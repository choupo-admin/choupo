#!/usr/bin/env python3
"""No unit op selects thermodynamics -- neither in source, nor in a case.

A unit operation answers a process question.  WHICH activity model evaluates
the aqueous phase, and WHICH solid phases may precipitate, are properties of
the declared chemical system -- `constant/thermoPhysPropDict` and
`constant/chemistryDict` -- and a unit reads them.

The corpus grew the opposite habit for a structural reason, not a careless
one: `equilibrium { aqueous { … } }` used to be readable only inside
`formulation electrolyteGammaPhi`, which demands `volatiles`.  A liquid-only
electrolyte case had no way to declare its chemistry, so the unit picked a
model -- SpiralWoundModule defaulted to Davies, ElectrodialysisStack froze the
literal.  The declaration is now formulation-independent, the defaults are
gone, and this gate keeps them gone.

Three checks:

  1. NO MODEL LITERAL in unit-op source.  A unit may not name davies / Pitzer /
     eNRTL / PitzerHMW as a model choice.
  2. NO THERMODYNAMIC KEY in a case's unit blocks.  `activityModel` and
     `minerals` are refused inside system/flowsheetDict; they belong to
     thermoPhysPropDict and chemistryDict respectively.
  3. A DECLARED aqueous model must be one the engine implements.

  4. THE ENGINE REFUSES IT, not just the corpus.  Checks 1-3 keep the tree
     clean; none of them stops a STUDENT writing `activityModel { ... }`
     beside a unit's `operation` block.  Until 2026-07-31 nothing did: the
     unit build copies a whitelist of keys and anything outside it fell on
     the floor, so flash16 with `activityModel { model pitzerHMW; }` ran to
     exit 0 on the case's declared davies.  This fires that refusal through
     choupoSolve, and checks the LEGAL neighbour still works -- the same
     block inside `thermo { ... }` is a per-unit override and must be
     honoured, or the refusal would have eaten the feature it protects.

Exit 1 on any violation."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "src" / "unitOperations"

# The models an `aqueous { activityModel { model … } }` block may name.
IMPLEMENTED = {"davies", "Pitzer", "eNRTL", "pitzerHMW"}

# Constructing an activity/speciation engine, or naming a model as a choice.
# A unit may CONSTRUCT a solver with the model the package declared; what it
# may never do is CHOOSE one -- a literal, or a dict key with a default.
SELECTS = re.compile(
    r'AqueousActivity::New\s*\(\s*"|'
    r'ActivityModel::New\s*\(\s*"|'
    r'SpeciationSolver\s*[(<][^)]*"(davies|Pitzer|eNRTL|pitzerHMW)"|'
    r'lookupWordOrDefault\s*\(\s*"activityModel"'
)

# Construction is still a unit reaching into the chemistry tier: legitimate
# today (it constructs with the DECLARED model) but destined for the package's
# own speciation surface.  Reported, never silent.
CONSTRUCTS = re.compile(r'\bSpeciationSolver\b')

bad, pending = [], []

# ---- 1. unit-op source may not select a model ------------------------------
for f in sorted(list(UNITS.rglob("*.cpp")) + list(UNITS.rglob("*.H"))):
    inComment = False
    for i, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
        # Prose is not code: a class doc block or a refusal message may quote
        # the very names this gate forbids, and must not trip it.
        if inComment:
            if "*/" in line: inComment = False
            continue
        if "/*" in line and "*/" not in line:
            inComment = True
            continue
        if line.lstrip().startswith("//"):
            continue
        ls = line.lstrip()
        if (ls.startswith("#include") or "SpeciationSolver::" in line
                or "const electrolyte::SpeciationSolver" in line
                or "SpeciationSolver*" in line
                or "class SpeciationSolver;" in line):
            continue          # an include, a static helper, or a BORROWED engine
        if CONSTRUCTS.search(line) and not SELECTS.search(line):
            pending.append(f"{f.relative_to(ROOT)}:{i}: constructs a"
                           f" SpeciationSolver from the DECLARED model -- legal,"
                           f" but destined for ThermoPackage's own speciation"
                           f" surface")
        if SELECTS.search(line):
            bad.append(f"{f.relative_to(ROOT)}:{i}: a unit op selects or builds"
                       f" aqueous thermodynamics -- read"
                       f" thermo.aqueousChemistry() instead")

# ---- 2. no thermodynamic key inside a case's unit blocks -------------------
for fs in sorted((ROOT / "tutorials").rglob("system/flowsheetDict")):
    txt = re.sub(r'/\*.*?\*/', '', fs.read_text(errors="replace"), flags=re.S)
    txt = re.sub(r'//.*$', '', txt, flags=re.M)
    case = fs.parent.parent.relative_to(ROOT)
    if re.search(r'^\s*activityModel\s+\S', txt, re.M):
        bad.append(f"{case}: `activityModel` in flowsheetDict -- the aqueous"
                   f" model belongs to constant/thermoPhysPropDict"
                   f" (equilibrium.aqueous)")
    if re.search(r'^\s*minerals\s*\(', txt, re.M):
        bad.append(f"{case}: `minerals (` in flowsheetDict -- which solid"
                   f" phases EXIST belongs to constant/chemistryDict"
                   f" (equilibria.solidPhases); use `reportMinerals` for the"
                   f" unit's reporting subset")

# ---- 3. a declared aqueous model must be implemented -----------------------
nDeclared = 0
for tpp in sorted((ROOT / "tutorials").rglob("constant/thermoPhysPropDict")):
    txt = re.sub(r'/\*.*?\*/', '', tpp.read_text(errors="replace"), flags=re.S)
    txt = re.sub(r'//.*$', '', txt, flags=re.M)
    m = re.search(r'aqueous\s*\{.*?activityModel\s*\{\s*model\s+(\w+)',
                  txt, re.S)
    if not m:
        continue
    nDeclared += 1
    if m.group(1) not in IMPLEMENTED:
        case = tpp.parent.parent.relative_to(ROOT)
        bad.append(f"{case}: aqueous activityModel '{m.group(1)}' is not"
                   f" implemented -- one of: {', '.join(sorted(IMPLEMENTED))}")

if bad:
    print("unit-chemistry gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

# ---------------------------------------------------------------------------
#  4. The refusal, fired for real.
# ---------------------------------------------------------------------------
import shutil, subprocess, tempfile

SOLVER = ROOT / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "flash" / "flash16_calcite_precipitation"


def _run_with(insert: str):
    """Copy flash16, splice `insert` in front of the unit's `operation`, run."""
    tmp = tempfile.mkdtemp(prefix="unitchem.")
    try:
        dst = Path(tmp) / "case"
        shutil.copytree(CASE, dst)
        for junk in ("converged", "reports"):
            shutil.rmtree(dst / junk, ignore_errors=True)
        fd = dst / "system" / "flowsheetDict"
        body = fd.read_text()
        i = body.index("operation")
        fd.write_text(body[:i] + insert + "\n        " + body[i:])
        r = subprocess.run([str(SOLVER), str(dst)], capture_output=True, text=True)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if not SOLVER.exists():
    print("SKIP  no choupoSolve binary -- check 4 needs one")
