#!/usr/bin/env python3
# -----------------------------------------------------------------------------
#  check_ion_pins.py -- reference-state consistency pins for the aqueous ion tier
#
#  The aqueous infinite-dilution ion tier (ions.dat: hfAq on the H+(aq)=0
#  convention) must be CONSISTENT with the dissolution-enthalpy anchors the
#  catalogue already carries (the Ksp lineage in each salt's electrolyte{}):
#
#      dH_soln(salt, m->0)  =  sum(nu_i * hfAq_i)  -  Hf_298(salt, solid)
#
#  Three independent pins cross-validate four ion values + three solid Hf's:
#      NaOH:  Na+ + OH-  - NaOH(s)   ~  -44.51 kJ/mol  (exothermic)
#      NaCl:  Na+ + Cl-  - NaCl(s)   ~   +3.88 kJ/mol  (endothermic)
#      KCl:   K+  + Cl-  - KCl(s)    ~  +17.22 kJ/mol  (endothermic)
#  Solid Hf (Wagman 1982): NaOH -425.61, NaCl -411.15, KCl -436.75 kJ/mol.
#  Tolerance 0.2 kJ/mol (table rounding).  Exit 1 on any failed pin --
#  reference-state bookkeeping errors look like numerics bugs downstream
#  (docs/electrolyte-enthalpy-spec.md sec.9), so this gates the L_phi build.
# -----------------------------------------------------------------------------
import re, sys
from pathlib import Path

repo = Path(__file__).resolve().parents[2]

def ion_hf(species):
    # The ion kind now lives ONLY as per-species records under
    # data/standards/species/ -- ONE medium-agnostic file per model species.
    # This used to read components/true/aqueous/, a path retired when "true
    # species" was banned and the five-home layout landed.  The gate was never
    # updated, was never executable, and was never wired into runTests: it has
    # been unable to run since that migration, while CLAUDE.md went on citing
    # it as the refusal that makes the salt-enthalpy contract settled.  A gate
    # that cannot run guards nothing.
    f = repo / f"data/standards/species/{species}.dat"
    if not f.exists(): sys.exit(f"PIN FAIL: species/{species}.dat not found")
    m = re.search(r"hfAq\s*\{[^}]*?value\s+(-?[\d.eE+]+)", f.read_text(), re.S)
    if not m: sys.exit(f"PIN FAIL: ion '{species}' has no hfAq in species/{species}.dat")
    return float(m.group(1))

def salt_anchor(name):
    txt = (repo / f"data/standards/components/{name}.dat").read_text()
    #  BLOCK form first (`dissolutionEnthalpy { value -44510; unit J/mol; }`),
    #  which is what the corpus writes; the bare `dissolutionEnthalpy -44510;`
    #  is the legacy spelling and still reads.  The hfAq lookup above was
    #  migrated to the block grammar and this one was not, so the gate reported
    #  "NaOH.dat has no dissolutionEnthalpy" about a record that states it in
    #  full, with a citation -- half a migration is a gate that accuses the
    #  data of its own staleness.
    m = re.search(r"dissolutionEnthalpy\s*\{[^}]*?value\s+(-?[\d.eE+]+)", txt, re.S) \
        or re.search(r"dissolutionEnthalpy\s+(-?[\d.eE+]+)", txt)
    if not m: sys.exit(f"PIN FAIL: {name}.dat has no dissolutionEnthalpy")
    return float(m.group(1))

# (salt, [ions], Hf_solid J/mol  -- Wagman 1982, public domain)
PINS = [
    ("NaOH", ["Na", "OH"], -425610.0),
    ("NaCl", ["Na", "Cl"], -411150.0),
    ("KCl",  ["K",  "Cl"], -436750.0),
]
TOL = 200.0   # J/mol

fails = 0
for salt, ions, hf_solid in PINS:
    pred   = sum(ion_hf(i) for i in ions) - hf_solid
    anchor = salt_anchor(salt)
    ok = abs(pred - anchor) <= TOL
    print(f"  {salt:5s}  ions-solid = {pred/1000.0:+8.2f} kJ/mol   "
          f"anchor = {anchor/1000.0:+8.2f}   {'OK' if ok else '** FAIL **'}")
    fails += (not ok)

if fails: sys.exit(f"{fails} pin(s) FAILED -- fix the tier before the L_phi build.")

# TEETH (forum 2026-06-29, 'salt-crystallisation-enthalpy'): a component whose
# formation lives in the ion tier (it carries dissolutionEnthalpy / an
# electrolyte{} block) MUST NOT also carry a component-level standardThermochemistry
# block.  The salt's SOLID formation is DERIVED (sum nu*hfAq - dH_soln), never a
# stored second source -- re-introducing it is a HARD failure, not silent drift.
import glob
sins = []
for p in (glob.glob(str(repo / "data/standards/components/*.dat"))
          + glob.glob(str(repo / "tutorials/**/constant/components/*.dat"), recursive=True)):
    t = open(p, errors="ignore").read()
    if re.search(r"dissolutionEnthalpy", t) and re.search(r"(?m)^standardThermochemistry\s*\n\{", t):
        sins.append(p)
if sins:
    sys.exit("ARITY-1 VIOLATION -- electrolyte component(s) ALSO carry a component\n"
             "standardThermochemistry block (a 2nd source of truth; the salt formation is\n"
             "DERIVED from ions + dissolutionEnthalpy, never stored):\n  "
             + "\n  ".join(sins))

print("all ion-tier pins consistent + no arity-1 second sources.")
