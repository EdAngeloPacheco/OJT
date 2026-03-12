import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import Login from './login';

// 1. THE MAIN APP COMPONENT
function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) {
    return <Login setToken={handleLogin} />;
  }

  return (
    <div style={{ backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
      {/* HEADER BAR */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '10px 40px', 
        backgroundColor: '#fff', 
        borderBottom: '1px solid #dadce0',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img 
            src="/src/TIPlogo.png" 
            alt="TIP Logo" 
            style={{ height: '45px', width: 'auto' }} 
          />
          <span style={{ color: '#1a73e8', fontWeight: 'bold', fontSize: '22px', fontFamily: '"Segoe UI", sans-serif' }}>
            I Love TIP ♥
          </span>
        </div>
        
        <button onClick={handleLogout} style={logoutBtnStyle}>
          Logout
        </button>
      </div>

      <DashboardContent /> 
    </div>
  );
}

// 2. THE DASHBOARD CONTENT
function DashboardContent() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [startDate, setStartDate] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null); 
  const [uploads, setUploads] = useState([]); 

  const fetchData = () => {
      fetch('http://localhost:5000/api/uploads')
      .then(res => res.json())
      .then(json => setUploads(json))
      .catch(err => console.error("Fetch error: Uploads", err));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this?")) {
      await fetch(`http://localhost:5000/api/uploads/${id}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setUsername(item.username);
    setEmail(item.email);
    setStartDate(new Date(item.deadline));
  };

  const handleUnifiedSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile && !editingId) return alert("Please select a file first!");
    
    setIsSubmitting(true);
    const url = editingId ? `http://localhost:5000/api/uploads/${editingId}` : 'http://localhost:5000/api/upload';
    const method = editingId ? 'PUT' : 'POST';

    const offset = startDate.getTimezoneOffset() * 60000;
    const localDeadline = new Date(startDate.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');

    let body;
    let headers = {};

    if (editingId) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ username, email, deadline: localDeadline });
    } else {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('username', username);
      formData.append('email', email);
      formData.append('deadline', localDeadline);
      body = formData;
    }

    fetch(url, { method, body, headers })
    .then(res => res.json())
    .then(() => {
      alert(editingId ? "✅ Update Successful!" : "✅ Submission Successful!");
      setEditingId(null);
      setUsername('');
      setEmail('');
      setSelectedFile(null);
      setStartDate(new Date());
      if (!editingId) e.target.reset(); 
      fetchData();
    })
    .catch(err => alert("❌ Error processing request."))
    .finally(() => setIsSubmitting(false));
  };

  return (
    <div style={mainContainerStyle}>
      
      {/* LEFT FORM SECTION */}
      <div style={{ flex: '0 0 380px' }}>
        <div style={cardStyle}>
          <form onSubmit={handleUnifiedSubmit}>
            <div style={sectionStyle}>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle}>Email Address</label>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            {!editingId && (
              <div style={sectionStyle}>
                <label style={labelStyle}>Upload File (PDF/DOCX)</label>
                <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setSelectedFile(e.target.files[0])} required />
              </div>
            )}

            <div style={sectionStyle}>
              <label style={labelStyle}>Set Deadline Reminder</label>
              <DatePicker 
                selected={startDate} 
                onChange={(date) => setStartDate(date)} 
                showTimeSelect 
                dateFormat="MMMM d, yyyy h:mm aa" 
                customInput={<input style={inputStyle} />} 
              />
            </div>

            <button type="submit" disabled={isSubmitting} style={{ ...btnStyle, backgroundColor: isSubmitting ? '#9ccc65' : (editingId ? '#3498db' : '#27ae60') }}>
              {isSubmitting ? 'Processing...' : (editingId ? 'Save Changes' : 'Submit & Set Reminder')}
            </button>

            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setUsername(''); setEmail(''); setStartDate(new Date()); }} style={{ ...btnStyle, backgroundColor: '#95a5a6', marginTop: '10px' }}>
                Cancel Edit
              </button>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT TABLE SECTION - ONLY SUBMITTED FILES */}
      <div style={{ flex: '1', minWidth: '0' }}>
        <h2 style={{ color: '#3c4043', marginBottom: '20px', marginTop: '0' }}>Submitted Files</h2>
        <div style={{ ...cardStyle, padding: '0px', overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #edf2f7' }}>
                <th style={{ ...thStyle, width: '25%' }}>Name</th>
                <th style={{ ...thStyle, width: '35%' }}>File</th>
                <th style={{ ...thStyle, width: '25%' }}>Deadline</th>
                <th style={{ ...thStyle, width: '15%', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((item) => (
                <tr key={item.id} style={trStyle}>
                  <td style={tdStyle}>{item.username}</td>
                  <td style={tdStyle}>
                    <a href={item.gdrive_url} target="_blank" rel="noreferrer" style={fileLinkStyle}>
                      {item.file_name}
                    </a>
                  </td>
                  <td style={tdStyle}>{new Date(item.deadline).toLocaleString()}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={() => handleEdit(item)} style={actionBtnEdit}>Edit</button>
                      <button onClick={() => handleDelete(item.id)} style={actionBtnDelete}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {uploads.length === 0 && <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>No submissions found.</p>}
        </div>
      </div>
  
    </div>
  );
}

// 3. ENHANCED STYLES
const mainContainerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px', gap: '40px', maxWidth: '1400px', margin: '0 auto', fontFamily: '"Segoe UI", sans-serif' };
const cardStyle = { backgroundColor: '#fff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', boxSizing: 'border-box' };
const sectionStyle = { marginBottom: '18px' };
const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#4a5568' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '15px', boxSizing: 'border-box', outline: 'none' };
const btnStyle = { width: '100%', padding: '14px', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };
const logoutBtnStyle = { padding: '8px 18px', backgroundColor: '#a0aec0', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };
const thStyle = { padding: '15px 20px', fontSize: '13px', color: '#718096', fontWeight: '700', textTransform: 'uppercase', textAlign: 'left', boxSizing: 'border-box' };
const tdStyle = { padding: '15px 20px', fontSize: '14px', color: '#2d3748', borderBottom: '1px solid #edf2f7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', boxSizing: 'border-box' };
const trStyle = { transition: 'background-color 0.2s' };
const fileLinkStyle = { color: '#3182ce', textDecoration: 'none', fontWeight: '600' };
const actionBtnEdit = { padding: '6px 12px', backgroundColor: '#ebf8ff', color: '#3182ce', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };
const actionBtnDelete = { padding: '6px 12px', backgroundColor: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };

// 4. RENDER
const container = document.getElementById('app');
const root = createRoot(container);
root.render(<App />);