# Contributing

Use Node.js 22.13 or later on Windows, macOS, or Linux. Install the locked dependencies with `npm ci`, run `npm test`, and use `npm start` for the dashboard. Build packages on their target system with `npm run build:win`, `npm run build:mac`, or `npm run build:linux`.

Keep changes focused. For a presence-reading fix, include the relevant metadata fixture and a regression test without real prompts, account credentials, or private chat content.

When reporting a bug, include the app version, Windows version, Codex version, and whether Discord desktop shows Connected. Redact private chat titles and account details from screenshots. Never attach authentication files or session logs containing private messages to a public issue.