elif not CASE.is_dir():
    fail = True
    print("FAIL  flash16 is gone -- check 4 has no case to mutate")
    sys.exit(1)
else:
    rc, out = _run_with("activityModel { model pitzerHMW; }")
    if rc == 0:
        print("FAIL  a unit declaring `activityModel` RAN (exit 0) -- the "
              "declaration was dropped and the unit used the case's model")
        sys.exit(1)
    if "declares `activityModel` at its own level" not in out:
        print("FAIL  refused (exit %d) but not for this reason -- a negative "
              "test that trips an earlier refusal proves that one:\n%s"
              % (rc, out[-400:]))
        sys.exit(1)
    print("  ok   engine refuses `activityModel` written at unit level")

    #  ...and the LEGAL neighbour still runs, or the refusal ate the feature.
    rc, out = _run_with("thermo { equilibrium { formulation gammaPhi; "
                        "liquid { activityModel { model ideal; } } "
                        "vapour { fugacityModel idealGas; } } }")
    if rc != 0:
        print("FAIL  a per-unit `thermo { ... }` override no longer runs "
              "(exit %d) -- the refusal above is too wide:\n%s"
              % (rc, out[-400:]))
        sys.exit(1)
    if "LOCAL override" not in out:
        print("FAIL  the per-unit override ran but was not ANNOUNCED -- the "
              "cascade must be loud (CLAUDE.md, fractal units)")
        sys.exit(1)
    print("  ok   the legal `thermo { ... }` override still runs, and says so")

print(f"unit-chemistry gate: no unit op selects thermodynamics; "
      f"{nDeclared} case(s) declare an aqueous activity model, all implemented"
      + (f"; {len(pending)} still construct a solver directly" if pending else ""))
for p in pending:
    print("  [pending] " + p)
sys.exit(0)
