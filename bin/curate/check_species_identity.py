#!/usr/bin/env python3
"""Species identity gate -- coherence now, no new opacity later.

The ratified aqueous architecture (docs/architecture) says chemical truth lives
in explicit fields and is NEVER inferred from an identifier.  The F2 campaign
(2026-07-26) delivered it: the p/m charge mangles are gone (CaOH, FeOH3,
MgSO4_2), redox pairs carry roman numerals (FeII/FeIII, CuI/CuII, MnII/MnIII),
chemistry files are named by their REACTION, and identity has one home.  What
remains pinned is the `aq` class, kept by the interim lexical-disambiguation
rule until record references are typed.  This gate now holds that line:

  1. PROSPECTIVE  -- a NEW opaque identifier is refused.  The historical set is
                     pinned in HISTORICAL_OPAQUE below; anything outside it that
                     looks like a mangled name is a regression.
  2. SINGLE HOME  -- F2 commit 1 gave identity one home: a species owning
                     species/<id>.dat carries charge THERE and its STANDARDS
                     reaction record may not redeclare `z`/`ion`.  (Sealed
                     case COPIES may still carry the legacy inline form; the
                     loader verifies coherence at load and refuses mismatch.)
  3. FORMULA      -- the charge parsed from `formula` must equal the declared
                     charge.  Curation-time cross-check only: the formula is
                     never a runtime source of charge.

Exit 1 on any violation.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

# The historical keys, pinned.  This list may SHRINK (F2 migrates them); it may
# GROW only when the interim aq-disambiguation rule REQUIRES a suffix -- a
# derived neutral species homonymous with a component (check_aq_disambiguation
# enforces that requirement; the two gates must agree).  Any other new opaque
# name is a regression.
# After F2 commit 2 the p/m/redox mangles are GONE from standards; what
# remains pinned is the `aq` class -- kept by the ratified interim
# lexical-disambiguation rule (six of these shadow a feedable component;
# check_aq_disambiguation enforces the requirement).  SEALED CASE COPIES may
# still carry pre-F2 keys until their re-import; this gate reads standards.
HISTORICAL_OPAQUE = {
    "BaCO3aq", "CO2aq", "CaCO3aq", "CaSO4aq", "FeCO3aq", "FeOH2aq", "FeSO4aq",
    "H2Saq", "H3PO4aq", "HClaq", "HFaq", "KFaq", "KHCO3aq", "MgCO3aq", "MgSO4aq",
    "MnCO3aq", "MnCl2aq", "MnSO4aq", "NH3aq", "Na2SO4aq", "NaFaq", "NaHCO3aq",
    "SrCO3aq", "SrSO4aq",
    # complexes named after their formula (no phase/charge mangle)
    "CaBOH4", "MgBOH4", "B3O3OH4", "B4O5OH4", "BOH4", "HTart",
}

# A name is opaque when it ends in a phase/charge mangle: `aq`, or `p`/`m`
# optionally followed by a magnitude, appended to a chemical stem.
OPAQUE = re.compile(r'^(?=.*[A-Z]).+?(aq|[pm]\d?)$')

bad = []


def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


def charge_from_formula(f):
    """Trailing sign(+magnitude) of a formula string; 0 when unsigned."""
    m = re.search(r'([+-])(\d*)$', f)
    if not m:
        return 0
    mag = int(m.group(2)) if m.group(2) else 1
    return mag if m.group(1) == "+" else -mag


# ---- gather ----------------------------------------------------------------
species = {}                                   # id -> (charge, formula, file)
for p in sorted((STD / "species").glob("*.dat")):
    t = strip_comments(p.read_text())
    n = re.search(r'^name\s+(\S+);', t, re.M)
    c = re.search(r'^charge\s+([+-]?\d+)\s*;', t, re.M)
    f = re.search(r'^formula\s+"([^"]*)"', t, re.M)
    if n and c:
        species[n.group(1)] = (int(c.group(1)),
                               f.group(1) if f else None, p)

inline = {}                                    # id -> (z, ion, file)
for p in sorted((STD / "chemistry").glob("*.dat")):
    t = strip_comments(p.read_text())
    if "recordType aqueousSpeciation" not in t:
        continue
    line = next((l for l in t.splitlines() if l.strip().startswith("species ")), "")
    s = re.search(r'species\s+(\S+);', line)
    z = re.search(r'\bz\s+([+-]?\d+)\s*;', line)
    ion = re.search(r'ion\s+"([^"]*)"', line)
    if s and z:
        inline[s.group(1)] = (int(z.group(1)),
                              ion.group(1) if ion else None, p)

# ---- 1. prospective: no NEW opaque identifiers -----------------------------
for sid in sorted(set(species) | set(inline)):
    if OPAQUE.match(sid) and sid not in HISTORICAL_OPAQUE:
        bad.append(f"NEW opaque identifier '{sid}' -- chemical truth belongs in "
                   f"`formula`/`charge`, never in the key.  Historical keys are "
                   f"pinned in this gate and are not a licence to mint more.")

# ---- 2. single identity home in the STANDARDS tree -------------------------
dual = sorted(set(species) & set(inline))
for sid in dual:
    _, _, pz = inline[sid]
    bad.append(f"'{sid}' declares identity TWICE: species/{sid}.dat owns it, "
               f"yet {pz.relative_to(ROOT)} redeclares z/ion -- F2 commit 1 "
               f"gave identity one home; drop the inline fields.")

# ---- 3. formula vs declared charge -----------------------------------------
for sid, (c, f, p) in sorted(species.items()):
    if f is None:
        bad.append(f"'{sid}' declares no formula ({p.relative_to(ROOT)})")
        continue
    fc = charge_from_formula(f)
    if fc != c:
        bad.append(f"'{sid}': formula \"{f}\" reads charge {fc:+d} but the "
                   f"record declares {c:+d} ({p.relative_to(ROOT)})")

for sid, (z, ion, p) in sorted(inline.items()):
    if ion is None:
        bad.append(f"'{sid}' declares no ion/display formula "
                   f"({p.relative_to(ROOT)}) -- the resolver would fall back to "
                   f"the raw label")
        continue
    fc = charge_from_formula(ion)
    if fc != z:
        bad.append(f"'{sid}': ion \"{ion}\" reads charge {fc:+d} but the record "
                   f"declares z {z:+d} ({p.relative_to(ROOT)})")

# ---- report ----------------------------------------------------------------
if bad:
    print("species identity gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

print(f"species identity gate: {len(species)} species + {len(inline)} inline "
      f"identities; single-home enforced (0 standards duplicates); "
      f"{len(HISTORICAL_OPAQUE)} historical keys pinned, 0 new")

# ---------------------------------------------------------------------------
#  THE REFUSAL, FIRED.  Everything above is a sweep over the tree: it proves
#  the CORPUS has one home per identity.  It cannot prove the LOADER refuses a
#  file that does not -- and the loader's coherence check ("one fact, two
#  homes, now inconsistent") guards exactly the shape the corpus no longer
#  has, so nothing exercised it.  A guard for legacy input, never fired, is a
#  guard nobody knows still works.
#
#  Two mutations, because the two refusals are DIFFERENT and the wrong one
#  firing would look like success:
#    * inline `z` disagreeing with the species file  -> the COHERENCE refusal;
#    * masters that do not sum to the declared charge -> the CHARGE-BALANCE
#      refusal, which is what fires when there is no inline z to compare.
# ---------------------------------------------------------------------------
import shutil as _shutil, subprocess as _sub, tempfile as _tmp

_SOLVER = ROOT / "choupoSolve"
_CASE = ROOT / "tutorials" / "steady" / "flash" / "flash16_calcite_precipitation"


def _fire(mutate, expect, label):
    tmp = _tmp.mkdtemp(prefix="specid.")
    try:
        dst = Path(tmp) / "case"
        _shutil.copytree(_CASE, dst)
        for junk in ("converged", "reports"):
            _shutil.rmtree(dst / junk, ignore_errors=True)
        mutate(dst)
        r = _sub.run([str(_SOLVER), str(dst)], capture_output=True, text=True)
        out = (r.stdout or "") + (r.stderr or "")
        if r.returncode == 0:
            print("FAIL  %s -- the case RAN (exit 0)" % label)
            return False
        if expect not in out:
            print("FAIL  %s -- refused (exit %d) but not for this reason; a "
                  "negative test that trips an earlier refusal proves that "
                  "one:\n%s" % (label, r.returncode, out[-400:]))
            return False
        print("  ok   %s -- refused, naming it" % label)
        return True
    finally:
        _shutil.rmtree(tmp, ignore_errors=True)


if not _SOLVER.exists():
    print("SKIP  no choupoSolve binary -- the refusals need one")
elif not _CASE.is_dir():
    print("FAIL  flash16 is gone -- no case to mutate")
    sys.exit(1)
else:
    def _double(dst):
        f = dst / "constant" / "chemistry" / "CO3-formation.dat"
        f.write_text(f.read_text().replace("species CO3;", "species CO3; z -3;", 1))

    def _unbalanced(dst):
        f = dst / "constant" / "chemistry" / "CO3-formation.dat"
        f.write_text(f.read_text().replace(
            "masters ( { ion HCO3; nu 1; } { ion H; nu -1; } );",
            "masters ( { ion HCO3; nu 1; } );", 1))

    if not (_fire(_double, "one fact, two homes, now inconsistent",
                  "inline z contradicting the identity file")
            and _fire(_unbalanced, "does not CONSERVE CHARGE",
                      "masters that do not sum to the declared charge")):
        sys.exit(1)


sys.exit(0)
