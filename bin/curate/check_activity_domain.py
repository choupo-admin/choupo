#!/usr/bin/env python3
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

WHAT IT DOES NOT CHECK.  Whether a declared band is TRUE of its model (that
is the source the declaration cites, and the measured band edge in
davies01_band_edge); a temperature domain (checked where a model's
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

if fail:
    for f in fail:
        print("FAIL", f)
    sys.exit(1)
print(f"[activity-domain] OK the activity models declare their own domain "
      f"({subclasses} AqueousActivity classes, each with validityDomain; no "
      "name branch or inline band in SpeciationSolver/ScalingScan/Exchange); "
      "Davies announces beyond I = 0.5 with its own sentence and not inside "
      "it, PitzerHMW states no bound and announces nothing, Edwards announces "
      "beyond its paper's ~6 mol/kg; NOT checked: whether a declared band is "
      "true, temperature domains, the mixed-solvent dominant-solvent "
      "criterion (no source states one)")
