const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const app = express();

// Middleware for parsing JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session and Passport middleware
app.use(session({
  secret: 'your_secret_key', // Change this to your own secret key
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// In-memory user storage (for simplicity, use a database in production)
const users = [];

// Passport local strategy for user authentication
passport.use(new LocalStrategy((username, password, done) => {
  const user = users.find(user => user.username === username);
  if (!user) {
    return done(null, false, { message: 'Incorrect username.' });
  }
  bcrypt.compare(password, user.password, (err, isMatch) => {
    if (err) throw err;
    if (isMatch) {
      return done(null, user);
    } else {
      return done(null, false, { message: 'Incorrect password.' });
    }
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.username);
});

passport.deserializeUser((username, done) => {
  const user = users.find(user => user.username === username);
  done(null, user);
});

// User registration route
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const existingUser = users.find(user => user.username === username);

  if (existingUser) {
    return res.status(400).json({ message: 'User already exists.' });
  }

  // Hash the password and store the new user
  bcrypt.genSalt(10, (err, salt) => {
    bcrypt.hash(password, salt, (err, hash) => {
      if (err) throw err;
      users.push({ username, password: hash });
      res.status(201).json({ message: 'User registered successfully!' });
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

// Protected dashboard route (only accessible if logged in)
app.get('/dashboard', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ message: `Welcome, ${req.user.username}!` });
  } else {
    res.status(401).json({ message: 'Please log in first.' });
  }
});

// Default route (for testing the server)
app.get('/', (req, res) => {
  res.send('Welcome to the AI Copywriting Service');
});

// Listen on the correct port (Heroku sets this dynamically)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
