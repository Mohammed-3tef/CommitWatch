/**
 * Commit Watch - Popup Script
 * 
 * Handles the popup UI interactions including:
 * - Authentication status display
 * - Token input for login
 * - Activity feed display
 * - Manual refresh trigger
 */

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const elements = {
  // Views
  loginView: document.getElementById('login-view'),
  mainView: document.getElementById('main-view'),
  loading: document.getElementById('loading'),
  errorMessage: document.getElementById('error-message'),
  
  // Login elements
  tokenInput: document.getElementById('token-input'),
  showTokenBtn: document.getElementById('show-token-btn'),
  loginBtn: document.getElementById('login-btn'),
  
  // Main view elements
  settingsBtn: document.getElementById('settings-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  logoutBtn: document.getElementById('logout-btn'),
  repoCount: document.getElementById('repo-count'),
  commitCount: document.getElementById('commit-count'),
  rateLimit: document.getElementById('rate-limit'),
  checkNowBtn: document.getElementById('check-now-btn'),
  lastCheckTime: document.getElementById('last-check-time'),
  activityList: document.getElementById('activity-list')
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Show a specific view and hide others
 * @param {string} viewName - 'login', 'main', or 'loading'
 */
function showView(viewName) {
  elements.loginView.classList.add('hidden');
  elements.mainView.classList.add('hidden');
  elements.loading.classList.add('hidden');
  
  switch (viewName) {
    case 'login':
      elements.loginView.classList.remove('hidden');
      break;
    case 'main':
      elements.mainView.classList.remove('hidden');
      break;
    case 'loading':
      elements.loading.classList.remove('hidden');
      break;
  }
}

// =============================================================================
// THEME MANAGEMENT
// =============================================================================

/**
 * Get the current theme from storage or system preference
 * @returns {Promise<string>} 'light' or 'dark'
 */
async function getTheme() {
  const { theme } = await chrome.storage.local.get('theme');
  if (theme) return theme;
  
  // Check system preference
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Set the theme and save to storage
 * @param {string} theme - 'light' or 'dark'
 */
async function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  await chrome.storage.local.set({ theme });
  
  // Update logo based on theme
  const logoImg = document.getElementById('logo-img');
  if (logoImg) {
    logoImg.src = theme === 'light' ? '../icons/icon48-light.png' : '../icons/icon48.png';
  }
}

/**
 * Toggle between light and dark theme
 */
async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  await setTheme(newTheme);
}

/**
 * Initialize theme on page load
 */
async function initTheme() {
  const theme = await getTheme();
  document.documentElement.setAttribute('data-theme', theme);
  
  // Set logo based on theme
  const logoImg = document.getElementById('logo-img');
  if (logoImg) {
    logoImg.src = theme === 'light' ? '../icons/icon48-light.png' : '../icons/icon48.png';
  }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove('hidden');
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    elements.errorMessage.classList.add('hidden');
  }, 5000);
}

/**
 * Format relative time
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted relative time
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// =============================================================================
// API COMMUNICATION
// =============================================================================

/**
 * Send message to background script
 * @param {Object} message - Message to send
 * @returns {Promise<Object>} Response from background
 */
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

// =============================================================================
// UI UPDATE FUNCTIONS
// =============================================================================

/**
 * Update the main view with current status
 */
async function updateMainView() {
  try {
    // Get status from background
    const status = await sendMessage({ action: 'getStatus' });
    
    if (!status.authenticated) {
      showView('login');
      return;
    }
    
    // Update user info
    if (status.user) {
      elements.userAvatar.src = status.user.avatar_url;
      elements.userName.textContent = status.user.login;
    }
    
    // Get repositories
    const repoResponse = await sendMessage({ action: 'getRepositories' });
    if (repoResponse.success) {
      elements.repoCount.textContent = repoResponse.repositories.length;
    }
    
    // Update rate limit
    if (status.rateLimit) {
      elements.rateLimit.textContent = status.rateLimit.remaining;
    }
    
    // Update last check time
    if (status.lastCheckTime) {
      elements.lastCheckTime.textContent = `Last checked: ${formatRelativeTime(status.lastCheckTime)}`;
    }
    
    // Update activity list
    await updateActivityList();
    
    showView('main');
    
  } catch (error) {
    console.error('Error updating main view:', error);
    showError('Failed to load status');
  }
}

/**
 * Update the activity list with recent notifications
 */
