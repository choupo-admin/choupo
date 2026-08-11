#!/usr/bin/env python3
"""Gate: the two claims stay apart, in the RUN and in the dossier.

    bin/curate/check_claim_separation.py

WHY THIS EXISTS.  "The model fits the data it saw" and "the fitted model
predicted evidence it never saw" are different scientific statements.  Until
2026-08-11 `fitParameters` printed only the first, unlabelled, and a student
reading `Final chi2` had no way to know it was in-sample.  The fix separated
them physically; this gate stops a later edit from quietly joining them back
up.

IT RUNS THE WITNESS.  Every arm below is asserted against the real output of
`curate02_vle_heldout_ethanol_water` and its dossier -- not against the source
text.  A gate that greps the C++ for four headings would pass a build in which
the headings print the wrong numbers, which is the failure that matters.

WHAT THIS GATE CHECKS.

  A1  THE FIT NUMBER IS LABELLED IN-SAMPLE.  The FIT QUALITY section states
      chi2 and carries the [IN-SAMPLE] qualification.  Dropping the label is
      the cheapest way to re-create the original defect.

  A2  THE HELD-OUT SECTION IS DISTINCT AND POPULATED.  It names the dataset,
      the number of points, and a held-out metric -- and its number is NOT the
      fit's chi-square, which is what "presenting fit quality as held-out
      quality" would look like.

  A3  THE ACCEPTANCE CRITERION CARRIES ITS ORIGIN.  A threshold with no stated
      provenance cannot be told apart from one chosen after the residuals were
      seen.  (The refusal itself is EvidencePartition's; this arm checks that
      the origin actually reaches the reader.)

  A4  THE VERDICT IS ONE OF THE ENGINE'S FIVE.  Not a sixth word invented at
      the print site.  The list is read from CurationDossier.cpp rather than
      transcribed here -- check_verdict_parity owns the C++/TS correspondence,
      and duplicating the five names in a third place would be the arity sin
      this campaign keeps paying for.

  A5  notValidated IS NOT COLLAPSED INTO validationRefused.  Sabotaged
      directly: the acceptance band is tightened far below the observed
      held-out AAD, and the run must report a COMPLETED test that missed its
      criterion -- never a refusal.  A failed experiment and a test that could
      not be performed are different findings.

  A6  THE LEGACY INLINE PATH ACQUIRES NO HELD-OUT LANGUAGE.  fitNRTL01 uses
      `residual.data ( )` and must say that no held-out evidence was declared,
      without printing an acceptance criterion or a verdict.

  A7  THE DOSSIER CARRIES THE SAME SEPARATION.  Its metrics block distinguishes
      the in-sample and held-out entries, records the band WITH its origin, and
      states each dataset's provenance -- so a reader months later can tell a
      structural fixture from an experiment.

WHAT THIS GATE DOES NOT CHECK.  It does not verify that any number is
physically right, and it exercises ONE witness: a second fitting operation
added later is uncovered until it is listed here.  Stated because a gate that
implies more coverage than it has is worse than one that reports less.

Exit 1 listing the failing arm."""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
CASE = ROOT / "tutorials/props/curation/curate02_vle_heldout_ethanol_water"
LEGACY = ROOT / "tutorials/steady/optimisation/fitNRTL01_ethanol_water"
DOSSIER_CPP = ROOT / "src/propertyOps/CurationDossier.cpp"


