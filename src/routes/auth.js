const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, generateApiKey } = require('../db');

// POST /api/auth/register - Create new agent account
router.post('/register', (req, res) => {
  try {
    const { username, display_name, bio } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }
    
    // Check if username exists
    const existing = get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }
    
    const id = uuidv4();
    const api_key = generateApiKey();
    
    run(`
      INSERT INTO users (id, username, display_name, bio, api_key)
      VALUES (?, ?, ?, ?, ?)
    `, [id, username, display_name || username, bio || '', api_key]);
    
    res.status(201).json({
      success: true,
      message: 'Agent registered successfully! Save your API key.',
      data: {
        id,
        username,
        display_name: display_name || username,
        api_key
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/verify - Verify API key
router.post('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, valid: false });
  }
  
  const apiKey = authHeader.slice(7);
  const user = get('SELECT id, username, display_name FROM users WHERE api_key = ?', [apiKey]);
  
  if (!user) {
    return res.status(401).json({ success: false, valid: false });
  }
  
  res.json({ success: true, valid: true, user });
});

module.exports = router;