async function updateActivityList() {
  try {
    const response = await sendMessage({ action: 'getNotificationHistory' });
    
    if (!response.success || !response.history || response.history.length === 0) {
      elements.activityList.innerHTML = '<p class="empty-state">No recent commits</p>';
      elements.commitCount.textContent = '0';
      return;
    }
    
    // Count today's commits
    const today = new Date().setHours(0, 0, 0, 0);
    const todayCommits = response.history.filter(n => n.timestamp >= today).length;
    elements.commitCount.textContent = todayCommits;
    
    // Build activity list HTML
    const activityHtml = response.history.slice(0, 10).map(item => {
      const priorityClass = `priority-${item.priority}`;
      const priorityEmoji = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      };
      
      return `
        <a href="${item.url}" target="_blank" class="activity-item ${priorityClass}">
          <div class="activity-header">
            <span class="activity-repo">${truncate(item.repo, 25)}</span>
            <span class="activity-time">${formatRelativeTime(item.timestamp)}</span>
          </div>
          <div class="activity-message">
            <span class="priority-indicator">${priorityEmoji[item.priority] || ''}</span>
            ${truncate(item.message, 50)}
          </div>
          <div class="activity-author">by ${item.author}</div>
        </a>
      `;
    }).join('');
    
    elements.activityList.innerHTML = activityHtml;
    
  } catch (error) {
    console.error('Error updating activity list:', error);
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Handle login button click
 */
async function handleLogin() {
  const token = elements.tokenInput.value.trim();
  
  if (!token) {
    showError('Please enter a token');
    return;
  }
  
  // Validate token format (GitHub PAT)
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    showError('Invalid token format. Token should start with ghp_ or github_pat_');
    return;
  }
  
  elements.loginBtn.disabled = true;
  elements.loginBtn.innerHTML = '<span>Connecting...</span>';
  
  try {
    const response = await sendMessage({
      action: 'authenticate',
      token: token
    });
    
    if (response.success) {
      elements.tokenInput.value = ''; // Clear token from input
      await updateMainView();
    } else {
      showError(response.error || 'Authentication failed');
    }
  } catch (error) {
    showError('Connection failed. Please try again.');
  } finally {
    elements.loginBtn.disabled = false;
    elements.loginBtn.innerHTML = '<span>Connect</span>';
  }
}

/**
 * Handle logout button click
 */
async function handleLogout() {
  try {
    await sendMessage({ action: 'logout' });
    showView('login');
  } catch (error) {
    showError('Logout failed');
  }
}

/**
 * Handle check now button click
 */
async function handleCheckNow() {
  elements.checkNowBtn.disabled = true;
  elements.checkNowBtn.innerHTML = `
    <svg class="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
    <span>Checking...</span>
  `;
  
  try {
    await sendMessage({ action: 'checkNow' });
    await updateMainView();
  } catch (error) {
    showError('Check failed');
  } finally {
    elements.checkNowBtn.disabled = false;
    elements.checkNowBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
      </svg>
      <span>Check Now</span>
    `;
  }
}

/**
 * Handle show/hide token button click
 */
function handleToggleToken() {
  const input = elements.tokenInput;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  
  // Update button icon
  elements.showTokenBtn.innerHTML = isPassword
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
         <line x1="1" y1="1" x2="23" y2="23"/>
       </svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
         <circle cx="12" cy="12" r="3"/>
       </svg>`;
}

/**
 * Handle settings button click
 */
function handleOpenSettings() {
  chrome.runtime.openOptionsPage();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the popup
 */
async function init() {
  // Initialize theme first to prevent flash
  await initTheme();
  
  showView('loading');
  
  // Set up event listeners
  elements.loginBtn.addEventListener('click', handleLogin);
  elements.tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  elements.showTokenBtn.addEventListener('click', handleToggleToken);
  elements.logoutBtn.addEventListener('click', handleLogout);
  elements.checkNowBtn.addEventListener('click', handleCheckNow);
  elements.settingsBtn.addEventListener('click', handleOpenSettings);
  elements.themeToggleBtn.addEventListener('click', toggleTheme);
  
  // Check authentication status and update view
  try {
    const status = await sendMessage({ action: 'getStatus' });
    
    if (status.authenticated) {
      await updateMainView();
    } else {
      showView('login');
    }
  } catch (error) {
    console.error('Init error:', error);
    showView('login');
  }
}

// Run initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);
