#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: an aqueous activity model DECLARES its own validity domain, and no
caller decides it by the model's name.

    bin/curate/check_activity_domain.py

WHAT THIS GATE IS FOR (DEV.md 4c C188 item 4, 2026-10-31).  Until then the
only domain check on the aqueous activity engines was ONE line in
SpeciationSolver -- `if (I > 0.5 && activityName_ == "davies")` -- a branch on
the model's NAME with Davies' band written inline, and two property ops
(`scalingScan`, `exchange`) restated "~0.5 mol/kg" and "Davies" in their own
console text.  Three homes for one fact about one model; and any model added
later was "in domain" everywhere by omission, because nobody had written its
name into the branch.  Now `AqueousActivity::validityDomain()` is PURE
VIRTUAL (declare a band, or declare that none is stated, or do not compile),
SpeciationSolver asks `beyond(I)` and carries the model's own `sentence(I)`
(`SpeciationResult::activityBeyondDomain` / `activityDomainNote`), and the
ops print that sentence.

WHAT IT CHECKS.

 (a) SOURCE.  Over src/ with comments stripped:
     (a1) no `daviesExceeded` token survives (the retired, name-bound flag);
     (a2) no comparison of a model name against a string literal ANYWHERE
          in the three consumers (SpeciationSolver's domain decision,
          ScalingScan, Exchange) that also reads the ionic strength on the
          same line -- the shape of the retired branch;
     (a3) no "0.5 mol/kg" / "~0.5" text and no ionic-strength comparison
          against a non-zero numeric literal in SpeciationSolver.cpp,
          ScalingScan.cpp or Exchange.cpp -- the band lives in the model;
     (a4) the band's one home exists: AqueousActivity.H declares
          `validityDomain() const = 0`, and SpeciationSolver.cpp decides
          through `validityDomain()` and `.beyond(`;
     (a5) every class deriving from AqueousActivity in src/ declares
          `validityDomain` (the compiler enforces it for an INSTANTIATED
          class; this catches one that is declared and never built).

 (b) BEHAVIOUR, through choupoProps on probes cut from the shipped witness
     tutorials/props/electrolyte/davies01_band_edge (one op per probe,
     because AdvisoryLog de-duplicates within a run):
     (b1) Davies at NaCl 1.0 mol/kg (I = 1.00) announces, with the MODEL's
          sentence, verbatim -- "Davies activity at I = 1.00 mol/kg --
          beyond its ~0.5 mol/kg trust range; ..." (check_advisory_attribution
          keys on that phrase too);
     (b2) Davies at 0.25 mol/kg (inside its band) announces nothing;
     (b3) PitzerHMW at 4.0 mol/kg announces nothing: it STATES NO BOUND in
          this tree, and an absent bound must stay silent, never become a
          borrowed Davies one.
     And on the shipped cases:
     (b4) the scaling scan of pitzer_vs_davies_ro_concentrate prints the
          Davies sentence through the op (`[advisory] from r = ... on (...):
          Davies activity at ...`) and the op's old restatement is gone;
     (b5) Edwards et al. (1978) declares the ~6 mol/kg limit its paper
          quotes: edwards03_table8_vle (the paper rows reach I = 7.79; the engine solves 7.73) announces
          it with the Edwards sentence, edwards02_table7_vle (I <= 1.55)
          does not.

 (c) DAVIES' BAND AGAINST MEASUREMENTS (EL-09, 2026-11-13).  The band's
     criterion is a stated error limit: 10 % in gamma_pm for the MEDIAN 1-1
     and 2-1 salt of the evaluated 298.15 K tables in
     data/curation/electrolytes.  The arm recomputes both medians (Davies at
     A = 0.51, stoichiometric I, no ion pairs) and holds Davies' declared
     I_max within 0.1 of each, and requires the banner to state the
     criterion.  Sabotage by hand: I_max 0.5 -> 0.3 in the source (no
     rebuild needed, the arm reads the declaration) -> FAIL (c) twice,
     naming 0.52 and 0.56.
 (d) DAVIES WITH A 2- ANION'S ION PAIR (EL-09, 2026-11-13).  For Na2SO4 at
     298.15 K and m = 0.1, 0.2, 0.3, 0.4 mol/kg the arm runs the `speciate`
     op with Davies twice -- with the catalogue's full network (NaSO4-) and
     with `networkScope restricted; network ( water-dissociation );` -- and
     forms gamma_pm on the TOTAL molality from the solved activities,
     (a_Na^2 a_SO4/((2m)^2 m))^(1/3), against the Na-SO4 evaluated table.
     WITH the pair it must be within 10 % to m = 0.3 and beyond at 0.4;
     WITHOUT, beyond at all four; each percentage must equal the gate's
     table to its printed precision, and the seven the Theory Guide prints
     (sec:davies-band) must appear there as text.  `-v` prints the rows.
     Sabotage by hand (2026-11-13): an expected value moved by one unit of
     its last digit -> FAIL (d)(iii); the WITH run given the restricted
     network -> FAIL (d)(i) and (iii); one number changed in the guide ->
     FAIL (d)(iii) on the guide text.
