#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 1 && "$1" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 64
image=$1
scripts=$(cd -- "$(dirname -- "$0")" && pwd)
scan_temp=$(mktemp -d)
cleanup() {
  status=$?
  if [[ $status -ne 0 ]]; then printf '%s\n' 'runtime_image_scan=BLOCKED'; fi
  rm -rf -- "$scan_temp"
}
trap cleanup EXIT
curl --fail --silent --location --retry 3 --connect-timeout 15 --max-time 120 --proto '=https' --tlsv1.2 \
  https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_Linux-64bit.tar.gz \
  -o "$scan_temp/trivy.tar.gz"
printf '%s  %s\n' c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0 "$scan_temp/trivy.tar.gz" | sha256sum --check --status
tar -xzf "$scan_temp/trivy.tar.gz" -C "$scan_temp" trivy
# Isolated cwd/HOME and empty config/ignore inputs prevent repository suppression rules.
cd "$scan_temp"
scanner_status=0
env -i PATH="$PATH" HOME="$scan_temp" "$scan_temp/trivy" image \
  --config='' --ignorefile=/dev/null --ignore-policy='' --ignore-unfixed=false \
  --scanners vuln --pkg-types os,library --list-all-pkgs --image-src docker \
  --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL --exit-code 0 \
  --disable-telemetry --skip-version-check --no-progress --parallel 1 --timeout 6m \
  --cache-dir "$scan_temp/cache" --format template --template "@$scripts/image-summary.tpl" \
  --output "$scan_temp/summary.json" "$image" >/dev/null 2>&1 || scanner_status=$?
python3 "$scripts/image-summary.py" "$scan_temp/summary.json" "$scanner_status"
