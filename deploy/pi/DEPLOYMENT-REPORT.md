# Orange Pi deployment report

Status: Mac qualification passed. Orange Pi deployment is pending SSH access.

## Mac qualification

- Base commit: `a0791ba3662dc967ae861681f2ec3ec0b851d73b`.
- Fixed SQLite startup by allowing dotted JSON field paths used by the polling index.
- Backend regression suite: 115 passed, 0 failed. The SQLite persistence test exercises all seven repositories, lease contention, log retention and database reopen.
- Vite production build passed. The official Node.js v22.23.5 Linux ARMv7 archive matched its published SHA-256 checksum.
- Local readiness reported SQLite connected. `PRAGMA integrity_check` returned `ok`.
- Four local Modbus TCP reads passed. EM500 FC03 at 2 returned `[0, 23267]`, Huawei FC03 at 32080 returned `[1, 14565]`, Solis FC04 at 3033 returned `[2302]`, and Sungrow FC03 at 5007 returned `[1000]`. The deployment acceptance script now issues those reads.

## Orange Pi acceptance pending

- The previously trusted SSH endpoint offered password authentication but rejected noninteractive key authentication. The alternative endpoint's host key needs independent verification.
- Hardware identity, deployed commit, dashboard URL, ARMv7 execution, native dependencies, resource usage, physical isolation, service restart and authorized reboot remain unverified.
- Installer still refuses partial installations. Inspect any existing deployment and preserve its database before retrying. Confirm trusted-LAN restrictions on the simulator TCP ports as part of on-device qualification.