WHAT IT DOES NOT CHECK.  Whether a declared band is TRUE of any model other
than Davies (that is the source the declaration cites; for Edwards, its
paper), or Davies with the ion pairs of any 1-2 salt but Na2SO4 (arm (d));
a temperature domain (checked where a model's
PARAMETERS are read, e.g. each Edwards record's Trange); the
dominant-solvent criterion of the mixed-solvent composite (`ionic davies;
molecular NRTL`), which no source in the tree states and is therefore NOT
declared; the `exchange` op's printed sentence on a shipped case (the one
`exchange` witness, softener_brackish, stays inside Davies' band, so only
its source arm (a) holds it).

SABOTAGE-VERIFIED BY HAND (2026-10-31; each restored from a byte copy, then
`make all` so check_build_fresh sees a fresh build):
  S1  restore the name branch in SpeciationSolver.cpp -- replace
      `dom.beyond(I)` by `I > 0.5 && activityName_ == "davies"` (sentence
      still the model's; NOT rebuilt, so only the source arm can see it):
        FAIL (a2) src/thermo/electrolyte/SpeciationSolver.cpp:2400: a model
             name is compared against a literal on a line that reads the
             ionic strength -- the domain is the model's declaration
        FAIL (a3) src/thermo/electrolyte/SpeciationSolver.cpp:2400: the
             ionic strength is compared against a numeric literal -- the
             band lives in AqueousActivity::validityDomain()
        FAIL (a4) SpeciationSolver.cpp no longer decides the domain through
             validityDomain() and beyond()
  S2  declare PitzerHMW's I_max = 0.5 (a borrowed Davies band), rebuilt:
        FAIL (b3) PitzerHMW at 4.0 mol/kg announced a domain advisory -- a
             model that states no bound must announce nothing
  S3  ScalingScan prints its old text ("Davies beyond its ~0.5 mol/kg trust
      range from r = ...") instead of the model's sentence, rebuilt (in the
      same build as S2; the messages are disjoint):
        FAIL (a3) src/propertyOps/ScalingScan.cpp:398: the band's number is
             restated outside the model
        FAIL (b4) the scaling scan does not print the model's sentence
             through the op
        FAIL (b4) the scaling scan still prints its own restatement of the
             band
Blind spot of (a2)/(a3): they are LINE-based, so a name branch split across
two lines passes them; (a4) and the behavioural arms are what remain.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
WITNESS = ROOT / "tutorials/props/electrolyte/davies01_band_edge"
SCAN = ROOT / "tutorials/props/electrolyte/pitzer_vs_davies_ro_concentrate"
ED_IN = ROOT / "tutorials/props/electrolyte/edwards02_table7_vle"
ED_OUT = ROOT / "tutorials/props/electrolyte/edwards03_table8_vle"

DAVIES_PHRASE = "beyond its ~0.5 mol/kg trust range"
fail = []


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"),
                  text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def strip_strings(line):
    return re.sub(r'"(?:\\.|[^"\\])*"', '""', line)


# ---------------------------------------------------------------- (a) source
code = {}
for p in list(SRC.rglob("*.cpp")) + list(SRC.rglob("*.H")):
    code[p] = strip_comments(p.read_text(errors="replace"))

for p, t in code.items():
    if "daviesExceeded" in t:
        fail.append(f"(a1) {p.relative_to(ROOT)}: the retired name-bound flag "
                    "`daviesExceeded` is still read or written")

CONSUMERS = [SRC / "thermo/electrolyte/SpeciationSolver.cpp",
             SRC / "propertyOps/ScalingScan.cpp",
             SRC / "propertyOps/Exchange.cpp"]
NAME_CMP = re.compile(r'(\w*[Nn]ame\w*|activityModel\w*)\s*[!=]=\s*"\w+"'
                      r'|"\w+"\s*[!=]=\s*(\w*[Nn]ame\w*)')
I_TOKEN = re.compile(r"\b(I|Ibefore|lastI|ionicStrength|raw\.I|res\.I|out\.I)\b")
I_LIT_CMP = re.compile(
    r"\b(?:I|Ibefore|lastI|ionicStrength|raw\.I|res\.I|out\.I)\s*[<>]=?\s*"
    r"(?:0*\.\d*[1-9]|[1-9][\d.]*)(?:[eE][-+]?\d+)?\b"
    r"|(?:0*\.\d*[1-9]|[1-9][\d.]*)\s*[<>]=?\s*"
    r"\b(?:I|Ibefore|lastI|ionicStrength)\b")
for p in CONSUMERS:
    rel = p.relative_to(ROOT)
    raw_lines = p.read_text(errors="replace").split("\n")
    for n, line in enumerate(code[p].split("\n"), 1):
        if NAME_CMP.search(line) and I_TOKEN.search(strip_strings(line)):
            fail.append(f"(a2) {rel}:{n}: a model name is compared against a "
                        "literal on a line that reads the ionic strength -- "
                        "the domain is the model's declaration")
        if I_LIT_CMP.search(strip_strings(line)):
            fail.append(f"(a3) {rel}:{n}: the ionic strength is compared "
                        "against a numeric literal -- the band lives in "
                        "AqueousActivity::validityDomain()")
        if re.search(r"~?0\.5 mol/kg|~0\.5\b", line) and '"' in line:
            fail.append(f"(a3) {rel}:{n}: the band's number is restated "
                        "outside the model")

hdr = code[SRC / "thermo/electrolyte/AqueousActivity.H"]
if not re.search(r"virtual\s+ActivityDomain\s+validityDomain\s*\(\s*\)\s*const"
                 r"\s*=\s*0", hdr):
    fail.append("(a4) AqueousActivity.H no longer declares "
                "`virtual ActivityDomain validityDomain() const = 0`")
spec = code[SRC / "thermo/electrolyte/SpeciationSolver.cpp"]
if "validityDomain()" not in spec or ".beyond(" not in spec:
    fail.append("(a4) SpeciationSolver.cpp no longer decides the domain "
                "through validityDomain() and beyond()")

subclasses = 0
for p, t in code.items():
    for m in re.finditer(r"class\s+(\w+)\s*(?:final\s*)?:\s*public\s+"
                         r"(?:electrolyte::)?AqueousActivity\b", t):
        subclasses += 1
        name = m.group(1)
        decl = any(re.search(rf"\b{name}::validityDomain\b", u)
                   for u in code.values()) or \
            re.search(r"ActivityDomain\s+validityDomain\s*\(\s*\)\s*const\s*"
                      r"override", t[m.end():m.end() + 20000].split("\n};")[0])
        if not decl:
            fail.append(f"(a5) {p.relative_to(ROOT)}: {name} derives from "
                        "AqueousActivity and declares no validityDomain()")
if subclasses < 3:
    fail.append(f"(a5) found {subclasses} AqueousActivity subclasses, expected "
                ">= 3 (davies, pitzerHMW, edwardsPitzer) -- the scan went blind")


# ------------------------------------------- (c) Davies' band vs measurements
# EL-09 (2026-11-12 electrolyte review): the band's criterion is a stated
# error limit -- 10 % in gamma_pm for the MEDIAN 1-1 and 2-1 salt of the
# evaluated 298.15 K tables in data/curation/electrolytes.  Recompute both
# medians here (Davies at A = 0.51, stoichiometric I, linear interpolation in
# I between table rows) and hold the declared I_max to them (|diff| <= 0.1),
# so a band re-declared without re-measuring, or a table set that moves the
# medians, fails.  This is the one place a declared band is checked TRUE.
DAV_CPP = SRC / "thermo/electrolyte/AqueousActivity.cpp"
CURATION = ROOT / "data/curation/electrolytes"
ZION = {"Ba": 2, "Ca": 2, "Mg": 2, "Sr": 2, "Zn": 2, "Cd": 2, "Cs": 1,
        "H": 1, "K": 1, "Li": 1, "Na": 1, "NH4": 1, "Rb": 1,
        "Br": 1, "Cl": 1, "I": 1, "F": 1, "NO3": 1, "NO2": 1, "OH": 1,
        "Acetate": 1, "H2PO4": 1, "HPO4": 2, "SO4": 2}


def davies_lg(z, I):
    s = I ** 0.5
    return -0.51 * z * z * (s / (1.0 + s) - 0.3 * I)


def crossing_10pct(rows, zc, za):
    import math
    g = math.gcd(zc, za)
    nc, na = za // g, zc // g
    pts = []
    for m, gmeas in rows:
        I = 0.5 * (nc * zc * zc + na * za * za) * m
        lgpm = (nc * davies_lg(zc, I) + na * davies_lg(za, I)) / (nc + na)
        pts.append((I, abs(100.0 * (10.0 ** lgpm - gmeas) / gmeas)))
    if pts[0][1] > 10.0:
        return pts[0][0]                     # already beyond: the first I
    for (I0, e0), (I1, e1) in zip(pts, pts[1:]):
        if e1 > 10.0:
            return I0 + (I1 - I0) * (10.0 - e0) / (e1 - e0)
    return pts[-1][0]                        # never crosses inside the table


m_imax = re.search(r"class\s+DaviesActivity\b.*?d\.I_max\s*=\s*([0-9.]+)\s*;",
                   code[DAV_CPP], re.S)
classes = {"1-1": [], "2-1": []}
for d in sorted(CURATION.glob("*-*")) if CURATION.is_dir() else []:
    cat, an = d.name.split("-", 1)
    if cat not in ZION or an not in ZION:
        continue
    for f in (d / "constant/experiments").glob("*.dat"):
        t = f.read_text(errors="replace")
        if not re.search(r"^temperature\s+298\.15\s*;", t, re.M):
            continue
        blk = re.search(r"\ndata\s*\((.*?)\);", t, re.S)
        if not blk:
            continue
        rows = [tuple(map(float, ln.split()[:2]))
                for ln in blk.group(1).strip().splitlines()
                if ln.strip() and not ln.strip().startswith("//")]
        key = f"{ZION[cat]}-{ZION[an]}"
        if rows and key in classes:
            classes[key].append(crossing_10pct(rows, ZION[cat], ZION[an]))
medians = {}
if not m_imax:
    fail.append("(c) Davies' I_max could not be read from AqueousActivity.cpp"
                " -- the arm cannot run, and a check that cannot run must not"
                " pass")
elif len(classes["1-1"]) < 30 or len(classes["2-1"]) < 12:
    fail.append(f"(c) only {len(classes['1-1'])} 1-1 and {len(classes['2-1'])}"
                " 2-1 evaluated 298.15 K tables found (floors 30 / 12) --"
                " collapsed scan")
else:
    import statistics
    imax = float(m_imax.group(1))
    for k, v in classes.items():
        medians[k] = statistics.median(v)
        if abs(medians[k] - imax) > 0.1:
            fail.append(f"(c) Davies declares I_max = {imax} but the median"
                        f" {k} salt reaches 10 % in gamma_pm at I ="
                        f" {medians[k]:.2f} -- re-measure the band, or restate"
                        " its criterion")


# ------------------------------------------------------------- (b) behaviour
def run(case):
    r = subprocess.run([str(PROPS), str(case)], capture_output=True,
                       text=True, timeout=600)
    return r.returncode, r.stdout + r.stderr


def probe(op_line):
    tmp = Path(tempfile.mkdtemp(prefix="activityDomain."))
    case = tmp / "probe"
    shutil.copytree(WITNESS, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "log.*", "reports"))
    (case / "system/propsDict").write_text(
        "operations\n(\n" + op_line + "\n);\n")
    rc, out = run(case)
    shutil.rmtree(tmp, ignore_errors=True)
    return rc, out


