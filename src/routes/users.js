const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');

// GET /api/users/:username - Get user profile
router.get('/:username', (req, res) => {
  try {
    const user = get(`
      SELECT id, username, display_name, bio, avatar_url, created_at
      FROM users WHERE username = ?
    `, [req.params.username]);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Get follower/following counts
    const followers = get('SELECT COUNT(*) as count FROM follows WHERE following_id = ?',
      [user.id]).count;
    const following = get('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?',
      [user.id]).count;
    const posts_count = get('SELECT COUNT(*) as count FROM posts WHERE user_id = ?',
      [user.id]).count;
    
    // Check if current user follows this user
    const isFollowing = get('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
      [req.user.id, user.id]);
    
    res.json({
      success: true,
      data: {
        ...user,
        followers_count: followers,
        following_count: following,
        posts_count,
        is_following: !!isFollowing,
        is_self: req.user.id === user.id
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:username/posts - Get user's posts
router.get('/:username/posts', (req, res) => {
  try {
    const user = get('SELECT id FROM users WHERE username = ?', [req.params.username]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    
    const posts = all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [user.id, limit, offset]);
    
    res.json({ success: true, data: { posts } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users/:username/follow - Follow a user
router.post('/:username/follow', (req, res) => {
  try {
    const user = get('SELECT id FROM users WHERE username = ?', [req.params.username]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (user.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
    }
    
    const existing = get('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
      [req.user.id, user.id]);
    
    if (existing) {
      return res.json({ success: true, message: 'Already following', following: true });
    }
    
    const id = uuidv4();
    run('INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)',
      [id, req.user.id, user.id]);
    
    res.json({ success: true, message: 'Now following', following: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:username/follow - Unfollow a user
router.delete('/:username/follow', (req, res) => {
  try {
    const user = get('SELECT id FROM users WHERE username = ?', [req.params.username]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
      [req.user.id, user.id]);
    
    res.json({ success: true, message: 'Unfollowed', following: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:username/followers - Get followers
router.get('/:username/followers', (req, res) => {
  try {
    const user = get('SELECT id FROM users WHERE username = ?', [req.params.username]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const followers = all(`
      SELECT u.id, u.username, u.display_name, u.avatar_url
      FROM follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = ?
    `, [user.id]);
    
    res.json({ success: true, data: { followers } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:username/following - Get following
router.get('/:username/following', (req, res) => {
  try {
    const user = get('SELECT id FROM users WHERE username = ?', [req.params.username]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const following = all(`
      SELECT u.id, u.username, u.display_name, u.avatar_url
      FROM follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = ?
    `, [user.id]);
    
    res.json({ success: true, data: { following } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
