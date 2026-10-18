08 Codex RPC now has native packages for Windows, macOS, and Linux.

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

- Native macOS and Linux Codex process detection.
- Discord Unix socket discovery, including Linux Flatpak and Snap socket locations.
- Windows named-pipe support retained.
- White-and-black 08 app icons across platforms.
- Remove the Codex authorship credit from the README.
- Remove the cursor and blue glow from the dashboard screenshot.
- Cross-platform process and local IPC regression tests.

SHA256SUMS.txt includes the checksums for every downloadable package. The README contains setup, build, and privacy details.