def op(name, model, m):
    return (f"    {{ name {name}; type speciate; activityModel {model};\n"
            f"      composition {{ NaCl {m} mol/kg; }} pH solve;\n"
            f"      diagSpecies ( Na Cl ); output {{ file {name}.csv; }} }}")


if not PROPS.exists():
    fail.append(f"(b) {PROPS.relative_to(ROOT)} is not built -- a check that "
                "cannot run must not pass")
else:
    rc, out = probe(op("d1", "davies", "1.0"))
    want = ("Davies activity at I = 1.00 mol/kg -- " + DAVIES_PHRASE +
            "; speciation and SI are INDICATIVE (use Pitzer for quantitative "
            "work)")
    if rc != 0:
        fail.append(f"(b1) the Davies probe exited {rc}")
    elif want not in out:
        fail.append("(b1) Davies at I = 1.00 did not announce the model's "
                    f"sentence verbatim: '{want}'")
    elif "trustworthy to I ~ 0.5 mol/kg (gamma_pm within 10 % of measured" \
            not in out:
        fail.append("(c) the Davies banner no longer states what"
                    " 'trustworthy' means (its measured 10 % criterion)")
    rc, out = probe(op("d025", "davies", "0.25"))
    if rc != 0 or "beyond its" in out:
        fail.append("(b2) Davies at 0.25 mol/kg (inside its band) announced a "
                    "domain advisory, or did not run")
    rc, out = probe(op("h4", "pitzerHMW", "4.0"))
    if rc != 0:
        fail.append(f"(b3) the PitzerHMW probe exited {rc}")
    elif "beyond its" in out:
        fail.append("(b3) PitzerHMW at 4.0 mol/kg announced a domain advisory "
                    "-- a model that states no bound must announce nothing")

    rc, out = run(SCAN)
    if rc != 0:
        fail.append(f"(b4) {SCAN.name} exited {rc}")
    else:
        if not re.search(r"\[advisory\] from r = [0-9.]+ on \(I = [0-9.]+ "
                         r"mol/kg at r = [0-9.]+\): Davies activity at I = "
                         r"[0-9.]+ mol/kg -- " + re.escape(DAVIES_PHRASE), out):
            fail.append("(b4) the scaling scan does not print the model's "
                        "sentence through the op")
        if "Davies beyond its" in out:
            fail.append("(b4) the scaling scan still prints its own "
                        "restatement of the band")

    rc, out = run(ED_OUT)
    if rc != 0:
        fail.append(f"(b5) {ED_OUT.name} exited {rc}")
    elif not re.search(r"Edwards et al\. \(1978\) activity at I = [0-9.]+ "
                       r"mol/kg -- beyond its ~6 mol/kg validity limit", out):
        fail.append("(b5) edwards03 (I up to 7.79) did not announce the "
                    "Edwards limit with the model's sentence")
    rc, out = run(ED_IN)
    if rc != 0:
        fail.append(f"(b5) {ED_IN.name} exited {rc}")
    elif "beyond its" in out:
        fail.append("(b5) edwards02 (I <= 1.55) announced a domain advisory")


