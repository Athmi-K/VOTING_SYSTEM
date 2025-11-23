import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// --- COMPONENTS ---

// 1. LANDING PAGE (Split Screen)
function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="container" style={{textAlign: 'center', marginTop: '100px'}}>
      <h1>Online Voting System</h1>
      <p>Please select your role to continue</p>
      <div style={{display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '40px'}}>
        <div className="card" style={{flexDirection: 'column', width: '200px', cursor: 'pointer'}} onClick={() => navigate('/admin/login')}>
          <h3>Administrator</h3>
          <p>Manage Election</p>
          <button className="btn-danger">Admin Access</button>
        </div>
        <div className="card" style={{flexDirection: 'column', width: '200px', cursor: 'pointer'}} onClick={() => navigate('/user/login')}>
          <h3>Voter</h3>
          <p>Cast Your Vote</p>
          <button className="btn-primary">Voter Access</button>
        </div>
      </div>
    </div>
  );
}

// 2. ADMIN LOGIN
function AdminLogin({ setToken }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:3001/api/admin/login', { username, password });
      setToken(res.data.token, 'admin');
      navigate('/admin/dashboard');
    } catch (err) { alert('Invalid Credentials'); }
  };

  return (
    <div className="container">
      <h2>Admin Login</h2>
      <form onSubmit={handleLogin}>
        <input placeholder="Username" onChange={e => setUsername(e.target.value)}autoComplete="off" />
        <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} autoComplete="new-password"

 />
        <button type="submit" className="btn-danger">Login</button>
      </form>
    </div>
  );
}

