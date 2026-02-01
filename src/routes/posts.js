const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { run, get, all, extractHashtags, extractMentions, createNotification, updateKarma } = require('../db');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
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

// POST /api/posts - Create new post
router.post('/', upload.single('image'), (req, res) => {
  try {
    const { caption, community } = req.body;
    const id = uuidv4();
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    // Extract hashtags and mentions
    const hashtags = extractHashtags(caption);
    const mentions = extractMentions(caption);
    
    // Get community if specified
    let community_id = null;
    if (community) {
      const comm = get('SELECT id FROM communities WHERE name = ?', [community]);
      if (comm) community_id = comm.id;
    }
    
    run(`
      INSERT INTO posts (id, user_id, community_id, image_url, caption, hashtags, mentions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, req.user.id, community_id, image_url, caption || '', JSON.stringify(hashtags), JSON.stringify(mentions)]);
    
    // Process hashtags
    hashtags.forEach(tag => {
      let hashtag = get('SELECT id FROM hashtags WHERE name = ?', [tag]);
      if (!hashtag) {
        const hid = uuidv4();
        run('INSERT INTO hashtags (id, name, post_count) VALUES (?, ?, 1)', [hid, tag]);
        hashtag = { id: hid };
      } else {
        run('UPDATE hashtags SET post_count = post_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [hashtag.id]);
      }
      run('INSERT OR IGNORE INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?)', [id, hashtag.id]);
    });
    
    // Process mentions - create notifications
    mentions.forEach(username => {
      const mentioned = get('SELECT id FROM users WHERE username = ?', [username]);
      if (mentioned) {
        createNotification(mentioned.id, 'mention', req.user.id, id, null, caption);
      }
    });
    
    // Update karma
    updateKarma(req.user.id, 5);
    
    res.status(201).json({
      success: true,
      data: {
        id,
        image_url,
        caption,
        hashtags,
        mentions,
        author: req.user.username,
        community: community || null,
        likes_count: 0,
        comments_count: 0,
        reposts_count: 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:id/repost - Repost
router.post('/:id/repost', (req, res) => {
  try {
    const original = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!original) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    // Check if already reposted
    const existing = get('SELECT id FROM posts WHERE user_id = ? AND original_post_id = ?', 
      [req.user.id, req.params.id]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Already reposted' });
    }
    
    const id = uuidv4();
    const { comment } = req.body;
    
    run(`
      INSERT INTO posts (id, user_id, image_url, caption, is_repost, original_post_id)
      VALUES (?, ?, ?, ?, 1, ?)
    `, [id, req.user.id, original.image_url, comment || '', req.params.id]);
    
    run('UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = ?', [req.params.id]);
    
    // Notify original author
    createNotification(original.user_id, 'repost', req.user.id, req.params.id);
    updateKarma(original.user_id, 3);
    
    res.status(201).json({ success: true, data: { id, original_post_id: req.params.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/posts/:id
router.get('/:id', (req, res) => {
  try {
    const post = get(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.karma, u.is_verified,
             c.name as community_name, c.display_name as community_display_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      WHERE p.id = ?
    `, [req.params.id]);
    
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    // Increment views
    run('UPDATE posts SET views_count = views_count + 1 WHERE id = ?', [req.params.id]);
    
    // Get original post if repost
    let originalPost = null;
    if (post.is_repost && post.original_post_id) {
      originalPost = get(`
        SELECT p.*, u.username, u.display_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `, [post.original_post_id]);
    }
    
    // Get comments
    const comments = all(`
      SELECT c.*, u.username, u.display_name, u.avatar_url, u.is_verified
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [req.params.id]);
    
    const liked = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
      [req.user.id, req.params.id]);
    
    res.json({
      success: true,
      data: {
        ...post,
        hashtags: JSON.parse(post.hashtags || '[]'),
        mentions: JSON.parse(post.mentions || '[]'),
        comments,
        liked: !!liked,
        original_post: originalPost
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', (req, res) => {
  try {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    if (post.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    run('DELETE FROM comments WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM likes WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM post_hashtags WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:id/like
router.post('/:id/like', (req, res) => {
  try {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    const existing = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
      [req.user.id, req.params.id]);
    
    if (existing) {
      return res.json({ success: true, message: 'Already liked', liked: true });
    }
    
    run('INSERT INTO likes (id, user_id, post_id) VALUES (?, ?, ?)',
      [uuidv4(), req.user.id, req.params.id]);
    run('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', [req.params.id]);
    
    // Notify and karma
    createNotification(post.user_id, 'like', req.user.id, req.params.id);
    updateKarma(post.user_id, 1);
    
    res.json({ success: true, message: 'Post liked', liked: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:id/like
router.delete('/:id/like', (req, res) => {
  try {
    const existing = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
      [req.user.id, req.params.id]);
    
    if (!existing) {
      return res.json({ success: true, message: 'Not liked', liked: false });
    }
    
    run('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [req.user.id, req.params.id]);
    run('UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?', [req.params.id]);
    
    res.json({ success: true, message: 'Post unliked', liked: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:id/comment
router.post('/:id/comment', (req, res) => {
  try {
    const { content, parent_id } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }
    
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    const id = uuidv4();
    run('INSERT INTO comments (id, user_id, post_id, parent_id, content) VALUES (?, ?, ?, ?, ?)',
      [id, req.user.id, req.params.id, parent_id || null, content]);
    run('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', [req.params.id]);
    
    // Notify and karma
    createNotification(post.user_id, 'comment', req.user.id, req.params.id, id, content);
    updateKarma(req.user.id, 2);
    
    // Check for mentions in comment
    const mentions = extractMentions(content);
    mentions.forEach(username => {
      const mentioned = get('SELECT id FROM users WHERE username = ?', [username]);
      if (mentioned && mentioned.id !== post.user_id) {
        createNotification(mentioned.id, 'mention', req.user.id, req.params.id, id, content);
      }
    });
    
    res.status(201).json({
      success: true,
      data: {
        id,
        content,
        author: req.user.username,
        post_id: req.params.id
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
