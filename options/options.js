/**
 * Commit Watch - Options Page Script
 * 
 * Handles the options/settings page including:
 * - Token management
 * - Notification preferences
 * - Repository enable/disable toggles
 * - Filter settings
 */

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const elements = {
  // Auth elements
  authStatus: document.getElementById('auth-status'),
  authForm: document.getElementById('auth-form'),
  tokenInput: document.getElementById('token-input'),
  showTokenBtn: document.getElementById('show-token-btn'),
  saveTokenBtn: document.getElementById('save-token-btn'),
  
  // Settings elements
  notificationsEnabled: document.getElementById('notifications-enabled'),
  releaseNotifications: document.getElementById('release-notifications'),
  checkInterval: document.getElementById('check-interval'),
  ignoreForks: document.getElementById('ignore-forks'),
  ignoreOwn: document.getElementById('ignore-own'),
  
  // Repository elements
  repoCount: document.getElementById('repo-count'),
  refreshReposBtn: document.getElementById('refresh-repos-btn'),
  repoSearch: document.getElementById('repo-search'),
  enableAllBtn: document.getElementById('enable-all-btn'),
  disableAllBtn: document.getElementById('disable-all-btn'),
  repoList: document.getElementById('repo-list'),
  
  // Theme
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  
  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message')
};

// Store repositories for filtering
let allRepositories = [];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Send message to background script
 * @param {Object} message - Message to send
 * @returns {Promise<Object>} Response
 */
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 */
function showToast(message, type = 'success') {
  elements.toast.className = `toast ${type}`;
  elements.toastMessage.textContent = message;
  elements.toast.classList.remove('hidden');
  
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

/**
 * Debounce function for search input
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
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

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Update authentication status display
 */
async function updateAuthStatus() {
  const status = await sendMessage({ action: 'getStatus' });
  
  if (status.authenticated && status.user) {
    elements.authStatus.innerHTML = `
      <div class="auth-connected">
        <img src="${status.user.avatar_url}" alt="Avatar" class="avatar" />
        <div class="auth-info">
          <strong>${status.user.login}</strong>
          <span class="auth-email">${status.user.email || 'Connected to GitHub'}</span>
        </div>
        <button id="disconnect-btn" class="btn btn-secondary btn-small">Disconnect</button>
      </div>
    `;
    elements.authForm.classList.add('hidden');
    
    // Add disconnect handler
    document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);
    
    // Load repositories
    await loadRepositories();
  } else {
    elements.authStatus.innerHTML = `
      <div class="auth-disconnected">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Not connected to GitHub</span>
      </div>
    `;
    elements.authForm.classList.remove('hidden');
  }
}

/**
 * Handle save token button click
 */
