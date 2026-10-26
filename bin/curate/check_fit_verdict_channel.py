#!/usr/bin/env python3
"""Gate: a fit's curation verdict reaches EVERY sink, and they all say the same word.

    bin/curate/check_fit_verdict_channel.py

WHY THIS EXISTS.  `fitParameters`, `vaporPressureFit` and `heatCapacityFit`
each decide a CURATION VERDICT -- validated / notValidated / heldOutPerformed
/ validationRefused / notClaimed -- from a held-out pass against a band the
case declared BEFORE the fit.  Until 2026-09-04 that word reached three sinks:
the console (a human), the curation dossier (a work record) and the promotable
pair record (a file).  It did NOT reach the result JSON, which is the only
channel a PROGRAM reads.

Two things followed, and both are failures of rules this project already
states.  The GUI's own fit panel -- the surface built to let a student JUDGE a
fit -- could not show it, and drew an IDENTIFIABILITY verdict instead, which
answers a different question.  And no golden row could reach it, so a number a
reader acts on was published to a human and pinned by nothing: the inverse of
`published implies pinned` (CLAUDE.md Sec. 6).

WHAT THIS GATE CHECKS, by RUNNING the witnesses in a scratch copy (never the
tree -- these ops write curation/ artefacts beside the case):

  (a) THE SINKS AGREE.  For every fit op in the witness, the verdict in the
      result JSON equals the `verdict` the CURATION DOSSIER wrote, and the
      CONSOLE mentions that same word (in either of the two shapes the two op
      families print -- see `console_mentions`).  Agreement is the whole
      point: three sinks that each recompute a decision can drift, and one of
      them already did -- the console's copy sat inside `if (verbosity >= 2)`,
      so the decision was taken a different number of times depending on how
      loudly the run was asked to speak.

  (b) THE CRITERION TRAVELS WITH THE VERDICT.  A verdict published without the
      band it was judged against is a badge.  Where the case declares an
      acceptance band, the JSON carries it and it matches the console's
      ACCEPTANCE CRITERION block; where it does not, the JSON says so in words
      rather than omitting the key (an absent key reads as "no block ran").

  (c) BOTH POLARITIES FIRE.  `curate01` publishes `validated` AND
      `validationRefused` from two ops on the same property -- the contrast
      that witness exists to demonstrate.  A gate that only ever saw a passing
      verdict would not notice the day the refused one stopped being emitted.

  (d) IT IS PINNED.  Every verdict the run publishes has a `verdict` row in
      that case's golden, and the row's word matches.  This is the
      published-implies-pinned rule applied to the thing this slice added.

  (f) THE BAND IS DECLARED IN ITS STATISTIC'S OWN UNIT (DEV.md 4c C172).  A
      band is a number in a unit and so is the held-out statistic it judges;
      `percent` (a RELATIVE deviation) and `points` (an ABSOLUTE one on a
      rejection) both scale by 1e-2, so nothing in the arithmetic notices a
      band in one judging a statistic in the other.  The engine refuses that
      by name (EvidencePartition::requireBandInUnitOf), and this arm holds it:
        f1  every published band carries its word (`acceptanceUnit`) and the
            statistic it judges carries its unit (`units`), and the two name
            ONE unit;
        f2  a MISMATCHED band refuses, quoting the band as written, the
            statistic and its unit, and the remedy (curate01's relative band
            re-declared in `points`);
        f3  a MATCHED band runs: membrane24 as it ships, `maxAAD 10 points`
            against its points statistic, to its pinned `validated` (and f1
            then sees both a relative band and a points band).  The remedy f2
            checks names `percent`, never `%`: the dict tokenizer cannot carry
            `%`, so a remedy naming it would be untypeable;
        f4  a band with NO unit word refuses;
        f5  the membrane fit's band in `percent` refuses against its POINTS
            statistic (membrane24 as it shipped before C172);
        f6  held-out evidence MIXING rejections and fluxes has a statistic with
            no single unit, and a band on it refuses;
        f7  SOURCE: every op class that calls `CurationDossier::verdictOf` also
            calls `requireBandInUnitOf` (verdictOf itself throws on a band never
            checked -- the runtime backstop; this arm names the op first).
  (g) A FITTED PAIR PARAMETER PUBLISHES THE UNIT ITS MODEL DECLARES, OR NONE
      (DEV.md 4c C172).  For every fitted `...binaryParameters.<i-j>.<key>` of
      the witnesses, the unit published for `fit.<i>.value` (and for the
      path-keyed readback) is exactly the unit the activity model's
      `pairParameterUnits()` table declares for <key> -- the table READ from
      the model's own source, never listed here -- and is ABSENT when the
      table declares none.  An absent unit is the honest answer; a unit
      guessed from the key's spelling is the defect (`b_ij` is kelvin in NRTL
      and a pure number in UNIQUAC).

SABOTAGES (f, g), by hand, each restored after -- see the end of this
docstring; they are recorded as MEASURED, including the ones that did not do
what was predicted.

WHAT IT DOES NOT DO, stated so its OK line cannot be read wider:

  * It does not judge whether a verdict is RIGHT -- that is the engine's
    decision from the case's own declared band, and this gate only checks that
    every sink reports the same one.
  * It does not check the GUI renders it (gui/tests owns that; the panel is
    TypeScript and this gate runs no browser).
  * It reaches only the ops that publish a `curation` object today.  An op that
    computes a verdict and publishes none would be INVISIBLE here, which is the
    exact defect this gate was written about -- so arm (e) counts the ops that
    call `CurationDossier::verdictOf` in the C++ and requires each to have a
    `curation()` override, rather than trusting the witnesses to cover them.
  * (f) holds the band's word against the statistic's; it does not judge
    whether the band's NUMBER is a sensible criterion in that unit (that is
    the case author's, with its stated origin).  (g) reaches the activity
    models whose pairs the witnesses fit -- NRTL today; UNIQUAC and Wilson
    declare their tables and no corpus case fits one of their pairs.

SABOTAGES of (f) and (g), 2026-10-26, each by hand on the engine source,
rebuilt, the gate run, restored with a NEW mtime and rebuilt (a restore that
keeps the old clock leaves the sabotaged object in the build -- this happened
once mid-series and invalidated one result, which was redone):
  S1  VaporPressureFit.cpp: its requireBandInUnitOf call deleted -> FAIL at
      the curate01 WITNESS (no result block): verdictOf's runtime backstop
      throws on a band never checked, before arm (f) is reached.
  S1b the same, AND the backstop in CurationDossier::verdictOf disabled ->
      FAIL (f2): the band in `points` against the relative statistic RAN.
  S1c HeatCapacityFit.cpp: its call deleted (no witness runs that op with a
      band, so no runtime arm can see it) -> FAIL (f7) naming HeatCapacityFit.
  S2  Units.cpp: the `percentagePoint` measure of `points` removed (the two
      words then compare equal by factor and dimensions) -> FAIL (f2).
  S3  NRTL.cpp: `b_ij`/`b_ji` removed from NRTL::pairParameterUnits -> PASS,
      as predicted: the run publishes NO unit for the b parameters (the GUI
      says "unit not published") and (g), reading the same table, requires
      exactly that.  The point of S3 is the next one.
  S3b S3 plus a unit GUESSED in FitParameters::diagnosticUnit for an
      undeclared key -> FAIL (g): "an undeclared key must publish NO unit,
      never a guessed one".
  S4  FitParameters.cpp: the pair-parameter branch of diagnosticUnit
      disabled -> FAIL (g): fit.0.value (a_ij) published in None, NRTL
      declares '-'.
  S5  FitParametersMembrane.cpp: its call made `if (false)` -> FAIL (f3):
      membrane24 no longer runs (the backstop).  NOT caught by (f7), which is
      a PRESENCE test of the call in the source -- recorded, not hidden: the
      runtime backstop is what closes that hole.
  S6  FitParametersMembrane.cpp: a mixed statistic labelled `points` ->
      FAIL (f6): the mixed probe RAN.
"""
import json
import re, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WITNESSES = [
    "tutorials/props/curation/curate01_water_evidence_partition",
    "tutorials/props/curation/curate02_vle_heldout_ethanol_water",
    "tutorials/props/curation/curate03_thermoml_fixture_bubble",
]
VERDICTS = {"validated", "notValidated", "heldOutPerformed",
            "validationRefused", "notClaimed"}

