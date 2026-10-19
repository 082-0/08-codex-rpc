08 Codex RPC 1.1.2 follows the chat selected in Codex Desktop on Windows, macOS, and Linux. Switching to an older chat updates your Discord presence without sending a message. If desktop selection data is unavailable, it uses the latest local chat.

## Choose your download

| System | Download |
| --- | --- |
| Windows x64 | `portable.exe` |
| Mac with Apple silicon | `mac-arm64.dmg` |
| Intel Mac | `mac-x64.dmg` |
| Linux x64 | `linux-x86_64.AppImage` |
| Linux ARM64 | `linux-arm64.AppImage` |

Keep Discord desktop and Codex open, then launch 08 Codex RPC. On Linux, make the AppImage executable before launching it.

macOS packages use ad-hoc signing and are not Apple-notarized. Native CI builds and tests all five packages. Interactive Discord presence was verified on Windows; macOS/Linux interactive sessions have not yet been checked.

## Changes

- Read selected-chat changes from the desktop activity logs on Windows, macOS, and Linux.
- Locate Windows packaged app logs and the native macOS/Linux log folders.
- Clear the chat after a desktop deactivation event and recognize ChatGPT desktop processes.
- Fall back to the latest local chat when no selection event exists.

The README contains setup, build, and privacy details.


