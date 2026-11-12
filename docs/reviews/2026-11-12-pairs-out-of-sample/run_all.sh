#!/usr/bin/env bash
# run_all.sh ARCHIVE_DIR [WORKDIR]
#
# Re-runs the whole review 2026-11-12-pairs-out-of-sample from the tree root
# (where ./choupoProps is built).  ARCHIVE_DIR is the ThermoML mirror that
# holds identity.json and the 10.xxxx/ article trees (here it was
# thirdParty/thermoml/thermoml).  WORKDIR (default a mktemp directory) gets
# every file that carries measured points; nothing measured is written into
# the review directory.  The tables in this directory are rewritten.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
arch="$(cd "$1" && pwd)"
work="${2:-$(mktemp -d)}"
mkdir -p "$work"
cd "$root"
python3 -I "$here/scan_archive.py" "$arch" "$work/scan.json"
python3 "$here/verify_kernels.py" "$root" "$work/verify" "$here/kernel_verification.tsv"
python3 "$here/gamma_inf.py" "$root" "$arch" "$work/scan.json" "$work/gi" "$here"
python3 "$here/ternary.py" "$root" "$arch" "$work/scan.json" "$work/tern" "$here"
python3 "$here/summarise.py" "$root" "$work" "$here"
echo "work directory (measured points, delete when done): $work"
