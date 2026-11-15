#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
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
IMPLEMENTED = {"davies", "Pitzer", "eNRTL", "pitzerHMW", "OlssonNaOH"}

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

# ---- 2b. THE OLD FORM COUNT (C402): no unit carries an inline `thermo { }` ---
#  A unit's own property world is a NAMED variant (`thermo <name>;`, the body
#  under `variants {}` in the dictionary the unit reads).  The inline fragment
#  is refused by the engine; this arm counts it across the tree and the count
#  must read zero:
#    (a) EVERY flowsheetDict of every case, wherever it sits -- a sector's or a
#        leaf's dictionary with no system/ folder included (sugarPlantEconomics-
#        Sweep's FERMENTATION/Flash/flowsheetDict is one);
#    (b) the TS-string fixtures of gui/tests and gui/src, and the code examples of
#        docs/ and docs/ai/ (markdown fences, LaTeX verbatim/lstlisting): a
#        window around a `thermo {` that also names a UNIT type the engine
#        registers is a unit's fragment (a property operation's `thermo { }` in a
#        propsDict example names a props type, and is the props bench's grammar);
#    (c) the ENGINE: the sites that read a unit's `thermo` sub-dictionary are
#        counted per file and must equal the pinned list -- the engine's own
#        copy of a selected variant (stamped under the unwritable key
#        `@selectedVariant`) and a props operation's fragment; the props main
#        reads none, and the refusals are all in place.
UNIT_TYPES = set(re.findall(r'reg\("(\w+)"', (ROOT / "src/unitOperations/UnitOperation.cpp").read_text()))
FRAG = re.compile(r'\bthermo\s*[{(]')


def _strip(txt):
    txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)
    return re.sub(r'//.*$', '', txt, flags=re.M)


def _unit_fragments(text):
    """Fragments of `text` whose surrounding window names a registered UNIT type."""
    n = 0
    for m in re.finditer(r'\bthermo\s*\{', text):
        lo = max(0, m.start() - 700); hi = min(len(text), m.end() + 700)
        #  a blank line, a markdown fence or a LaTeX environment edge ends the example
        brk = re.compile(r'\n[ \t]*\n|```|\\(?:begin|end)\{(?:verbatim|lstlisting)')
        for bm in brk.finditer(text, lo, m.start()):
            lo = bm.end()
        am = brk.search(text, m.end(), hi)
        if am:
            hi = am.start()
        win = text[lo:hi]
        #  the unit's own block: from the nearest `name` before to the nearest `name` after
        before = list(re.finditer(r'\bname\s+[\w.]+\s*;', text[lo:m.start()]))
        after = re.search(r'\bname\s+[\w.]+\s*;', text[m.end():hi])
        s = before[-1].start() if before else 0
        e = (m.end() - lo) + (after.start() if after else len(text[m.end():hi]))
        span = win[s:e]
        for tm in re.finditer(r'\btype\s+(\w+)\s*;', span):
            if tm.group(1) in UNIT_TYPES:
                n += 1
                break
    return n


nFragments = 0
for root in ("tutorials", "benchmarks", "data", "docs", "gui/tests", "gui/public"):
    base = ROOT / root
    for fs in sorted(base.rglob("flowsheetDict")) if base.is_dir() else []:
        k = len(FRAG.findall(_strip(fs.read_text(errors="replace"))))
        if k:
            nFragments += k
            bad.append(f"{fs.parent.relative_to(ROOT)}: {k} inline unit `thermo {{ }}` "
                       f"fragment(s) in flowsheetDict -- a unit's own world is a named variant "
                       f"(`variants {{ <name> {{ ... }} }}` in the dictionary it reads, "
                       f"`thermo <name>;` in the unit; DEV.md 4c C402)")