def fail(msg):
    print("check_fit_verdict_channel: FAIL -- " + msg)
    sys.exit(1)

def run_case(src: Path, tmp: Path):
    d = tmp / src.name
    shutil.copytree(src, d)
    r = subprocess.run([str(ROOT / "choupoProps"), "."], cwd=d,
                       capture_output=True, text=True, timeout=600)
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  r.stdout, re.S)
    if not m:
        fail(f"{src.name}: no result block (exit {r.returncode})")
    try:
        j = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        fail(f"{src.name}: the result block is not valid JSON ({e}) -- the"
             " curation object must be escaped, an acceptance ORIGIN is a"
             " curator's sentence and carries punctuation")
    return d, r.stdout, j

#  THE CONSOLE SAYS IT IN TWO SHAPES, and that is a finding rather than a
#  thing this gate can paper over.  `fitParameters` prints a `VERDICT` heading
#  with the engine's own word beneath it; `vaporPressureFit` prints prose --
#  "-> VALIDATED against the pre-declared band" / "VALIDATION REFUSED:".  Two
#  spellings of one decision in one product is the shape of the `T_top` defect
#  this project spent a slice removing, and unifying them would move console
#  text that other gates and guide prose quote, so it is NOT done here: it is
#  RECORDED, and the agreement check below runs on the two channels that ARE
#  uniform (the result JSON and the curation dossier).
#
#  What the console is still held to: the word must be THERE.  A run whose
#  console says nothing about a verdict it published fails, whichever shape it
#  would have used -- which is the failure that actually matters to a reader.
def console_mentions(text, verdict):
    """Is this verdict visible on the console at all, in either shape?"""
    spaced = re.sub(r"(?<!^)(?=[A-Z])", " ", verdict)   # heldOutPerformed -> held Out Performed
    return (re.search(r"\b" + re.escape(verdict) + r"\b", text) is not None
            or re.search(re.escape(spaced).replace(r"\ ", r"[\s-]+"),
                         text, re.I) is not None)

