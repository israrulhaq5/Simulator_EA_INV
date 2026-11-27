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

## Cockpit LAN verification

2026-11-27, around 14:32 PKT. Cockpit was already answering before the optional installer in this branch was run. SSH reached the Pi and authenticated the known host, but available keys were rejected for both the default local account and root. The earlier SSH control socket was stale. The active package set, firewall rules, startup configuration and network backend could not be read over SSH. No board changes were made during this verification.

| Check | Result | Evidence |
| --- | --- | --- |
| Cockpit HTTPS on 9090 | PASS | LAN connection returned HTTP 200 over TLS. Plain HTTP redirected to HTTPS with HTTP 301. |
| Certificate validation with default client trust | FAIL | The live endpoint presented a self-signed certificate that the client did not trust. The reachability probe used TLS without certificate validation and sent no credentials. |
| Anonymous authentication gate | PASS | An unsigned-in request to `/cockpit/login` returned HTTP 401. |
| Successful local authentication, admin permissions, trusted-LAN restriction | Pending | Requires authenticated access and a test from outside the allowed source or ingress path. |
| CPU, RAM, storage and temperature pages | Pending | Requires an authenticated browser session. |
| Ethernet and Wi-Fi management, static IP, DHCP, DNS and gateway | Pending | Requires network backend inspection and a test network profile. |
| System services, Simulator start/stop/restart and automatic startup controls | Pending | Requires authenticated browser access and an on-board acceptance run. |
| Logs, web terminal, reboot and shutdown | Pending | Requires an authenticated session. Shutdown also needs an available power-on path. |
| Simulator on port 8080, SQLite readiness | PASS | Live readiness reported SQLite connected. |
| Four simulator process states | PASS | Live API reported EM500, Huawei, Solis and Sungrow as running. A fresh Modbus register read awaits on-board access. |
| Physical control disabled | PASS | Both gateway and zero-export reported disabled and stopped. |
| Backend tests | PASS on Mac | 115/115. Earlier on-board 115/115 is recorded above. A fresh on-board run, full SQLite integrity check, and saved-settings comparison remain pending. |
| Socket activation and post-reboot startup | Pending | Requires service state and boot ID before/after reboot. |
| ARMv7 package selection and exclusions on the live Pi | Pending | The optional installer defines the package set and skips recommendations. The live package inventory requires board access. |

### Resource comparison

| Metric | Pre-install | Socket idle | Authenticated browser |
| --- | --- | --- | --- |
| CPU | No matched sample | Unmeasured | Unmeasured |
| RAM | No matched sample | Unmeasured | Unmeasured |
| Storage | No matched sample | Unmeasured | Unmeasured |

The previous Simulator-only qualification above gives historical context. Its single-service CPU figure uses a different denominator from the host CPU samples in the Cockpit runbook and cannot support an overhead delta. See [the Cockpit runbook](COCKPIT.md) for the matched samples, installation and rollback.
