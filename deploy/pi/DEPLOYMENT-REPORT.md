# Orange Pi deployment report

Updated: 2026-11-26 (Asia/Karachi)

Status: Mac qualification passed for `ce17403`. Deployment is blocked after SSH authentication. Deployed commit and live dashboard URL are unconfirmed.

## Mac qualification

- Base commit: `a0791ba3662dc967ae861681f2ec3ec0b851d73b`.
- Fixed SQLite startup by allowing dotted JSON field paths used by the polling index.
- Backend regression suite: 115 passed, 0 failed. The SQLite persistence test exercises all seven repositories, lease contention, log retention and database reopen.
- Vite production build passed. The official Node.js v22.23.5 Linux ARMv7 archive matched its published SHA-256 checksum.
- Local readiness reported SQLite connected. `PRAGMA integrity_check` returned `ok`.
- Four local Modbus TCP reads passed. EM500 FC03 at 2 returned `[0, 23267]`, Huawei FC03 at 32080 returned `[1, 14565]`, Solis FC04 at 3033 returned `[2302]`, and Sungrow FC03 at 5007 returned `[1000]`. The deployment acceptance script now issues those reads.

## Orange Pi acceptance pending

- The router lists `orangepizero` online on Wi-Fi. The Wi-Fi endpoint presented the previously trusted SSH host key, and SSH confirmed password authentication before the session timed out. A remote identity command returned no output. Dashboard port 8080 was unreachable from the Mac on both tested endpoints.
- The requested Wi-Fi DHCP reservation is pending router admin access. No device answered the Mac's ARP probe for the proposed address. Check the router lease table before saving the reservation and confirm the new lease after renewal.
- Board model, ARMv7 execution, native dependencies, on-device regressions and Modbus reads, configuration persistence across restart, physical isolation, CPU/RAM/storage usage and automatic startup after an authorized reboot remain unverified.
- Installer still refuses partial installations. Inspect any existing deployment and preserve its database before retrying. Confirm trusted-LAN restrictions on the simulator TCP ports as part of on-device qualification.

Next step: Restore an SSH session or obtain direct console access to diagnose the post-authentication timeout, then verify board identity and deployment state before installation.
