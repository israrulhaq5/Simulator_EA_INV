# Optional Orange Pi management console

Cockpit adds a second HTTPS listener on the Pi’s Ethernet address at port 9090. Install it separately from the Simulator on Debian 13/Trixie armhf. The installer expects a fresh Cockpit installation, an APT source for Trixie backports, an Ethernet address reserved for the Pi, and the nftables CLI at `/usr/sbin/nft`. Inspect the active firewall before provisioning nftables on a host that lacks the CLI. Preserve the existing ruleset and avoid enabling a second firewall manager. Debian Trixie backports ships Cockpit for armhf. Cockpit 358 introduced native Wi-Fi management. [Debian package list](https://packages.debian.org/trixie-backports/armhf/admin/) · [Cockpit 358 release notes](https://cockpit-project.org/blog/cockpit-358.html)

## Capture the baseline and install

1. Verify the current Simulator boot and acceptance using [the Simulator runbook](README.md). Record the boot ID from `/proc/sys/kernel/random/boot_id`, verify the systemd services, and rerun `deploy/pi/acceptance.sh` and SQLite `PRAGMA integrity_check;` on the Pi. Record current Simulator settings before making changes, using a protected SQLite backup or readings of the relevant configuration fields.
2. Run `sudo bash deploy/pi/cockpit/measure.sh pre-install` on the Pi. Save the output in a protected location and record the interface holding the Ethernet address and which backend manages it.
3. Check the authentication account. Use an existing local non-root account with a PAM password and administrative rights for privileged actions. Keep Cockpit’s default root login denial. Verify the server certificate through SSH or provision a certificate trusted by the client with the IP in its subject alternative name before entering a password. [Cockpit authentication](https://cockpit-project.org/guide/latest/authentication.html) · [Cockpit HTTPS certificates](https://cockpit-project.org/guide/latest/https.html)
4. Refresh the APT index and run the optional installer. Replace `end0` if the baseline shows another interface.

   ```bash
   sudo apt-get update
   sudo bash deploy/pi/install-cockpit.sh 192.168.100.152 192.168.100.0/24 end0
   ```

The installer uses `--no-install-recommends` and leaves the Simulator’s service and files untouched. It installs the native storage page and adds native networking when NetworkManager already owns the Ethernet interface. On a 512 MB Pi, use the matched test conditions below to quantify the impact of the storage and network services. The nftables rules loaded before the Cockpit socket opens apply solely to port 9090 on the selected IPv4 address. They require both the Ethernet ingress interface and the trusted source subnet. Keep the existing firewall rules and ensure firewall reloads preserve the `automatrix_cockpit` table. Cockpit starts on demand through `cockpit.socket`.

## NetworkManager handoff

Inspect `ip -br address`, `ip route`, `nmcli device status`, `networkctl list` and the persistent configuration to determine ownership of Ethernet and Wi-Fi. If NetworkManager already manages both, retain that backend. If Ethernet is managed by networkd through Netplan, schedule a handoff with a local serial console and a second LAN SSH client. Keep the original SSH connection open. Use a root-only copy of the original Netplan and NetworkManager configuration and record service enablement and DNS ownership. Keep the original renderer available during the test.

Prepare matching NetworkManager profiles before the handoff, preserving the IP or DHCP reservation, route, DNS, and Ethernet route preference. Stage Wi-Fi separately and keep its route at a higher metric until validated. With Netplan, validate the staged configuration with `netplan generate` and use `netplan try --timeout 120` from the console to stage the change. Test a **new** SSH session over Ethernet, 8080, route and DNS before confirming. If a check fails, decline confirmation. From the console compare the persistent files to the backup, restore the original files and service enablement if needed, and run `netplan apply`. Verify the restored SSH path before rebooting. For another network backend, prepare its equivalent rollback at the console before handing off. A test that interrupts management SSH fails acceptance.

After a successful handoff, install `cockpit-networkmanager/trixie-backports` with `--no-install-recommends`. Install the NetworkManager Wi-Fi backend and supplicant only if needed for the detected hardware. Verify Wi-Fi association and DHCP using a test AP while retaining the Ethernet SSH path. Verify IPv4 static, DHCP, DNS and gateway edits on a test connection before touching the management profile.

## Acceptance and overhead

- From the trusted LAN, verify HTTPS, a failed unauthenticated request to `/cockpit/login`, successful PAM login, and administrative access. Test 9090 from outside the allowed source or ingress path and confirm the nftables counter increments. Verify 8080 separately.
- Open CPU and memory metrics, Storage and Board temperature. Compare them with system counters, `df` and `/sys/class/thermal/thermal_zone0/temp`. In Networking verify Ethernet and Wi-Fi management and the IPv4 configuration methods.
- In Services, stop, start and restart `zero-export-pi.service` in the maintenance window. Observe the corresponding readiness changes and restore enabled startup. Verify journal output and execute `id` in the web terminal. Verify reboot and shutdown actions with console access for power-on after shutdown.
- Capture three 10-second samples for each state with `sudo bash deploy/pi/cockpit/measure.sh PHASE`. Use `pre-install` after boot settles, `socket-idle` after all Cockpit login sessions and workers exit, and `browser-active` while logged into CPU and memory metrics. Keep Simulator traffic and other clients comparable. Report median host CPU busy percentage, available RAM and root filesystem byte delta. Report per-process RSS individually because shared pages may be counted in several processes. Record NetworkManager and udisks overhead alongside Cockpit if installed. Keep the APT transaction’s package footprint distinct from the root filesystem delta.
- After reboot, compare boot IDs and verify enabled and active `zero-export-pi.service`, `nginx.service`, and `cockpit.socket`. Verify that Cockpit can launch on demand, then repeat Simulator acceptance, the full SQLite integrity check, the 115 backend tests and settings comparison. Confirm gateway and zero-export remain disabled.

## Rollback

Stop the socket and service before removing any filtering rules. These commands apply to files created by the optional installer. If installation failed with the units still masked, remove those masks only after removing any partly installed Cockpit packages or verifying the completed LAN rules.

```bash
sudo systemctl disable --now cockpit.socket
sudo systemctl stop cockpit.service
sudo rm -f /etc/systemd/system/cockpit.socket.d/50-automatrix-lan.conf
sudo rm -f /etc/cockpit/{automatrix-lan.nft,cockpit.conf}
sudo nft delete table inet automatrix_cockpit
sudo rm -r /usr/local/share/cockpit/amx-temperature
sudo systemctl daemon-reload
```

Review the exact APT transaction in `/var/log/apt/history.log` before purging any newly installed Cockpit packages. Keep pre-existing packages and active network services. If a network migration was performed, restore it separately from the serial console using the saved backend configuration and verify SSH and port 8080 again.