# ------------------------------- (d) Davies with a 2- anion's ion pair (EL-09)
# The Theory Guide (sec:davies-band) claims, for Na2SO4 at 298.15 K, that
# Davies' gamma_pm comes back inside 10 % of the evaluated table when the
# catalogue's NaSO4- is in the speciation network, and is far outside it
# without.  Recompute the eight rows with the ENGINE on every run: one
# `speciate` op per (m, network), Davies; WITH = the catalogue's full network
# (it holds NaSO4-), WITHOUT = `networkScope restricted; network (
# water-dissociation );` (every ion free).  gamma_pm referred to the salt's
# TOTAL molality from the solved free-ion activities,
#     gamma_pm = (a_Na^2 a_SO4 / ((2m)^2 m))^(1/3),
# against the Na-SO4 evaluated table.  Asserted: (i) WITH inside 10 % at
# m = 0.1, 0.2, 0.3 and beyond it at 0.4; (ii) WITHOUT beyond 10 % at all
# four; (iii) every percentage equals D_EXPECTED to its printed precision,
# and the seven the guide prints appear in its text (gate and guide cannot
# drift apart).  `-v` prints the eight rows.
VERBOSE = "-v" in sys.argv[1:] or "--verbose" in sys.argv[1:]
NA2SO4 = CURATION / "Na-SO4/constant/experiments/Na-SO4.dat"
GUIDE = ROOT / "docs/theoryGuide.tex"
# m: (with pair %, decimals, without pair %, decimals) -- as the guide prints
D_EXPECTED = {0.1: ("-2.7", "+21"), 0.2: ("+2.3", "+50"),
              0.3: ("+7.1", "+87"), 0.4: ("+11.6", "+134")}
