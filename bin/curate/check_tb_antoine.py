#!/usr/bin/env python3
"""Record self-consistency: a component's declared normal boiling point must
agree with its OWN Antoine set.

THE IDENTITY.  Antoine evaluated at the record's declared Tb must give one
atmosphere -- the engine states it itself (EstimateComponent: "Psat(Tb) is
the self-consistency check") and applies it only to ESTIMATED components.
This gate applies it to every curated record that carries BOTH facts, with
the engine's own convention (Antoine.cpp: log10(Psat[bar]) = A - B/(T+C)).

THE PIN LIST.  13 real substances failed the identity by more than 3 % with
Tb INSIDE the record's own declared Trange when the gate was written
(2026-08-22 fresh-eyes audit; formaldehyde worst at 59 K).  Deciding WHICH
half of each record is wrong needs primary literature, so the values are
NOT touched -- unsourced must never become falsely sourced.  They are
PINNED: a pinned name that heals FAILS the stale-pin arm (fix the record,
remove the pin), and any NEW disagreement fails at once, so the list cannot
grow in silence.  Synthetic pseudo-components (compA/compB/compC declare
their own tuning) are exempt BY DECLARED KIND, not by name: the exemption
reads the record's own "NOT A REAL SUBSTANCE" header.

NOT COVERED, said plainly: only `model Antoine;` is evaluated -- Wagner and
other vaporPressure models are outside this gate's reach.
"""
import re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import TB_ANTOINE_PINNED as PINNED   # waivers have ONE home

repo = Path(__file__).resolve().parents[2]
cdir = repo / "data/standards/components"

P0 = 1.01325   # bar
fails, n_both, healed = [], 0, []

if not cdir.is_dir():
    print("tb-antoine GATE FAILED: components/ missing"); sys.exit(1)

for f in sorted(cdir.glob("*.dat")):
    txt = f.read_text(encoding="utf-8", errors="replace")
    name = f.stem
    mtb = re.search(r'^\s*Tb\s+([0-9.eE+-]+)\s*;', txt, re.M)
    mvp = re.search(r'vaporPressure\s*\{(.*?)\n\}', txt, re.S)
    if not (mtb and mvp):
        continue
    blk = mvp.group(1)
    if not re.search(r'model\s+Antoine\s*;', blk):
        continue
    mc = re.search(r'coefficients\s*\(\s*([0-9.eE+-]+)\s+([0-9.eE+-]+)'
                   r'\s+([0-9.eE+-]+)\s*\)', blk)
    mr = re.search(r'Trange\s*\(\s*([0-9.eE+-]+)\s+([0-9.eE+-]+)\s*\)', blk)
    if not (mc and mr):
        continue
    Tb = float(mtb.group(1)); A, B, C = map(float, mc.groups())
    lo, hi = float(mr.group(1)), float(mr.group(2))
    if not (lo <= Tb <= hi) or Tb + C <= 0:
        continue                    # extrapolation is a different question
    n_both += 1
    P = 10.0 ** (A - B / (Tb + C))
    dev = (P - P0) / P0 * 100.0
    synthetic = "NOT A REAL SUBSTANCE" in txt
    if abs(dev) > 3.0:
        if synthetic:
            continue                # declares its own tuning; exempt by kind
        if name in PINNED:
            if abs(dev - PINNED[name]) > 0.5:
                fails.append(f"{name}: pinned at {PINNED[name]:+.1f}% but now"
                             f" {dev:+.1f}% -- the defect MOVED; re-examine"
                             " and re-pin or fix")
        else:
            fails.append(f"{name}: Psat(Tb={Tb} K) = {P:.4f} bar"
                         f" ({dev:+.1f}% off 1 atm) with Tb inside the"
                         f" declared Trange ({lo}-{hi} K) -- the record"
                         " contradicts itself; fix Tb or the Antoine set"
                         " from a primary source")
    elif name in PINNED:
        healed.append(name)

for name in healed:
    fails.append(f"STALE PIN: {name} now satisfies the identity -- remove it"
                 " from PINNED (an acceptance that outlives its subject is a"
                 " licence)")
for name in PINNED:
    if not (cdir / f"{name}.dat").exists():
        fails.append(f"STALE PIN: {name}.dat no longer exists -- remove the pin")

if n_both < 60:   # census 2026-08-22: 105 records carry both facts
    fails.append(f"only {n_both} record(s) carry Tb + in-range Antoine"
                 " (floor 60, census 105) -- collapsed scan")

if fails:
    print("tb-antoine GATE FAILED:")
    for x in fails[:30]:
        print("  -", x)
    sys.exit(1)
print(f"tb-antoine: OK -- {n_both} record(s) checked for Psat(Tb) ~ 1 atm;"
      f" {len(PINNED)} known defects pinned with their observed deviation"
      " (fix needs primary literature; the list cannot grow or heal in"
      " silence).  NOT COVERED: non-Antoine vapour-pressure models.")
