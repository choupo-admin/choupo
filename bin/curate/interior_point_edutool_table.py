#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""interior_point_edutool_table -- record the engine runs behind the EduTool
"How does an interior-point method find the minimum?"
(gui/src/ui/methods/InteriorPointTool.tsx).

    bin/curate/interior_point_edutool_table.py        # needs `make all` first (choupoSolve)
    bin/curate/interior_point_edutool_table.py --hs-only   # the test-binary runs only (no choupoSolve)

WHAT IT RECORDS, AND WHY IT IS A RECORD.  The page draws the iterations of
Choupo-IP (src/solver/ip/): the path in x of one small problem, the filter
plane of one run with a restoration phase, the inertia corrections of two runs,
the Gibbs reactor's iteration log, and the polish table of review R1.  The
engine's trace is what a run PRINTS (IPTrace.H), so nothing here is recomputed:

  1. test/interior_point_hs.cpp is compiled beside src/solver/ip/*.cpp (as
     check_interior_point does) and run as `hs -v --iterates NAME` for HS21,
     WB2000, HS6, HS7 and HS38, plus a plain run of HS116.  The live trace is
     parsed: one row per iteration, the event lines (a change of mu, each
     attempt of Algorithm IC, a restoration) attached to the row they precede,
     and the `ITERATE x ...` lines (the point at which the gradient was asked,
     one per accepted iterate) as the path in x.
  2. tutorials/steady/gibbs/gibbs14_interior_point is copied to a scratch
     directory and run by choupoSolve; its `ipLog.csv` and the unit's KPIs
     (lambda, pi, the bridge) are read back.
  3. bin/curate/check_gibbs_interior_point.py --table is run and its rows
     (review R1: the size of the finish's change to the amounts, with a barrier
     on the condensed phases only, the default, and on every amount) copied.

Rejected line-search TRIALS are not in the trace: a row records the accepted
trial and `ls`, the number of trials it took.  The page says so.

Output: gui/src/case/interiorPointRecorded.json (`provenance` names the commit
and the commands).  Nothing in it is computed by this script except the parse.
"""
import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "gui" / "src" / "case" / "interiorPointRecorded.json"

ROW = re.compile(
    r"^\s*(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+"
    r"\((\d+),(\d+),(\d+)\)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w+)\s+(\d+)\s*$")
ATTEMPT = re.compile(r"dw (\S+) dc (\S+): inertia \((\d+),(\d+),(\d+)\) wanted \((\d+),(\d+),(\d+)\)")
RESULT = re.compile(r"iterations (\d+), inertia corrections (\d+), restorations (\d+), factorisations (\d+)")


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, **kw)
    return r.returncode, r.stdout + r.stderr


def parse_trace(text):
    """Rows, the events before each row, the path and the summary of one `hs -v --iterates` run."""
    rows, pending, path, start = [], [], [], None
    seen_header = False
    for ln in text.splitlines():
        if ln.startswith("ITERATE"):
            x = [float(v) for v in ln.split()[1:]]
            if not seen_header:
                start = x          # the last one before the header is the (pushed) start
            else:
                path.append(x)
            continue
        if re.match(r"^\s+it\s+mu\s", ln):
            seen_header = True
            continue
        m = ROW.match(ln) if seen_header else None
        if m:
            g = m.groups()
            rows.append({
                "it": int(g[0]), "mu": float(g[1]), "phi": float(g[2]), "theta": float(g[3]),
                "infDu": float(g[4]), "compl": float(g[5]), "dx": float(g[6]), "dw": float(g[7]),
                "dc": float(g[8]), "inertia": [int(g[9]), int(g[10]), int(g[11])],
                "aPr": float(g[12]), "aDu": float(g[13]), "ls": int(g[14]), "type": g[15],
                "filter": int(g[16]), "events": pending,
            })
            pending = []
            continue
        if seen_header and ln.strip().startswith("--"):
            e = ln.strip()[2:].strip()
            a = ATTEMPT.search(e)
            if a:
                pending.append({"kind": "attempt", "dw": float(a.group(1)), "dc": float(a.group(2)),
                                "got": [int(a.group(i)) for i in (3, 4, 5)],
                                "wanted": [int(a.group(i)) for i in (6, 7, 8)]})
            elif e.startswith("mu "):
                pending.append({"kind": "mu", "text": e})
            else:
                pending.append({"kind": "note", "text": e})
    res = RESULT.search(text)
    fx = re.search(r"^\s+x =\s*(.*)$", text, re.M)
    out = {"rows": rows, "start": start, "path": path,
           "x": [float(v) for v in fx.group(1).split()] if fx else None}
    if res:
        out.update({"iterations": int(res.group(1)), "inertiaCorrections": int(res.group(2)),
                    "restorations": int(res.group(3)), "factorisations": int(res.group(4))})
    act = re.search(r"^\s+(x\d+) >= (\S+)\s+z = (\S+)", text, re.M)
    if act:
        out["activeBound"] = {"variable": act.group(1), "at": float(act.group(2)), "z": float(act.group(3))}
    line = re.search(r"^(HS\d+\w*|WB2000)\s+f\*\s+(\S+)\s+f\s+(\S+)", text, re.M)
    if line:
        out["fStar"], out["f"] = float(line.group(2)), float(line.group(3))
    return out


def main():
    commit = sh(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT)[1].strip()
    work = Path(tempfile.mkdtemp(prefix="ip_edutool_"))
    try:
        exe = work / "hs"
        srcs = sorted(str(p) for p in (ROOT / "src/solver/ip").glob("*.cpp"))
        rc, o = sh(["g++", "-std=c++17", "-O2", "-I", str(ROOT / "src"), str(ROOT / "test/interior_point_hs.cpp"),
                    *srcs, "-o", str(exe)])
        if rc:
            sys.exit("test/interior_point_hs.cpp did not compile:\n" + o[-800:])
        data = {"provenance": {
            "commit": commit,
            "script": "bin/curate/interior_point_edutool_table.py",
            "hsRuns": "test/interior_point_hs.cpp: `hs -v --iterates NAME`",
            "gibbsRun": "choupoSolve on a copy of tutorials/steady/gibbs/gibbs14_interior_point",
            "r1Table": "bin/curate/check_gibbs_interior_point.py --table",
        }, "hs": {}}
        for name in ("HS21", "WB2000", "HS6", "HS7", "HS38"):
            rc, o = sh([str(exe), "-v", "--iterates", name])
            if rc:
                sys.exit(f"{name} failed:\n" + o[-600:])
            data["hs"][name] = parse_trace(o)
        rc, o = sh([str(exe), "HS116"])
        m = re.search(r"^HS116\s+f\* (\S+)\s+f (\S+)", o, re.M)
        data["hs116"] = {"fStar": float(m.group(1)), "f": float(m.group(2)), "published": 97.5884089805}

        if "--hs-only" in sys.argv:
            OUT.write_text(json.dumps(data, indent=1) + "\n")
            print("wrote the HS part only")
            return
        # the Gibbs reactor
        case = work / "gibbs14"
        shutil.copytree(ROOT / "tutorials/steady/gibbs/gibbs14_interior_point", case, ignore=shutil.ignore_patterns("expected"))
        rc, o = sh([str(ROOT / "choupoSolve"), str(case)])
        if rc:
            sys.exit("gibbs14 failed:\n" + o[-800:])
        logs = list(case.rglob("ipLog.csv"))
        if not logs:
            sys.exit("no ipLog.csv written")
        #  ipLog.csv is long-form: stage, iteration, quantity, value, unit (InteriorPointGibbs.cpp, `log({...})`)
        its, bridge, amounts, polish = {}, {}, {}, {}
        with open(logs[0], newline="") as f:
            for r in csv.reader(f):
                if len(r) < 4 or r[0] not in ("interiorPoint", "bridge", "amounts", "polish"):
                    continue
                stage, it, q, v = r[0], int(float(r[1])), r[2], float(r[3])
                if stage == "interiorPoint":
                    its.setdefault(it, {"it": it})[q] = v
                elif stage == "bridge":
                    bridge[q] = v
                elif stage == "amounts":
                    amounts[q] = v
                else:
                    polish[q] = v
        data["gibbs14"] = {"iterations": [its[k] for k in sorted(its)], "bridge": bridge,
                           "amounts": amounts, "polish": polish}
        m = re.search(r"<<<Choupo:result-begin>>>(.*)<<<Choupo:result-end>>>", o, re.S)
        k = json.loads(m.group(1))["kpis"]["wgs"]
        data["gibbs14"]["kpis"] = {key: v for key, v in k.items()
                                   if key.startswith(("lambda_", "pi_", "ip_", "mu"))}

        # review R1
        rc, o = sh([sys.executable, str(HERE / "check_gibbs_interior_point.py"), "--table"], cwd=ROOT)
        rows = []
        #  The gate prints `%-52s %9.2e %-8s %9.2e %9.2e %8.1e %4d %9.2e`: the name is the first 52 columns
        #  (it holds spaces), the species may be blank, so the rest is split on whitespace.
        for ln in o.splitlines():
            name, rest = ln[:52].strip(), ln[52:].split()
            if name in ("", "case.unit") or len(rest) not in (6, 7) or not re.match(r"^[\d.]+e[+-]\d+$", rest[0]):
                continue
            sp = rest[1] if len(rest) == 7 else ""
            nums = rest[:1] + rest[2 if len(rest) == 7 else 1:]
            rows.append({"case": name, "variant": "everyAmount" if "[everyAmount]" in name else "condensedPhases",
                         "amount": float(nums[0]), "species": sp, "pi": float(nums[1]), "bridge": float(nums[2]),
                         "dT": float(nums[3]), "it": int(nums[4]), "polish": float(nums[5])})
        data["r1"] ={"rows": rows, "gateExit": rc}
        OUT.write_text(json.dumps(data, indent=1) + "\n")
        print(f"wrote {OUT.relative_to(ROOT)}: {len(data['hs'])} traces, {len(rows)} R1 rows")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
