#!/usr/bin/env python3
"""Typed-identifier gate -- the compiler owns the rule; this guards the shortcuts.

The 2026-07-25 three-way decision: ComponentId / SpeciesId / SolidId are strong
types with NO implicit conversion, so a component index cannot become a species
key without passing the ONE declared bridge (AqueousChemistry::aqueousMapping,
each component's `aqueousMapping` block or its `dissociatesTo` converted at
load).  The compiler enforces the signatures; what it cannot see is a human
LAUNDERING a crossing through the public `.key` / `.name()` spellings.  This
gate refuses those shortcuts:

  1. no unit-op source constructs SpeciesId from a component's name
     (`SpeciesId(thermo.comp(...).name())` and friends);
  2. no unit-op source indexes a species-space map with `.name()` directly;
  3. every case that runs an aqueous-bridge unit (spiralWoundModule scaling,
     electrodialysisStack, ionExchanger) declares the bridge on each ionic
     component record -- `aqueousMapping` or `dissociatesTo` -- so the refusal
     never fires at a student mid-run;
  4. the historic crossing sites stay dead: `totals[thermo.comp` and
     `ionCharge/ionD0/ionRadius` on a bare string.

Exit 1 on any violation.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "src" / "unitOperations"

bad = []

LAUNDER = re.compile(
    r'SpeciesId\s*\(\s*(thermo\.)?comp\w*\s*\([^)]*\)\s*\.name\(\)|'
    r'SpeciesId\s*\{\s*(thermo\.)?comp\w*\s*\([^)]*\)\s*\.name\(\)|'
    r'totals\s*\[\s*(thermo\.)?comp\w*\s*\([^)]*\)\s*\.name\(\)|'
    r'\bion(Charge|D0|Radius)\s*\(\s*"'
)

for f in sorted(list(UNITS.rglob("*.cpp")) + list(UNITS.rglob("*.H"))):
    inComment = False
    for i, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
        if inComment:
            if "*/" in line:
                inComment = False
            continue
        if "/*" in line and "*/" not in line:
            inComment = True
            continue
        if line.lstrip().startswith("//"):
            continue
        if LAUNDER.search(line):
            bad.append(f"{f.relative_to(ROOT)}:{i}: launders a component name"
                       f" into species space -- cross through the declared"
                       f" bridge (aqueousChemistry().singleMaster /"
                       f" aqueousMapping), never by spelling")

# ---- 3. bridge declared in every case that needs it ------------------------
BRIDGE_UNITS = re.compile(r'\b(spiralWoundModule|electrodialysisStack|ionExchanger)\b')
IONIC = {"Ca", "Mg", "Na", "K", "Cl", "SO4", "HCO3"}
nCases = 0
for fs in sorted((ROOT / "tutorials").rglob("system/flowsheetDict")):
    txt = re.sub(r'/\*.*?\*/', '', fs.read_text(errors="replace"), flags=re.S)
    txt = re.sub(r'//.*$', '', txt, flags=re.M)
    if not BRIDGE_UNITS.search(txt):
        continue
    # scaling-free spiralWoundModule cases don't speciate -> no bridge needed
    if "spiralWoundModule" in txt and "scaling" not in txt \
            and "electrodialysisStack" not in txt and "ionExchanger" not in txt:
        continue
    case = fs.parent.parent
    comp = case / "constant" / "components"
    if not comp.is_dir():
        continue
    nCases += 1
    for p in sorted(comp.glob("*.dat")):
        if p.stem not in IONIC:
            continue
        t = p.read_text(errors="replace")
        if "aqueousMapping" not in t and "dissociatesTo" not in t:
            bad.append(f"{case.relative_to(ROOT)}: ionic component"
                       f" '{p.stem}' declares no aqueousMapping /"
                       f" dissociatesTo -- the bridge refusal would fire"
                       f" mid-run")

if bad:
    print("typed-identifier gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

print(f"typed-identifier gate: no laundered crossings in unit ops;"
      f" {nCases} bridge-unit case(s) declare their component->species"
      f" mappings")

# ---------------------------------------------------------------------------
#  THE BRIDGE REFUSAL, FIRED.  Claim 3 above checks that every case running an
#  aqueous-bridge unit DECLARES the bridge, "so the refusal never fires at a
#  student mid-run".  That is a statement about the corpus; the refusal itself
#  -- ThermoPackage::AqueousBridge::singleMaster, the one place the two
#  identity spaces meet -- was exercised by nothing, because the corpus is
#  complete.
#
#  Fired here on membrane08, whose scaling path DOES cross the bridge.  Note
#  which case: removing the same declaration from membrane01 changes NOTHING
#  (identical KPIs, exit 0), because a solution-diffusion module prices the
#  salt, never the ions -- a mutation that does not reach the code path proves
#  nothing about it.
# ---------------------------------------------------------------------------
import re as _re, shutil as _shutil, subprocess as _sub, tempfile as _tmp

_SOLVER = ROOT / "choupoSolve"
_CASE = ROOT / "tutorials" / "steady" / "membranes" / "membrane08_softened_scaling"

if not _SOLVER.exists():
    print("SKIP  no choupoSolve binary -- the bridge refusal needs one")
elif not _CASE.is_dir():
    print("FAIL  membrane08 is gone -- nothing crosses the bridge")
    sys.exit(1)
else:
    _tmpdir = _tmp.mkdtemp(prefix="bridge.")
    try:
        _dst = Path(_tmpdir) / "case"
        _shutil.copytree(_CASE, _dst)
        for _junk in ("converged", "reports"):
            _shutil.rmtree(_dst / _junk, ignore_errors=True)
        _f = _dst / "constant" / "components" / "Ca.dat"
        _t = _f.read_text()
        _u = _re.sub(r"(?ms)^aqueousMapping\s*\([^)]*\)\s*;\s*$", "", _t, count=1)
        if _u == _t:
            _u = _re.sub(r"(?m)^dissociatesTo.*$", "", _t, count=1)
        if _u == _t:
            print("FAIL  Ca.dat declares no bridge to remove -- the mutation "
                  "does not apply, so this proves nothing")
            sys.exit(1)
        _f.write_text(_u)
        _r = _sub.run([str(_SOLVER), str(_dst)], capture_output=True, text=True)
        _out = (_r.stdout or "") + (_r.stderr or "")
        if _r.returncode == 0:
            print("FAIL  a bridge-crossing case RAN with Ca's mapping removed "
                  "-- a name-identity fallback is back")
            sys.exit(1)
        if "declares no aqueous mapping" not in _out:
            print("FAIL  refused (exit %d) but not for this reason:\n%s"
                  % (_r.returncode, _out[-400:]))
            sys.exit(1)
        print("  ok   the aqueous bridge refuses a component with no declared "
              "mapping, naming the block to add")
    finally:
        _shutil.rmtree(_tmpdir, ignore_errors=True)


sys.exit(0)