D_IN_GUIDE = ["-2.7", "+2.3", "+7.1", "+11.6", "+21", "+50", "+87"]
DAVIES_SURFACE = """recordType    thermophysicalPropertySystem;
schemaVersion 2;
components ( water );
aqueousProperties
{
    activityCoefficients { model Davies; referenceBasis aqueousMolality; }
}
"""


def d_op(name, m, restricted):
    scope = ("\n      networkScope restricted; network ( water-dissociation );"
             "\n      reason \"check_activity_domain (d): every ion free, no "
             "ion pair\";" if restricted else "")
    return (f"    {{ name {name}; type speciate; activityModel davies;\n"
            f"      temperature 298.15; analyticalTotals {{ Na {2 * m:g} "
            f"mol/kg; SO4 {m:g} mol/kg; }}\n      pH 7.0;{scope}\n"
            f"      output {{ file {name}.csv; }} }}")


def d_rows():
    """{m: (gamma_meas, gamma_with, gamma_without)} or a failure string."""
    import csv
    import os
    t = NA2SO4.read_text(errors="replace")
    blk = re.search(r"\ndata\s*\((.*?)\);", t, re.S)
    if not blk:
        return "the Na-SO4 evaluated table has no data block"
    meas = {}
    for ln in blk.group(1).strip().splitlines():
        if ln.strip() and not ln.strip().startswith("//"):
            v = ln.split()
            meas[float(v[0])] = float(v[1])
    tmp = Path(tempfile.mkdtemp(prefix="activityDomain.d."))
    case = tmp / "na2so4"
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / "system/controlDict").write_text(
        'application  choupoProps;\ndescription  "check_activity_domain (d)";'
        "\nverbosity    1;\n")
    (case / "constant/thermoPhysPropDict").write_text(DAVIES_SURFACE)
    ops = []
    for m in D_EXPECTED:
        tag = f"{m:g}".replace(".", "p")
        ops.append(d_op(f"with_m{tag}", m, False))
        ops.append(d_op(f"without_m{tag}", m, True))
    (case / "system/propsDict").write_text(
        "operations\n(\n" + "\n".join(ops) + "\n);\n")
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    try:
        r = subprocess.run([str(PROPS), str(case)], capture_output=True,
                           text=True, timeout=600, env=env, cwd=case)
        if r.returncode != 0:
            return (f"the Na2SO4 speciate probe exited {r.returncode}: "
                    + (r.stdout + r.stderr).strip()[-400:])
        out = {}
        for m in D_EXPECTED:
            if m not in meas:
                return f"the Na-SO4 table has no row at m = {m}"
            tag = f"{m:g}".replace(".", "p")
            g = []
            for kind in ("with", "without"):
                f = case / f"{kind}_m{tag}.csv"
                if not f.exists():
                    return f"the probe wrote no {f.name}"
                act = {row["species"]: float(row["activity"])
                       for row in csv.DictReader(open(f))}
                if "Na" not in act or "SO4" not in act:
                    return f"{f.name} carries no Na or SO4 activity"
                g.append((act["Na"] ** 2 * act["SO4"]
                          / ((2 * m) ** 2 * m)) ** (1.0 / 3.0))
            out[m] = (meas[m], g[0], g[1])
        return out
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if not PROPS.exists():
    fail.append(f"(d) {PROPS.relative_to(ROOT)} is not built -- a check that "
                "cannot run must not pass")
