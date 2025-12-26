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
  // Auth elements - GitHub
  authStatus: document.getElementById('auth-status'),
  authForm: document.getElementById('auth-form'),
  githubAuthSection: document.getElementById('github-auth-section'),
  githubAuthStatus: document.getElementById('github-auth-status'),
  githubAuthForm: document.getElementById('github-auth-form'),
  githubTokenInput: document.getElementById('github-token-input'),
  showGithubTokenBtn: document.getElementById('show-github-token-btn'),
  saveGithubTokenBtn: document.getElementById('save-github-token-btn'),
  
  // Auth elements - GitLab
  gitlabAuthSection: document.getElementById('gitlab-auth-section'),
  gitlabAuthStatus: document.getElementById('gitlab-auth-status'),
  gitlabAuthForm: document.getElementById('gitlab-auth-form'),
  gitlabTokenInput: document.getElementById('gitlab-token-input'),
  showGitlabTokenBtn: document.getElementById('show-gitlab-token-btn'),
  saveGitlabTokenBtn: document.getElementById('save-gitlab-token-btn'),
  
  // Legacy elements (for backwards compatibility)
  tokenInput: document.getElementById('github-token-input'),
  showTokenBtn: document.getElementById('show-github-token-btn'),
  saveTokenBtn: document.getElementById('save-github-token-btn'),
  
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
 * Update authentication status display for both platforms
 */
async function updateAuthStatus() {
  const status = await sendMessage({ action: 'getStatus' });
  
  // Update GitHub auth status
  if (status.githubAuthenticated && status.user) {
    elements.githubAuthStatus.innerHTML = `
      <div class="auth-connected">
        <img src="${status.user.avatar_url}" alt="Avatar" class="avatar" />
        <div class="auth-info">
          <strong>${status.user.login}</strong>
          <span class="auth-email">${status.user.email || 'Connected to GitHub'}</span>
        </div>
        <button id="disconnect-github-btn" class="btn btn-secondary btn-small">Disconnect</button>
      </div>
    `;
    elements.githubAuthForm.classList.add('hidden');
    
    // Add disconnect handler
    document.getElementById('disconnect-github-btn').addEventListener('click', handleDisconnectGitHub);
  } else {
    elements.githubAuthStatus.innerHTML = `
      <div class="auth-disconnected">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Not connected</span>
      </div>
    `;
    elements.githubAuthForm.classList.remove('hidden');
  }
  
  // Update GitLab auth status
  if (status.gitlabAuthenticated && status.gitlabUser) {
    elements.gitlabAuthStatus.innerHTML = `
      <div class="auth-connected">
        <img src="${status.gitlabUser.avatar_url || '../icons/gitlab-default.png'}" alt="Avatar" class="avatar" />
        <div class="auth-info">
          <strong>${status.gitlabUser.login}</strong>
          <span class="auth-email">${status.gitlabUser.email || 'Connected to GitLab'}</span>
        </div>
        <button id="disconnect-gitlab-btn" class="btn btn-secondary btn-small">Disconnect</button>
      </div>
    `;
    elements.gitlabAuthForm.classList.add('hidden');
    
    // Add disconnect handler
    document.getElementById('disconnect-gitlab-btn').addEventListener('click', handleDisconnectGitLab);
  } else {
    elements.gitlabAuthStatus.innerHTML = `
      <div class="auth-disconnected">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Not connected</span>
      </div>
    `;
    elements.gitlabAuthForm.classList.remove('hidden');
  }
  
  // Load repositories if at least one platform is connected
  if (status.githubAuthenticated || status.gitlabAuthenticated) {
    await loadRepositories();
  }
}

/**
 * Handle save GitHub token button click
 */
