#!/usr/bin/env python3
"""Lithium route/composition gate (Codex checklist, M6 2026-07-16).

The lithiumBrinePlant golden pins RESULTS; this gate pins the ROUTE: the five
TUNED NRTL pairs of the EXTRACTION sector must resolve from the sealed
snapshot (status perNodeSnapshot, provSource tuned) -- an idealDefault on any
of them is exactly the silent degradation the 2026-07-16 audit caught (organic
phase collapsed while the smoke test stayed green).  Also asserts the organic
phase composition is physical: LiCl loading present, water nearly excluded.

ALWAYS reruns the case fresh and parses THAT run's log -- a pre-existing
green log must never ratify a currently-broken route (Codex review of the
first version caught exactly that freshness defect).  Exit 1 on any violation.
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials" / "plant" / "lithiumBrinePlant"
LOG = CASE / "log.choupoSolve"

PAIRS = ["LiCl-LiX_extractant", "LiCl-kerosene_C12cut", "LiCl-water",
         "LiX_extractant-water", "kerosene_C12cut-water"]

LOG.unlink(missing_ok=True)                      # never trust an old artefact
r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(CASE)],
                   capture_output=True, text=True)
if r.returncode != 0 or not LOG.exists():
    print("lithium gate: fresh plant run FAILED (rc="
          + str(r.returncode) + ") or produced no log"); sys.exit(1)

log = LOG.read_text(errors="replace")
bad = []

# 1) route assertions: each pair resolved perNodeSnapshot + tuned, never idealDefault
for pair in PAIRS:
    hits = [m for m in re.finditer(
        r'\{ "model": "NRTL"[^}]*"source": "[^"]*' + re.escape(pair) + r'\.dat"[^}]*\}', log)]
    if not hits:
        bad.append(f"pair {pair}: NO resolution record naming its file (idealDefault?)")
        continue
    for m in hits:
        rec = m.group(0)
        if '"status": "perNodeSnapshot"' not in rec:
            bad.append(f"pair {pair}: status is not perNodeSnapshot: {rec[:120]}")
        if '"provSource": "tuned"' not in rec:
            bad.append(f"pair {pair}: provSource is not tuned")

# 2) composition assertions on the loaded organic phase
m = re.search(r'"EXTRACTION\.loadedOrganic":\s*(\{.*?\}\s*\})', log)
if not m:
    bad.append("no EXTRACTION.loadedOrganic result JSON in the log")
else:
    rec = json.loads(m.group(1).rstrip(", \n"))
    comp, F = rec.get("composition", {}), rec.get("F", 0.0)
    if not F > 0.0:
        bad.append(f"loadedOrganic F = {F} (organic phase collapsed)")
    xLiCl, xW = comp.get("LiCl", 0.0), comp.get("water", 1.0)
    if not (0.005 <= xLiCl <= 0.20):
        bad.append(f"loadedOrganic x_LiCl = {xLiCl} outside [0.005, 0.20] (no lithium loading)")
    if not xW < 0.01:
        bad.append(f"loadedOrganic x_water = {xW} >= 0.01 (aqueous carry-over -- LLE split wrong)")

# 2b) the OWNED ideal assumption resolves as a RECORD (provSource assumedIdeal),
#     never as a silent default (Codex ratification condition).
mAI = re.search(r'\{ "model": "NRTL"[^}]*LiX_extractant-kerosene_C12cut\.dat"[^}]*\}', log)
if not mAI:
    bad.append("pair kerosene_C12cut-LiX_extractant: no resolution record (silent default?)")
elif '"provSource": "assumedIdeal"' not in mAI.group(0):
    bad.append("pair kerosene_C12cut-LiX_extractant: provSource is not assumedIdeal")

# 3) CONVERGED-state domain assertion: the runtime guard tolerates announced
#    solver transients (feed-aggregate tear seeds), so the HARD out-of-domain
#    check lives here, on the converged streams: no material outside the
#    declared EXTRACTION domain may survive convergence.
DOMAIN = {"water", "NaCl", "LiCl", "kerosene_C12cut", "LiX_extractant", "Li2CO3"}
for sname in ("EXTRACTION.loadedOrganic", "EXTRACTION.raffinate"):
    ms = re.search(r'"' + re.escape(sname) + r'":\s*(\{.*?\}\s*\})', log)
    if not ms:
        bad.append(f"no {sname} result JSON in the log"); continue
    comp = json.loads(ms.group(1).rstrip(", \n")).get("composition", {})
    for c, xv in comp.items():
        if c not in DOMAIN and xv > 1.0e-8:
            bad.append(f"{sname}: out-of-domain {c} survives convergence"
                       f" (x = {xv}) -- the declared domain is wrong")

if bad:
    print("LITHIUM ROUTE GATE FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print("lithium gate: 5 tuned pairs via perNodeSnapshot; organic loaded (x_LiCl ok, water excluded)")
