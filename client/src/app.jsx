import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import Login from './login';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/* ─── GOOGLE FONTS ── */
const fontLink = Object.assign(document.createElement('link'), {
  href: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap',
  rel: 'stylesheet',
});
document.head.appendChild(fontLink);

/* ─── 1. ROOT COMPONENT ── */
function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  const handleLogin  = (t) => { localStorage.setItem('token', t); setToken(t); };
  const handleLogout = ()  => { localStorage.removeItem('token');  setToken(null); };

  if (!token) return <Login setToken={handleLogin} />;

  return (
    <div style={styles.root}>
      <style>{globalCSS}</style>
      <header style={styles.navbar}>
        <div style={styles.navBrand}>
          <img src="/src/TIPlogo.png" alt="TIP Logo" style={styles.navLogo} />
          <div style={styles.navTitleGroup}>
            <span style={styles.navTitle}>I Love TIP</span>
            <span style={styles.navHeart}>♥</span>
          </div>
        </div>
        <nav style={styles.navRight}>
          <span style={styles.navTagline}>Submission Portal</span>
          <div style={styles.navDivider} />
          <button onClick={handleLogout} style={styles.logoutBtn} className="tip-logout-btn">Log out</button>
        </nav>
      </header>
      <DashboardContent />
    </div>
  );
}

