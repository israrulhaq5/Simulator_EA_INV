# Orange Pi installation — SQLite

Target: Orange Pi Zero LTS (ARMv7 / armhf, 512 MB nominal RAM), Armbian Debian or Ubuntu. The installer also accepts ARM64 and x86-64 Linux for qualification. It installs a checksum-verified official Node 22 ARM binary, tests the backend, builds React, uses SQLite locally, and installs a dedicated non-root systemd service and Nginx on port 8080. It stops on test or readiness failure. No existing installation is overwritten.

## Fresh install (trusted isolated lab LAN only)

```bash
git clone --branch orange-pi/sqlite --single-branch https://github.com/israrulhaq5/Simulator_EA_INV.git /tmp/zero-export-pi-src
cd /tmp/zero-export-pi-src
sudo SIMULATOR_LAN_CIDR=192.168.100.0/24 bash deploy/pi/install.sh
```

Default access is loopback only; for a trusted LAN explicitly set the CIDR above. The UI has no application authentication. Do not expose any API or Modbus ports to the internet, and do not connect real equipment during qualification. Simulator ports are 15020–15023, forwarding port default 1502. Gateway and zero-export controls remain disabled on a fresh database. The HTTP server listens on 127.0.0.1:3001; Nginx serves UI on 8080.

The persistent database is /var/lib/zero-export-pi/zero-export.sqlite. Configuration is /etc/zero-export-pi.env. Default polling concurrency is 2 and communication log retention 7 days. Temporary build swap is cleaned up; no permanent swap is configured. Existing MongoDB data is not imported. Node runtime is pinned for reproducibility; review security updates separately.

## Verify and operate

```bash
systemctl status zero-export-pi --no-pager
curl -fsS http://127.0.0.1:8080/ready
journalctl -u zero-export-pi -n 80 --no-pager
sqlite3 /var/lib/zero-export-pi/zero-export.sqlite 'PRAGMA quick_check;'
free -h
```

Use SQLite's online backup rather than copying its live WAL database file:
```bash
umask 077
sqlite3 /var/lib/zero-export-pi/zero-export.sqlite ".backup '/root/zero-export-pi-backup.sqlite'"
```

## Acceptance boundary

The installer runs deploy/pi/acceptance.sh before and after restarting the service: checks SQLite, seeded profiles, each simulator's live values and TCP listener, and disabled physical control. The installer must report INSTALL PASS on the target; this is not proof of Modbus RTU, live equipment control, or sustained-load/power-loss acceptance. Hardware checks must be conducted on an isolated test bench. Do not use production controller outputs until commissioned. If installation fails after creating the deployment directory, inspect the logs and preserve any state before manually cleaning up; the installer deliberately does not delete existing data.
