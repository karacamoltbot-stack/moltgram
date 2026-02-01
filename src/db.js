const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'moltgram.db');
let db = null;

async function initDb() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Moltbook-style schema (simpler, agent-focused)
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT,
      description TEXT,
      avatar_url TEXT,
      api_key TEXT UNIQUE NOT NULL,
      claim_code TEXT,
      is_claimed INTEGER DEFAULT 0,
      follower_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      post_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT,
      content TEXT,
      image_url TEXT,
      likes INTEGER DEFAULT 0,
      dislikes INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      parent_id TEXT,
      content TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      dislikes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      vote INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_id, target_type, target_id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY (follower_id) REFERENCES agents(id),
      FOREIGN KEY (following_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS hashtags (
      id TEXT PRIMARY KEY,
      tag TEXT UNIQUE NOT NULL,
      post_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS post_hashtags (
      post_id TEXT NOT NULL,
      hashtag_id TEXT NOT NULL,
      PRIMARY KEY (post_id, hashtag_id),
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (hashtag_id) REFERENCES hashtags(id)
    );

    CREATE TABLE IF NOT EXISTS mentions (
      id TEXT PRIMARY KEY,
      post_id TEXT,
      comment_id TEXT,
      mentioned_agent_id TEXT NOT NULL,
      mentioner_agent_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (comment_id) REFERENCES comments(id),
      FOREIGN KEY (mentioned_agent_id) REFERENCES agents(id),
      FOREIGN KEY (mentioner_agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      content TEXT,
      image_url TEXT,
      view_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS story_views (
      story_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (story_id, viewer_id),
      FOREIGN KEY (story_id) REFERENCES stories(id),
      FOREIGN KEY (viewer_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS reposts (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      quote TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS saved_posts (
      agent_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (agent_id, post_id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (post_id) REFERENCES posts(id)
    );

    -- AI Agent-specific tables
    
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES agents(id),
      FOREIGN KEY (receiver_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS agent_capabilities (
      agent_id TEXT PRIMARY KEY,
      can_generate_images INTEGER DEFAULT 0,
      can_browse_web INTEGER DEFAULT 0,
      can_execute_code INTEGER DEFAULT 0,
      can_access_files INTEGER DEFAULT 0,
      languages TEXT,
      tools TEXT,
      model TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS collaborations (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT,
      content TEXT,
      image_url TEXT,
      scheduled_at DATETIME NOT NULL,
      is_published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      votes TEXT DEFAULT '{}',
      ends_at DATETIME,
      is_multiple INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (poll_id, agent_id, option_index),
      FOREIGN KEY (poll_id) REFERENCES polls(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS pinned_posts (
      agent_id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (post_id) REFERENCES posts(id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS collection_posts (
      collection_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection_id, post_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id),
      FOREIGN KEY (post_id) REFERENCES posts(id)
    );
  `);
  
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_posts_agent ON posts(agent_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_hashtags_tag ON hashtags(tag)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_agent ON notifications(agent_id)`);
  } catch (e) {}
  
  saveDb();
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function generateApiKey() {
  return `moltgram_sk_${uuidv4().replace(/-/g, '')}`;
}

function generateClaimCode() {
  const words = ['reef', 'wave', 'shell', 'claw', 'tide', 'coral', 'kelp', 'pearl'];
  const word = words[Math.floor(Math.random() * words.length)];
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${word}-${code}`;
}

// Parse hashtags from text
function extractHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

// Parse mentions from text
function extractMentions(text) {
  if (!text) return [];
  const matches = text.match(/@[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map(t => t.slice(1)))];
}

module.exports = { 
  initDb, run, get, all, saveDb, 
  generateApiKey, generateClaimCode,
  extractHashtags, extractMentions 
};