def dossier_verdicts(case_dir: Path):
    out = []
    for f in sorted((case_dir / "curation").glob("*.dossier")) \
             if (case_dir / "curation").is_dir() else []:
        out += re.findall(r"^\s*verdict\s+(\w+);", f.read_text(), re.M)
    return out

def golden_verdicts(src: Path):
    exp = src / "expected"
    if not exp.is_file():
        return None
    return {m[0]: m[1] for m in
            re.findall(r"^verdict\s+(\S+)\s+verdict\s+(\S+)\s+exact\s*$",
                       exp.read_text(), re.M)}


# ---------------------------------------------------------------------------
#  (f) the band in its statistic's own unit
# ---------------------------------------------------------------------------
#  A TEST ORACLE for "names one unit": the twins core/Units.cpp registers
#  (`percent` IS `%`).  The engine's own comparison is units::sameUnit; this
#  map only lets the gate read a published pair, and f2/f3/f5 prove the
#  engine's.
ONE_UNIT = {"%": "%", "percent": "%", "points": "points"}
#  the held-out statistic keys the fit ops publish
STAT_KEYS = ("aad_heldout_pct", "heldOut_AAD_pct")
M24 = "tutorials/steady/membranes/membrane24_fit_then_simulate"
C01 = "tutorials/props/curation/curate01_water_evidence_partition"


