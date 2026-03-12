import React, { useState } from 'react';

const Login = ({ setToken }) => {
  const [isRegistering, setIsRegistering] = useState(false); // Switch between Login/Register
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

 const handleSubmit = async (e) => {
  e.preventDefault();
  const endpoint = isRegistering ? 'register' : 'login';
  const payload = isRegistering ? { username, email, password } : { email, password };

  try {
    const response = await fetch(`http://localhost:5000/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      // This will now catch the "Email already registered" error
      alert(data); 
      return;
    }

    if (isRegistering) {
      alert("Registration successful! You can now log in.");
      setIsRegistering(false);
    } else if (data.token) {
      setToken(data.token);
    }
  } catch (err) {
    alert("Check if your server is running!");
  }
};
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={headerStyle}>{isRegistering ? 'Create Account' : 'Login to I Love TIP'}</h2>
        
        <form onSubmit={handleSubmit}>
          {isRegistering && (
            <div style={inputGroupStyle}>
              <label style={labelStyle}>Full Name</label>
              <input type="text" style={inputStyle} onChange={e => setUsername(e.target.value)} required />
            </div>
          )}

          <div style={inputGroupStyle}>
            <label style={labelStyle}>Email Address</label>
            <input type="email" style={inputStyle} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>Password</label>
            <input type="password" style={inputStyle} onChange={e => setPassword(e.target.value)} required />
          </div>

          <button type="submit" style={mainBtnStyle}>
            {isRegistering ? 'Register' : 'Login'}
          </button>
        </form>

        <p style={footerTextStyle}>
          {isRegistering ? "Already have an account?" : "Don't have an account?"} 
          <button 
            onClick={() => setIsRegistering(!isRegistering)} 
            style={toggleBtnStyle}
          >
            {isRegistering ? ' Login here' : ' Register here'}
          </button>
        </p>
      </div>
    </div>
  );
};

// --- STYLES ---
const containerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f0f2f5', fontFamily: '"Segoe UI", sans-serif' };
const cardStyle = { backgroundColor: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', width: '100%', maxWidth: '400px' };
const headerStyle = { color: '#1a73e8', textAlign: 'center', marginBottom: '30px' };
const inputGroupStyle = { marginBottom: '15px' };
const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #dadce0', boxSizing: 'border-box' };
const mainBtnStyle = { width: '100%', padding: '15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', marginTop: '10px' };
const footerTextStyle = { textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#5f6368' };
const toggleBtnStyle = { background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' };

export default Login;