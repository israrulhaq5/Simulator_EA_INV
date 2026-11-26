#!/usr/bin/env bash
set -Eeuo pipefail
umask 022
trap 'echo "INSTALL FAILED at line $LINENO; inspect the error above. Do not connect physical equipment." >&2' ERR
[[ $EUID == 0 ]] || { echo "Run with sudo or as root."; exit 1; }
[[ "$(uname -s)" == Linux ]] || { echo "Linux required"; exit 1; }
case "$(uname -m)" in
  armv7l|armv8l) node_arch=armv7l ;;
  aarch64) node_arch=arm64 ;;
  x86_64) node_arch=x64 ;;
  *) echo "Unsupported CPU"; exit 1 ;;
esac
[[ "$(getconf LONG_BIT)" == 32 && "$node_arch" == arm64 ]] && node_arch=armv7l
command -v systemctl >/dev/null
src="$(cd "$(dirname "$0")/../.." && pwd)"
app=/opt/automatrix/zero-export-pi
state=/var/lib/zero-export-pi
runtime=/opt/automatrix/node-pi-22
service=zero-export-pi
port=8080
lan="${SIMULATOR_LAN_CIDR:-127.0.0.1/32}"
# Only a syntactically valid IPv4 CIDR can be inserted into Nginx configuration.
[[ "$lan" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ ]] || { echo "Invalid SIMULATOR_LAN_CIDR"; exit 1; }
[[ ! -e "$app" && ! -e "$state" && ! -e /etc/systemd/system/$service.service && ! -e /etc/nginx/conf.d/$service.conf ]] || {
  echo "Existing deployment detected. This installer is fresh-install only; refusing to overwrite data or configuration."; exit 1;
}
if ss -H -lnt "( sport = :$port or sport = :3001 )" | grep -q .; then echo "Port 8080 or 3001 already in use"; exit 1; fi
if [[ $(df -Pm /opt | awk 'NR==2{print $4}') -lt 1800 ]]; then echo "At least 1800 MB free on /opt required"; exit 1; fi
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils git build-essential python3 nginx-light sqlite3 rsync iproute2
tmp="$(mktemp -d)"
swapfile=""
cleanup() {
  if [[ -n "$swapfile" ]]; then swapoff "$swapfile" && rm -f "$swapfile" || echo "Temporary swap remains active: $swapfile" >&2; fi
  rm -rf "$tmp"
}
trap cleanup EXIT
# Low-memory board: temporary build swap only; no permanent fstab edits.
total_kb="$(awk '/^MemTotal:|^SwapTotal:/{s+=$2}END{print s}' /proc/meminfo)"
if (( total_kb < 1000000 )); then
  swapfile="$tmp/build.swap"
  dd if=/dev/zero of="$swapfile" bs=1M count=768 status=none
  chmod 600 "$swapfile"
  mkswap "$swapfile" >/dev/null
  swapon "$swapfile"