async function handleSaveToken() {
  const token = elements.tokenInput.value.trim();
  
  if (!token) {
    showToast('Please enter a token', 'error');
    return;
  }
  
  // Validate token format
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    showToast('Invalid token format', 'error');
    return;
  }
  
  elements.saveTokenBtn.disabled = true;
  elements.saveTokenBtn.innerHTML = 'Saving...';
  
  try {
    const response = await sendMessage({
      action: 'authenticate',
      token: token
    });
    
    if (response.success) {
      elements.tokenInput.value = '';
      showToast('Successfully connected to GitHub!', 'success');
      await updateAuthStatus();
      await loadSettings();
    } else {
      showToast(response.error || 'Authentication failed', 'error');
    }
  } catch (error) {
    showToast('Connection failed', 'error');
  } finally {
    elements.saveTokenBtn.disabled = false;
    elements.saveTokenBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save Token
    `;
  }
}

/**
 * Handle disconnect button click
 */
async function handleDisconnect() {
  try {
    await sendMessage({ action: 'logout' });
    showToast('Disconnected from GitHub', 'info');
    await updateAuthStatus();
  } catch (error) {
    showToast('Failed to disconnect', 'error');
  }
}

/**
 * Handle show/hide token button
 */
function handleToggleToken() {
  const isPassword = elements.tokenInput.type === 'password';
  elements.tokenInput.type = isPassword ? 'text' : 'password';
}

// =============================================================================
// SETTINGS MANAGEMENT
// =============================================================================

/**
 * Load current settings and populate UI
 */
async function loadSettings() {
  try {
    const response = await sendMessage({ action: 'getSettings' });
    
    if (response.success && response.settings) {
      const settings = response.settings;
      
      elements.notificationsEnabled.checked = settings.notificationsEnabled !== false;
      elements.releaseNotifications.checked = settings.releaseNotificationsEnabled !== false;
      elements.checkInterval.value = settings.checkInterval || 5;
      elements.ignoreForks.checked = settings.ignoreForks !== false;
      elements.ignoreOwn.checked = settings.ignoreOwnCommits === true;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Save a single setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
async function saveSetting(key, value) {
  try {
    const settings = {};
    settings[key] = value;
    
    await sendMessage({
      action: 'updateSettings',
      settings
    });
    
    showToast('Settings saved', 'success');
  } catch (error) {
    showToast('Failed to save settings', 'error');
  }
}

// =============================================================================
// REPOSITORY MANAGEMENT
// =============================================================================

/**
 * Load and display repositories
 */
async function loadRepositories() {
  try {
    const response = await sendMessage({ action: 'getRepositories' });
    
    if (response.success && response.repositories) {
      allRepositories = response.repositories;
      elements.repoCount.textContent = allRepositories.length;
      renderRepositories(allRepositories);
    } else {
      elements.repoList.innerHTML = `
        <p class="empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Failed to load repositories
        </p>
      `;
    }
  } catch (error) {
    console.error('Failed to load repositories:', error);
  }
}

/**
 * Render repository list
 * @param {Array} repos - Repositories to render
 */
async function renderRepositories(repos) {
  if (repos.length === 0) {
    elements.repoList.innerHTML = `
      <p class="empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        No repositories found
      </p>
    `;
    return;
  }
  
  // Get current settings to check enabled status
  const response = await sendMessage({ action: 'getSettings' });
  const enabledRepos = response.settings?.enabledRepos || {};
  
  const repoHtml = repos.map(repo => {
    // Default to enabled unless explicitly disabled
    const isEnabled = enabledRepos[repo.full_name] !== false;
    
    return `
      <div class="repo-item" data-repo="${repo.full_name}">
        <div class="repo-info">
          <div class="repo-name">
            ${repo.private ? `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            ` : `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            `}
            <a href="https://github.com/${repo.full_name}" target="_blank">${repo.full_name}</a>
          </div>
          <div class="repo-meta">
            ${repo.fork ? '<span class="repo-tag">Fork</span>' : ''}
            ${repo.language ? `<span class="repo-lang">${repo.language}</span>` : ''}
            <span class="repo-branch">${repo.default_branch}</span>
          </div>
        </div>
        <label class="toggle">
          <input type="checkbox" class="repo-toggle" data-repo="${repo.full_name}" ${isEnabled ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }).join('');
  
  elements.repoList.innerHTML = repoHtml;
  
  // Add event listeners to toggles
  document.querySelectorAll('.repo-toggle').forEach(toggle => {
    toggle.addEventListener('change', handleRepoToggle);
  });
}

/**
 * Handle repository toggle change
 * @param {Event} event - Change event
 */
async function handleRepoToggle(event) {
  const repoName = event.target.dataset.repo;
  const isEnabled = event.target.checked;
  
  try {
    // Get current enabled repos
    const response = await sendMessage({ action: 'getSettings' });
    const enabledRepos = response.settings?.enabledRepos || {};
    
    // Update
    enabledRepos[repoName] = isEnabled;
    
    await sendMessage({
      action: 'updateSettings',
      settings: { enabledRepos }
    });
    
  } catch (error) {
    console.error('Failed to update repo setting:', error);
    // Revert toggle
    event.target.checked = !isEnabled;
    showToast('Failed to save', 'error');
  }
}

