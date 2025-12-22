# 🔄 Commit Watch

A Chrome Extension (Manifest v3) that intelligently monitors GitHub repositories and notifies you about important commits and activity.

## ✨ Features

### 🔔 Smart Notifications
- **Real-time commit monitoring** for all repositories you're involved in (owner, collaborator, organization member)
- **Priority-based classification** - commits are categorized as High, Medium, or Low priority
- **GitHub notifications** - PR reviews, mentions, CI failures

### 🎯 Priority Classification
| Priority | Criteria |
|----------|----------|
| 🔴 **High** | Keywords: fix, hotfix, breaking, critical, urgent, security; Commits by repo owner to main branch |
| 🟡 **Medium** | Regular team commits, feature branches |
| 🟢 **Low** | Merge commits, docs, documentation, format, style, chore |

### ⚙️ Customizable Settings
- Enable/disable notifications per repository
- Ignore forked repositories
- Ignore your own commits
- Configurable check frequency (1-60 minutes)

### 🛡️ Efficient & Secure
- GitHub API rate limit management
- Response caching to minimize API calls
- Secure Personal Access Token authentication
- No backend server required

## 📦 Installation

### Prerequisites
1. Google Chrome browser
2. A GitHub account
3. A GitHub Personal Access Token (PAT)

### Step 1: Generate Icon Files
1. Open `icons/generate-icons.html` in your browser
2. Click "Download All Icons"
3. Save `icon16.png`, `icon48.png`, and `icon128.png` to the `icons/` folder

### Step 2: Load the Extension
1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `CommitWatch` folder

### Step 3: Configure Authentication
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
| Enable Notifications | Receive Chrome notifications | ✅ On |
| Check Frequency | How often to poll for commits | 5 minutes |
| Ignore Forks | Don't monitor forked repositories | ✅ On |
| Ignore Own Commits | Don't notify for your commits | ❌ Off |
| Per-Repo Toggle | Enable/disable individual repos | All enabled |

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

### Polling Mechanism
1. The service worker uses `chrome.alarms` for periodic checks
2. Every check interval, it fetches repositories via GitHub API
3. For each repository, it compares the latest commit SHA with the stored value
4. New commits trigger Chrome notifications based on priority

### API Rate Limiting
- GitHub allows 5000 requests/hour for authenticated users
- The extension tracks remaining quota via response headers
- Responses are cached to minimize redundant requests
- Rate limit info is displayed in the popup

### Commit Priority Algorithm
```javascript
// High Priority
- Contains: fix, hotfix, breaking, critical, urgent, security
- Author is repository owner on default branch

// Low Priority
- Contains: merge, docs, documentation, format, formatting, style, chore
- Is a merge commit (message starts with "Merge")

// Medium Priority
- Everything else
```

## 🛠️ Development

### Local Development
1. Make changes to the source files
2. Go to `chrome://extensions`
3. Click the refresh icon on the Commit Watch extension
4. Test your changes

### Debugging
- **Background script**: Click "service worker" link in extension details
- **Popup**: Right-click popup → Inspect
- **Options**: Right-click page → Inspect

### Key APIs Used
- `chrome.storage.local` - Persistent data storage
- `chrome.alarms` - Background polling
- `chrome.notifications` - Desktop notifications
- `chrome.identity` - OAuth authentication (optional)
- `chrome.runtime` - Message passing

## ⚠️ Troubleshooting

### "Rate limit exceeded"
- Wait for the rate limit to reset (shown in popup)
- Increase check interval in settings
- Disable unnecessary repositories

### "Invalid token"
- Ensure token has required scopes (repo, read:user, notifications)
- Check token hasn't expired
- Generate a new token if needed

### Notifications not appearing
- Check Chrome notification settings
- Ensure "Enable Notifications" is on in extension settings
- Verify Chrome has permission to show notifications

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