/* ─── 2. DASHBOARD CONTENT ── */
function DashboardContent() {
  const [username, setUsername]         = useState('');
  const [email, setEmail]               = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [startDate, setStartDate]       = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [uploads, setUploads]           = useState([]);
  const [hoveredRow, setHoveredRow]     = useState(null);

  const fetchData = () =>
    fetch('http://localhost:5000/api/uploads')
      .then(r => r.json()).then(setUploads)
      .catch(err => console.error('Fetch error:', err));

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    await fetch(`http://localhost:5000/api/uploads/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleEdit = (item) => {
    setEditingId(item.id); setUsername(item.username);
    setEmail(item.email);  setStartDate(new Date(item.deadline));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null); setUsername(''); setEmail(''); setStartDate(new Date());
  };

  const handleUnifiedSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile && !editingId) return alert('Please select a file first!');
    setIsSubmitting(true);

    const url    = editingId ? `http://localhost:5000/api/uploads/${editingId}` : 'http://localhost:5000/api/upload';
    const method = editingId ? 'PUT' : 'POST';
    const localDeadline = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 19).replace('T', ' ');

    let body, headers = {};
    if (editingId) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ username, email, deadline: localDeadline });
    } else {
      body = Object.assign(new FormData(), {}) ;
      body.append('file', selectedFile); body.append('username', username);
      body.append('email', email);       body.append('deadline', localDeadline);
    }

    fetch(url, { method, body, headers })
      .then(r => r.json())
      .then(() => {
        alert(editingId ? '✅ Record updated.' : '✅ File submitted.');
        cancelEdit(); setSelectedFile(null); setStartDate(new Date());
        if (!editingId) e.target.reset();
        fetchData();
      })
      .catch(() => alert('❌ Something went wrong. Please try again.'))
      .finally(() => setIsSubmitting(false));
  };

  /* ── FORM PANEL ── */
  const FormPanel = (
    <aside style={styles.formPanel}>
      <div style={styles.formHeader}>
        <div style={styles.formHeaderDot} />
        <h2 style={styles.formTitle}>{editingId ? 'Edit Submission' : 'New Submission'}</h2>
      </div>
      <form onSubmit={handleUnifiedSubmit} style={styles.form}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Full Name</label>
          <input style={styles.input} className="tip-input" value={username}
            onChange={e => setUsername(e.target.value)} placeholder="e.g. Juan dela Cruz" required />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Email Address</label>
          <input style={styles.input} className="tip-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="juan@tip.edu.ph" required />
        </div>
        {!editingId && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Attach File</label>
            <label style={styles.fileDropZone} className="tip-filedrop">
              <div style={styles.fileDropIcon}>{selectedFile ? '📄' : '⬆'}</div>
              <span style={styles.fileDropText}>{selectedFile ? selectedFile.name : 'Click to choose a PDF, DOCX, Excel, or image'}</span>
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpeg,.jpg,.png" style={{ display: 'none' }}
                onChange={e => setSelectedFile(e.target.files[0])} required />
            </label>
          </div>
        )}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Deadline Reminder</label>
          <DatePicker selected={startDate} onChange={setStartDate} showTimeSelect
            dateFormat="MMMM d, yyyy  h:mm aa"
            customInput={<input style={styles.input} className="tip-input" />} />
        </div>
        <button type="submit" disabled={isSubmitting} className="tip-submit-btn"
          style={{ ...styles.submitBtn, opacity: isSubmitting ? 0.7 : 1,
            background: editingId ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'linear-gradient(135deg,#2d3a8c,#1e2d6e)' }}>
          {isSubmitting ? 'Processing…' : editingId ? 'Save Changes' : 'Submit & Set Reminder'}
        </button>
        {editingId && (
          <button type="button" onClick={cancelEdit} style={styles.cancelBtn} className="tip-cancel-btn">Cancel</button>
        )}
      </form>
    </aside>
  );

  /* ── TABLE PANEL ── */
  const TablePanel = (
    <section style={styles.tablePanel}>
      <div style={styles.tablePanelHeader}>
        <div>
          <h2 style={styles.tableTitle}>Submitted Files</h2>
          <p style={styles.tableSubtitle}>{uploads.length} record{uploads.length !== 1 ? 's' : ''} found</p>
        </div>
        <div style={styles.tableBadge}>{uploads.length}</div>
      </div>
      {uploads.length === 0 ? (
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>📭</span>
          <p style={styles.emptyText}>No submissions yet.</p>
          <p style={styles.emptySubtext}>Use the form on the left to add the first entry.</p>
        </div>
      ) : (
        <div style={{ ...styles.tableWrapper, overflowY: uploads.length >= 8 ? 'auto' : 'visible', maxHeight: uploads.length >= 8 ? '420px' : 'none' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: '20%' }}>Name</th>
                <th style={{ ...styles.th, width: '25%' }}>File</th>
                <th style={{ ...styles.th, width: '25%' }}>Deadline</th>
                <th style={{ ...styles.th, width: '30%', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map(item => (
                <tr key={item.id}
                  style={{ ...styles.tr, backgroundColor: hoveredRow === item.id ? '#f0f4ff' : 'transparent' }}
                  onMouseEnter={() => setHoveredRow(item.id)} onMouseLeave={() => setHoveredRow(null)}>
                  <td style={styles.td}><span style={styles.nameCell}>{item.username}</span></td>
                  <td style={styles.td}>
                    <a href={item.gdrive_url} target="_blank" rel="noreferrer" style={styles.fileLink}>
                      <span style={styles.fileIcon}>↗</span>{item.file_name}
                    </a>
                  </td>
                  <td style={styles.td}><span style={styles.deadlineCell}>{new Date(item.deadline).toLocaleString()}</span></td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <div style={styles.actionGroup}>
                      <button onClick={() => handleEdit(item)} style={styles.editBtn} className="tip-action-btn">Edit</button>
                      <button onClick={() => handleDelete(item.id)} style={styles.deleteBtn} className="tip-action-btn">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  /* ── CHART PANEL ── */
  const FILE_TYPES = [
    { ext: 'pdf',  label: 'PDF',  color: '#e53e3e', bg: '#fff5f5' },
    { ext: 'docx', label: 'DOCX', color: '#2d3a8c', bg: '#eef1ff' },
    { ext: 'doc',  label: 'DOC',  color: '#6872a0', bg: '#f3f4fb' },
    { ext: 'xlsx', label: 'XLSX', color: '#1a7a4a', bg: '#edfaf3' },
    { ext: 'xls',  label: 'XLS',  color: '#276749', bg: '#f0faf5' },
    { ext: 'jpeg', label: 'JPEG', color: '#b7791f', bg: '#fffbeb' },
    { ext: 'jpg',  label: 'JPG',  color: '#b7791f', bg: '#fffbeb' },
    { ext: 'png',  label: 'PNG',  color: '#6b46c1', bg: '#faf5ff' },
  ];

  const typeCounts = FILE_TYPES.map(t => ({
    ...t,
    count: uploads.filter(u => u.file_name?.toLowerCase().endsWith(`.${t.ext}`)).length,
  }));

  const maxCount = Math.max(...typeCounts.map(t => t.count), 1);

  const ChartPanel = (
    <section style={styles.chartPanel}>
      <div style={styles.tablePanelHeader}>
        <div>
          <h2 style={styles.tableTitle}>File Type Breakdown</h2>
          <p style={styles.tableSubtitle}>Distribution across {uploads.length} submission{uploads.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={styles.tableBadge}>
          <span style={{ fontSize: '14px' }}>📊</span>
        </div>
      </div>

      <div style={{ ...styles.chartBody, overflowY: typeCounts.length >= 4 ? 'auto' : 'visible', maxHeight: typeCounts.length >= 4 ? '420px' : 'none' }}>
        {uploads.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={styles.emptyIcon}>📂</span>
            <p style={styles.emptyText}>No data yet.</p>
            <p style={styles.emptySubtext}>Submit files to populate this chart.</p>
          </div>
        ) : (
          <div style={styles.chartRows}>
            {typeCounts.map(({ ext, label, color, bg, count }) => (
              <div key={ext} style={styles.chartRow}>
                {/* Label + count */}
                <div style={styles.chartMeta}>
                  <span style={{ ...styles.chartBadge, backgroundColor: bg, color }}>{label}</span>
                  <span style={styles.chartCount}>{count} file{count !== 1 ? 's' : ''}</span>
                </div>
                {/* Bar track */}
                <div style={styles.barTrack}>
                  <div
                    className="tip-bar"
                    style={{
                      ...styles.barFill,
                      width: `${(count / maxCount) * 100}%`,
                      backgroundColor: color,
                      '--bar-width': `${(count / maxCount) * 100}%`,
                    }}
                  />
                  {/* Axis tick labels */}
                  <div style={styles.barAxisLabels}>
                    {[0, Math.round(maxCount / 2), maxCount].map(v => (
                      <span key={v} style={styles.barAxisLabel}>{v}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  /* ── REPORT HELPERS ── */
  const UPCOMING_DAYS = 7;
  const now = new Date();
  const upcomingDeadlines = uploads
    .filter(u => { const d = new Date(u.deadline); return d >= now && d <= new Date(now.getTime() + UPCOMING_DAYS * 86400000); })
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const mostRecent = uploads.reduce((latest, u) =>
    !latest || new Date(u.created_at) > new Date(latest.created_at) ? u : latest, null);
  const FILE_TYPE_SUMMARY = ['pdf','docx','doc','xlsx','xls','jpeg','jpg','png'].map(ext => ({
    ext: ext.toUpperCase(),
    count: uploads.filter(u => u.file_name?.toLowerCase().endsWith(`.${ext}`)).length,
  })).filter(t => t.count > 0);
  const flatRows = [...uploads].map(u => ({
    Name: u.username, Email: u.email, File: u.file_name, Link: u.gdrive_url,
    Deadline: new Date(u.deadline).toLocaleString(),
    Submitted: u.created_at ? new Date(u.created_at).toLocaleString() : '—',
  }));

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(45, 58, 140);
    doc.text('I Love TIP — Submission Report', 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 140);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 50);
    doc.text('Summary Statistics', 14, 35);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 80);
    doc.text(`Total Submissions: ${uploads.length}`, 14, 42);
    doc.text(`File Types: ${FILE_TYPE_SUMMARY.map(t => `${t.ext} (${t.count})`).join(', ') || '—'}`, 14, 48);
    doc.text(`Upcoming Deadlines (next 7 days): ${upcomingDeadlines.length}`, 14, 54);
    doc.text(`Most Recent: ${mostRecent ? `${mostRecent.username} — ${new Date(mostRecent.created_at).toLocaleString()}` : '—'}`, 14, 60);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 50);
    doc.text('All Submissions', 14, 72);
    autoTable(doc, {
      startY: 76,
      head: [['Name', 'Email', 'File Name', 'File Link', 'Deadline', 'Date Submitted']],
      body: flatRows.map(r => [r.Name, r.Email, r.File, r.Link, r.Deadline, r.Submitted]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [45, 58, 140], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 243, 255] },
      columnStyles: { 3: { cellWidth: 50, overflow: 'ellipsize' } },
    });
    doc.save('TIP_Submission_Report.pdf');
  };

  const generateExcel = () => {
    const wb = XLSX.utils.book_new();
    const summaryData = [
      ['I Love TIP — Submission Report'],
      [`Generated: ${new Date().toLocaleString()}`], [],
      ['SUMMARY STATISTICS'],
      ['Total Submissions', uploads.length],
      ['Upcoming Deadlines (next 7 days)', upcomingDeadlines.length],
      ['Most Recent', mostRecent ? `${mostRecent.username} (${new Date(mostRecent.created_at).toLocaleString()})` : '—'],
      [], ['FILE TYPE BREAKDOWN'], ['Type', 'Count'],
      ...FILE_TYPE_SUMMARY.map(t => [t.ext, t.count]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 36 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    const wsData = XLSX.utils.json_to_sheet(flatRows);
    wsData['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 40 }, { wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsData, 'Submissions');
    XLSX.writeFile(wb, 'TIP_Submission_Report.xlsx');
  };

  /* ── REPORT PANEL ── */
  const ReportPanel = (
    <div style={styles.reportWrapper}>
      <section style={styles.reportPanel}>
        <div style={styles.reportHeader}>
          <div>
            <h2 style={styles.tableTitle}>Summary Report</h2>
            <p style={styles.tableSubtitle}>Export all submissions with stats</p>
          </div>
          <div style={{ ...styles.tableBadge, backgroundColor: '#fff7ed', color: '#c05621' }}>⬇</div>
        </div>
        <div style={styles.reportBody}>
          <div style={styles.reportStats}>
            <div style={styles.reportStat}>
              <span style={styles.reportStatNum}>{uploads.length}</span>
              <span style={styles.reportStatLabel}>Total Files</span>
            </div>
            <div style={styles.reportStatDivider} />
            <div style={styles.reportStat}>
              <span style={styles.reportStatNum}>{upcomingDeadlines.length}</span>
              <span style={styles.reportStatLabel}>Due This Week</span>
            </div>

          </div>
          <div style={styles.reportRecent}>
            <span style={styles.reportRecentLabel}>Most Recent</span>
            <span style={styles.reportRecentValue}>
              {mostRecent ? `${mostRecent.username} · ${new Date(mostRecent.created_at).toLocaleDateString()}` : 'No submissions yet'}
            </span>
          </div>
          <div style={styles.reportBtns}>
            <button onClick={generatePDF} style={styles.reportBtnPdf} className="tip-report-btn tip-report-pdf">
              <span style={styles.reportBtnIcon}>📄</span> Download PDF
            </button>
            <button onClick={generateExcel} style={styles.reportBtnXlsx} className="tip-report-btn tip-report-xlsx">
              <span style={styles.reportBtnIcon}>📊</span> Download Excel
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <main style={styles.dashboardMain}>
      <div style={styles.dashboardGrid}>{FormPanel}{TablePanel}</div>
      {ChartPanel}
      {ReportPanel}
    </main>
  );
}

/* ─── 3. STYLES ── */
const styles = {
  root:             { minHeight: '100vh', backgroundColor: '#eef1f8', fontFamily: '"DM Sans", sans-serif', color: '#1a1f36' },
  navbar:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: '64px', backgroundColor: '#ffffff', borderBottom: '1px solid #e4e8f0', position: 'sticky', top: 0, zIndex: 1000, boxShadow: '0 1px 6px rgba(45,58,140,0.06)' },
  navBrand:         { display: 'flex', alignItems: 'center', gap: '14px' },
  navLogo:          { height: '36px', width: 'auto' },
  navTitleGroup:    { display: 'flex', alignItems: 'center', gap: '5px' },
  navTitle:         { fontFamily: '"Syne", sans-serif', fontWeight: '800', fontSize: '18px', color: '#2d3a8c', letterSpacing: '-0.3px' },
  navHeart:         { fontSize: '16px', color: '#e53e3e' },
  navRight:         { display: 'flex', alignItems: 'center', gap: '20px' },
  navTagline:       { fontSize: '13px', fontWeight: '500', color: '#8b95b5', letterSpacing: '0.05em', textTransform: 'uppercase' },
  navDivider:       { width: '1px', height: '20px', backgroundColor: '#d8dce8' },
  logoutBtn:        { padding: '7px 18px', fontSize: '13px', fontWeight: '600', color: '#5a6282', backgroundColor: 'transparent', border: '1px solid #d0d5e8', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.18s ease', fontFamily: '"DM Sans", sans-serif' },
  dashboardMain:    { padding: '40px 48px', maxWidth: '1380px', margin: '0 auto' },
  dashboardGrid:    { display: 'flex', gap: '32px', alignItems: 'flex-start' },
  formPanel:        { flex: '0 0 360px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 4px 24px rgba(45,58,140,0.07)', overflow: 'hidden', border: '1px solid #e8eaf4' },
  formHeader:       { display: 'flex', alignItems: 'center', gap: '10px', padding: '22px 28px 18px', borderBottom: '1px solid #f0f2fa' },
  formHeaderDot:    { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2d3a8c', flexShrink: 0 },
  formTitle:        { fontFamily: '"Syne", sans-serif', fontSize: '17px', fontWeight: '700', margin: 0, color: '#1a1f36', letterSpacing: '-0.2px' },
  form:             { padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: '0' },
  fieldGroup:       { marginBottom: '20px' },
  label:            { display: 'block', marginBottom: '7px', fontSize: '13px', fontWeight: '600', color: '#4a5380', letterSpacing: '0.03em', textTransform: 'uppercase' },
  input:            { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e4e8f2', fontSize: '14.5px', color: '#1a1f36', backgroundColor: '#fafbff', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.18s' },
  fileDropZone:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '22px 16px', border: '1.5px dashed #c5cae8', borderRadius: '10px', backgroundColor: '#f7f8ff', cursor: 'pointer', transition: 'all 0.18s ease' },
  fileDropIcon:     { fontSize: '24px', lineHeight: '1' },
  fileDropText:     { fontSize: '13.5px', fontWeight: '500', color: '#6872a0', textAlign: 'center', wordBreak: 'break-all' },
  submitBtn:        { width: '100%', padding: '13px', color: '#ffffff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '15px', letterSpacing: '0.01em', fontFamily: '"DM Sans", sans-serif', transition: 'transform 0.15s ease, box-shadow 0.15s ease', boxShadow: '0 4px 14px rgba(45,58,140,0.3)', marginBottom: '0' },
  cancelBtn:        { marginTop: '10px', width: '100%', padding: '11px', color: '#6872a0', backgroundColor: 'transparent', border: '1.5px solid #dde1f0', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: '"DM Sans", sans-serif', transition: 'background-color 0.18s' },
  tablePanel:       { flex: '1', minWidth: '0', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 4px 24px rgba(45,58,140,0.07)', border: '1px solid #e8eaf4', overflow: 'hidden' },
  tablePanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 28px 18px', borderBottom: '1px solid #f0f2fa' },
  tableTitle:       { fontFamily: '"Syne", sans-serif', fontSize: '17px', fontWeight: '700', margin: '0 0 2px', color: '#1a1f36', letterSpacing: '-0.2px' },
  tableSubtitle:    { margin: 0, fontSize: '13px', color: '#8b95b5', fontWeight: '400' },
  tableBadge:       { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '32px', height: '32px', padding: '0 10px', backgroundColor: '#eef1ff', color: '#2d3a8c', fontWeight: '700', fontSize: '14px', borderRadius: '8px', fontFamily: '"Syne", sans-serif' },
  tableWrapper:     { overflowX: 'auto' },
  table:            { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
  th:               { padding: '12px 20px', fontSize: '11.5px', fontWeight: '700', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8b95b5', backgroundColor: '#f8f9fd', borderBottom: '1px solid #eceef7', textAlign: 'left', fontFamily: '"DM Sans", sans-serif', position: 'sticky', top: 0, zIndex: 1 },
  tr:               { transition: 'background-color 0.14s ease' },
  td:               { padding: '15px 20px', fontSize: '14px', color: '#2d3148', borderBottom: '1px solid #f2f4fb', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxSizing: 'border-box' },
  nameCell:         { fontWeight: '500', color: '#1a1f36' },
  fileLink:         { color: '#2d3a8c', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'color 0.15s' },
  fileIcon:         { fontSize: '11px', opacity: '0.6' },
  deadlineCell:     { fontSize: '13px', color: '#6872a0' },
  actionGroup:      { display: 'inline-flex', gap: '6px', justifyContent: 'center' },
  editBtn:          { padding: '5px 13px', fontSize: '12.5px', fontWeight: '600', color: '#2d3a8c', backgroundColor: '#eef1ff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'background-color 0.15s' },
  deleteBtn:        { padding: '5px 13px', fontSize: '12.5px', fontWeight: '600', color: '#c0392b', backgroundColor: '#fff0ee', border: 'none', borderRadius: '7px', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'background-color 0.15s' },
  chartPanel:       { marginTop: '32px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 4px 24px rgba(45,58,140,0.07)', border: '1px solid #e8eaf4', overflow: 'hidden' },
  chartBody:        { padding: '28px 32px 32px' },
  chartRows:        { display: 'flex', flexDirection: 'column', gap: '28px' },
  chartRow:         { display: 'flex', flexDirection: 'column', gap: '10px' },
  chartMeta:        { display: 'flex', alignItems: 'center', gap: '10px' },
  chartBadge:       { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', fontFamily: '"Syne", sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase' },
  chartCount:       { fontSize: '13px', fontWeight: '500', color: '#8b95b5' },
  barTrack:         { position: 'relative', height: '36px', backgroundColor: '#f5f6fb', borderRadius: '10px', overflow: 'visible' },
  barFill:          { position: 'absolute', top: 0, left: 0, height: '36px', borderRadius: '10px', transition: 'width 0.7s cubic-bezier(0.34,1.56,0.64,1)', minWidth: count => count > 0 ? '8px' : '0' },
  barAxisLabels:    { display: 'flex', justifyContent: 'space-between', marginTop: '6px', paddingLeft: '2px' },
  barAxisLabel:     { fontSize: '11px', color: '#b0b8d0', fontWeight: '500', fontFamily: '"DM Sans", sans-serif' },
  emptyState:       { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px', gap: '8px' },
  emptyIcon:        { fontSize: '36px', marginBottom: '8px' },
  emptyText:        { margin: 0, fontFamily: '"Syne", sans-serif', fontWeight: '700', fontSize: '16px', color: '#3d4468' },
  emptySubtext:     { margin: 0, fontSize: '13.5px', color: '#9ba5c0' },
  reportWrapper:    { display: 'flex', justifyContent: 'flex-end', marginTop: '32px' },
  reportPanel:      { width: '420px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 4px 24px rgba(45,58,140,0.07)', border: '1px solid #e8eaf4', overflow: 'hidden' },
  reportHeader:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 28px 18px', borderBottom: '1px solid #f0f2fa' },
  reportBody:       { padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: '20px' },
  reportStats:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8f9fd', borderRadius: '12px', padding: '16px 20px' },
  reportStat:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 },
  reportStatNum:    { fontFamily: '"Syne", sans-serif', fontWeight: '800', fontSize: '24px', color: '#2d3a8c' },
  reportStatLabel:  { fontSize: '11px', fontWeight: '600', color: '#8b95b5', textTransform: 'uppercase', letterSpacing: '0.05em' },
  reportStatDivider:{ width: '1px', height: '36px', backgroundColor: '#e4e8f0' },
  reportRecent:     { display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', backgroundColor: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a' },
  reportRecentLabel:{ fontSize: '11px', fontWeight: '700', color: '#b7791f', textTransform: 'uppercase', letterSpacing: '0.05em' },
  reportRecentValue:{ fontSize: '13.5px', fontWeight: '500', color: '#78350f' },
  reportBtns:       { display: 'flex', gap: '10px' },
  reportBtnPdf:     { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '12px', fontSize: '13.5px', fontWeight: '700', color: '#ffffff', backgroundColor: '#e53e3e', border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 12px rgba(229,62,62,0.28)', transition: 'transform 0.15s, box-shadow 0.15s' },
  reportBtnXlsx:    { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '12px', fontSize: '13.5px', fontWeight: '700', color: '#ffffff', backgroundColor: '#1a7a4a', border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 12px rgba(26,122,74,0.28)', transition: 'transform 0.15s, box-shadow 0.15s' },
  reportBtnIcon:    { fontSize: '15px' },
};

/* ─── GLOBAL CSS ── */
const globalCSS = `
  * { box-sizing: border-box; }
  .tip-input:focus { border-color: #0436ff !important; background-color: #ffffff !important; box-shadow: 0 0 0 3px rgba(45,58,140,0.1); }
  .tip-filedrop:hover { border-color: #2d3a8c; background-color: #eef1ff; }
  .tip-submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(45,58,140,0.38); }
  .tip-submit-btn:active:not(:disabled) { transform: translateY(0); }
  .tip-cancel-btn:hover { background-color: #f5f6fb; }
  .tip-logout-btn:hover { background-color: #f0f2fa; color: #2d3a8c; border-color: #c5cae8; }
  .tip-action-btn:hover { filter: brightness(0.92); }
  .react-datepicker { font-family: "DM Sans", sans-serif !important; border: 1.5px solid #e4e8f2 !important; border-radius: 12px !important; box-shadow: 0 8px 24px rgba(45,58,140,0.12) !important; }
  .react-datepicker__header { background-color: #f0f2ff !important; border-bottom: 1px solid #e4e8f2 !important; }
  .react-datepicker__day--selected, .react-datepicker__time-list-item--selected { background-color: #2d3a8c !important; }
  .tip-report-pdf:hover  { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(229,62,62,0.38) !important; }
  .tip-report-xlsx:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(26,122,74,0.38) !important; }
  .tip-report-btn:active { transform: translateY(0) !important; }
  @keyframes barGrow { from { width: 0; } to { width: var(--bar-width); } }
  .tip-bar { animation: barGrow 0.7s cubic-bezier(0.34,1.56,0.64,1) both; }
`;

/* ─── RENDER ── */
createRoot(document.getElementById('app')).render(<App />);