/**
 * Handle refresh repositories button
 */
async function handleRefreshRepos() {
  elements.refreshReposBtn.disabled = true;
  elements.refreshReposBtn.innerHTML = `
    <svg class="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
    Refreshing...
  `;
  
  try {
    // Clear cached repos
    await chrome.storage.local.remove(['repositories', 'repositoriesUpdated']);
    await loadRepositories();
    showToast('Repositories refreshed', 'success');
  } catch (error) {
    showToast('Failed to refresh', 'error');
  } finally {
    elements.refreshReposBtn.disabled = false;
    elements.refreshReposBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
      </svg>
      Refresh List
    `;
  }
}

/**
 * Handle repository search
 */
const handleRepoSearch = debounce((event) => {
  const query = event.target.value.toLowerCase().trim();
  
  if (!query) {
    renderRepositories(allRepositories);
    return;
  }
  
  const filtered = allRepositories.filter(repo => 
    repo.full_name.toLowerCase().includes(query) ||
    (repo.language && repo.language.toLowerCase().includes(query))
  );
  
  renderRepositories(filtered);
}, 300);

/**
 * Enable all repositories
 */
async function handleEnableAll() {
  const enabledRepos = {};
  allRepositories.forEach(repo => {
    enabledRepos[repo.full_name] = true;
  });
  
  try {
    await sendMessage({
      action: 'updateSettings',
      settings: { enabledRepos }
    });
    
    document.querySelectorAll('.repo-toggle').forEach(toggle => {
      toggle.checked = true;
    });
    
    showToast('All repositories enabled', 'success');
  } catch (error) {
    showToast('Failed to update', 'error');
  }
}

/**
 * Disable all repositories
 */
async function handleDisableAll() {
  const enabledRepos = {};
  allRepositories.forEach(repo => {
    enabledRepos[repo.full_name] = false;
  });
  
  try {
    await sendMessage({
      action: 'updateSettings',
      settings: { enabledRepos }
    });
    
    document.querySelectorAll('.repo-toggle').forEach(toggle => {
      toggle.checked = false;
    });
    
    showToast('All repositories disabled', 'success');
  } catch (error) {
    showToast('Failed to update', 'error');
  }
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

/**
 * Initialize all event listeners
 */
function initEventListeners() {
  // Auth
  elements.saveTokenBtn.addEventListener('click', handleSaveToken);
  elements.showTokenBtn.addEventListener('click', handleToggleToken);
  elements.tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSaveToken();
  });
  
  // Settings
  elements.notificationsEnabled.addEventListener('change', (e) => {
    saveSetting('notificationsEnabled', e.target.checked);
  });
  
  elements.releaseNotifications.addEventListener('change', (e) => {
    saveSetting('releaseNotificationsEnabled', e.target.checked);
  });
  
  elements.checkInterval.addEventListener('change', (e) => {
    saveSetting('checkInterval', parseInt(e.target.value));
  });
  
  elements.ignoreForks.addEventListener('change', (e) => {
    saveSetting('ignoreForks', e.target.checked);
  });
  
  elements.ignoreOwn.addEventListener('change', (e) => {
    saveSetting('ignoreOwnCommits', e.target.checked);
  });
  
  // Repositories
  elements.refreshReposBtn.addEventListener('click', handleRefreshRepos);
  elements.repoSearch.addEventListener('input', handleRepoSearch);
  elements.enableAllBtn.addEventListener('click', handleEnableAll);
  elements.disableAllBtn.addEventListener('click', handleDisableAll);
  
  // Theme
  elements.themeToggleBtn.addEventListener('click', toggleTheme);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the options page
 */
async function init() {
  // Initialize theme first to prevent flash
  await initTheme();
  
  initEventListeners();
  await updateAuthStatus();
  await loadSettings();
}

// Run initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);