else:
    rows = d_rows()
    if isinstance(rows, str):
        fail.append(f"(d) {rows} -- a check that cannot run must not pass")
    else:
        if VERBOSE:
            print("[activity-domain] (d) Na2SO4, Davies, 298.15 K, gamma_pm "
                  "referred to the total molality")
            print("    m      measured  with NaSO4-  err %   without  err %")
        for m, (gm, gw, go) in rows.items():
            ew, eo = 100 * (gw - gm) / gm, 100 * (go - gm) / gm
            if VERBOSE:
                print(f"    {m:<5}  {gm:.4f}    {gw:.4f}     {ew:+7.2f}  "
                      f"{go:.4f}  {eo:+7.2f}")
            inside = abs(ew) <= 10.0
            if (m < 0.35) != inside:
                fail.append(f"(d)(i) with NaSO4- at m = {m}: Davies is "
                            f"{ew:+.2f} % off the table -- expected "
                            + ("within" if m < 0.35 else "beyond") + " 10 %")
            if abs(eo) <= 10.0:
                fail.append(f"(d)(ii) without the pair at m = {m}: Davies is "
                            f"{eo:+.2f} % off -- expected beyond 10 %")
            for got, want, what in ((ew, D_EXPECTED[m][0], "with the pair"),
                                    (eo, D_EXPECTED[m][1], "without")):
                dec = len(want.split(".")[1]) if "." in want else 0
                if f"{got:+.{dec}f}" != want:
                    fail.append(f"(d)(iii) {what} at m = {m}: the engine gives "
                                f"{got:+.{dec}f} %, the gate's table (and the "
                                f"Theory Guide) say {want} %")
    sec = GUIDE.read_text(errors="replace").split(r"\label{sec:davies-band}")
    if len(sec) != 2:
        fail.append("(d)(iii) docs/theoryGuide.tex has no single "
                    "sec:davies-band to hold the numbers against")
    else:
        body = sec[1].split(r"\subsection")[0]
        for v in D_IN_GUIDE:
            if f"${v}$" not in body:
                fail.append(f"(d)(iii) the Theory Guide's sec:davies-band no "
                            f"longer prints ${v}$ -- the gate and the guide "
                            "have drifted apart")

