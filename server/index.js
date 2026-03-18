/*
  ┌──────────────────────────────────────────────────────┐
  │  server.js — I Love TIP Backend                      │
  │                                                       │
  │  Structure:                                           │
  │  1. Setup & Config   imports, app, Google Drive auth  │
  │  2. Database         PostgreSQL pool + health check   │
  │  3. Auth Routes      /register, /login                │
  │  4. User Routes      CRUD for the users table         │
  │  5. Upload Routes    file upload + Google Drive sync  │
  │  6. Cron Job         deadline notifier (desktop+email)│
  │  7. Google Calendar  auto-create events on submission  │
  └──────────────────────────────────────────────────────┘
*/


/* ─── 1. SETUP & CONFIG ───────────────────────────────── */

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const { Pool }    = require('pg');
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const { google }  = require('googleapis');
const nodemailer  = require('nodemailer');
const notifier    = require('node-notifier');
const cron        = require('node-cron');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

// Create the local uploads folder if it does not already exist.
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ── Google Drive auth (service account) ──
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.split(String.raw`\n`).join('\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const driveService = google.drive({ version: 'v3', auth });

// ── Google Calendar auth (personal OAuth2) ──
// Uses the same Gmail OAuth2 credentials to create calendar events.
// CALENDAR_REFRESH_TOKEN must be generated with the calendar.events scope.
const calendarOAuth2 = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
calendarOAuth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN }); // same token — all scopes authorized together
const calendarService = google.calendar({ version: 'v3', auth: calendarOAuth2 });

// Creates a Google Calendar event for a submission deadline.
// Placed 10 minutes before the deadline as an extra reminder.
const createCalendarEvent = async ({ title, email, deadline, driveUrl }) => {
  try {
    const deadlineDate = new Date(deadline);
    const reminderDate = new Date(deadlineDate.getTime() - 10 * 60000);

    await calendarService.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary:     `📄 Deadline: ${title}`,
        description: `Submitted by: ${email}\nFile: ${driveUrl}`,
        start: { dateTime: reminderDate.toISOString() },
        end:   { dateTime: deadlineDate.toISOString() },
        attendees:   [{ email }],
        reminders: {
          useDefault: false,
          overrides:  [
            { method: 'email', minutes: 10 },
            { method: 'popup', minutes: 10 },
          ],
        },
        colorId: '11', // Tomato red — stands out on the calendar
      },
    });
    console.log(`📅 Calendar event created: "${title}" for ${email}`);
  } catch (err) {
    console.error('❌ Calendar event failed:', err.message);
  }
};

// ── Gmail SMTP transporter ──
// Auth credentials are passed per-send via a fresh access token,
// bypassing nodemailer's unreliable built-in OAuth2 refresh.
const gmailTransporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   465,
  secure: true,
});

// Multer stores incoming files in /uploads with a timestamp prefix.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });


/* ─── 2. DATABASE ─────────────────────────────────────── */

const pool = new Pool({
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
});

pool.query('SELECT NOW()', (err) => {
  if (err) console.error('❌ Database connection failed:', err.message);
  else     console.log('✓ Database connected successfully to "ilovetip"');
});


/* ─── 3. AUTH ROUTES ──────────────────────────────────── */

app.post('/api/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));

    await client.query('BEGIN');

    const userRes = await client.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id',
      [username, email]
    );

    if (userRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json('This email is already registered.');
    }

    await client.query(
      'INSERT INTO accounts (user_id, password) VALUES ($1, $2)',
      [userRes.rows[0].id, hashedPassword]
    );

    await client.query('COMMIT');
    res.json({ message: 'User registered successfully!', userId: userRes.rows[0].id });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Registration Error:', err.message);
    res.status(500).json('Server error during registration.');
  } finally {
    client.release();
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT users.*, accounts.password
       FROM users
       JOIN accounts ON users.id = accounts.user_id
       WHERE users.email = $1`,
      [email]
    );

    if (result.rows.length === 0) return res.status(401).json('Invalid credentials.');

    const isValid = await bcrypt.compare(password, result.rows[0].password);
    if (!isValid) return res.status(401).json('Invalid credentials.');

    const token = jwt.sign({ id: result.rows[0].id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { username: result.rows[0].username, email: result.rows[0].email } });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error.');
  }
});


/* ─── 4. USER ROUTES ──────────────────────────────────── */

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT users.id, users.username, users.email, accounts.password
       FROM users
       LEFT JOIN accounts ON users.id = accounts.user_id`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, email } = req.body;
    const result = await pool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
      [username, email]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { username, email } = req.body;
    await pool.query(
      'UPDATE users SET username = $1, email = $2 WHERE id = $3',
      [username, email, req.params.id]
    );
    res.json('User updated successfully.');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ─── 5. UPLOAD / SUBMISSION ROUTES ──────────────────── */

