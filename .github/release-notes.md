08 Codex RPC follows the chat currently open in Codex Desktop on Windows. Switching chats updates the Discord activity without needing to send a new message. If the desktop selection is unavailable, it falls back to the latest local chat.

## Choose your download

| System | Download |
| --- | --- |
| Windows x64 | `portable.exe` |
| Mac with Apple silicon | `mac-arm64.dmg` |
| Intel Mac | `mac-x64.dmg` |
| Linux x64 | `linux-x86_64.AppImage` |
| Linux ARM64 | `linux-arm64.AppImage` |

Keep Discord desktop and Codex open, then launch 08 Codex RPC. On Linux, make the AppImage executable before launching it.

macOS packages use ad-hoc signing and are not Apple-notarized. These packages are built and tested on GitHub's native platform runners; Discord presence has been checked interactively on Windows, while interactive macOS/Linux Discord sessions have not yet been verified.

## Changes

- Fix Windows chat switching by reading only the active chat ID from Codex Desktop's local activity log, then getting its title and model from Codex metadata.
- Keep the latest-chat fallback for CLI use and when desktop selection is unavailable.
- Add a regression test where the visible chat differs from the most recently edited chat.

The README contains setup, build, and privacy details.

