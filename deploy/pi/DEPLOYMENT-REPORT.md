# Orange Pi deployment report

Updated: 2026-11-27 (Asia/Karachi)

Status: Deployed and verified over Ethernet. Service restart acceptance passed. Cold boot acceptance is pending a board reboot.

Deployed source: `a4eb1cc3b1271d6e261f76af880efdb144c824d7`. Dashboard: `http://192.168.100.152:8080/` from the lab LAN.

## Orange Pi results

- SSH identified `orangepizero` as Xunlong Orange Pi Zero, ARMv7, 484 MiB RAM, Armbian 26.11/Debian Trixie, kernel `6.18.64-current-sunxi`.
- Node v22.23.5 ARMv7 archive checksum passed. Node loaded SQLite 3.54.1 and the installed SerialPort and Modbus modules. Backend tests passed 115/115. The Vite production build ran on the board and the Mac fetched its HTML, JavaScript and CSS.
- The readiness endpoint reported SQLite connected and four register profiles were exported. `PRAGMA integrity_check` returned `ok`. The EM500 update interval persisted at 1250 ms after a service restart and was then restored to 1000 ms.
- Post-restart Modbus TCP reads returned EM500 FC03 at 2 `[0, 23252]`, Huawei FC03 at 32080 `[1, 13179]`, Solis FC04 at 3033 `[2296]` and Sungrow FC03 at 5007 `[1000]`.
- Nginx permits the lab subnet on 8080. A deployment-specific systemd drop-in confines the backend and simulators to loopback, hides physical devices, and sets memory limits of 240 MiB high and 320 MiB max. From the Mac, backend and Modbus ports were inaccessible. Gateway and zero-export physical control remained disabled. The operator confirmed only power and Ethernet were attached.
- The service used about 32 MiB of cgroup memory, peaked near 33 MiB, and used 3.05% of one CPU over a five-second idle sample. The board had 374 MiB available RAM and 5.3 GiB free storage. No service journal entries at error level were observed during qualification. Both systemd services are enabled.
- Installer acceptance passed before and after restart. The exit cleanup then misidentified active swap and triggered a service stop. The exact installer swap file was manually deactivated and removed, and the service recovered. This follow-up corrects swap detection and prevents post-qualification cleanup errors from stopping the application. The corrected installer has syntax checks but has not been rerun as a fresh install.

## Mac qualification

- Base commit: `a0791ba3662dc967ae861681f2ec3ec0b851d73b`.
- Fixed SQLite startup by allowing dotted JSON field paths used by the polling index.
- Backend regression suite: 115 passed, 0 failed. The SQLite persistence test exercises all seven repositories, lease contention, log retention and database reopen.
- Vite production build passed. The official Node.js v22.23.5 Linux ARMv7 archive matched its published SHA-256 checksum.
- Local readiness reported SQLite connected. `PRAGMA integrity_check` returned `ok`.
- Four local Modbus TCP reads passed. EM500 FC03 at 2 returned `[0, 23267]`, Huawei FC03 at 32080 returned `[1, 14565]`, Solis FC04 at 3033 returned `[2302]`, and Sungrow FC03 at 5007 returned `[1000]`. The deployment acceptance script now issues those reads.

## Orange Pi acceptance pending

- Automatic startup awaits a safe reboot. Physical RTU hardware was outside this isolated simulator qualification.
- The requested Wi-Fi DHCP reservation remains pending router admin access. Deployment used the Ethernet address.
- Installer remains fresh-install only. For partial installations preserve the SQLite database and inspect installed state before retrying.

Next step: Reboot with operator approval, then verify the service starts automatically and rerun the on-board acceptance script.