async function handleSaveGitHubToken() {
  const token = elements.githubTokenInput.value.trim();
  
  if (!token) {
    showToast('Please enter a token', 'error');
    return;
  }
  
  // Validate token format
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    showToast('Invalid GitHub token format', 'error');
    return;
  }
  
  elements.saveGithubTokenBtn.disabled = true;
  elements.saveGithubTokenBtn.innerHTML = 'Saving...';
  
  try {
    const response = await sendMessage({
      action: 'authenticateGitHub',
      token: token
    });
    
    if (response.success) {
      elements.githubTokenInput.value = '';
      showToast('Successfully connected to GitHub!', 'success');
      await updateAuthStatus();
      await loadSettings();
    } else {
      showToast(response.error || 'GitHub authentication failed', 'error');
    }
  } catch (error) {
    showToast('Connection failed', 'error');
  } finally {
    elements.saveGithubTokenBtn.disabled = false;
    elements.saveGithubTokenBtn.innerHTML = `
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
 * Handle save GitLab token button click
 */
async function handleSaveGitLabToken() {
  const token = elements.gitlabTokenInput.value.trim();
  
  if (!token) {
    showToast('Please enter a token', 'error');
    return;
  }
  
  // GitLab tokens are typically 20+ chars, but don't enforce glpat- prefix
  // as self-hosted instances may have different formats
  if (token.length < 20) {
    showToast('Token seems too short. Please enter a valid GitLab Personal Access Token.', 'error');
    return;
  }
  
  elements.saveGitlabTokenBtn.disabled = true;
  elements.saveGitlabTokenBtn.innerHTML = 'Saving...';
  
  try {
    const response = await sendMessage({
      action: 'authenticateGitLab',
      token: token
    });
    
    if (response.success) {
      elements.gitlabTokenInput.value = '';
      showToast('Successfully connected to GitLab!', 'success');
      await updateAuthStatus();
      await loadSettings();
    } else {
      showToast(response.error || 'GitLab authentication failed', 'error');
    }
  } catch (error) {
    showToast('Connection failed', 'error');
  } finally {
    elements.saveGitlabTokenBtn.disabled = false;
    elements.saveGitlabTokenBtn.innerHTML = `
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
 * Handle save token button click (legacy - routes to GitHub)
 */
async function handleSaveToken() {
  return handleSaveGitHubToken();
}

/**
 * Handle GitHub disconnect button click
 */
async function handleDisconnectGitHub() {
  try {
    await sendMessage({ action: 'logoutGitHub' });
    showToast('Disconnected from GitHub', 'info');
    await updateAuthStatus();
  } catch (error) {
    showToast('Failed to disconnect', 'error');
  }
}

/**
 * Handle GitLab disconnect button click
 */
async function handleDisconnectGitLab() {
  try {
    await sendMessage({ action: 'logoutGitLab' });
    showToast('Disconnected from GitLab', 'info');
    await updateAuthStatus();
  } catch (error) {
    showToast('Failed to disconnect', 'error');
  }
}

/**
 * Handle disconnect button click (legacy - disconnects all)
 */
async function handleDisconnect() {
  try {
    await sendMessage({ action: 'logout' });
    showToast('Disconnected from all platforms', 'info');
    await updateAuthStatus();
  } catch (error) {
    showToast('Failed to disconnect', 'error');
  }
}

/**
 * Handle show/hide token button for a specific input
 * @param {HTMLInputElement} input - Token input element  
 */
function handleToggleTokenFor(input) {
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
}

/**
 * Handle show/hide token button (legacy)
 */
function handleToggleToken() {
  handleToggleTokenFor(elements.githubTokenInput);
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
    // Use platform-specific key for enabled status
    const platform = repo.platform || 'github';
    const repoKey = `${platform}:${repo.full_name}`;
    // Check both old and new key formats for backwards compatibility
    const isEnabled = enabledRepos[repoKey] !== false && enabledRepos[repo.full_name] !== false;
    
    // Generate platform-specific URL
    const repoUrl = platform === 'gitlab' 
      ? `https://gitlab.com/${repo.full_name}` 
      : `https://github.com/${repo.full_name}`;
    
    // Platform icon
    const platformIcon = platform === 'gitlab' 
      ? `<svg class="platform-icon-small gitlab" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
           <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
         </svg>`
      : `<svg class="platform-icon-small github" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
           <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
         </svg>`;
    
    return `
      <div class="repo-item" data-repo="${repoKey}" data-platform="${platform}">
        <div class="repo-info">
          <div class="repo-name">
            ${platformIcon}
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
            <a href="${repoUrl}" target="_blank">${repo.full_name}</a>
          </div>
          <div class="repo-meta">
            <span class="repo-tag platform-tag ${platform}">${platform === 'gitlab' ? 'GitLab' : 'GitHub'}</span>
            ${repo.fork ? '<span class="repo-tag">Fork</span>' : ''}
            ${repo.language ? `<span class="repo-lang">${repo.language}</span>` : ''}
            <span class="repo-branch">${repo.default_branch}</span>
          </div>
        </div>
        <label class="toggle">
          <input type="checkbox" class="repo-toggle" data-repo="${repoKey}" ${isEnabled ? 'checked' : ''} />
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
  // Auth - GitHub
  elements.saveTokenBtn.addEventListener('click', handleSaveToken);
  elements.showTokenBtn.addEventListener('click', handleToggleToken);
  elements.tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSaveToken();
  });
  
  // Auth - GitLab
  elements.saveGitlabTokenBtn.addEventListener('click', handleSaveGitLabToken);
  elements.showGitlabTokenBtn.addEventListener('click', () => handleToggleTokenFor(elements.gitlabTokenInput));
  elements.gitlabTokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSaveGitLabToken();
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