def probe(rel, name, edits, tmp):
    """Copy a case, apply (file, old, new) edits (each must apply), run
    choupoProps; return (exit, stdout+stderr, json-or-None)."""
    d = tmp / name
    shutil.copytree(ROOT / rel, d)
    for f, old, new in edits:
        p = d / f
        t = p.read_text()
        if old not in t:
            fail(f"probe {name}: the edit did not apply to {f} ({old!r})")
        p.write_text(t.replace(old, new, 1))
    r = subprocess.run([str(ROOT / "choupoProps"), "."], cwd=d,
                       capture_output=True, text=True, timeout=900)
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  r.stdout, re.S)
    j = json.loads(m.group(1)) if m else None
    return r.returncode, r.stdout + r.stderr, j


def must_refuse(name, rc, out, needles):
    if rc == 0:
        fail(f"(f) {name}: the probe RAN (exit 0) -- the band was not held to"
             " its statistic's unit")
    for n in needles:
        if n not in out:
            fail(f"(f) {name}: refused (exit {rc}) but the message does not"
                 f" say {n!r} -- a refusal must quote the band, the statistic"
                 " and its unit, and the remedy")


def arm_f(witness_results):
    seen_units = set()
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        pd = "system/propsDict"
        # f3 -- A MATCHED BAND RUNS: membrane24 as it ships, its band in
        #       `points` against its points statistic, to the verdict it pins
        #       (and its result joins f1, so f1 sees both units)
        rc, out, j = probe(M24, "f3", [], tmp)
        if rc != 0 or j is None:
            fail(f"(f3) membrane24 with its band in `points` did not run (exit {rc})")
        got = [o["curation"]["verdict"] for o in j["operationResults"]
               if o.get("curation")]
        if got != ["validated"]:
            fail(f"(f3) membrane24's band in `points` gave {got}, not 'validated'")
        results = list(witness_results) + [(ROOT / M24, j)]

        # f1 -- every published band names the unit of its statistic
        for src, jj in results:
            for op in jj.get("operationResults", []):
                cur = op.get("curation") or {}
                band = cur.get("acceptanceMaxAADPct", "")
                if not band or band.startswith("none"):
                    continue
                word = cur.get("acceptanceUnit")
                if not word:
                    fail(f"(f1) {src.name}/{op['name']}: a band is published with"
                         " no `acceptanceUnit` -- a band's number without its word"
                         " is the ambiguity this arm exists for")
                units = op.get("units") or {}
                for k in STAT_KEYS:
                    if k not in (op.get("diagnostics") or {}):
                        continue
                    u = units.get(k)
                    if not u:
                        fail(f"(f1) {src.name}/{op['name']}: the statistic {k} is"
                             " published with NO unit, so nobody can tell what"
                             " the band was held to")
                    if ONE_UNIT.get(word) != ONE_UNIT.get(u):
                        fail(f"(f1) {src.name}/{op['name']}: band `{band} {word}`"
                             f" published beside {k} in `{u}` -- the engine"
                             " should have refused this")
                    seen_units.add(f"`{word}` vs {k} [{u}]")
        if len({ONE_UNIT.get(w.split("`")[1]) for w in seen_units}) < 2:
            fail(f"(f1) only one band unit was seen ({sorted(seen_units)}) -- the"
                 " arm must see a relative band AND a points band")

        # f2 -- mismatched; the remedy names `percent`, the word a dict can
        #       carry for `%` (`maxAAD 0.1 %;` is a parse error)
        rc, out, _ = probe(C01, "f2", [(pd, "maxAAD  0.001 percent;",
                                        "maxAAD  0.001 points;")], tmp)
        must_refuse("f2 (relative statistic, band in points)", rc, out,
                    ["`maxAAD 0.001 points`", "aad_heldout_pct", "`%`",
                     "`maxAAD <x> percent;`"])
        # f4 -- no unit word
        rc, out, _ = probe(C01, "f4", [(pd, "maxAAD  0.001 percent;",
                                        "maxAAD  0.00001;")], tmp)
        must_refuse("f4 (no unit word)", rc, out,
                    ["NO unit word", "aad_heldout_pct", "`maxAAD <x> percent;`"])
        # f5 -- the membrane band as it shipped before C172
        rc, out, _ = probe(M24, "f5", [(pd, "maxAAD  10 points;",
                                        "maxAAD  10 percent;")], tmp)
        must_refuse("f5 (membrane points statistic, band in percent)", rc, out,
                    ["`maxAAD 10 percent`", "heldOut_AAD_pct", "`points`",
                     "`maxAAD <x> points;`"])
        # f6 -- a held-out statistic mixing points and per cents: the MgSO4
        #        set re-declared with an imposed dP and a measured flux beside
        #        its rejection (values immaterial: the refusal precedes the fit)
        ds = "constant/experimental/fdl2021_MgSO4.dat"
        body = re.search(r"data\s*\((.*?)\);", (ROOT / M24 / ds).read_text(), re.S)
        mixed = "\n".join(f"    5.0e5  {r.split()[1]}  {r.split()[0]}"
                          for r in body.group(1).strip().splitlines())
        rc, out, _ = probe(M24, "f6", [
            (ds, "{ name Jv;  unit m/s; }", "{ name dP;  unit Pa; }"),
            (ds, "{ name R_MgSO4;  unit -; }",
                 "{ name R_MgSO4;  unit -; }\n    { name Jv_measured;  unit m/s; }"),
            (ds, body.group(1), "\n" + mixed + "\n")], tmp)
        must_refuse("f6 (held-out rejections AND fluxes)", rc, out,
                    ["NO single unit", "heldOut_AAD_pct"])
    # f7 -- source: whoever decides a verdict holds its band to its unit
    deciders, checkers = set(), set()
    for f in (ROOT / "src" / "propertyOps").glob("*.cpp"):
        if f.stem in ("CurationDossier", "EvidencePartition"):
            continue                    # the rule's own home and the check's
        t = re.sub(r"//[^\n]*|/\*.*?\*/", "", f.read_text(), flags=re.S)
        owners = set(re.findall(r"^\w[\w:<>,\s]*?\b([A-Z]\w*)::\w+\s*\(", t, re.M))
        owners -= {"CurationDossier", "EvidencePartition", "HeldOutStatistic"}
        owners = owners or {f.stem}
        if "CurationDossier::verdictOf(" in t:
            deciders |= owners
        if "requireBandInUnitOf(" in t:
            checkers |= owners
    missing = sorted(deciders - checkers)
    if missing:
        fail(f"(f7) these ops decide a verdict and never hold their band to"
             f" its statistic's unit: {missing}")
    if not deciders:
        fail("(f7) no op calls CurationDossier::verdictOf -- the arm has no subject")
    return seen_units