fi
version=v22.23.5
archive="node-$version-linux-$node_arch.tar.xz"
url="https://nodejs.org/dist/$version"
curl --fail --location --retry 3 "$url/$archive" -o "$tmp/$archive"
curl --fail --location --retry 3 "$url/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
(cd "$tmp"; awk -v a="$archive" '$2==a{print}' SHASUMS256.txt > selected.sha; test -s selected.sha; sha256sum -c selected.sha)
mkdir -p "$runtime" "$app"
tar -xJf "$tmp/$archive" --strip-components=1 -C "$runtime"
export PATH="$runtime/bin:$PATH"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(':memory:');console.log(process.version,process.arch,d.prepare('select sqlite_version() as version').get());d.close()"
id "$service" >/dev/null 2>&1 || useradd --system --user-group --home-dir "$state" --shell /usr/sbin/nologin "$service"
install -d -m 0700 -o "$service" -g "$service" "$state"
if getent group dialout >/dev/null; then usermod -aG dialout "$service"; fi
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude=.env --exclude=data "$src/" "$app/"
chown -R "$service:$service" "$app"
run_build() {
  runuser -u "$service" -- env PATH="$PATH" HOME="$state" npm_config_jobs=1 MAKEFLAGS=-j1 NODE_OPTIONS=--max-old-space-size=384 "$@"
}
echo "=== Backend install and regression tests ==="
run_build npm --prefix "$app/backend" ci --no-audit --no-fund
(cd "$app/backend"; run_build node --test --test-concurrency=1)
echo "=== Frontend production build ==="
run_build npm --prefix "$app/frontend" ci --no-audit --no-fund
run_build npm --prefix "$app/frontend" run build
test -f "$app/frontend/dist/index.html"
run_build npm --prefix "$app/backend" prune --omit=dev --no-audit --no-fund
rm -rf "$app/frontend/node_modules"
chown -R root:root "$app" "$runtime"
chmod 755 "$app" "$app/frontend" "$app/frontend/dist"
cat > /etc/zero-export-pi.env <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
SQLITE_PATH=$state/zero-export.sqlite
CORS_ORIGINS=http://127.0.0.1:8080
POLLING_SCHEDULER_ENABLED=true
POLLING_CONCURRENCY=2
MODBUS_POOL_MAX_SIZE=16
COMMUNICATION_LOG_RETENTION_DAYS=7
SIMULATOR_AUTO_START=true
LOG_FILE_ENABLED=false
LOG_LEVEL=warn
ENV
# Nginx removes Origin only after same-origin checks; clients cannot bypass
# browser CORS via the private backend because it binds to loopback.
chmod 600 /etc/zero-export-pi.env
cat > "/etc/systemd/system/$service.service" <<UNIT
[Unit]
Description=Automatrix Zero Export Pi Simulator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service
Group=$service
WorkingDirectory=$app/backend
EnvironmentFile=/etc/zero-export-pi.env
Environment=NODE_OPTIONS=--max-old-space-size=192
ExecStart=$runtime/bin/node $app/backend/src/index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$state
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT
# Same-origin UI/API, no wildcard CORS and no internet-facing access.
# Refuse browser requests with a foreign Origin before removing it.
cat > "/etc/nginx/conf.d/$service.conf" <<NGINX
map \$http_origin \$zero_export_origin_ok {
    default 0;
    "" 1;
    "http://\$http_host" 1;
}
server {
    listen 8080;
    server_name _;
    root $app/frontend/dist;
    index index.html;
    allow 127.0.0.1;
    allow $lan;
    deny all;
    client_max_body_size 1m;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    location ~ ^/(api/|health\$|ready\$) {
        if (\$zero_export_origin_ok = 0) { return 403; }
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Origin "";
        proxy_set_header X-Forwarded-For \$remote_addr;
    }
}
NGINX
# Use a separate, explicit per-host origin list: Nginx map string keys are literal,
# so replace the dynamic key with a comparison in the location block below.
python3 - "/etc/nginx/conf.d/$service.conf" <<'PY'
import sys
p=sys.argv[1]
s=open(p).read()
s=s[s.index("server {"):]
s=s.replace("if ($zero_export_origin_ok = 0) { return 403; }", "set $zero_export_allowed 0;\n        if ($http_origin = \"\") { set $zero_export_allowed 1; }\n        if ($http_origin = \"http://$http_host\") { set $zero_export_allowed 1; }\n        if ($zero_export_allowed = 0) { return 403; }")
open(p,"w").write(s)
PY
nginx -t
systemctl daemon-reload
systemctl start "$service"
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/ready >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3001/ready
systemctl enable --now nginx
systemctl reload nginx
curl -fsS http://127.0.0.1:8080/ready
curl -fsS http://127.0.0.1:8080/ >/dev/null
sqlite3 "$state/zero-export.sqlite" 'PRAGMA quick_check;' | grep -qx ok
systemctl restart "$service"
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/ready >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8080/ready
systemctl enable "$service"
systemctl --no-pager status "$service"
echo "INSTALL PASS — local API, UI, SQLite integrity and service restart verified."
echo "UI port 8080; allow-list: $lan. Do not port-forward this unauthenticated industrial test UI."
hostname -I
