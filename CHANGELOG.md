# Changelog

## 1.0.2

- Read the latest model and reasoning setting from Codex's local thread metadata.
- Refresh presence when the reasoning setting changes, including Low to High.
- Keep the session-log fallback when the local database is unavailable.
- Show friendly model labels such as `GPT-6 Sol High`.
- Replace the purple Windows app icon with white and black 08 artwork.
- Add a regression test for reasoning-level changes.

## 1.0.1

- Pure-black dashboard with live presence preview.
- Chat-title, model, label, and elapsed-time controls.
- Portable Windows build, tray controls, and Discord IPC connection.
