// backend/index.js

require('dotenv').config();

const express = require('express');
const cors = require('cors'); // Lets your React app talk to this server
const jwt = require('jsonwebtoken'); // For creating secure tokens
const randomstring = require('randomstring'); // For generating the OTP
const pool = require('./db'); // Our updated database pool

const app = express();
const port = 3001;

// --- Config / Middleware ---

// This is a secret key for signing JWTs.
// In a real app, you'd put this in a .env file!
const JWT_SECRET = 'my-super-secret-key-for-voting-app';

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Allow server to read JSON from request bodies

// --- 1. Authentication Endpoints ---

// POST /api/login
// Action: Receives voter_id and email, sends an OTP
app.post('/api/login', async (req, res) => {
  const { voter_id, email } = req.body;
  
  try {
    const user = await pool.query(
      'SELECT * FROM Voter WHERE voter_id = $1 AND email = $2',
      [voter_id, email]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ message: 'Voter not found' });
    }

    // Generate a 6-digit numeric OTP
    const otp = randomstring.generate({
      length: 6,
      charset: 'numeric',
    });

    // Set expiration time (e.g., 5 minutes from now)
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP to the database
    await pool.query(
      'INSERT INTO OTP (voter_id, otp_code, expires_at) VALUES ($1, $2, $3)',
      [voter_id, otp, expires_at]
    );

    // --- In a real project, you would email this OTP ---
    console.log(`*** OTP for ${voter_id}: ${otp} ***`);
    // --------------------------------------------------

    res.json({ message: 'OTP has been sent (check console)' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// POST /api/verify
// Action: Receives voter_id and OTP, sends back a JWT
app.post('/api/verify', async (req, res) => {
  const { voter_id, otp_code } = req.body;

  try {
    // Check for a valid, non-used, non-expired OTP
    const result = await pool.query(
      'SELECT * FROM OTP WHERE voter_id = $1 AND otp_code = $2 AND is_used = false AND expires_at > NOW()',
      [voter_id, otp_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Mark the OTP as used
    const otp_id = result.rows[0].otp_id;
    await pool.query('UPDATE OTP SET is_used = true WHERE otp_id = $1', [otp_id]);

    // OTP is valid. Create a JWT.
    const payload = {
      voter: {
        voter_id: voter_id,
      },
    };

    // Sign the token to send to the user
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: '1h', // Token lasts for 1 hour
    });

    res.json({ message: 'Login successful', token: token });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// --- 2. Authentication Middleware ---
// This function protects our routes.
// It checks for a valid JWT in the request header.

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

  if (token == null) {
    return res.status(401).json({ message: 'No token provided' }); // Unauthorized
  }

  // Verify the token
  jwt.verify(token, JWT_SECRET, (err, voter) => {
    if (err) {
      return res.status(403).json({ message: 'Token is invalid' }); // Forbidden
    }
    
    // Add the user payload to the request object
    req.voter = voter; 
    next(); // Move on to the next function (the route handler)
  });
}

// --- 3. Protected Endpoints (Voting) ---

// GET /api/candidates
// Action: (Requires valid token) Gets all candidates
app.get('/api/candidates', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT candidate_id, name, party FROM Candidate'
    );
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// POST /api/vote
// Action: (Requires valid token) Submits a vote
app.post('/api/vote', authenticateToken, async (req, res) => {
  const { candidate_id } = req.body;
  // Get voter_id from the token payload (added by our middleware)
  const voter_id = req.voter.voter.voter_id;

  // We MUST use a client from the pool for transactions
  const client = await pool.connect();

  try {
    // Start the transaction
    await client.query('BEGIN');

    // 1. Check if the voter has already voted
    const voterCheck = await client.query(
      'SELECT has_voted FROM Voter WHERE voter_id = $1',
      [voter_id]
    );
    
    if (voterCheck.rows[0].has_voted) {
      // If they have, stop the transaction
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'You have already voted' });
    }

    // 2. Mark the voter as 'voted'
    await client.query(
      'UPDATE Voter SET has_voted = true WHERE voter_id = $1',
      [voter_id]
    );

    // 3. Increment the candidate's vote count
    await client.query(
      'UPDATE Candidate SET vote_count = vote_count + 1 WHERE candidate_id = $1',
      [candidate_id]
    );
    
    // 4. (Optional but good) Log the vote in the Vote table
    await client.query(
      'INSERT INTO Vote (voter_id, candidate_id) VALUES ($1, $2)',
      [voter_id, candidate_id]
    );

    // 4. If all queries succeed, commit the transaction
    await client.query('COMMIT');
    res.json({ message: 'Vote cast successfully' });

  } catch (err) {
    // 5. If any query fails, roll back all changes
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server error during transaction');
  } finally {
    // 6. ALWAYS release the client back to the pool
    client.release();
  }
});


// --- 4. Public Endpoint (Results) ---

// GET /api/results
// Action: Gets the final results
app.get('/api/results', async (req, res) => {
  
  // --- Result Locking Logic ---
  // We can hardcode an election end time for this project.
  // Let's set it to a future date (e.g., Dec 1, 2025)
  const electionEndTime = new Date('2025-12-01T17:00:00Z');
  
  if (Date.now() < electionEndTime) {
    return res.status(403).json({ 
      message: 'Results are locked until the election period ends.' 
    });
  }
  // -----------------------------
  
  try {
    const { rows } = await pool.query(
      'SELECT name, party, vote_count FROM Candidate ORDER BY vote_count DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// --- Start The Server ---
app.listen(port, () => {
  console.log(`Back-end server listening on http://localhost:${port}`);
});