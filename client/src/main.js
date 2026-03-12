import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/api/users')
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      //1. TECHNICAL ERROR HANDLING (.catch)
      .catch((err) => {
        console.error('Error fetching users:', err); // Logs the "password failed" or "connection refused" error
        setLoading(false); // Ensures the "Loading..." text goes away even if it fails
      });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <h1>I Love TIP</h1>
      <div style={{ marginTop: '20px' }}>
        {loading ? (
          <p>Loading users...</p>
        ) : 
        //2. LOGICAL ERROR HANDLING (Conditionals)
        users.length === 0 ? (
          <p>No users found. Try adding some in pgAdmin!</p> // This is what you see when data is missing
        ) : (
          <div>
            <h2>Users from Database:</h2>
            <ul>
              {users.map((user) => (
                <li key={user.id}>
                  <strong>{user.username}</strong> - {user.email}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const container = document.getElementById('app');
const root = createRoot(container);
root.render(<App />);