def run(case: pathlib.Path):
    p = subprocess.run([str(PROPS), "."], cwd=case, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def section(out: str, title: str) -> str:
    """The lines under a heading, up to the next blank-line-separated heading."""
    m = re.search(rf"^\s*{title}\n((?:\s{{4}}.*\n)+)", out, re.M)
    return m.group(1) if m else ""


def engine_verdicts() -> set:
    """The five, read from verdictOf -- never transcribed into this file."""
    m = re.search(r"verdictOf\s*\([^)]*\)[^{]*\{(.*?)\n\}", DOSSIER_CPP.read_text(), re.S)
    if not m:
        return set()
    return set(re.findall(r'"([A-Za-z]+)"', re.sub(r"//[^\n]*", "", m.group(1))))


def main() -> int:
    fails = []

    verdicts = engine_verdicts()
    if not verdicts:
        fails.append("could not harvest the verdicts from verdictOf() -- this "
                     "gate is blind rather than satisfied")

    rc, out = run(CASE)
    if rc != 0:
        print("check_claim_separation: FAILED")
        print(f"  the witness {CASE.name} exited {rc}; no arm below could run")
        return 1

    # -- A1 --------------------------------------------------------------
    fit = section(out, "FIT QUALITY")
    if "chi2" not in fit:
        fails.append("A1 FIT QUALITY does not report chi2")
    if "IN-SAMPLE" not in fit:
        fails.append("A1 the fit chi2 is NOT labelled IN-SAMPLE -- a reader "
                     "cannot tell it from a held-out number")

    # -- A2 --------------------------------------------------------------
    held = section(out, "HELD-OUT EVIDENCE")
    for want in ("dataset", "points", "AAD"):
        if want not in held:
            fails.append(f"A2 HELD-OUT EVIDENCE states no {want}")
    #  COMPARED AS NUMBERS, NOT AS TEXT.  The first version compared the two
    #  formatted strings and was blind: chi2 prints scientific (8.09699e-01)
    #  while the held-out slot prints fixed (0.8097), so substituting one for
    #  the other changed every character and the arm saw two different values.
    #  A gate that compares renderings tests the formatter, not the claim.
    m_chi = re.search(r"chi2\s+([0-9.eE+-]+)", fit)
    m_aad = re.search(r"AAD\s+([0-9.eE+-]+)", held)
    if m_chi and m_aad:
        try:
            a, b = float(m_chi.group(1)), float(m_aad.group(1))
            if abs(a - b) <= 1.0e-4 * max(abs(a), abs(b), 1.0e-30):
                fails.append("A2 the held-out metric equals the fit "
                             f"chi-square ({a:g}) -- fit quality is being "
                             "presented as held-out quality")
        except ValueError:
            fails.append("A2 could not read the two metrics as numbers -- the "
                         "arm cannot run and must not pass")

    # -- A3 --------------------------------------------------------------
    acc = section(out, "ACCEPTANCE CRITERION")
    if "maxAAD" not in acc:
        fails.append("A3 ACCEPTANCE CRITERION states no threshold")
    if "origin" not in acc:
        fails.append("A3 the acceptance band reaches the reader WITHOUT its "
                     "origin -- a limit with no provenance cannot be told "
                     "apart from one chosen after the residuals")

    # -- A4 --------------------------------------------------------------
    verdict_block = section(out, "VERDICT")
    said = verdict_block.strip().split("\n")[0].strip() if verdict_block else ""
    if said not in verdicts:
        fails.append(f"A4 the run reports verdict {said!r}, which is not one of "
                     f"the engine's {sorted(verdicts)}")

    # -- A5: a MISSED criterion is not a refusal --------------------------
    with tempfile.TemporaryDirectory() as td:
        d = pathlib.Path(td) / "probe"
        shutil.copytree(CASE, d)
        pd = d / "system/propsDict"
        body = pd.read_text().replace("maxAAD  0.1 percent;",
                                      "maxAAD  0.000001 percent;", 1)
        pd.write_text(body)
        rc_s, out_s = run(d)
        vb = section(out_s, "VERDICT").strip().split("\n")[0].strip() \
            if section(out_s, "VERDICT") else ""
        if vb != "notValidated":
            fails.append(f"A5 an unreachable band produced verdict {vb!r}; a "
                         f"held-out test that MISSED its criterion is a "
                         f"completed experiment and must report notValidated")
        #  Scoped to the VERDICT section, not the whole run: curate02's own
        #  controlDict description once carried the words "VALIDATION REFUSED"
        #  (copied from curate01) and tripped this arm -- a false positive that
        #  found a real defect in the case, but would have been a permanent
        #  nuisance here.  A claim is made in the verdict, not in prose.
        if "VALIDATION REFUSED" in section(out_s, "VERDICT").upper():
            fails.append("A5 a MISSED criterion was reported as VALIDATION "
                         "REFUSED -- a failed test and a test that could not "
                         "be performed are different findings")

    # -- A6: the legacy inline path stays quiet ---------------------------
    #  Probed at RAISED verbosity.  fitNRTL01 ships `verbosity 1`, which
    #  silences the whole reporting block -- so testing it as shipped would
    #  assert nothing while looking like coverage.  The invariant is not "the
    #  legacy path is silent"; it is "when the legacy path SPEAKS, it claims
    #  no held-out validation".
    with tempfile.TemporaryDirectory() as td:
        dl = pathlib.Path(td) / "legacy"
        shutil.copytree(LEGACY, dl)
        cd = dl / "system/controlDict"
        cd.write_text(re.sub(r"verbosity\s+\d+;", "verbosity 3;", cd.read_text(), count=1))
        rc_l, out_l = run(dl)
    if rc_l != 0:
        fails.append(f"A6 the legacy witness exited {rc_l}")
    else:
        lheld = section(out_l, "HELD-OUT EVIDENCE")
        if "none declared" not in lheld:
            fails.append("A6 the legacy `residual.data ( )` path does not say "
                         "that no held-out evidence was declared")
        if section(out_l, "ACCEPTANCE CRITERION") or section(out_l, "VERDICT"):
            fails.append("A6 the legacy inline path printed an acceptance "
                         "criterion or a verdict -- it fitted every point and "
                         "may claim neither")

    # -- A7: the dossier keeps the separation -----------------------------
    doss = sorted((CASE / "curation").glob("*.dossier"))
    if not doss:
        fails.append("A7 the witness wrote no dossier")
    else:
        text = doss[0].read_text()
        if "aadHeldOutPct" not in text:
            fails.append("A7 the dossier records no held-out metric")
        if "acceptanceOrigin" not in text:
            fails.append("A7 the dossier records the band without its origin")
        if "provenance" not in text:
            fails.append("A7 the dossier does not state each dataset's "
                         "provenance -- a structural fixture and an experiment "
                         "would read alike months later")
        if not re.search(r"verdict\s+(" + "|".join(sorted(verdicts)) + r")", text):
            fails.append("A7 the dossier's verdict is not one of the engine's")

    if fails:
        print("check_claim_separation: FAILED")
        for f in fails:
            print("  - " + f)
        return 1

    print(f"check_claim_separation: OK -- on {CASE.name} the fit chi-square is "
          f"reported IN-SAMPLE, the held-out metric is a DIFFERENT number over "
          f"named datasets, the acceptance band reaches the reader with its "
          f"origin, and the verdict is one of the engine's "
          f"{len(verdicts)}; an unreachable band reports notValidated (a "
          f"completed test that missed its criterion) and NOT a refusal; the "
          f"legacy inline path claims neither a criterion nor a verdict; and "
          f"the dossier carries the same separation plus each dataset's "
          f"provenance.  NOT COVERED: whether any number is physically right, "
          f"and any fitting operation other than this one witness.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
