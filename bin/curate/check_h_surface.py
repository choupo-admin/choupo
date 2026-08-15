#!/usr/bin/env python3
# check_h_surface.py -- the ONE-ENTHALPY-SURFACE gate (design forum
# #103/#105: the unification's guard).  Style precedent: the check_*.py
# family (check_doctrine, check_ion_pins, check_estimates).
#
# THE CONTRACT:
#   * the legacy blend-by-natural-phase surface must NEVER re-enter an
#     energy balance, a duty, or a published stream .H.  Its old name
#     (`H_stream(`) is BANNED outright -- zero call sites tolerated;
#   * its survivor (`H_blendPerNaturalPhase(`) is legal ONLY at loci
#     carrying an explicit `// AUTHORIZED-BLEND: <purpose>` marker on the
#     SAME line.  The gate LISTS every locus it finds (file:line +
#     purpose), so a new call fails with its exact location and what the
#     authorized ones are for -- never a bare "count changed" (#105).
#
# Usage:  bin/curate/check_h_surface.py   (exit 0 clean, 1 violation)

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "src"

# A scan over nothing is not a clean surface (2026-08-15 fleet census): this
# gate shared the check_true_ions death shape -- rename src/ and rglob
# returns nothing, zero violations are found over zero files, and the gate
# goes permanently green.  A scanner refuses when it cannot see its subject.
if not ROOT.is_dir():
    print("check_h_surface FAILED: scan root 'src' does not exist -- this"
          " gate cannot see the surface it audits, and a green verdict over"
          " an absent tree would be the check_true_ions failure again.")
    sys.exit(1)

banned    = []   # (file, line, text) calls to the RETIRED name
unmarked  = []   # blend calls without the authorization marker
authorized = []  # (file, line, purpose)

sources = sorted(ROOT.rglob("*.cpp")) + sorted(ROOT.rglob("*.H"))
for path in sources:
    rel = path.relative_to(ROOT.parent)
    for lineno, line in enumerate(path.read_text().splitlines(), 1):
        # The RETIRED name: any call `.H_stream(` / `->H_stream(` /
        # bare `H_stream(` that is not H_stream_formation.  Comments
        # mentioning it historically are tolerated; CALLS are not.
        for m in re.finditer(r"\bH_stream\(", line):
            code = line.split("//")[0]
            if "H_stream(" in code:
                banned.append((str(rel), lineno, line.strip()))
            break
        if "H_blendPerNaturalPhase(" in line:
            code = line.split("//")[0]
            if "H_blendPerNaturalPhase(" not in code:
                continue                      # comment mention only
            # Declaration/definition in ThermoPackage is the surface itself.
            if "thermo/ThermoPackage" in str(rel) and (
                    "scalar ThermoPackage::" in line
                    or line.strip().startswith("scalar H_blendPerNaturalPhase")):
                continue
            m = re.search(r"//\s*AUTHORIZED-BLEND:\s*(.+)$", line)
            if m:
                authorized.append((str(rel), lineno, m.group(1).strip()))
            else:
                unmarked.append((str(rel), lineno, line.strip()))

# Collapsed-scan floor (2026-08-15 fleet census, check_true_ions precedent):
# 628 source files observed; the floor sits a round 5x+ below.
if len(sources) < 100:
    print(f"check_h_surface FAILED: only {len(sources)} source files scanned"
          f" -- the tree holds hundreds, so the scan surface has collapsed"
          f" and a verdict over it would describe nothing.")
    sys.exit(1)

print(f"check_h_surface: {len(sources)} source files scanned (an absent or"
      f" collapsed scan root REFUSES); {len(authorized)} authorized blend"
      f" locus/loci:")
for f, l, p in authorized:
    print(f"  {f}:{l}  [{p}]")

fail = False
if banned:
    fail = True
    print(f"\nBANNED ({len(banned)}) -- the retired H_stream surface must not"
          f" be called (use H_stream_formation, or an AUTHORIZED-BLEND"
          f" locus):")
    for f, l, t in banned:
        print(f"  {f}:{l}  {t}")
if unmarked:
    fail = True
    print(f"\nUNAUTHORIZED ({len(unmarked)}) -- H_blendPerNaturalPhase call"
          f" without an `// AUTHORIZED-BLEND: <purpose>` marker; the blend"
          f" never enters a balance/duty/published .H:")
    for f, l, t in unmarked:
        print(f"  {f}:{l}  {t}")

sys.exit(1 if fail else 0)
