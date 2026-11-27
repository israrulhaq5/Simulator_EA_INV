#!/usr/bin/env bash
set -Eeuo pipefail

[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ $# == 3 ]] || { echo "Usage: $0 ETHERNET_IP TRUSTED_LAN_CIDR ETHERNET_INTERFACE" >&2; exit 1; }
bind_ip=$1
lan=$2
interface=$3
root=$(cd "$(dirname "$0")" && pwd)
[[ $interface =~ ^[A-Za-z0-9_.-]{1,15}$ && $interface != lo ]]
python3 - "$bind_ip" "$lan" <<'PY'
import ipaddress
import sys

address = ipaddress.IPv4Address(sys.argv[1])
network = ipaddress.IPv4Network(sys.argv[2])
private = ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
if address not in network or not any(network.subnet_of(ipaddress.IPv4Network(block)) for block in private):
    sys.exit("Bind address must belong to a private LAN CIDR.")
PY
ip -4 -o address show dev "$interface" | awk -v ip="$bind_ip" '{split($4,a,"/"); if(a[1]==ip) found=1} END{exit !found}'

dropin=/etc/systemd/system/cockpit.socket.d/50-automatrix-lan.conf
config=/etc/cockpit/cockpit.conf
firewall=/etc/cockpit/automatrix-lan.nft
temperature=/usr/local/share/cockpit/amx-temperature
for path in "$dropin" "$config" "$firewall" "$temperature" \
  /etc/systemd/system/cockpit.socket /etc/systemd/system/cockpit.service; do
  [[ ! -e $path && ! -L $path ]] || { echo "Existing configuration: $path" >&2; exit 1; }
done
if dpkg-query -W -f='${db:Status-Status}\n' cockpit-ws 2>/dev/null | grep -qx installed; then
  echo 'This installer expects a fresh Cockpit installation.' >&2
  exit 1
fi
[[ -z $(ss -H -ltn 'sport = :9090') ]] || { echo 'Port 9090 is already in use.' >&2; exit 1; }

[[ -x /usr/sbin/nft ]] || { echo 'nftables is required. Provision it and review existing firewall ownership first.' >&2; exit 1; }
if nft list table inet automatrix_cockpit >/dev/null 2>&1; then
  echo 'Existing automatrix_cockpit nftables table.' >&2
  exit 1
fi
release=trixie-backports
packages=("cockpit-ws/$release" "cockpit-bridge/$release" "cockpit-system/$release")
if systemctl is-active --quiet NetworkManager && nmcli -g GENERAL.NM-MANAGED device show "$interface" | grep -qx yes; then
  packages+=("cockpit-networkmanager/$release")
else
  echo 'NetworkManager does not manage the management interface. See COCKPIT.md for handoff.' >&2
fi

# Review and save the resolution before masking or installing anything.
plan=$(apt-get -s --no-install-recommends --no-remove install "${packages[@]}")
printf '%s\n' "$plan"
if grep -Eq '^Inst (packagekit|cockpit-packagekit|cockpit-pcp|pcp|docker|podman|containerd)([- :]|$)' <<<"$plan"; then
  echo 'Unexpected optional stack in the APT plan.' >&2
  exit 1
fi
systemctl mask cockpit.socket cockpit.service
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends --no-remove "${packages[@]}"

install -d -m 0755 "$(dirname "$dropin")" /etc/cockpit "$temperature"
install -m 0644 "$root/cockpit/cockpit.conf" "$config"
sed "s/@BIND_IP@/$bind_ip/g" "$root/cockpit/socket.conf.in" |
  install -m 0644 /dev/stdin "$dropin"
sed -e "s/@BIND_IP@/$bind_ip/g" -e "s|@TRUSTED_LAN@|$lan|g" \
  -e "s/@LAN_INTERFACE@/$interface/g" "$root/cockpit/lan.nft.in" |
  install -m 0644 /dev/stdin "$firewall"
/usr/sbin/nft -c -f "$firewall"
install -m 0644 "$root"/cockpit/temperature/* "$temperature/"
systemctl unmask cockpit.socket cockpit.service
systemctl daemon-reload
systemctl enable --now cockpit.socket
systemctl is-active --quiet cockpit.socket
nft list table inet automatrix_cockpit
echo "Cockpit HTTPS at https://$bind_ip:9090/"
