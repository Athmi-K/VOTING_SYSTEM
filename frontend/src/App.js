import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
    <div className="LoginPage">
    <h1>Welcome to the Voting System</h1>
    </div>
    <div className="LoginForm">
    <form action="/api/login" method="post">
    <input type="text" name="voter_id"placeholder="Voter_ID" required />
    <input type="text" name="user_name" placeholder="Name" required />
    <input type="text" name="email" placeholder="Email" required />
    <input type="number" name="phone_number" placeholder="Mobile Number" required />
    <button type="submit">Login</button>
    </form>
    </div>
    </div>
);
}

export default App;