// 3. ADMIN DASHBOARD
function AdminDashboard({ token, logout }) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [newCandidate, setNewCandidate] = useState({name: '', party: ''});

  // Load Data
  React.useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await axios.get('http://localhost:3001/api/admin/dashboard-data', {
      headers: { Authorization: `Bearer ${token}` }
    });
    setIsOpen(res.data.is_open);
    setResults(res.data.results);
  };

  const toggleVoting = async () => {
    await axios.post('http://localhost:3001/api/admin/toggle-voting', {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchData(); // Refresh
  };

  const addCandidate = async () => {
    await axios.post('http://localhost:3001/api/admin/add-candidate', newCandidate, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setNewCandidate({name: '', party: ''});
    alert('Candidate Added');
    fetchData();
  };

  const winner = results.length > 0 ? results[0] : null;

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between'}}>
        <h2>Admin Dashboard</h2>
        <button onClick={logout} className="btn-secondary">Logout</button>
      </div>
      
      <div className="card" style={{display:'block', textAlign:'center'}}>
        <h3>Status: {isOpen ? <span style={{color:'green'}}>VOTING OPEN</span> : <span style={{color:'red'}}>VOTING CLOSED</span>}</h3>
        <button onClick={toggleVoting} className={isOpen ? "btn-danger" : "btn-primary"}>
          {isOpen ? "STOP VOTING" : "START VOTING"}
        </button>
      </div>

      <h3>Add Candidate</h3>
      <input placeholder="Name" value={newCandidate.name} onChange={e=>setNewCandidate({...newCandidate, name: e.target.value})} />
      <input placeholder="Party" value={newCandidate.party} onChange={e=>setNewCandidate({...newCandidate, party: e.target.value})} />
      <button onClick={addCandidate} className="btn-primary">Add</button>

      {!isOpen && (
        <div>
          <h3>Final Results</h3>
          {winner && <div style={{padding:'10px', background:'#D65A42', color:'white', borderRadius:'8px', textAlign:'center'}}>
             👑 WINNER: {winner.name} ({winner.party})
          </div>}
          {results.map(c => (
            <div key={c.name} className="card">
              <span>{c.name} ({c.party})</span>
              <strong>{c.vote_count} Votes</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 4. USER REGISTER
function UserRegister() {
  const [form, setForm] = useState({voter_id:'', name:'', email:'', phone:''});
  const navigate = useNavigate();

  const handleReg = async () => {
    try {
      await axios.post('http://localhost:3001/api/user/register', form);
      alert('Registration Successful');
      navigate('/user/login');
    } catch(e) { alert('Voter_id/email is incorrect'); }
  };

  return (
    <div className="container">
      <h2>Voter Registration</h2>
      <input placeholder="Voter ID" onChange={e=>setForm({...form, voter_id:e.target.value})}autoComplete="off"  />
      <input placeholder="Full Name" onChange={e=>setForm({...form, name:e.target.value})}autoComplete="off"  />
      <input placeholder="Email" onChange={e=>setForm({...form, email:e.target.value})}autoComplete="off"  />
      <input placeholder="Phone" onChange={e=>setForm({...form, phone:e.target.value})}autoComplete="off"  />
      <button onClick={handleReg} className="btn-primary">Register</button>
      <p onClick={()=>navigate('/user/login')} style={{cursor:'pointer', textDecoration:'underline'}}>Already registered? Login</p>
    </div>
  );
}

// 5. USER LOGIN & OTP
function UserLogin({ setToken }) {
  const [step, setStep] = useState(1); // 1=Login, 2=OTP
  const [creds, setCreds] = useState({voter_id:'', email:''}) ;
  const [otp, setOtp] = useState('');
  const navigate = useNavigate();

  const sendOtp = async () => {
    try {
      await axios.post('http://localhost:3001/api/user/login', creds);
      setStep(2);
      alert('OTP sent to Gmail!');
    } catch(e) { alert('User not found'); }
  };

  const verifyOtp = async () => {
    try {
      const res = await axios.post('http://localhost:3001/api/user/verify', {voter_id: creds.voter_id, otp_code: otp});
      setToken(res.data.token, 'user');
      navigate('/user/dashboard');
    } catch(e) { alert('Invalid OTP'); }
  };

  return (
    <div className="container">
      <h2>Voter Login</h2>
      {step === 1 ? (
        <>
          <input placeholder="Voter ID" onChange={e=>setCreds({...creds, voter_id:e.target.value})}autoComplete="off"  />
          <input placeholder="Email" onChange={e=>setCreds({...creds, email:e.target.value})} autoComplete="off" />
          <button onClick={sendOtp} className="btn-primary">Get OTP</button>
          <p onClick={()=>navigate('/user/register')} style={{cursor:'pointer', textDecoration:'underline'}}>New User? Register</p>
        </>
      ) : (
        <>
          <h3>Enter Verification Code</h3>
          <input placeholder="6-Digit OTP" onChange={e=>setOtp(e.target.value)} autoComplete="off" />
          <button onClick={verifyOtp} className="btn-primary">Verify & Login</button>
        </>
      )}
    </div>
  );
}

// 6. USER DASHBOARD (VOTING)
function UserDashboard({ token, logout }) {
  const [candidates, setCandidates] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);

  React.useEffect(() => {
    axios.get('http://localhost:3001/api/candidates', {headers: {Authorization: `Bearer ${token}`}})
      .then(res => setCandidates(res.data))
      .catch(e => console.log(e));
  }, []);

  const vote = async (id) => {
    try {
      await axios.post('http://localhost:3001/api/vote',{candidate_id: id}, {headers: {Authorization: `Bearer ${token}`}});
      setHasVoted(true);
    } catch(err) {
      alert(err.response?.data?.message || 'Error voting');
    }
  };

  if (hasVoted) {
    return (
      <div className="container" style={{textAlign:'center'}}>
        <h1 style={{fontSize:'50px'}}>✅</h1>
        <h2>Thank you for voting!</h2>
        <p>Your vote has been securely recorded.</p>
        <button onClick={logout} className="btn-secondary">Logout</button>
      </div>
    );
  }
  

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between'}}>
        <h2>Electronic Ballot</h2>
        <button onClick={logout} className="btn-secondary">Logout</button>
      </div>
      <p>Please select one candidate. This cannot be undone.</p>
      {candidates.map(c => (
        <div key={c.candidate_id} className="card">
          <div>
            <h3>{c.name}</h3>
            <span>Party: {c.party}</span>
          </div>
          <button onClick={() => vote(c.candidate_id)} className="btn-primary">Vote</button>
        </div>
      ))}
    </div>
  );
}

// --- MAIN APP ---
function App() {
  const [token, setTokenState] = useState(localStorage.getItem('token'));
  const [role, setRole] = useState(localStorage.getItem('role'));

  const setToken = (t, r) => {
    localStorage.setItem('token', t);
    localStorage.setItem('role', r);
    setTokenState(t);
    setRole(r);
  };

  const logout = () => {
    localStorage.clear();
    setTokenState(null);
    setRole(null);
    window.location.href = '/';
  };
  

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        
        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin setToken={setToken} />} />
        <Route path="/admin/dashboard" element={token && role==='admin' ? <AdminDashboard token={token} logout={logout} /> : <Navigate to="/admin/login" />} />

        {/* User Routes */}
        <Route path="/user/login" element={<UserLogin setToken={setToken} />} />
        <Route path="/user/register" element={<UserRegister />} />
        <Route path="/user/dashboard" element={token && role==='user' ? <UserDashboard token={token} logout={logout} /> : <Navigate to="/user/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
