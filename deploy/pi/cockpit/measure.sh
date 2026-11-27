#!/usr/bin/env bash
set -euo pipefail

phase=${1:?Supply pre-install, socket-idle, or browser-active}
[[ $phase == pre-install || $phase == socket-idle || $phase == browser-active ]]
printf 'Phase=%s UTC=%s Kernel=%s Architecture=%s\n' "$phase" "$(date -u +%FT%TZ)" "$(uname -r)" "$(dpkg --print-architecture)"
printf 'CPU cores=%s\n' "$(nproc)"
awk '/^model name|^Hardware/ { print; exit }' /proc/cpuinfo
read -r _ user1 nice1 sys1 idle1 wait1 irq1 soft1 steal1 _ < /proc/stat
sleep 10
read -r _ user2 nice2 sys2 idle2 wait2 irq2 soft2 steal2 _ < /proc/stat
busy=$((user2-user1 + nice2-nice1 + sys2-sys1 + irq2-irq1 + soft2-soft1 + steal2-steal1))
total=$((busy + idle2-idle1 + wait2-wait1))
awk -v busy="$busy" -v total="$total" 'BEGIN {printf "Host CPU busy (10 s, all cores): %.2f%%\n", 100 * busy / total}'
awk '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/' /proc/meminfo
df -B1 --output=source,size,used,avail,target / /var/lib/zero-export-pi
ps -eo pid,ppid,rss,comm | awk 'NR==1 || $4 ~ /^(cockpit|udisksd$|NetworkManager$)/'
dpkg-query -W -f='${db:Status-Status} ${binary:Package} ${Version} ${Installed-Size}\n' |
  awk '$1=="installed" && $2 ~ /^(cockpit|nftables|udisks2|network-manager)/'
systemctl show cockpit.socket cockpit.service zero-export-pi.service \
  -p Id -p ActiveState -p UnitFileState -p MemoryCurrent -p CPUUsageNSec
if [[ $phase == pre-install ]]; then
  ip -br link
  ip -br address
  ip route show
  ip -6 route show
  ls -l /etc/resolv.conf
  awk '/^nameserver /' /etc/resolv.conf
  for unit in NetworkManager systemd-networkd networking systemd-resolved; do
    systemctl show "$unit.service" -p Id -p ActiveState -p UnitFileState
  done
  if command -v nmcli >/dev/null; then nmcli device status || true; fi
fi
