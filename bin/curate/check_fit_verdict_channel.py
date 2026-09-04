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
"""
import json, re, shutil, subprocess, sys, tempfile
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

def main():
    seen = set()
    n_ops = 0
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for rel in WITNESSES:
            src = ROOT / rel
            if not src.is_dir():
                fail(f"witness missing: {rel}")
            d, stdout, j = run_case(src, tmp)

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
        if "CurationDossier::verdictOf" in f.read_text():
            deciders.add(f.stem)
    for f in (ROOT / "src" / "propertyOps").glob("*.H"):
        if "curation() const override" in f.read_text():
            publishers.add(f.stem)
    deciders.discard("CurationDossier")          # the rule's own home
    missing = sorted(deciders - publishers)
    if missing:
        fail("these ops DECIDE a curation verdict and publish none to the"
             f" machine channel: {missing} -- add a `curation()` override,"
             " which is the whole defect this gate exists for")

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
          "  NOT CHECKED: whether any verdict is RIGHT (the engine decides it"
          " from the case's own declared band -- this gate checks only that"
          " every sink reports the SAME one), and whether the GUI renders it"
          " (gui/tests owns that; no browser runs here)."
          % (n_ops, len(WITNESSES), ", ".join(sorted(seen)), len(deciders)))

main()
