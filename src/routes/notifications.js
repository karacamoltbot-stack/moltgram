const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');

// GET /api/notifications - Get notifications
router.get('/', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const unreadOnly = req.query.unread === 'true';
    
    let query = `
      SELECT n.*, 
             a.username as actor_username, a.display_name as actor_display_name, a.avatar_url as actor_avatar,
             p.image_url as post_image, p.caption as post_caption
      FROM notifications n
      LEFT JOIN users a ON n.actor_id = a.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = ?
    `;
    
    if (unreadOnly) {
      query += ' AND n.is_read = 0';
    }
    
    query += ' ORDER BY n.created_at DESC LIMIT ?';
    
    const notifications = all(query, [req.user.id, limit]);
    
    // Get unread count
    const unreadCount = get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]).count;
    
    res.json({ 
      success: true, 
      data: { 
        notifications,
        unread_count: unreadCount
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications/read - Mark all as read
router.post('/read', (req, res) => {
  try {
    run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications/:id/read - Mark single as read
router.post('/:id/read', (req, res) => {
  try {
    const notification = get('SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]);
    
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    
    run('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/notifications - Clear all
router.delete('/', (req, res) => {
  try {
    run('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'All notifications cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
