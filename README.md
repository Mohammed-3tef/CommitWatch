# Commit Watch

**Version 2.0.0** - Enhanced with Intelligent Commit Analysis & Release Monitoring

A Chrome Extension (Manifest v3) that intelligently monitors GitHub repositories and notifies you about important commits, releases, and activity with **automatic file-based detection**.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![GitHub API](https://img.shields.io/badge/GitHub-API-181717?logo=github)](https://docs.github.com/en/rest)
[![License](https://img.shields.io/badge/License-MPL-blue)](./LICENSE)

> **🎯 Never miss important commits!** Get intelligent notifications for critical code changes, security updates, and releases without the noise.

### 🚀 Quick Start

1. **Load Extension**: `chrome://extensions` → Enable Developer Mode → Load unpacked
2. **Get Token**: [Generate GitHub PAT](https://github.com/settings/tokens/new?scopes=repo,read:user,notifications&description=Commit%20Watch) (repo, read:user, notifications)
3. **Configure**: Click extension icon → Paste token → Save
4. **Done!** Notifications will start appearing automatically

---

## 📖 Quick Navigation

- [Features](#-features) - What this extension does
- [Installation](#-installation) - How to install and set up
- [Configuration](#-configuration) - GitHub token and settings
- [How It Works](#-how-it-works) - Technical architecture
- [Development](#-development) - For developers
- [Troubleshooting](#-troubleshooting) - Common issuestools

---

## ✨ Features

### 🔔 Smart Notifications
- **Real-time commit monitoring** for all repositories you're involved in (owner, collaborator, organization member)
- **Intelligent priority classification** - analyzes files, changes, and patterns automatically
- **Release & Tag notifications** - monitors GitHub Releases and Git tags
- **GitHub native notifications** - PR reviews, mentions, CI failures, security alerts
- **Recent Activity feed** - unified view of all commits, releases, and notifications

### 🎯 Intelligent Priority Classification

**Automatic Detection (No Keywords Required!):**

| Priority | Detection Logic |
|----------|-----------------|
| 🔴 **High** | • Security/auth files changed (`auth.js`, `security.js`, `crypto.js`, `password.js`)<br>• Core system files (`index.js`, `main.js`, `server.js`, `kernel.*`)<br>• Database migrations/schema changes<br>• Large deletions (>100 lines, <30% additions)<br>• Multiple critical files modified<br>• Keywords (fallback): `fix`, `hotfix`, `breaking`, `critical`, `urgent`, `security` |
| 🟡 **Medium** | • API/Routes changes (`api/`, `routes/`, `controllers/`)<br>• Build system changes (`webpack`, `vite.config`)<br>• Test files (`.test.js`, `__tests__/`, `spec/`)<br>• Large commits (>500 lines)<br>• Regular code changes<br>• Feature additions |
| 🟢 **Low** | • Merge commits (2+ parent commits)<br>• Documentation-only (`.md`, `docs/`, `README`, `CHANGELOG`)<br>• Config files (`package.json`, `.eslintrc`, `tsconfig.json`)<br>• CI/CD changes (`.github/workflows/`, `Dockerfile`)<br>• Localization updates (`locales/`, `i18n/`)<br>• Style/formatting keywords: `format`, `style`, `chore`, `refactor` |

### 🏷️ Release & Tag Monitoring
- **Formal Releases** - GitHub Release notifications with version info
- **Git Tags** - Detects tags even without formal releases
- **Pre-release Detection** - Identifies and labels pre-release versions
- **Unified Display** - Shows in popup Recent Activity with 🏷️ emoji

### ⚙️ Customizable Settings
- Enable/disable notifications globally
- Enable/disable release/tag notifications
- Enable/disable notifications per repository
- Ignore forked repositories
- Ignore your own commits
- Configurable check frequency (1-60 minutes)

### 🛡️ Efficient & Secure
- **Smart API usage** - Only fetches detailed commit info when SHA changes (50% API reduction)
- **GitHub API rate limit management** - Tracks and displays remaining quota
- **Response caching** - Minimizes redundant API calls
- **Batch processing** - 10 repos at a time with delays
- **Secure Personal Access Token authentication**
- **No backend server required** - All data stays in your browser

### 🧠 Intelligent Features
- **Structural analysis** - Detects merge commits by parent count (not message)
- **File pattern recognition** - Automatically identifies docs, config, CI/CD, tests
- **Critical file detection** - Recognizes security, auth, core system files
- **Change size analysis** - Detects large refactors and breaking changes
- **Notification history** - Stores last 100 notifications with full details
- **Badge counter** - Shows unread count on extension icon

## 📦 Installation

### Prerequisites
1. Google Chrome browser
2. A GitHub account
3. A GitHub Personal Access Token (PAT)

### Step 1: Load the Extension
1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `CommitWatch` folder

### Step 2: Configure Authentication
1. Click the Commit Watch extension icon
2. Go to **Settings** (gear icon)
3. Generate a GitHub Personal Access Token at [github.com/settings/tokens/new](https://github.com/settings/tokens/new) with these scopes:
   - `repo` - Full control of private repositories
   - `read:user` - Read user profile data
   - `notifications` - Access notifications
4. Paste the token and click **Save Token**

## 🔧 Configuration

### GitHub Personal Access Token

Create a new token at [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo,read:user,notifications&description=Commit%20Watch%20Extension) with these required scopes:

| Scope | Description |
|-------|-------------|
| `repo` | Access to public and private repositories |
| `read:user` | Read user profile information |
| `notifications` | Access GitHub notifications |

### Settings Options

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Notifications | Receive Chrome notifications for all activity | ✅ On |
| Release Notifications | Monitor GitHub Releases and Git tags | ✅ On |
| Check Frequency | How often to poll for commits/releases | 5 minutes |
| Ignore Forks | Don't monitor forked repositories | ✅ On |
| Ignore Own Commits | Don't notify for your commits | ❌ Off |
| Per-Repo Toggle | Enable/disable individual repositories | All enabled |

## 📁 Project Structure

```
CommitWatch/
├── manifest.json          # Extension manifest (v3)
├── background.js          # Service worker (polling, API, notifications)
├── popup/
│   ├── popup.html         # Popup UI markup
│   ├── popup.js           # Popup interactions
│   └── popup.css          # Popup styles
├── options/
│   ├── options.html       # Settings page markup
│   ├── options.js         # Settings interactions
│   └── options.css        # Settings styles
├── icons/
│   ├── icon.svg           # Source SVG icon
│   ├── icon16.png         # 16x16 toolbar icon
│   ├── icon48.png         # 48x48 management icon
│   ├── icon128.png        # 128x128 store icon
│   ├── generate-icons.html # Icon generator tool
│   └── README.md          # Icon generation guide
└── README.md              # This file
```

## 🔍 How It Works

### Architecture Overview
```
┌─────────────────────────────────────────────────┐
│          Background Service Worker              │
├─────────────────────────────────────────────────┤
│  • Periodic polling (chrome.alarms)            │
│  • GitHub API integration                       │
│  • Intelligent commit analysis                  │
│  • Release/tag monitoring                       │
│  • Notification management                      │
│  • Rate limit tracking                          │
└─────────────────────────────────────────────────┘
              ↓          ↓          ↓
    ┌──────────────┬──────────────┬──────────────┐
    │   Popup UI   │  Options UI  │ Notifications│
    └──────────────┴──────────────┴──────────────┘
```

### Polling Mechanism
1. **Service worker** uses `chrome.alarms` for periodic checks (default: 5 minutes)
2. **Batch processing**: Fetches repositories in batches of 10 with 100ms delays
3. **Smart fetching**: Only gets detailed commit info if SHA changed (API optimization)
4. **Parallel checks**: Monitors commits, releases, and GitHub notifications simultaneously
5. **Intelligent classification**: Analyzes files, patterns, and changes automatically
6. **Notification dispatch**: Creates Chrome notifications based on priority/type

### Commit Analysis Pipeline
```
Fetch Commit → Analyze Type → Detect Critical Files → Calculate Priority → Notify
     ↓              ↓                   ↓                      ↓            ↓
 Get files    Merge/Docs/     Security/Auth/Core?      High/Medium/Low   Chrome
 & stats      Config/CI?       Large deletions?         classification   Popup
```

### Release Detection
1. **Try GitHub Releases API** (`/repos/{owner}/{repo}/releases/latest`)
2. **Fallback to Tags** (`/repos/{owner}/{repo}/tags?per_page=1`) if no releases
3. **Compare IDs** with stored values to detect new releases/tags
4. **Send notifications** with 🏷️ emoji, version info, and pre-release labels

### API Rate Limiting
- **GitHub limits**: 5000 requests/hour for authenticated users
- **Header tracking**: Monitors `X-RateLimit-Remaining` and `X-RateLimit-Reset`
- **Optimization**: Stores responses and only refetches when needed
- **Caching**: Repository list cached for 1 hour
- **Display**: Rate limit info shown in popup (e.g., "4850/5000 remaining")

## 🛠️ Development

### Local Development
1. Make changes to the source files
2. Go to `chrome://extensions`
3. Click the refresh icon on the Commit Watch extension
4. Test your changes

### Debugging
- **Background script**: Click "service worker" link in extension details (`chrome://extensions`)
- **Popup**: Right-click popup → Inspect
- **Options**: Right-click page → Inspect

### Key APIs Used
- `chrome.storage.local` - Persistent data storage
- `chrome.alarms` - Background polling scheduler
- `chrome.notifications` - Desktop notifications
- `chrome.identity` - OAuth authentication (optional)
- `chrome.runtime` - Message passing between components
- `chrome.action` - Badge management

### File Pattern Detection
Edit patterns in `analyzeCommitType()`:
```javascript
const filePatterns = {
  docs: [/\.md$/i, /^docs\//i, ...],
  config: [/package\.json$/i, /tsconfig\.json$/i, ...],
  ci: [/^\.github\/workflows\//i, /^Dockerfile$/i, ...],
  tests: [/\.(test|spec)\.(js|ts)$/i, ...],
  localization: [/^locales?\//i, /^i18n\//i, ...]
};
```

### Critical File Detection
Edit patterns in `analyzeCriticalFiles()`:
```javascript
const criticalPatterns = [
  { pattern: /auth/i, category: 'security', weight: 3 },
  { pattern: /security/i, category: 'security', weight: 3 },
  { pattern: /migration/i, category: 'database', weight: 2 },
  // Add your own patterns
];
```

## ⚠️ Troubleshooting

### "Rate limit exceeded"
- Wait for the rate limit to reset (shown in popup)
- Increase check interval in settings
- Disable unnecessary repositories
- **Note**: Optimized version uses 50% fewer API calls than v1.0

### "Invalid token"
- Ensure token has required scopes (repo, read:user, notifications)
- Check token hasn't expired at [github.com/settings/tokens](https://github.com/settings/tokens)
- Generate a new token if needed

### Notifications not appearing
- Check Chrome notification settings (`chrome://settings/content/notifications`)
- Ensure "Enable Notifications" is ON in extension settings
- Verify Chrome has permission to show notifications
- For releases: Enable "Release Notifications" in settings
- **First run**: Extension won't notify for existing releases (only new ones)

### Release notifications not working
1. Open background console: `chrome://extensions` → Click "service worker"
2. Run diagnostics: Copy [test-releases.js](test-releases.js) → Run `runAllTests()`
3. Check settings: `releaseNotificationsEnabled` should be `true`
4. Force re-detection: `clearReleaseHistory()` then `checkAllRepositoriesForReleases()`
5. View logs: Check console for `[Commit Watch]` messages

### Extension not loading
- Ensure all icon PNG files exist in `icons/` folder
- Check for JavaScript errors in background script
- Verify manifest.json syntax is correct

## 🔐 Privacy & Security

- **No backend server** - All data stays in your browser
- **Token storage** - PAT is stored in Chrome's secure local storage
- **API calls** - Only made to `api.github.com`
- **No tracking** - No analytics or telemetry

## 📄 License

MPL License - See [LICENSE](./LICENSE) file

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🙏 Acknowledgments

- [GitHub REST API](https://docs.github.com/en/rest)
- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- GitHub Primer Design System (color inspiration)

---

**Made with ❤️ for developers who want to stay informed without being overwhelmed**
