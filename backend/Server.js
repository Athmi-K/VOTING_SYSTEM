// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const randomstring = require('randomstring');
const nodemailer = require('nodemailer'); // Import Nodemailer
const pool = require('./db');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- MIDDLEWARE ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token is invalid' });
    req.user = user;
    next();
  });
}

// ==========================
// 🟢 USER (VOTER) MODULE
// ==========================

// 1. User Registration
app.post('/api/user/register', async (req, res) => {
  const { voter_id, name, email, phone } = req.body;
  try {
    await pool.query(
      'INSERT INTO Voter (voter_id, name, email, phone_number) VALUES ($1, $2, $3, $4)',
      [voter_id, name, email, phone]
    );
    res.json({ message: 'Registration successful! Please log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registering user. ID or Email may already exist.' });
  }
});

// 2. User Login (Sends OTP via Gmail)
app.post('/api/user/login', async (req, res) => {
  const { voter_id, email } = req.body;
  try {
    console.log("LOGIN REQUEST:", voter_id, email);

    const user = await pool.query('SELECT * FROM Voter WHERE voter_id = $1 AND email = $2', [voter_id, email]);
    console.log("DB RESULT:", user.rows);

    if (user.rows.length === 0) return res.status(404).json({ message: 'Voter not found' });

    // Generate OTP
    const otps= randomstring.generate({ length: 6, charset: 'numeric' });
    const expires_at = new Date(Date.now() + 5 * 60 * 1000);
    await pool.query('INSERT INTO OTP (voter_id, otp_code, expires_at) VALUES ($1, $2, $3)', [voter_id, otps, expires_at]);

    // Send Email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Voting OTP Code',
      text: `Your OTP for login is: ${otps}. It expires in 5 minutes.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        return res.status(500).json({ message: 'Error sending email' });
      }
      console.log('Email sent: ' + info.response);
      res.json({ message: 'OTP sent to your email' });
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// 3. Verify OTP
app.post('/api/user/verify', async (req, res) => {
  const { voter_id, otp_code } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM OTP WHERE voter_id = $1 AND otp_code = $2 AND is_used = false AND expires_at > NOW()', 
      [voter_id, otp_code]
    );
    if (result.rows.length === 0) return res.status(400).json({ message: 'Invalid or expired OTP' });

    await pool.query('UPDATE OTP SET is_used = true WHERE otp_id = $1', [result.rows[0].otp_id]);
    
    // Token includes role: 'user'
    const token = jwt.sign({ role: 'user', id: voter_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token, role: 'user' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// 4. Cast Vote (Checks if Election is Open first)
app.post('/api/vote', authenticateToken, async (req, res) => {
  const { candidate_id } = req.body;
  const voter_id = req.user.id;

  try {
    // Check Election Status
    const status = await pool.query('SELECT is_open FROM ElectionSettings LIMIT 1');
    if (!status.rows[0].is_open) {
      return res.status(403).json({ message: 'Voting is currently CLOSED by the Admin.' });
    }

    await pool.query('CALL cast_vote($1, $2)', [voter_id, candidate_id]);
    res.json({ message: 'Vote cast successfully' });
  } catch (err) {
   
    console.error("VOTE ERROR =>", err);   // <-- add this
    res.status(500).json({ message: err.message });
  }
});

// ==========================
// 🔴 ADMINISTRATOR MODULE
// ==========================

// 1. Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  // In a real app, hash passwords! For this mini-project, plain text check is okay if pre-seeded.
  try {
    const admin = await pool.query('SELECT * FROM Administrator WHERE username = $1 AND password_hash = $2', [username, password]);
    if (admin.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ role: 'admin', id: admin.rows[0].admin_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Admin Login successful', token, role: 'admin' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// 2. Add Candidate
app.post('/api/admin/add-candidate', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { name, party } = req.body;
  try {
    await pool.query('INSERT INTO Candidate (name, party) VALUES ($1, $2)', [name, party]);
    res.json({ message: 'Candidate added' });
  } catch (err) {
    res.status(500).send('Error adding candidate');
  }
});

// 3. Toggle Voting Status
app.post('/api/admin/toggle-voting', authenticateToken, async (req, res) => {
  console.log("🔥 /api/admin/toggle-voting CALLED");
  console.log("USER:", req.user);

  if (req.user.role !== 'admin') return res.sendStatus(403);

  try {
    const update = await pool.query('UPDATE ElectionSettings SET is_open = NOT is_open');
    const newState = await pool.query('SELECT is_open FROM electionsettings LIMIT 1');

    console.log("DB RESPONSE:", newState.rows);

    res.json({ message: 'Status updated', is_open: newState.rows[0].is_open });
  } catch (err) {
    console.error("❌ ERROR IN toggle-voting:", err);
    res.status(500).json({ error: err.message });
  }
});


// 4. Get Election Status & Results
app.get('/api/admin/dashboard-data', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  try {
    const status = await pool.query('SELECT is_open FROM ElectionSettings LIMIT 1');
    const results = await pool.query('SELECT name, party, vote_count FROM Candidate ORDER BY vote_count DESC');
    
    res.json({ 
      is_open: status.rows[0].is_open,
      results: results.rows 
    });
  } catch (err) {
    res.status(500).send('Error fetching data');
  }
});

// Helper: Public endpoint to check candidates (for User Dashboard)
app.get('/api/candidates', authenticateToken, async (req, res) => {
  try {
    console.log("AUTH HEADER:", req.headers.authorization); // <--- Log here

    const { rows } = await pool.query('SELECT candidate_id, name, party FROM Candidate');
    res.json(rows);

  } catch (err) {
    res.status(500).send('Error');
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});