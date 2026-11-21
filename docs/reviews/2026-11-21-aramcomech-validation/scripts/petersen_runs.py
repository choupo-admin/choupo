#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""petersen_runs -- every measured point of Petersen, Davidson & Hanson (1999) Table 2 through
Choupo and Cantera (run_pair.py, constant volume, adiabatic, the AramcoMech 1.3 import).

    petersen_runs.py IMPORTED_CASE MECH.yaml WORKDIR OUT.jsonl [--shard k/N]

Grid: endTime = 5 tau_measured, deltaT = endTime / 2500; a point whose model has not ignited by
then (no T0 + 400 K crossing) is rerun once with endTime x 4.  One JSON line per point.
"""
import csv
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIX = {1: "CH4:0.4,O2:2,AR:8", 2: "CH4:3,O2:2,N2:10", 3: "CH4:3,O2:2,AR:10", 4: "CH4:3,O2:2,N2:6",
       5: "CH4:3,O2:2,AR:6", 6: "CH4:6,O2:2,HE:4", 7: "CH4:3,O2:2,N2:4,HE:8"}


def main():
    imported, mech, work, out = sys.argv[1:5]
    shard = (0, 1)
    if "--shard" in sys.argv:
        k, n = sys.argv[sys.argv.index("--shard") + 1].split("/")
        shard = (int(k), int(n))
    tsv = os.path.join(HERE, "..", "petersen1999_table2.tsv")
    rows = [r for r in csv.DictReader((l for l in open(tsv) if not l.startswith("#")), delimiter="\t")]
    for i, r in enumerate(rows):
        if i % shard[1] != shard[0]:
            continue
        tau = float(r["tau_ign_us"]) * 1e-6
        end = 5.0 * tau
        for attempt in range(2):
            cmd = [sys.executable, os.path.join(HERE, "run_pair.py"), imported, mech, work,
                   "--label", "p%03d" % i, "--T", r["T5_K"], "--P", r["P5_atm"], "--mix", MIX[int(r["mixture"])],
                   "--mode", "V", "--endTime", repr(end), "--deltaT", repr(end / 2500.0)]
            p = subprocess.run(cmd, capture_output=True, text=True)
            if p.returncode:
                res = dict(error=(p.stdout + p.stderr)[-400:])
                break
            res = json.loads(p.stdout.strip().splitlines()[-1])
            if res["choupo"]["tau_T400"] == res["choupo"]["tau_T400"]:      # not NaN: ignited
                break
            end *= 4.0
        res.update(row=i, measured=r)
        with open(out, "a") as f:
            f.write(json.dumps(res) + "\n")


if __name__ == "__main__":
    sys.exit(main())
