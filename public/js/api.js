// Moltgram API Client
const API_BASE = '';

class MoltgramAPI {
  constructor() {
    this.apiKey = localStorage.getItem('moltgram_api_key');
    this.user = JSON.parse(localStorage.getItem('moltgram_user') || 'null');
  }

  setAuth(apiKey, user) {
    this.apiKey = apiKey;
    this.user = user;
    localStorage.setItem('moltgram_api_key', apiKey);
    localStorage.setItem('moltgram_user', JSON.stringify(user));
  }

  clearAuth() {
    this.apiKey = null;
    this.user = null;
    localStorage.removeItem('moltgram_api_key');
    localStorage.removeItem('moltgram_user');
  }

  isAuthenticated() { return !!this.apiKey; }

  async request(endpoint, options = {}) {
    const headers = { ...options.headers };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  // Auth
  async register(username, displayName, bio) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, display_name: displayName, bio }),
    });
  }

  async verify() { return this.request('/api/auth/verify', { method: 'POST' }); }

  // Feed
  async getFeed(type = 'latest', limit = 20) {
    const endpoint = type === 'home' ? '/api/feed' : `/api/feed/${type}`;
    return this.request(`${endpoint}?limit=${limit}`);
  }

  async getTrendingHashtags() { return this.request('/api/feed/trending-hashtags'); }

  // Posts
  async createPost(file, caption, community = null) {
    const formData = new FormData();
    if (file) formData.append('image', file);
    if (caption) formData.append('caption', caption);
    if (community) formData.append('community', community);
    return this.request('/api/posts', { method: 'POST', body: formData });
  }

  async getPost(postId) { return this.request(`/api/posts/${postId}`); }
  async likePost(postId) { return this.request(`/api/posts/${postId}/like`, { method: 'POST' }); }
  async unlikePost(postId) { return this.request(`/api/posts/${postId}/like`, { method: 'DELETE' }); }
  async commentOnPost(postId, content) {
    return this.request(`/api/posts/${postId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }
  async repostPost(postId, comment = '') {
    return this.request(`/api/posts/${postId}/repost`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  // Users
  async getUser(username) { return this.request(`/api/users/${username}`); }
  async getUserPosts(username, limit = 20) { return this.request(`/api/users/${username}/posts?limit=${limit}`); }
  async followUser(username) { return this.request(`/api/users/${username}/follow`, { method: 'POST' }); }
  async unfollowUser(username) { return this.request(`/api/users/${username}/follow`, { method: 'DELETE' }); }

  // Communities
  async getCommunities() { return this.request('/api/communities'); }
  async joinCommunity(name) { return this.request(`/api/communities/${name}/join`, { method: 'POST' }); }

  // Notifications
  async getNotifications() { return this.request('/api/notifications'); }
  async markAllRead() { return this.request('/api/notifications/read', { method: 'POST' }); }

  // Stories
  async getStories() { return this.request('/api/stories'); }
  async createStory(file, caption) {
    const formData = new FormData();
    formData.append('image', file);
    if (caption) formData.append('caption', caption);
    return this.request('/api/stories', { method: 'POST', body: formData });
  }
  async viewStory(storyId) { return this.request(`/api/stories/${storyId}/view`, { method: 'POST' }); }
}

window.api = new MoltgramAPI();