for root, pats in (("gui/tests", ("*.ts", "*.tsx")), ("gui/src", ("*.ts", "*.tsx")),
                   ("docs", ("*.md", "*.tex")), ("docs/ai", ("*.md",))):
    base = ROOT / root
    if not base.is_dir():
        continue
    seen = set()
    for pat in pats:
        for f in sorted(base.rglob(pat)):
            if f in seen or "node_modules" in f.parts or "/reviews/" in f.as_posix() \
                    or "/design/" in f.as_posix() or f.name.startswith("tutorialsGuide"):
                continue
            seen.add(f)
            txt = f.read_text(errors="replace")
            k = _unit_fragments(txt)
            if k:
                nFragments += k
                bad.append(f"{f.relative_to(ROOT)}: {k} inline unit `thermo {{ }}` fragment(s) in a "
                           f"code example or fixture -- teach `thermo <name>;` and a `variants {{}}` "
                           f"entry (DEV.md 4c C402)")
#  (c) the engine's readers of a unit's `thermo` sub-dictionary
PINNED_READERS = {            # file -> number of `subDict("thermo")` sites it may hold
    "src/unitOperations/flowsheet/Flowsheet.cpp": None,   # reads ONLY the engine's stamped copy (counted below)
    "src/thermo/PropertyVariants.cpp": 1,                 # fragmentOf: a props operation's own declaration
    "src/reporting/ModelBoundaryLedger.cpp": 1,           # the engine's stamped copy only (`@selectedVariant`)
}
nReaders = 0
for f in sorted((ROOT / "src").rglob("*.[cHh]*")):
    s = f.read_text(errors="replace")
    k = len(re.findall(r'subDict\("thermo"\)', s))
    rel = f.relative_to(ROOT).as_posix()
    if k and rel not in PINNED_READERS and rel != "src/propertyOps/PropertyOperation.cpp":
        nReaders += k
        bad.append(f"{rel}: {k} read(s) of a `thermo` sub-dictionary outside the pinned homes -- "
                   f"an authored unit fragment must have NO reader (C402)")
for _rel, _n in PINNED_READERS.items():
    if _n is not None and len(re.findall(r'subDict\("thermo"\)', (ROOT / _rel).read_text())) != _n:
        nReaders += 1
        bad.append(f"{_rel}: the number of `subDict(\"thermo\")` reads moved from the pinned {_n}")
_fl = (ROOT / "src/unitOperations/flowsheet/Flowsheet.cpp").read_text()
if len(re.findall(r'refuseInlineFragment\(', _fl)) < 3 or "refuseNodeThermo(" not in _fl:
    nReaders += 1
    bad.append("Flowsheet.cpp no longer refuses an authored unit `thermo { }` at its three entry points "
               "and a sector's own `thermo` key (C402)")
if 'inline const char* selectedKey() { return "@selectedVariant"; }' not in \
        (ROOT / "src/thermo/PropertyVariants.H").read_text():
    nReaders += 1
    bad.append("the engine's variant stamp is no longer the unwritable key `@selectedVariant` -- an author "
               "could write it and have a fragment read (C402 FR-01)")

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


