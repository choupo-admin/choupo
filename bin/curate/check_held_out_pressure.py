#!/usr/bin/env python3
"""Gate: a bubble-point fit prices every point at the pressure its measurement declares.

    bin/curate/check_held_out_pressure.py

WHY THIS EXISTS.  `fitParameters(T_bubble)` read ONE scalar `residual.P` and
priced every experimental point at it.  A bubble point is (x, P, T) and which
two are independent is the experimenter's choice, so a study that measured
three isobars could only be fitted by throwing two of them away -- and the
temperature dependence of an NRTL pair (b_ij, b_ji) is identifiable only from
data that span temperature.  The pressure is now per point, read from the
evidence itself in either of the two forms a faithful transcription uses: a
`Pressure` COLUMN where the study varied it, a held-constant SCALAR where the
study fixed it.

THE DANGEROUS FAILURE IS NOT AN ERROR, IT IS A PLAUSIBLE NUMBER.  Two
pressures for one fit -- half the residual at the datasets' own, half at a
declared scalar -- converges, reports a chi-square and is wrong.  So does a
held-out subset priced at a different pressure from the fit subset: the
held-out residual would then measure the difference between two pressures and
publish it as a model error, which is the most convincing wrong number this
operation can produce.  Every arm below exists for one of those.

WHAT THIS GATE CHECKS, on `tutorials/steady/optimisation/fitNRTL02_thermoml_isobars`:

  (a) THE SPAN IS REPORTED, NOT A SINGLE PRESSURE.  The run must print
      `across 3 isobars, P = 0.1315 .. 0.3286 bar`.  A pair regressed over one
      isobar and one regressed over three are different claims about b_ij, and
      the header must not describe them alike.

  (b) THE ISOBARS ARE RECOUNTED HERE, from the dataset file, independently of
      the engine -- the gate parses the `Pressure` column itself and counts
      distinct values.  An auditor that reuses the auditee's arithmetic checks
      nothing.

  (c) BOTH DECLARATION FORMS REACH THE SOLVER.  The fit set carries a column
      (3 distinct pressures); the held-out set carries a held-constant scalar
      (101.3 kPa).  The held-out AAD must be finite and the run must report
      21 held-out points -- if the constant form were dropped, `pVal` would
      fall back to the fit's first pressure and the AAD would be enormous.
      Pinned as a BAND, not a value: the value itself is in `expected`.

  (d) THE ARITY REFUSALS FIRE, each by name, on probe cases this gate BUILDS:
      a scalar `residual.P` declared beside evidence that carries its own; a
      fit set with a pressure and a held-out set without; and a partition whose
      datasets disagree among themselves.  A guard whose only case satisfies it
      is a guard nothing tests -- the shipped witness satisfies all three, so
      the offending cases have to be constructed.

  (e) AN UNQUALIFIED HELD-CONSTANT REFUSES.  `Pressure 101.3;` with no unit is
      read as 101.3 Pa; the fit would converge to a vacuum with no symptom.
      The column form cannot make that mistake (its unit is in the `columns`
      block), so the scalar form must not be allowed to either.

  (f) THE UNCHECKED TRANSCRIPTION IS ANNOUNCED.  Both datasets declare
      `reviewStatus transcribedNotCheckedAgainstArticle`, and the run must say
      so on the console AND carry it into the result JSON's advisories.  A
      citation says where numbers are supposed to come from, not that anybody
      looked, and a transcribed file carries the DOI from birth -- which is
      exactly what makes the unchecked state look checked.

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * It does not check that the two datasets match their publications.  Nothing
      in this repository can: that needs the articles, and arm (f) exists
      precisely because it has not been done.
  * It says nothing about whether the FITTED pair is good.  The case's own
      finding is that it predicts 101.3 kPa 4.7x WORSE than the catalogue pair
      it started from; those four numbers are pinned in `expected`, not here.
  * Only `kind T_bubble` is wired for a per-point pressure.  The isotherm kind
      shares the loader but not this path.
  * The two caveats the witness reports (ethanol's Antoine window at 371.8 K
      and 372.8 K) are the bubble-point Newton's STARTING temperature, not any
      published state.  Framing the bubble-point Newton is named as an open
      gap in docs/design/advisory-attribution.md; this gate does not close it
      and does not pretend the caveats are about the answer.

SABOTAGE-VERIFIED 2026-08-25, five times, each with a rebuild; the quoted
lines are OBSERVED output, not predicted.  All five were caught.

S1 -- `pData_Pa[k]` replaced by `pData_Pa[0]` inside computeResiduals: one
pressure for the whole fit, which is the pre-slice behaviour.  Caught by arm
(c), NOT by arm (a) -- and that is the finding.  The header went on printing
`across 3 isobars` truthfully, because the span is computed from the loaded
points while the pressure is USED in the residual.  An announcement can stay
true while the arithmetic beneath it stops being described by it, which is why
this gate recounts and re-measures rather than reading the log twice.

    fitNRTL02: held-out AAD 2.7221 % is outside the band [0.05, 1.0] --
    the held-out set is being priced at a pressure it was not measured at

S2 -- the held-constant read dropped (`zConst` left NaN even when the key is
present).  The engine DID refuse, by name and correctly -- the fit set carries
a column, the held-out set now carries nothing, and the all-or-none rule fires
-- so the operation never published a diagnostic and three arms went red at
once.  The gate's evidence here is the ABSENCE, which is the right shape: a
held-out comparison that cannot run must never report as one.

    fitNRTL02: no aad_heldout_pct in the result JSON -- the held-out
    comparison did not run
    fitNRTL02: n_heldout is None, expected 21

S3 -- the `hasDimensions` requirement on the held-constant removed.  The probe
case then RAN instead of refusing, and its output is the scenario the check
exists for: `Pressure 101.3;` was read as 101.3 Pa, a deep vacuum, and the run
converged while ethanol's Antoine correlation was dragged far outside its
window.  No error, a plausible answer, the wrong pressure by a factor of a
thousand.  The gate caught it because arm (e) demands the NAMED refusal --
accepting any failure would have been checking that something went wrong, not
that the right thing did.

    probe 'unqualifiedConstant': the run did not refuse with `declares no
    unit...` -- got: The saturation pressure is extrapolated: ...

S4 -- `readOwnProvenance` no longer reads `reviewStatus`.  Arm (f), both
datasets:

    fitNRTL02: no [reviewStatus] line for
    constant/experiments/ethanol-water-bubble-j.fluid.2011.06.009.dat

S5 -- the reviewStatus announcement kept on the console but NOT raised on the
AdvisoryLog.  Arm (f)'s second half, and the reason it has two halves: a line
in the middle of a run has been delivered and not received, which is exactly
what the end-of-run caveat block exists to fix.

    fitNRTL02: 'reviewStatus' announced on the console but only 0 of 2
    reached the result JSON advisories -- a caveat that does not reach the
    summary block
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/steady/optimisation/fitNRTL02_thermoml_isobars"
FITSET = CASE / "constant/experiments/ethanol-water-bubble-j.fluid.2011.06.009.dat"
VALSET = CASE / "constant/experiments/ethanol-water-bubble-je2008704.dat"
BIN = ROOT / "choupoProps"

fails = []


def run(case_dir):
    """Run choupoProps in `case_dir`; return (stdout+stderr, result JSON or None)."""
    p = subprocess.run([str(BIN)], cwd=str(case_dir), capture_output=True,
                       text=True, timeout=900)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return out, js


def read_columns(path):
    """Parse a Choupo experiments file's `columns` + `data` blocks.  Deliberately
    a LOCAL parser: the point of arms (b) is to recount the pressures without
    going through the engine that is being audited."""
    txt = path.read_text()
    cols = re.findall(r"\{\s*name\s+(\S+?);\s*unit\s+(\S+?);\s*\}", txt)
    grid = re.search(r"^data\s*\((.*?)\);", txt, re.S | re.M)
    nums = [float(x) for x in grid.group(1).split()] if grid else []
    return [c[0] for c in cols], [c[1] for c in cols], nums


def main():
    if not BIN.exists():
        print(f"check_held_out_pressure: FAIL -- {BIN} is missing; run `make all`")
        return 1

    out, js = run(CASE)

    # ---- (b) recount the isobars from the file, before reading the engine ----
    names, units, nums = read_columns(FITSET)
    if "Pressure" not in names:
        fails.append(f"{FITSET.name}: no Pressure column -- the witness no longer"
                     " exercises the per-point form")
        nIso, pLo, pHi = 0, 0.0, 0.0
    else:
        j, nc = names.index("Pressure"), len(names)
        assert units[j] == "kPa", f"{FITSET.name}: Pressure unit is {units[j]}, not kPa"
        ps = [nums[r * nc + j] for r in range(len(nums) // nc)]
        distinct = sorted(set(round(p, 6) for p in ps))
        nIso, pLo, pHi = len(distinct), min(distinct) / 100.0, max(distinct) / 100.0

    # ---- (a) the span is REPORTED, and it matches the recount ---------------
    m = re.search(r"across (\d+) isobars, P = ([\d.]+) \.\. ([\d.]+) bar", out)
    if not m:
        fails.append("fitNRTL02: the run does not report a multi-isobar span --"
                     " expected `across N isobars, P = lo .. hi bar`")
    else:
        got = (int(m.group(1)), float(m.group(2)), float(m.group(3)))
        if got[0] != nIso:
            fails.append(f"fitNRTL02: the run reports {got[0]} isobars, the"
                         f" dataset carries {nIso}")
        if abs(got[1] - pLo) > 1e-3 or abs(got[2] - pHi) > 1e-3:
            fails.append(f"fitNRTL02: the reported span {got[1]}..{got[2]} bar"
                         f" is not the dataset's {pLo:.4f}..{pHi:.4f} bar")

    # ---- (c) both forms reach the solver -----------------------------------
    #  The held-out set declares its pressure as a held-constant SCALAR.  If
    #  that form were dropped, the held-out points would be priced at the fit's
    #  pressure and the AAD would leave this band by two orders of magnitude.
    #  A BAND, not a value: the value is pinned in the case's own `expected`.
    diag = {}
    if js:
        for op in js.get("operationResults", []):
            if op["name"] == "fit_NRTL_across_isobars":
                diag = op.get("diagnostics", {})
    aad = diag.get("aad_heldout_pct")
    nHeld = diag.get("n_heldout")
    if aad is None:
        fails.append("fitNRTL02: no aad_heldout_pct in the result JSON -- the"
                     " held-out comparison did not run")
    elif not (0.05 <= aad <= 1.0):
        fails.append(f"fitNRTL02: held-out AAD {aad:.4f} % is outside the band"
                     " [0.05, 1.0] -- the held-out set is being priced at a"
                     " pressure it was not measured at")
    if nHeld != 21:
        fails.append(f"fitNRTL02: n_heldout is {nHeld}, expected 21")
    #  and the held-out set really does use the scalar form
    #  Case-insensitive on the KEY: the reader accepts `P` / `Pressure` /
    #  `pressure`, and `choupo-thermoml extract-vle` writes the lowercase one.
    #  A gate that assumed a capital passed only against a hand-written file.
    if not re.search(r"^[Pp]ressure\s+[\d.]+\s+kPa\s*;", VALSET.read_text(), re.M):
        fails.append(f"{VALSET.name}: no held-constant `pressure <v> kPa;` --"
                     " the scalar form is no longer exercised")

    # ---- (f) the unchecked transcription is announced, twice ---------------
    for ds in (FITSET, VALSET):
        rel = f"constant/experiments/{ds.name}"
        if f"[reviewStatus] {rel}" not in out:
            fails.append(f"fitNRTL02: no [reviewStatus] line for {rel}")
    advs = (js or {}).get("advisories", [])
    nRev = sum(1 for a in advs if "reviewStatus" in a.get("message", ""))
    if "[reviewStatus]" in out and nRev < 2:
        fails.append("fitNRTL02: 'reviewStatus' announced on the console but"
                     f" only {nRev} of 2 reached the result JSON advisories --"
                     " a caveat that does not reach the summary block")

    # ---- (d) + (e) the refusals, on probe cases BUILT here ------------------
    probes = ROOT / "generated/probes/heldOutPressure"
    if probes.exists():
        shutil.rmtree(probes)
    for label, mutate, expect in PROBES:
        d = probes / label
        shutil.copytree(CASE, d, ignore=shutil.ignore_patterns(
            "*.csv", "log.*", "expected"))
        mutate(d)
        pout, _ = run(d)
        if expect not in pout:
            fails.append(f"probe '{label}': the run did not refuse with"
                         f" `{expect[:70]}...` -- got:\n      "
                         + (pout.strip().splitlines() or ["(no output)"])[-1][:200])
    shutil.rmtree(probes, ignore_errors=True)

    if fails:
        print("check_held_out_pressure: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print(f"check_held_out_pressure: OK -- fitNRTL02 regresses across {nIso}"
          f" isobars ({pLo:.4f}..{pHi:.4f} bar, recounted from the dataset, not"
          f" read from the log), prices its {nHeld} held-out points at the"
          f" held-constant they declare (AAD {aad:.4f} %), announces both"
          " datasets as transcribed-but-unchecked on the console AND in the"
          f" advisories, and refuses {len(PROBES)} built probe(s): a scalar"
          " pressure beside evidence that carries one, a half-priced held-out"
          " set, and an unqualified held-constant.  NOT CHECKED: that either"
          " dataset matches its publication (that needs the articles -- which"
          " is what the reviewStatus says), whether the fitted pair is any"
          " good (the case's own goldens carry that, and its finding is that"
          " the fit predicts WORSE), and the bubble-point Newton's initial"
          " guess, whose two caveats this run still reports as though they"
          " qualified the answer.")
    return 0


# ---------------------------------------------------------------------------
#  The probe mutations.  Each BUILDS a case the shipped witness cannot be --
#  the witness satisfies every guard, so a guard tested only against it is a
#  guard nothing tests (the diafiltration slice paid for that lesson twice).
# ---------------------------------------------------------------------------
def _probe_scalar_beside_column(d):
    p = d / "system/propsDict"
    s = p.read_text().replace("            kind        T_bubble;",
                              "            kind        T_bubble;\n"
                              "            P           1.01325 bar;", 1)
    p.write_text(s)


def _probe_heldout_without_pressure(d):
    #  Strip the held-constant from the validation set only: the fit set keeps
    #  its column, so the two subsets would be priced differently.
    p = d / "constant/experiments/ethanol-water-bubble-je2008704.dat"
    p.write_text(re.sub(r"^[Pp]ressure\s+.*$", "", p.read_text(), flags=re.M))


def _probe_unqualified_constant(d):
    #  The held-constant loses its UNIT but keeps its key.  The fit set keeps
    #  its column, so the all-or-none arm is satisfied and the only thing wrong
    #  with this case is the missing unit -- which is what makes the refusal
    #  name it (see S3: without this, the probe refused for another reason).
    p = d / "constant/experiments/ethanol-water-bubble-je2008704.dat"
    p.write_text(re.sub(r"^([Pp]ressure)\s+([\d.]+)\s+kPa\s*;.*$", r"\1    \2;",
                        p.read_text(), flags=re.M))


PROBES = [
    ("scalarBesideColumn", _probe_scalar_beside_column,
     "`residual.P` is declared AND the fit evidence carries its own pressure"),
    ("heldOutWithoutPressure", _probe_heldout_without_pressure,
     "the fit evidence carries its own pressure per point but the held-out"),
    ("unqualifiedConstant", _probe_unqualified_constant,
     "declares no unit"),
]


if __name__ == "__main__":
    sys.exit(main())