app.get('/api/uploads', async (req, res) => {
  try {
    // FIX: added created_at to the SELECT so the frontend "Most Recent" logic works.
    // Make sure your uploads table has a created_at column:
    //   ALTER TABLE uploads ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    const result = await pool.query('SELECT * FROM uploads ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM link');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file was attached.');

    const { username, email, deadline } = req.body;

    // Step A: Ensure the submitter exists in the users table.
    await pool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
      [username, email]
    );

    // Step B: Upload the file to Google Drive.
    const gDriveFile = await driveService.files.create({
      resource: {
        name: req.file.originalname,
        parents: ['1mAwRNiE_uD5i_VfzGuX_i1slb3-s1mgB'],
      },
      media: {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path),
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    // Make the file publicly viewable — "Anyone with the link can view".
    // Without this, recipients get a "Request access" prompt instead of seeing the file.
    await driveService.permissions.create({
      fileId:           gDriveFile.data.id,
      requestBody:      { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });

    const driveLink = gDriveFile.data.webViewLink;

    // Step C: Insert into the link table for cron tracking.
    // email is stored here so the cron job can send deadline emails without a JOIN.
    await pool.query(
      'INSERT INTO link (file_name, gdrive_url, deadline, email, notified, notified_now) VALUES ($1, $2, $3, $4, false, false)',
      [req.file.originalname, driveLink, deadline, email]
    );

    // Step D: Insert into uploads table with created_at defaulting to NOW().
    // FIX: created_at is now returned so the frontend "Most Recent" stat works correctly.
    const newRecord = await pool.query(
      'INSERT INTO uploads (username, email, file_name, deadline, gdrive_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [username, email, req.file.originalname, deadline, driveLink]
    );

    // Step E: Delete temp file from local disk.
    fs.unlinkSync(req.file.path);

    // Step F: Create a Google Calendar event for the deadline.
    await createCalendarEvent({
      title:    req.file.originalname,
      email,
      deadline,
      driveUrl: driveLink,
    });

    console.log(`✅ Synced: ${username} | ${req.file.originalname}`);
    res.json({ message: 'Submission successful!', data: newRecord.rows[0] });

  } catch (err) {
    console.error('❌ Upload Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/uploads/:id', async (req, res) => {
  try {
    const { username, email, deadline } = req.body;
    const result = await pool.query(
      'UPDATE uploads SET username = $1, email = $2, deadline = $3 WHERE id = $4 RETURNING *',
      [username, email, deadline, req.params.id]
    );

    if (result.rowCount === 0) return res.status(404).json('Submission not found.');

    // Keep the link table in sync so the cron notifier uses the correct deadline and email.
    await pool.query(
      'UPDATE link SET deadline = $1, email = $2 WHERE file_name = $3',
      [deadline, email, result.rows[0].file_name]
    );

    res.json({ message: 'Submission updated.', data: result.rows[0] });
  } catch (err) {
    console.error('Update Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/uploads/:id', async (req, res) => {
  try {
    const findFile = await pool.query('SELECT file_name FROM uploads WHERE id = $1', [req.params.id]);

    if (findFile.rows.length > 0) {
      await pool.query('DELETE FROM link WHERE file_name = $1', [findFile.rows[0].file_name]);
    }

    const deleteOp = await pool.query('DELETE FROM uploads WHERE id = $1', [req.params.id]);

    if (deleteOp.rowCount === 0) return res.status(404).json('Item not found.');

    res.json('Deleted successfully.');
  } catch (err) {
    console.error('Delete Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


/* ─── 6. CRON JOB ─────────────────────────────────────── */

// Sends an email by fetching a fresh access token via calendarOAuth2 each time.
// This avoids nodemailer's unreliable built-in token refresh entirely.
const sendDeadlineEmail = async ({ to, subject, fileName, deadline, driveUrl, isWarning }) => {
  const deadlineStr = new Date(deadline).toLocaleString();
  const actionLine  = isWarning
    ? `Your file <strong>"${fileName}"</strong> is due in <strong>10 minutes</strong> at ${deadlineStr}.`
    : `The deadline for <strong>"${fileName}"</strong> has been reached at ${deadlineStr}.`;

  try {
    // Always fetch a fresh access token — googleapis handles the refresh automatically.
    const { token: accessToken } = await calendarOAuth2.getAccessToken();

    await gmailTransporter.sendMail({
      from:    `"I Love TIP" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      auth: {
        type:         'OAuth2',
        user:         process.env.GMAIL_USER,
        clientId:     process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
        accessToken,
      },
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e4e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:#2d3a8c;padding:24px 32px;">
            <h2 style="color:#ffffff;margin:0;font-size:20px;">I Love TIP — Submission Portal</h2>
          </div>
          <div style="padding:28px 32px;background:#ffffff;">
            <p style="font-size:15px;color:#1a1f36;margin:0 0 16px;">${actionLine}</p>
            ${driveUrl ? `<a href="${driveUrl}" style="display:inline-block;padding:10px 20px;background:#2d3a8c;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View File on Drive ↗</a>` : ''}
          </div>
          <div style="padding:16px 32px;background:#f8f9fd;border-top:1px solid #eceef7;">
            <p style="font-size:12px;color:#8b95b5;margin:0;">This is an automated reminder from I Love TIP.</p>
          </div>
        </div>
      `,
    });
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`❌ Email failed to ${to}:`, err.message);
  }
};

console.log('✓ Cron job initialized — scanning every 30 seconds.');

cron.schedule('*/30 * * * * *', async () => {
  try {

    // Alert 1: files due within the next 10 minutes, not yet warned.
    const earlyWarning = await pool.query(
      `SELECT * FROM link
       WHERE deadline <= LOCALTIMESTAMP + INTERVAL '10 minutes'
         AND deadline >  LOCALTIMESTAMP
         AND notified  = false`
    );

    for (const task of earlyWarning.rows) {
      // Desktop notification
      notifier.notify({
        title:   '⚠️ Upcoming Deadline!',
        message: `"${task.file_name}" is due in 10 minutes.`,
        icon:    path.join(__dirname, 'TIPlogo.png'),
        appName: 'I Love TIP',
        sound:   true,
        wait:    true,
      });

      // Email notification — only fires if the link row has a stored email address.
      if (task.email) {
        await sendDeadlineEmail({
          to:        task.email,
          subject:   `⚠️ Reminder: "${task.file_name}" is due in 10 minutes`,
          fileName:  task.file_name,
          deadline:  task.deadline,
          driveUrl:  task.gdrive_url,
          isWarning: true,
        });
      }

      await pool.query('UPDATE link SET notified = true WHERE id = $1', [task.id]);
      console.log(`🚀 10-min warning sent: ${task.file_name}`);
    }

    // Alert 2: files whose deadline has passed, final alert not yet sent.
    const finalAlert = await pool.query(
      `SELECT * FROM link
       WHERE deadline     <= LOCALTIMESTAMP
         AND notified_now  = false`
    );

    for (const task of finalAlert.rows) {
      // Desktop notification
      notifier.notify({
        title:   '⏰ DEADLINE REACHED!',
        message: `Time is up for "${task.file_name}"!`,
        icon:    path.join(__dirname, 'TIPlogo.png'),
        appName: 'I Love TIP',
        sound:   true,
        wait:    true,
      });

      // Email notification
      if (task.email) {
        await sendDeadlineEmail({
          to:        task.email,
          subject:   `⏰ Deadline Reached: "${task.file_name}"`,
          fileName:  task.file_name,
          deadline:  task.deadline,
          driveUrl:  task.gdrive_url,
          isWarning: false,
        });
      }

      await pool.query('UPDATE link SET notified_now = true WHERE id = $1', [task.id]);
      console.log(`🔥 Final alert sent: ${task.file_name}`);
    }

  } catch (err) {
    console.error('❌ Cron Error:', err.message);
  }
});


/* ─── START SERVER ────────────────────────────────────── */

app.listen(5000, () => {
  console.log('🚀 Server running on http://localhost:5000');
});