def _run_with(insert: str, variants: str = ""):
    """Copy flash16, splice `insert` in front of the unit's `operation`, run.
    `variants` is appended to the copy's constant/thermoPhysPropDict (C402: a
    unit's own world is a named variant there, selected by `thermo <name>;`)."""
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
        if variants:
            tp = dst / "constant" / "thermoPhysPropDict"
            tp.write_text(tp.read_text() + "\n" + variants + "\n")
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

    #  ...and the LEGAL neighbour still runs, or the refusal ate the feature:
    #  a unit's own world is a NAMED variant of the case's dictionary (C402).
    rc, out = _run_with("thermo gp;",
                        "variants { gp { equilibrium { formulation gammaPhi; "
                        "liquid { activityModel { model ideal; } } "
                        "vapour { fugacityModel idealGas; } } } }")
    if rc != 0:
        print("FAIL  a per-unit named variant no longer runs "
              "(exit %d) -- the refusal above is too wide:\n%s"
              % (rc, out[-400:]))
        sys.exit(1)
    if "LOCAL override" not in out:
        print("FAIL  the per-unit variant ran but was not ANNOUNCED -- the "
              "cascade must be loud (CLAUDE.md, sectored units)")
        sys.exit(1)
    print("  ok   the legal per-unit named variant still runs, and says so")

    #  ...and the OLD form, an inline `thermo { ... }` in the unit, is refused
    #  BY NAME with the lines to write (C402), not read.
    rc, out = _run_with("thermo { equilibrium { formulation gammaPhi; "
                        "liquid { activityModel { model ideal; } } "
                        "vapour { fugacityModel idealGas; } } }")
    if rc == 0 or "no longer read (DEV.md 4c C402)" not in out or "variants {" not in out:
        print("FAIL  an inline per-unit `thermo { ... }` was not refused by name "
              "with the lines to write (exit %d):\n%s" % (rc, out[-400:]))
        sys.exit(1)
    print("  ok   the old inline `thermo { ... }` form is refused by name")

    #  FR-01: a hand-written copy of the engine's stamp does not turn the block
    #  into a variant -- ANY authored block is refused, whatever it contains.
    for stamp in ("selectedVariant fake;", "@selectedVariant fake;"):
        rc, out = _run_with("thermo { " + stamp + " equilibrium { formulation gammaPhi; "
                            "liquid { activityModel { model ideal; } } "
                            "vapour { fugacityModel idealGas; } } }")
        #  (`@selectedVariant` cannot even be tokenized: the engine's own key is unwritable)
        if rc == 0 or ("no longer read (DEV.md 4c C402)" not in out
                       and "unexpected character '@'" not in out):
            print("FAIL  a hand-written stamp (%s) made an inline fragment READ (exit %d):\n%s"
                  % (stamp, rc, out[-300:]))
            sys.exit(1)
    print("  ok   a hand-written variant stamp does not make an inline fragment read")

    #  FR-09: a list is not a selector.
    rc, out = _run_with("thermo ( gp );")
    if rc == 0 or "is not a selector" not in out or "thermo <name>;" not in out:
        print("FAIL  `thermo ( ... );` was not refused by name with the line to write (exit %d):\n%s"
              % (rc, out[-300:]))
        sys.exit(1)
    print("  ok   `thermo ( ... );` is refused by name")

    #  FR-06: a `thermo` key at SECTOR level is refused by name (it was ignored).
    SECT = ROOT / "tutorials" / "steady" / "flowsheets" / "esterification2sector"
    if SECT.is_dir():
        tmp2 = tempfile.mkdtemp(prefix="unitchem2.")
        try:
            dst = Path(tmp2) / "case"
            shutil.copytree(SECT, dst)
            for junk in ("converged", "reports"):
                shutil.rmtree(dst / junk, ignore_errors=True)
            sfd = dst / "sectors" / "SEPARATION" / "system" / "flowsheetDict"
            sfd.write_text(sfd.read_text() + "\nthermo { equilibrium { vapour { fugacityModel SRK; } } }\n")
            r = subprocess.run([str(SOLVER), str(dst)], capture_output=True, text=True)
            o2 = (r.stdout or "") + (r.stderr or "")
            if r.returncode == 0 or "in a sector's (or a plant's) flowsheetDict is not read" not in o2:
                print("FAIL  a sector-level `thermo { }` was not refused by name (exit %d):\n%s"
                      % (r.returncode, o2[-300:]))
                sys.exit(1)
        finally:
            shutil.rmtree(tmp2, ignore_errors=True)
        print("  ok   a sector-level `thermo` key is refused by name")

print(f"unit-chemistry gate: no unit op selects thermodynamics; "
      f"{nFragments} inline unit thermo fragment(s) in the tree and {nReaders} engine reader(s) of one; "
      f"{nDeclared} case(s) declare an aqueous activity model, all implemented"
      + (f"; {len(pending)} still construct a solver directly" if pending else ""))
for p in pending:
    print("  [pending] " + p)
sys.exit(0)
