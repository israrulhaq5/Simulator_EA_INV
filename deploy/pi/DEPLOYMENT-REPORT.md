# Orange Pi deployment report

Updated: 2026-11-27 (Asia/Karachi)

Status: Simulator automatic startup verified on the 14:11 PKT reboot. Cockpit, Simulator and Nginx automatic startup passed on the subsequent 15:04 PKT reboot.

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

## Items pending at the original Simulator handoff

- Automatic startup awaits a safe reboot. Physical RTU hardware was outside this isolated simulator qualification.
- The requested Wi-Fi DHCP reservation remains pending router admin access. Deployment used the Ethernet address.
- Installer remains fresh-install only. For partial installations preserve the SQLite database and inspect installed state before retrying.

See the follow-up below for subsequent boot and acceptance evidence.

## Cockpit LAN verification

2026-11-27, around 14:32 PKT. Cockpit was already answering before the optional installer in this branch was run. SSH reached the Pi and authenticated the known host, but available keys were rejected for both the default local account and root. The earlier SSH control socket was stale. The active package set, firewall rules, startup configuration and network backend could not be read over SSH. No board changes were made during this verification.

| Check | Result | Evidence |
| --- | --- | --- |
| Cockpit HTTPS on 9090 | PASS | LAN connection returned HTTP 200 over TLS. Plain HTTP redirected to HTTPS with HTTP 301. |
| Certificate validation with default client trust | FAIL | The live endpoint presented a self-signed certificate. A second check used the public certificate retrieved over host-key-verified SSH as the trust anchor. IP validation still failed because the certificate SAN contains only 127.0.0.1 and localhost. The reachability probe sent no credentials. |
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

## Authenticated board follow-up

On 2026-11-27, SSH key login as `amx` succeeded over Ethernet and Wi-Fi. The user demonstrated a signed-in Cockpit web terminal. The SSH account requires an interactive sudo password, and the browser origin approval was declined. The checks below therefore use SSH plus the user’s browser evidence.

- **Simulator boot PASS.** The journal shows the Simulator starting at 14:11:11 PKT and Nginx at 14:11:12 on boot `ba2d5119-0556-4ac9-b08f-d012140f133d`. The live readiness and on-board Modbus checks passed. EM500 FC03 returned `[0, 23497]`, Huawei FC03 `[1, 13357]`, Solis FC04 `[2346]`, and Sungrow FC03 `[1000]`. Gateway and zero-export remained disabled.
- **Cockpit package selection PASS.** APT history shows installation with `--no-install-recommends`. The four installed Cockpit packages were all version `372-1~bpo13+1` on armhf. No installed Docker engine, Podman, containerd, PackageKit, PCP, Armbian desktop metapackage or UDisks package appeared in the inspected package inventory. The native Storage page is absent.
- **Socket configuration PASS.** The enabled socket binds only to `192.168.100.152:9090`, the service is static, and the live unit has the trusted source range `192.168.100.0/24` configured. Kernel cgroup BPF support is present. An out-of-subnet rejection test remains pending. Cockpit was installed after the 14:11 reboot, so that reboot only establishes automatic startup for the Simulator and Nginx.
- **Ethernet and Wi-Fi connectivity PASS.** Separate SSH connections reached `end0` at `192.168.100.152` and `wlan0` at `192.168.100.199`. Both used DHCP, gateway `192.168.100.1` and DNS `192.168.100.1`. Ethernet had route metric 100 and Wi-Fi 600. **Native network editing FAIL.** Both interfaces are managed by systemd-networkd. NetworkManager is installed and disabled. No backend migration or profile edits were performed.
- **Temperature sensor PASS.** The kernel `cpu_thermal` sensor returned 59.1 °C and the temperature page was visible in the user's screenshot. The reading inside the Cockpit page and the CPU/RAM pages remain unverified. Journal access via SSH passed. Management through the Cockpit Logs and Services pages remains unverified.
- **Fresh ARM suite PASS, 115/115.** The first two runs against the host network namespace reported 114 of 115. The serial retry identified `EADDRINUSE` on 15022 in the stopped-Solis test because the live Simulator already uses that port. The isolated loopback network namespace run passed all 115 tests in 59.4 seconds while the live Simulator kept running. The 97.52% host CPU sample taken during the first test run was excluded from the browser-only comparison.

