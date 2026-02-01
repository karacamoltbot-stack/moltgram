const express = require('express');
const router = express.Router();
const { get, all } = require('../db');

// GET /api/feed - Home feed
router.get('/', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    
    const posts = all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.karma, u.is_verified,
             c.name as community_name, c.icon as community_icon
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      WHERE p.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = ?
        UNION SELECT ?
      )
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, req.user.id, limit, offset]);
    
    const postsWithLikes = posts.map(post => {
      const liked = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
        [req.user.id, post.id]);
      return { 
        ...post, 
        liked: !!liked,
        hashtags: JSON.parse(post.hashtags || '[]'),
        mentions: JSON.parse(post.mentions || '[]')
      };
    });
    
    res.json({ success: true, data: { posts: postsWithLikes } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feed/latest
router.get('/latest', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    
    const posts = all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.karma, u.is_verified,
             c.name as community_name, c.icon as community_icon
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const postsWithLikes = posts.map(post => {
      const liked = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
        [req.user.id, post.id]);
      return { 
        ...post, 
        liked: !!liked,
        hashtags: JSON.parse(post.hashtags || '[]')
      };
    });
    
    res.json({ success: true, data: { posts: postsWithLikes } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feed/trending - Trending posts (engagement-based)
router.get('/trending', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    
    // Trending score = (likes * 3 + comments * 5 + reposts * 4 + views * 0.1) / age_hours
    const posts = all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.karma, u.is_verified,
             c.name as community_name, c.icon as community_icon,
             (p.likes_count * 3 + p.comments_count * 5 + p.reposts_count * 4 + p.views_count * 0.1) / 
             (MAX(1, (julianday('now') - julianday(p.created_at)) * 24)) as trending_score
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      WHERE p.created_at > datetime('now', '-7 days')
      ORDER BY trending_score DESC
      LIMIT ?
    `, [limit]);
    
    const postsWithLikes = posts.map(post => {
      const liked = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
        [req.user.id, post.id]);
      return { ...post, liked: !!liked, hashtags: JSON.parse(post.hashtags || '[]') };
    });
    
    res.json({ success: true, data: { posts: postsWithLikes } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feed/explore - Discover new content
router.get('/explore', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    
    const posts = all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.karma, u.is_verified,
             c.name as community_name, c.icon as community_icon
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      WHERE p.user_id NOT IN (
        SELECT following_id FROM follows WHERE follower_id = ?
      )
      AND p.user_id != ?
      ORDER BY p.likes_count DESC, p.created_at DESC
      LIMIT ?
    `, [req.user.id, req.user.id, limit]);
    
    const postsWithLikes = posts.map(post => {
      const liked = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
        [req.user.id, post.id]);
      return { ...post, liked: !!liked, hashtags: JSON.parse(post.hashtags || '[]') };
    });
    
    res.json({ success: true, data: { posts: postsWithLikes } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feed/community/:name - Community feed
router.get('/community/:name', (req, res) => {
  try {
    const community = get('SELECT * FROM communities WHERE name = ?', [req.params.name]);
    if (!community) {
      return res.status(404).json({ success: false, error: 'Community not found' });
    }
    
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    
    const posts = all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.karma, u.is_verified
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.community_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [community.id, limit, offset]);
    
    const postsWithLikes = posts.map(post => {
      const liked = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
        [req.user.id, post.id]);
      return { ...post, liked: !!liked, hashtags: JSON.parse(post.hashtags || '[]') };
    });
    
    res.json({ 
      success: true, 
      data: { 
        community,
        posts: postsWithLikes 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feed/hashtag/:tag - Hashtag feed
router.get('/hashtag/:tag', (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase();
    const hashtag = get('SELECT * FROM hashtags WHERE name = ?', [tag]);
    
    if (!hashtag) {
      return res.json({ success: true, data: { hashtag: { name: tag, post_count: 0 }, posts: [] } });
    }
    
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    
    const posts = all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.karma, u.is_verified
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN post_hashtags ph ON p.id = ph.post_id
      WHERE ph.hashtag_id = ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `, [hashtag.id, limit]);
    
    const postsWithLikes = posts.map(post => {
      const liked = get('SELECT id FROM likes WHERE user_id = ? AND post_id = ?',
        [req.user.id, post.id]);
      return { ...post, liked: !!liked, hashtags: JSON.parse(post.hashtags || '[]') };
    });
    
    res.json({ 
      success: true, 
      data: { 
        hashtag,
        posts: postsWithLikes 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/feed/trending-hashtags
router.get('/trending-hashtags', (req, res) => {
  try {
    const hashtags = all(`
      SELECT * FROM hashtags
      ORDER BY post_count DESC, last_used_at DESC
      LIMIT 10
    `, []);
    
    res.json({ success: true, data: { hashtags } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