if fail:
    for f in fail:
        print("FAIL", f)
    sys.exit(1)
print(f"[activity-domain] OK the activity models declare their own domain "
      f"({subclasses} AqueousActivity classes, each with validityDomain; no "
      "name branch or inline band in SpeciationSolver/ScalingScan/Exchange); "
      "Davies announces beyond I = 0.5 with its own sentence and not inside "
      "it, PitzerHMW states no bound and announces nothing, Edwards announces "
      "beyond its paper's ~6 mol/kg; Davies' I_max is within 0.1 of the "
      f"median 10 %-in-gamma_pm crossing of the evaluated 25 C tables (1-1 "
      f"{medians.get('1-1', float('nan')):.2f}, 2-1 "
      f"{medians.get('2-1', float('nan')):.2f}) and its banner states that "
      "criterion; Davies with the catalogue's NaSO4- recomputed for Na2SO4 "
      "at m = 0.1-0.4 mol/kg (within 10 % to 0.3, beyond at 0.4; beyond at "
      "all four without the pair; all eight equal the gate's table to "
      "their printed digits, and the seven the Theory Guide prints appear "
      "in it); NOT checked: whether the Edwards band is true, temperature "
      "domains, the ion pairs of the other seven 1-2 salts, the "
      "mixed-solvent dominant-solvent criterion (no source states one)")
