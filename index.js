retconst express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const { Pool } = require('pg'); // PostgreSQL client
const path = require('path'); // For serving static files
const app = express();

// Connect to PostgreSQL (replace with your DATABASE_URL from Heroku or local)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://username:password@localhost:5432/ai_copywriting',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Middleware for parsing JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Session and Passport middleware
app.use(session({
  secret: 'secret', // Change this to your own secret key
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Create Users and Copy Tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS copy_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    prompt TEXT NOT NULL,
    generated_copy TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`, (err) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables created or already exist');
  }
});

// Passport local strategy for user authentication
passport.use(new LocalStrategy((username, password, done) => {
  pool.query('SELECT * FROM users WHERE username = $1', [username], (err, result) => {
    if (err) return done(err);
    if (result.rows.length === 0) return done(null, false, { message: 'Incorrect username.' });

    const user = result.rows[0];
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) throw err;
      if (isMatch) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Incorrect password.' });
      }
    });
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  pool.query('SELECT * FROM users WHERE id = $1', [id], (err, result) => {
    if (err) return done(err);
    return done(null, result.rows[0]);
  });
});

// User registration route
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  
  pool.query('SELECT * FROM users WHERE username = $1', [username], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (result.rows.length > 0) return res.status(400).json({ message: 'User already exists' });

    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(password, salt, (err, hash) => {
        if (err) throw err;
        pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash], (err) => {
          if (err) return res.status(500).json({ message: 'Error registering user' });
          res.status(201).json({ message: 'User registered successfully!' });
        });
      });
    });
  });
});

// User login route
app.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({ message: 'Logged in successfully!' });
});

// User logout route
app.post('/logout', (req, res) => {
  req.logout(() => {
    res.json({ message: 'Logged out successfully!' });
  });
});

// Save generated copy route (requires authentication)
app.post('/save-copy', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Please log in first.' });
  }

  const { prompt, generatedCopy } = req.body;
  pool.query('INSERT INTO copy_history (user_id, prompt, generated_copy) VALUES ($1, $2, $3)', 
    [req.user.id, prompt, generatedCopy], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to save copy', error: err });
      res.json({ message: 'Copy saved successfully!' });
  });
});

// Get user copy history (requires authentication)
app.get('/copy-history', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Please log in first.' });
  }

  pool.query('SELECT * FROM copy_history WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to retrieve copy history', error: err });
    res.json(result.rows);
  });
});

// Serve the user dashboard
app.get('/dashboard', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile(path.join(__dirname, 'public/dashboard.html'));
  } else {
    res.redirect('/login'); // Redirect to login if not authenticated
  }
});

// Protected dashboard route (API example)
app.get('/dashboard-api', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ message: `Welcome, ${req.user.username}!` });
  } else {
    res.status(401).json({ message: 'Please log in first.' });
  }
});

// Default route
app.get('/', (req, res) => {
  res.send('Welcome to the AI Copywriting Service');
});

// Listen on the correct port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