### On-board resource measurements

| Measurement | Pre-install | Socket-only | Signed-in terminal |
| --- | --- | --- | --- |
| Host CPU busy across four cores, 10-second sample | Unavailable | 1.03% | 12.90% |
| Available RAM | Unavailable | 378,696 KiB | 338,076 KiB |
| Root filesystem used | Unavailable | 2,008,092,672 bytes | 2,005,446,656 bytes |

The signed-in-terminal sample was collected after the concurrent tests ended. The socket-only sample was taken after reboot, with the socket listening, the service inactive and no Cockpit worker processes. The two measurements are observations from different boots and do not isolate the CPU or RAM cost of Cockpit. Cockpit TLS, web server, session and two bridge processes individually used 4,524, 4,904, 3,352, 21,192 and 19,660 KiB RSS. RSS includes shared pages. The four Cockpit packages report 7,578 KiB of installed size and NetworkManager reports 5,904 KiB. The 26 packages retained from the original Cockpit APT transaction total 25,181 KiB of installed size at current versions, including dependencies. This is package metadata and does not establish the root filesystem delta.

## Privileged acceptance and final reboot

- **Simulator controls PASS.** Live SQLite `PRAGMA integrity_check` returned `ok`. Stopping the Simulator made readiness unavailable. Start and restart restored readiness.
- **Post-install reboot PASS.** Boot ID changed from `ba2d5119-0556-4ac9-b08f-d012140f133d` to `25aaf9e8-7949-4772-b021-9d5003d61dc7`. Cockpit opened its enabled socket at 15:04:34 PKT and started its service on demand at 15:04:39. The Simulator and Nginx started at 15:04:37. Both Ethernet and Wi-Fi SSH returned after reboot.
- **On-board Simulator acceptance PASS.** The full post-boot SQLite integrity result was `ok`. The acceptance script passed the UI, readiness, profile export, all four TCP listeners and disabled physical control checks. EM500 FC03 returned `[0, 23175]`, Huawei FC03 `[1, 15531]`, Solis FC04 `[2294]`, and Sungrow FC03 `[1000]`. The settings fingerprint matched the pre-reboot value for the four Simulator configurations and gateway and zero-export configuration. The isolated ARM backend suite passed again after reboot, 115/115 in 57.1 seconds.
- **Trusted-LAN restriction PASS.** From an isolated test namespace with source `198.18.42.2`, the SSH control connection received a banner while HTTPS on 9090 timed out. Trusted LAN HTTPS returned 200, and the anonymous login endpoint returned 401. The temporary namespace was removed. The live Pi uses its existing systemd IP allowlist, which passed this test. The optional fresh installer uses a dedicated nftables rule.
- **TLS address validation PASS with the explicitly trusted certificate.** The old certificate details above describe the pre-upgrade state. A Pi-generated self-signed certificate with IP SAN `192.168.100.152` now serves the endpoint. The Mac retrieved the public certificate through verified SSH and validated HTTPS using it as the trust anchor. Browser default trust remains pending.
- **Temperature and storage provider PASS.** The deployed on-demand Cockpit package was enumerated by the bridge. The kernel sensor returned 64.9 °C and the root filesystem reported 27% used. The page adds disk monitoring without UDisks or metrics history. Browser rendering and native CPU/RAM, Logs and Services page interactions remain unverified.
- Native Cockpit network editing still fails because NetworkManager does not manage the links. The prior reboot journal records an earlier Wi-Fi handoff attempt failing because NetworkManager reported wlan0 unavailable. The existing Ethernet and Wi-Fi paths were retained. Shutdown was not exercised because a power-on path was unavailable.
