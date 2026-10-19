08 Codex RPC 1.1.3 has one download for each operating system. It follows the chat selected in Codex Desktop on Windows, macOS, and Linux. Switching to an older chat updates your Discord presence without sending a message.

## Choose your download

| System | Download |
| --- | --- |
| Windows x64 | `portable.exe` |
| Mac (Apple silicon or Intel) | `mac.dmg` |
| Linux (x64 or ARM64) | `linux.tar.gz` |

Keep Discord desktop and Codex open, then launch 08 Codex RPC. On Linux, extract the archive and run `./08-Codex-RPC` inside the extracted folder. It selects the matching AppImage automatically.

The macOS package uses ad-hoc signing and is not Apple-notarized. Native CI builds and tests each platform. Interactive macOS/Linux Discord sessions have not yet been checked.

## Changes

- Combine Intel and Apple silicon into one universal Mac DMG.
- Bundle both Linux architectures in one archive with an automatic launcher.
- Include the active-chat tracking fix from 1.1.2.

The README contains setup, build, and privacy details.


