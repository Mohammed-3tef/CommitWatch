# Commit Watch Flutter Mobile App Roadmap

Commit Watch is currently a Chrome extension for GitHub and GitLab monitoring. This document turns the extension into a Flutter mobile app roadmap.

## Feature inventory

| Area | Current capability |
| --- | --- |
| Authentication | GitHub and GitLab PAT login, validation, disconnect |
| Repository sync | Fetches user repos/projects, caches them, ignores forks |
| Monitoring | Polls commits and releases/tags on a schedule |
| Classification | Detects merge/docs/config/CI/test/localization/code commits |
| Priority | Flags high-risk changes using files, size, and keywords |
| Notifications | Desktop notifications for commits, releases, and GitHub notifications |
| Activity feed | Unified recent activity list with platform filtering |
| Settings | Interval, release alerts, fork filter, own-commit filter, repo toggles |
| Rate limits | GitHub and GitLab remaining quota display |
| UX extras | Theme toggle, manual refresh, clear history, unread badge, shortcuts |
| Analytics | Commit charts by time range for GitHub and GitLab |

## Flutter product goal

Build a mobile app that keeps the same monitoring value, but in a mobile-first workflow:

- Connect GitHub and GitLab with PATs
- Sync repositories and background activity
- Surface critical commits and releases quickly
- Keep an activity feed, settings, and analytics in one app

## MVP

The MVP should include:

1. GitHub and GitLab PAT authentication
2. Secure token storage
3. Repository discovery and per-repo enable/disable
4. Commit polling with priority classification
5. Release/tag monitoring
6. Local notifications
7. Unified activity feed
8. Core settings: interval, notifications, release alerts, fork filter, own-commit filter
9. Manual refresh and clear history
10. Basic rate-limit visibility and error handling

Not in MVP:

- Charts and analytics
- GitHub notifications inbox sync
- App badge parity on every platform
- Keyboard shortcut equivalents
- Advanced sharing/collaboration features

## Epic map

### Epic 1: App foundation
Flutter shell, navigation, theming, state management, and shared UI components.

User stories:
- As a user, I can move between dashboard, repositories, settings, and analytics.
- As a user, I can switch between light and dark themes.
- As a developer, I can reuse common cards, chips, and list items.

### Epic 2: Authentication and security
PAT login, validation, secure storage, and logout for both platforms.

User stories:
- As a user, I can connect GitHub safely with a valid PAT.
- As a user, I can connect GitLab safely with a valid PAT.
- As a user, I can disconnect one platform without removing the other.

### Epic 3: Repository management
Repository discovery, search, filtering, and monitoring toggles.

User stories:
- As a user, I can see all repositories from both platforms.
- As a user, I can search and filter repositories quickly.
- As a user, I can enable or disable monitoring per repository.

### Epic 4: Monitoring engine
Polling, SHA comparison, release/tag checks, and commit priority logic.

User stories:
- As a user, I get alerts only for new commits or releases.
- As a user, important changes are prioritized automatically.
- As a user, my own commits can be ignored when enabled.

### Epic 5: Notifications and feed
Local notifications, notification history, and a unified activity timeline.

User stories:
- As a user, I receive a mobile alert when critical activity happens.
- As a user, I can open a feed of recent commits and releases.
- As a user, I can clear history when needed.

### Epic 6: Settings and controls
All monitoring preferences and maintenance actions.

User stories:
- As a user, I can change the polling interval.
- As a user, I can toggle notifications and release alerts.
- As a user, I can refresh or reset activity data.

### Epic 7: Insights
Mobile-friendly analytics and rate-limit visibility.

User stories:
- As a user, I can see commit trends by day, week, and month.
- As a user, I can compare GitHub and GitLab activity.
- As a user, I can review API quota before forcing a sync.

## Sprints

Assume 2-week sprints.

### Sprint 1: Foundation and auth
- Create Flutter app shell and navigation
- Add theme system
- Add secure storage layer
- Build GitHub PAT login
- Build GitLab PAT login

### Sprint 2: Repository sync
- Add normalized repository model
- Fetch GitHub repositories
- Fetch GitLab projects
- Add search and platform filters
- Add per-repo monitoring toggles

### Sprint 3: Monitoring
- Add background polling
- Track last commit SHA per repo
- Classify commit priority
- Detect releases and tags
- Handle rate limits and retry behavior

### Sprint 4: Notifications and feed
- Send local notifications
- Store activity history
- Build unified feed UI
- Add clear history action
- Add manual refresh

### Sprint 5: Settings and analytics
- Build settings screen
- Persist interval and filter settings
- Show rate-limit state
- Add analytics charts
- Polish empty/error states

## Kanban board

### Ready

| Task | Epic | Notes |
| --- | --- | --- |
| Scaffold Flutter app with tab navigation | Epic 1 | Dashboard, repos, settings, insights |
| Add theme support and shared UI widgets | Epic 1 | Light/dark mode and reusable cards |
| Implement secure token storage | Epic 2 | Use encrypted local storage |
| Build GitHub login screen | Epic 2 | PAT validation before save |
| Build GitLab login screen | Epic 2 | PAT validation before save |
| Create normalized repository model | Epic 3 | Common fields for both platforms |
| Build repo search and platform filter | Epic 3 | Name + GitHub/GitLab filter |
| Add repo enable/disable toggles | Epic 3 | Persist per-repo state |

### In progress

| Task | Epic | Notes |
| --- | --- | --- |
| None | - | - |

### Blocked

| Task | Epic | Notes |
| --- | --- | --- |
| None | - | - |

### Done

| Task | Epic | Notes |
| --- | --- | --- |
| None | - | - |

### Backlog

| Task | Epic | Notes |
| --- | --- | --- |
| Add background polling scheduler | Epic 4 | Use platform-native background work |
| Implement commit SHA change detection | Epic 4 | Avoid duplicate alerts |
| Port commit priority classifier | Epic 4 | Preserve current file-pattern logic |
| Add release/tag monitor | Epic 4 | GitHub and GitLab support |
| Add local notification pipeline | Epic 5 | Include tap actions and dismissal |
| Build unified activity feed | Epic 5 | Commit/release cards with platform badges |
| Add clear history action | Epic 5 | Remove stored notification history |
| Add settings persistence | Epic 6 | Interval, filters, notification flags |
| Show GitHub/GitLab rate limits | Epic 7 | Display remaining quota |
| Build analytics charts | Epic 7 | Time-range commit trends |
| Add automated tests | Epic 1 | Models, parsers, sync, and settings |

## Recommended Flutter stack

- Flutter + Dart
- Riverpod or Bloc
- GoRouter
- flutter_secure_storage
- http or dio
- workmanager or background_fetch
- flutter_local_notifications
- Hive, Isar, or Drift
- fl_chart

## Delivery order

1. Foundation and auth
2. Repository sync
3. Monitoring and notifications
4. Settings and feed
5. Analytics and release hardening

