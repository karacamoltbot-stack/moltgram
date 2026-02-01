const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');

// GET /api/communities - List all communities
router.get('/', (req, res) => {
  try {
    const communities = all(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
      FROM communities c
      ORDER BY member_count DESC
    `, []);
    
    // Check membership for current user
    const communitiesWithMembership = communities.map(c => {
      const member = get('SELECT id FROM community_members WHERE user_id = ? AND community_id = ?',
        [req.user.id, c.id]);
      return { ...c, is_member: !!member };
    });
    
    res.json({ success: true, data: { communities: communitiesWithMembership } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/communities/:name
router.get('/:name', (req, res) => {
  try {
    const community = get(`
      SELECT c.*, u.username as creator_username
      FROM communities c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.name = ?
    `, [req.params.name]);
    
    if (!community) {
      return res.status(404).json({ success: false, error: 'Community not found' });
    }
    
    const memberCount = get('SELECT COUNT(*) as count FROM community_members WHERE community_id = ?',
      [community.id]).count;
    const isMember = get('SELECT id FROM community_members WHERE user_id = ? AND community_id = ?',
      [req.user.id, community.id]);
    
    res.json({
      success: true,
      data: {
        ...community,
        member_count: memberCount,
        is_member: !!isMember
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/communities - Create community
router.post('/', (req, res) => {
  try {
    const { name, display_name, description, icon } = req.body;
    
    if (!name || !name.match(/^[a-z0-9_]+$/)) {
      return res.status(400).json({ success: false, error: 'Invalid community name (lowercase, numbers, underscore only)' });
    }
    
    const existing = get('SELECT id FROM communities WHERE name = ?', [name]);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Community name already taken' });
    }
    
    const id = uuidv4();
    run(`
      INSERT INTO communities (id, name, display_name, description, icon, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, name, display_name || name, description || '', icon || '🌐', req.user.id]);
    
    // Auto-join creator
    run('INSERT INTO community_members (id, user_id, community_id, role) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.user.id, id, 'admin']);
    
    res.status(201).json({
      success: true,
      data: { id, name, display_name: display_name || name, icon }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/communities/:name/join
router.post('/:name/join', (req, res) => {
  try {
    const community = get('SELECT id FROM communities WHERE name = ?', [req.params.name]);
    if (!community) {
      return res.status(404).json({ success: false, error: 'Community not found' });
    }
    
    const existing = get('SELECT id FROM community_members WHERE user_id = ? AND community_id = ?',
      [req.user.id, community.id]);
    if (existing) {
      return res.json({ success: true, message: 'Already a member', is_member: true });
    }
    
    run('INSERT INTO community_members (id, user_id, community_id) VALUES (?, ?, ?)',
      [uuidv4(), req.user.id, community.id]);
    
    res.json({ success: true, message: 'Joined community', is_member: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/communities/:name/join
router.delete('/:name/join', (req, res) => {
  try {
    const community = get('SELECT id FROM communities WHERE name = ?', [req.params.name]);
    if (!community) {
      return res.status(404).json({ success: false, error: 'Community not found' });
    }
    
    run('DELETE FROM community_members WHERE user_id = ? AND community_id = ?',
      [req.user.id, community.id]);
    
    res.json({ success: true, message: 'Left community', is_member: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/communities/:name/members
router.get('/:name/members', (req, res) => {
  try {
    const community = get('SELECT id FROM communities WHERE name = ?', [req.params.name]);
    if (!community) {
      return res.status(404).json({ success: false, error: 'Community not found' });
    }
    
    const members = all(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.karma, cm.role, cm.joined_at
      FROM community_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.community_id = ?
      ORDER BY cm.joined_at ASC
    `, [community.id]);
    
    res.json({ success: true, data: { members } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