# ---------------------------------------------------------------------------
#  (g) a fitted pair parameter's unit is its MODEL's declaration
# ---------------------------------------------------------------------------
def declared_pair_units():
    """{model word: {key: unit}} read from each model's pairParameterUnits()
    body and the name registerBuiltins registers it under."""
    by_class = {}
    for f in sorted((ROOT / "src/thermo/activityCoefficient").glob("*.cpp")):
        t = f.read_text()
        m = re.search(r"(\w+)::pairParameterUnits\(\)\s*\{(.*?)\n\}", t, re.S)
        if m:
            by_class[m.group(1)] = dict(
                re.findall(r'\{\s*"(\w+)"\s*,\s*"([^"]*)"\s*\}', m.group(2)))
    reg = (ROOT / "src/thermo/activityCoefficient/ActivityModel.cpp").read_text()
    named = {word: by_class.get(cls, {}) for word, cls in
             re.findall(r'registerPairParameterUnits\("(\w+)",\s*(\w+)::', reg)}
    if not named:
        fail("(g) no activity model registers pair-parameter units -- the"
             " declaration this arm reads is gone")
    return named


def arm_g(witness_results):
    table = declared_pair_units()
    n = 0
    for src, j in witness_results:
        props = (src / "system/propsDict").read_text()
        tpp = (src / "constant/thermoPhysPropDict").read_text()
        mm = re.search(r"activityModel\s*\{\s*model\s+(\w+);", tpp)
        for op in j.get("operationResults", []):
            if op.get("type") != "fitParameters":
                continue
            blk = re.search(r"\bname\s+" + re.escape(op["name"]) +
                            r";(.*?)(?=\n\s*name\s+\w+;|\Z)", props, re.S)
            paths = re.findall(r"\{\s*path\s+(\S+);", blk.group(1)) if blk else []
            units = op.get("units") or {}
            for i, path in enumerate(paths):
                seg = path.split(".")
                if len(seg) < 3 or seg[-3] != "binaryParameters":
                    continue
                if not mm:
                    fail(f"(g) {src.name}: a pair parameter is fitted and the"
                         " gate cannot read the activity model it belongs to")
                want = table.get(mm.group(1), {}).get(seg[-1])
                got = units.get(f"fit.{i}.value")
                if got != want:
                    fail(f"(g) {src.name}/{op['name']}: fit.{i}.value ({path})"
                         f" is published in {got!r}; model {mm.group(1)}"
                         f" declares {want!r} for `{seg[-1]}`"
                         + ("" if want else " -- an undeclared key must publish"
                            " NO unit, never a guessed one"))
                if units.get(path) != want:
                    fail(f"(g) {src.name}/{op['name']}: the path-keyed readback"
                         f" {path} carries {units.get(path)!r}, not {want!r}")
                n += 1
    if n == 0:
        fail("(g) no witness fits a pair parameter -- the arm has no case")
    return n


