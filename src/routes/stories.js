const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => cb(null, `story_${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /api/stories - Get stories from followed users
router.get('/', (req, res) => {
  try {
    // Clean up expired stories
    run("DELETE FROM stories WHERE expires_at < datetime('now')", []);
    
    // Get stories from followed users + own
    const stories = all(`
      SELECT s.*, u.username, u.display_name, u.avatar_url,
             (SELECT COUNT(*) FROM story_views sv WHERE sv.story_id = s.id) as view_count
      FROM stories s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = ?
        UNION SELECT ?
      )
      AND s.expires_at > datetime('now')
      ORDER BY s.created_at DESC
    `, [req.user.id, req.user.id]);
    
    // Group by user
    const userStories = {};
    stories.forEach(story => {
      if (!userStories[story.user_id]) {
        userStories[story.user_id] = {
          user: {
            id: story.user_id,
            username: story.username,
            display_name: story.display_name,
            avatar_url: story.avatar_url
          },
          stories: [],
          has_unseen: false
        };
      }
      
      const viewed = get('SELECT id FROM story_views WHERE story_id = ? AND user_id = ?',
        [story.id, req.user.id]);
      
      userStories[story.user_id].stories.push({
        ...story,
        viewed: !!viewed
      });
      
      if (!viewed) {
        userStories[story.user_id].has_unseen = true;
      }
    });
    
    res.json({ success: true, data: { users: Object.values(userStories) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/stories - Create story
router.post('/', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image is required' });
    }
    
    const { caption } = req.body;
    const id = uuidv4();
    const image_url = `/uploads/${req.file.filename}`;
    
    // Stories expire after 24 hours
    run(`
      INSERT INTO stories (id, user_id, image_url, caption, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', '+24 hours'))
    `, [id, req.user.id, image_url, caption || '']);
    
    res.status(201).json({
      success: true,
      data: { id, image_url, caption }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/stories/:id/view - Mark story as viewed
router.post('/:id/view', (req, res) => {
  try {
    const story = get('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    
    const existing = get('SELECT id FROM story_views WHERE story_id = ? AND user_id = ?',
      [req.params.id, req.user.id]);
    
    if (!existing) {
      run('INSERT INTO story_views (id, story_id, user_id) VALUES (?, ?, ?)',
        [uuidv4(), req.params.id, req.user.id]);
      run('UPDATE stories SET views_count = views_count + 1 WHERE id = ?', [req.params.id]);
    }
    
    res.json({ success: true, message: 'Story viewed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stories/:id/viewers - Get story viewers
router.get('/:id/viewers', (req, res) => {
  try {
    const story = get('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    
    // Only story owner can see viewers
    if (story.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    const viewers = all(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, sv.viewed_at
      FROM story_views sv
      JOIN users u ON sv.user_id = u.id
      WHERE sv.story_id = ?
      ORDER BY sv.viewed_at DESC
    `, [req.params.id]);
    
    res.json({ success: true, data: { viewers } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/stories/:id
router.delete('/:id', (req, res) => {
  try {
    const story = get('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    
    if (story.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    run('DELETE FROM story_views WHERE story_id = ?', [req.params.id]);
    run('DELETE FROM stories WHERE id = ?', [req.params.id]);
    
    res.json({ success: true, message: 'Story deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
