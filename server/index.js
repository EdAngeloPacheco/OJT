const express = require('express');
const cors = require('cors');
const { Pool } = require("pg");
const multer = require('multer');
const path = require('path');
const fs = require('fs'); 
const { google } = require('googleapis');
const notifier = require('node-notifier');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = "your_super_secret_key_here";

// 1. MIDDLEWARE
app.use(cors());
app.use(express.json());

// Ensure 'uploads' folder exists automatically
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// --- GOOGLE DRIVE CONFIGURATION ---
const KEYFILEPATH = path.join(__dirname, 'neural-house-489802-m5-51bf90f3d04a.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
});
const driveService = google.drive({ version: 'v3', auth });

// Multer Storage Logic
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); 
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// 2. DATABASE CONNECTION
const pool = new Pool({
    user: "postgres", 
    password: "admin123",
    host: "localhost",
    port: 5432,
    database: "ilovetip"
});
//Error handling for database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✓ Database connected successfully to "ilovetip"');
    }
});

// 3. API for Users (CRUD Operations)
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// This route is for testing the JOIN between users and accounts tables
app.get('/api/users', async (req, res) => {
    try {
        const sql = `
            SELECT users.id, users.username, users.email, accounts.password 
            FROM users 
            LEFT JOIN accounts ON users.id = accounts.user_id
        `;
        const result = await pool.query(sql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { username, email } = req.body; 
        const newUser = await pool.query(
            "INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *",
            [username, email] 
        );
        res.json(newUser.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email } = req.body;
        const updateUser = await pool.query(
            "UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING *",
            [username, email, id]
        );
        res.json("User was updated!");
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Updated Delete Route
app.delete('/api/uploads/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get the filename first so we can delete it from the 'link' table too
    const findFile = await pool.query("SELECT file_name FROM uploads WHERE id = $1", [id]);
    
    if (findFile.rows.length > 0) {
      const fileName = findFile.rows[0].file_name;
      
      // 2. Delete from 'link' table (stops the notifications)
      await pool.query("DELETE FROM link WHERE file_name = $1", [fileName]);
    }

    // 3. Delete from 'uploads' table (removes from frontend list)
    const deleteOp = await pool.query("DELETE FROM uploads WHERE id = $1", [id]);

    if (deleteOp.rowCount === 0) {
      return res.status(404).json("Item not found in database.");
    }

    res.json("Deleted successfully from both tables!");
  } catch (err) {
    console.error("Delete Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// New endpoint to view purely account credentials linked to user IDs
app.get('/api/accounts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM accounts');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. API for View Lists
app.get('/api/uploads', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM uploads');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Added this so you can see your Drive links too
app.get('/api/links', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM link');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. THE MERGED UPLOAD ROUTE
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file selected.');

    const { username, email, deadline } = req.body; 

    // --- STEP A: Save/Update User ---
    // Added "ON CONFLICT" so it doesn't error out if the email already exists
    await pool.query(
      "INSERT INTO users (username, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
      [username, email]
    );

    // --- STEP B: Upload to Google Drive ---
    const fileMetadata = {
      name: req.file.originalname,
      parents: ['1mAwRNiE_uD5i_VfzGuX_i1slb3-s1mgB'], 
    };
    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path),
    };

    const gDriveFile = await driveService.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const driveLink = gDriveFile.data.webViewLink;

    // --- STEP C: Save to 'link' table (For the Cron Notifier) ---
    await pool.query(
      "INSERT INTO link (file_name, gdrive_url, deadline, notified, notified_now) VALUES ($1, $2, $3, false, false)",
      [req.file.originalname, driveLink, deadline]
    );

    // --- STEP D: Save to 'uploads' table (For your Frontend Dashboard) ---
    const newRecord = await pool.query(
      "INSERT INTO uploads (username, email, file_name, deadline, gdrive_url) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [username, email, req.file.originalname, deadline, driveLink]
    );

    // --- STEP E: Clean up local storage ---
    fs.unlinkSync(req.file.path);

    console.log(`✅ Database Synced: ${username} | File: ${req.file.originalname}`);
    res.json({ message: 'Submission successful!', data: newRecord.rows[0] });

  } catch (err) {
    console.error("❌ Critical Upload Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- BACKGROUND CHECKER (Double Alert System) ---
console.log('✓ Cron Job Initialized: Scanning every 30 seconds...');

cron.schedule('*/30 * * * * *', async () => { 
    try {

        const allTasks = await pool.query("SELECT file_name, deadline, notified, notified_now FROM link");
        
        if (allTasks.rows.length === 0) {
            console.log("Empty Database: No files found to notify.");
        }

        allTasks.rows.forEach(task => {
        
        });
        // --- ALERT 1: 10 MINUTE WARNING ---
        const earlyWarning = await pool.query(
            `SELECT * FROM link 
             WHERE deadline <= LOCALTIMESTAMP + INTERVAL '10 minutes' 
             AND deadline > LOCALTIMESTAMP
             AND notified = false`
        );

        earlyWarning.rows.forEach(task => {
            notifier.notify({
                title: '⚠️ Upcoming Deadline!',
                message: `Reminder: "${task.file_name}" is due in 10 minutes.`,
                icon: path.join(__dirname, 'TIPlogo.png'),
                appName: 'I Love TIP',
                sound: true,
                wait: true
            });
            pool.query("UPDATE link SET notified = true WHERE id = $1", [task.id]);
            console.log(`🚀 10-min warning sent for: ${task.file_name}`);
        });

        // --- ALERT 2: DEADLINE IS NOW! ---
            const finalAlert = await pool.query(
            `SELECT * FROM link 
            WHERE deadline <= LOCALTIMESTAMP 
            AND notified_now = false`
);

        finalAlert.rows.forEach(task => {
            notifier.notify({
                title: '⏰ DEADLINE REACHED!',
                message: `The time for "${task.file_name}" is UP!`,
                icon: path.join(__dirname, 'TIPlogo.png'),
                appName: 'I Love TIP',
                sound: true,
                wait: true
            });
            pool.query("UPDATE link SET notified_now = true WHERE id = $1", [task.id]);
            console.log(`🔥 FINAL notification sent for: ${task.file_name}`);
        });

    } catch (err) {
        // If there is a database error (like a missing column), it will show up here
        console.error("❌ Cron Error:", err.message);
    }
});

app.post('/api/register', async (req, res) => {
    const client = await pool.connect(); 
    try {
        const { username, email, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await client.query('BEGIN'); // Start transaction

        // 1. Insert into users table (No password column here anymore)
        const userRes = await client.query(
            "INSERT INTO users (username, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
            [username, email]
        );

        if (userRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json("This email is already registered.");
        }

        const newUserId = userRes.rows[0].id;

        // 2. Insert the hashed password into the new accounts table linked by user_id
        await client.query(
            "INSERT INTO accounts (user_id, password) VALUES ($1, $2)",
            [newUserId, hashedPassword]
        );

        await client.query('COMMIT'); // Finalize both inserts
        res.json({ message: "User registered successfully!", userId: newUserId });

    } catch (err) {
        await client.query('ROLLBACK'); // Undo changes if any step fails
        console.error("Registration Error:", err.message);
        res.status(500).json("Server error during registration.");
    } finally {
        client.release();
    }
});
// --- LOGIN ROUTE ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // We MUST join with accounts to get the password field
        const userQuery = await pool.query(`
            SELECT users.*, accounts.password 
            FROM users 
            JOIN accounts ON users.id = accounts.user_id 
            WHERE users.email = $1
        `, [email]);

        if (userQuery.rows.length === 0) return res.status(401).json("Invalid Credentials");

        // Now userQuery.rows[0].password exists because of the JOIN
        const validPassword = await bcrypt.compare(password, userQuery.rows[0].password);
        
        if (!validPassword) return res.status(401).json("Invalid Credentials");

        const token = jwt.sign({ id: userQuery.rows[0].id }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ token, user: { username: userQuery.rows[0].username, email: userQuery.rows[0].email } });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

app.listen(5000, () => {
    console.log('🚀 Server is running on http://localhost:5000');
});