def main():
    seen = set()
    n_ops = 0
    witness_results = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for rel in WITNESSES:
            src = ROOT / rel
            if not src.is_dir():
                fail(f"witness missing: {rel}")
            d, stdout, j = run_case(src, tmp)
            witness_results.append((src, j))

            published = {}
            for op in j.get("operationResults", []):
                cur = op.get("curation")
                if cur is None:
                    continue
                v = cur.get("verdict")
                if v not in VERDICTS:
                    fail(f"{src.name}/{op['name']}: verdict '{v}' is not one of"
                         f" the engine's five ({sorted(VERDICTS)})")
                published[op["name"]] = cur
                seen.add(v); n_ops += 1
                # (b) the criterion travels with the verdict
                if "acceptanceMaxAADPct" not in cur and v != "notClaimed":
                    fail(f"{src.name}/{op['name']}: verdict '{v}' published with"
                         " no acceptanceMaxAADPct -- a verdict without the band"
                         " it was judged against is a badge; where no band was"
                         " declared the key must SAY so, not be omitted")
            if not published:
                fail(f"{src.name}: no operation published a `curation` object")

            # (a) the sinks agree
            doss = dossier_verdicts(d)
            jsonv = sorted(published[k]["verdict"] for k in published)
            if doss and sorted(doss) != jsonv:
                fail(f"{src.name}: the curation dossier says {sorted(doss)} and"
                     f" the result JSON says {jsonv} -- the sinks disagree")
            for opname, cur in published.items():
                if not console_mentions(stdout, cur["verdict"]):
                    fail(f"{src.name}/{opname}: the result JSON publishes"
                         f" '{cur['verdict']}' and the CONSOLE mentions it"
                         " nowhere -- a reader watching the run would never"
                         " learn the verdict the machine channel carries")

            # (d) pinned
            g = golden_verdicts(src)
            if g is None:
                fail(f"{src.name}: no golden at all")
            for opname, cur in published.items():
                if opname not in g:
                    fail(f"{src.name}: op '{opname}' publishes verdict"
                         f" '{cur['verdict']}' and the golden pins no `verdict`"
                         " row for it -- published implies pinned")
                if g[opname] != cur["verdict"]:
                    fail(f"{src.name}/{opname}: golden pins '{g[opname]}',"
                         f" the run publishes '{cur['verdict']}'")

    # (c) both polarities
    for need in ("validated", "validationRefused"):
        if need not in seen:
            fail(f"no witness published '{need}' -- a gate that only ever sees"
                 " one polarity cannot notice the other going missing")

    # (e) every op that DECIDES a verdict must publish one
    deciders, publishers = set(), set()
    for f in (ROOT / "src" / "propertyOps").glob("*.cpp"):
        t = f.read_text()
        if "CurationDossier::verdictOf" in t:
            #  An op is its CLASS, not its file: a class may define its methods
            #  in several translation units (FitParameters' membrane residual,
            #  FitParametersMembrane.cpp, DEV.md 4c C149).  The class is read
            #  off the methods the file DEFINES (`int FitParameters::run...`);
            #  a file defining none falls back to its stem, as before.
            owners = set(re.findall(r"^\w[\w:<>,\s]*?\b([A-Z]\w*)::\w+\s*\(", t, re.M))
            owners.discard("CurationDossier")
            deciders |= owners if owners else {f.stem}
    for f in (ROOT / "src" / "propertyOps").glob("*.H"):
        if "curation() const override" in f.read_text():
            publishers.add(f.stem)
    deciders.discard("CurationDossier")          # the rule's own home
    missing = sorted(deciders - publishers)
    if missing:
        fail("these ops DECIDE a curation verdict and publish none to the"
             f" machine channel: {missing} -- add a `curation()` override,"
             " which is the whole defect this gate exists for")

    band_units = arm_f(witness_results)
    n_pair = arm_g(witness_results)

    print("check_fit_verdict_channel: OK -- %d fit operation(s) across %d"
          " witness(es) publish a curation verdict; for each one the RESULT JSON and"
          " the CURATION DOSSIER carry the SAME word, and the CONSOLE mentions"
          " it (mentions, not matches: the two op families print the verdict in"
          " two different shapes -- a `VERDICT` heading vs prose -- which is"
          " recorded in this gate rather than papered over);"
          " every verdict carries the band it was judged against (or"
          " states in words that none was declared); both polarities are"
          " exercised (%s); every published verdict is pinned by a `verdict`"
          " row in its case's golden; and all %d op(s) that call"
          " CurationDossier::verdictOf publish a `curation()` object, so an op"
          " that decides in silence fails here rather than going unnoticed."
          "  (f) every declared band is held to its statistic's unit (%s);"
          " a band in `points` against a relative statistic, a band with no"
          " unit word, the membrane band in `percent` against its points"
          " statistic, and a band on a statistic mixing rejection points and"
          " flux per cent each REFUSE by name, membrane24's band in `points`"
          " runs to its pinned verdict, and every op class that calls verdictOf calls"
          " requireBandInUnitOf.  (g) %d fitted pair parameter(s) publish"
          " exactly the unit their activity model's pairParameterUnits()"
          " declares (read from the model source), none where it declares"
          " none."
          "  NOT CHECKED: whether any verdict is RIGHT (the engine decides it"
          " from the case's own declared band -- this gate checks only that"
          " every sink reports the SAME one), and whether the GUI renders it"
          " (gui/tests owns that; no browser runs here)."
          % (n_ops, len(WITNESSES), ", ".join(sorted(seen)), len(deciders),
             "; ".join(sorted(band_units)), n_pair))

main()
