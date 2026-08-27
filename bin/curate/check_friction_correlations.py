#!/usr/bin/env python3
"""Gate: the friction-factor family states its windows, cites its sources, and proves itself.

    bin/curate/check_friction_correlations.py

WHY THIS EXISTS.  Choupo computed Blasius, Colebrook-White, Haaland and
Churchill for as long as the pipe unit has existed -- correctly, with their
citations in comments, as free functions nobody outside `Pipe.cpp` could
reach.  A student could not name one, could not evaluate it without building
a pipe around it, could not see where each stops being valid, and had no way
to learn that THEY DISAGREE.

`HeatTransferCorrelation` had solved all of that for Nusselt years earlier: a
declared validity window, a `verify()` pinned to a published anchor, and a
bench that runs every registered correlation and prints the deviation WITH
its source.  This slice applies that pattern to a second family.  The gate
pins the properties that make it worth having, not merely that it compiles.

WHAT THIS GATE CHECKS, on `tutorials/props/hydraulics/moody01_friction_correlations`:

  (a) EVERY REGISTERED CORRELATION VERIFIES.  All four reproduce their own
      anchor within the declared tolerance, and the run prints each one's
      window AND its primary citation.  A correlation whose source is a
      comment is one the reader cannot check.

  (b) THE ANCHORS ARE OF DIFFERENT KINDS, and the run says which is which.
      Blasius is checked against its own closed form -- ARITHMETIC, not
      physics, and the output must say so rather than let a 0.000 % deviation
      read as a validation.  Churchill is checked against the EXACT laminar
      law it contains as its own limit, which is the strongest of the four.

  (c) THE TWO SPREADS ARE REPORTED APART.  At the witness point the four
      answers span 25.7 %, and the three inside their windows span 1.7 %.
      Collapsing those into one headline would say "the correlations disagree
      by 26 %" when the truth is "three agree within 2 % and one was asked a
      question it was never fitted for".  Both numbers are recomputed HERE
      from the published per-correlation values, not read from the log.

  (d) BLASIUS IS FLAGGED OUT OF WINDOW at a rough-pipe point, with a note
      that names the reason (no roughness term).  This is the arm that makes
      the window mean something: the correlation still ANSWERS, confidently
      and wrongly, and only the note stands between that answer and a reader.

  (e) THE UNIT OP READS THE SAME OBJECTS.  `Pipe.cpp` must contain no
      private friction-factor arithmetic -- the free functions are gone and
      both of its call sites (single-phase and the two-phase lambda) go
      through the factory.  Checked by SOURCE INSPECTION, because the whole
      point is that there is no second home for the decision.

  (f) THE PIPE'S NUMBERS DID NOT MOVE.  A refactor that moves an answer is
      not a refactor; the three hydraulics goldens carry that arm in the main
      suite and this gate re-asserts the KPI of pipe01 directly.

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * It does not establish that any correlation is RIGHT.  Two of the four
      anchors are self-consistency checks by construction (Blasius against
      its own formula; Churchill against the laminar limit it was built to
      contain), and Haaland's is agreement with Colebrook -- which is the
      claim Haaland published, and not an independent measurement.  Only
      Colebrook's fully-rough limit tests an iteration against a closed form.
      NONE of the four is checked against experimental data; the corpus holds
      no friction measurements at all.
  * It says nothing about the transition band (2300 < Re < 4000), where the
      physics is not single-valued and no correlation was regressed.
  * Ergun (packed beds) and the two-phase multipliers are NOT part of this
      family yet; they remain unit-op-private.

SABOTAGE-VERIFIED 2026-08-25, four times; the quoted lines are OBSERVED.

S1 -- Churchill's `(8/Re)^12` exponent changed to 11.  The turbulent branch
still looked entirely plausible; the LAMINAR anchor caught it, which is why
that anchor was chosen:

    moody: Churchill deviates 12.4787 % from its anchor (tolerance 3.00 %)

S2 -- Blasius's out-of-window flag suppressed (inValidity forced true at
eps/D > 0).  Arm (d), and arm (c) went with it: with nothing outside the
window the two spreads collapse to one number, which is exactly the
conflation this bench exists to prevent.

    moody: Blasius is NOT flagged outside its window at eps/D = 1e-3
    moody: n_outside_window is 0, expected 1

S3 -- the citation dropped from the bench output (window kept).  A window
with no source is half a claim: the reader can see where it stops being
valid but not who said so.

    moody: no citation printed for Colebrook

S4 -- `Pipe.cpp` given back a private `f_churchill` free function while the
factory call stayed.  The goldens did NOT move (both computed the same
thing), so the corpus was silent; arm (e) caught it by reading the source,
which is the only thing that can see a second home that happens to agree.

    Pipe.cpp defines its own friction arithmetic (f_churchill) -- the
    decision has two homes again

AND A DEFECT IN THIS GATE, found by running those four.  Three of the
sabotages ALSO reported "pipe01_water_line no longer reproduces its golden"
while touching nothing the pipe computes -- S3 changed only a printed line.
The cause was arm (f): `bin/runTests` REFUSES outright while a destructive
session's journal is open, so it never printed a PASS line, and the arm read
that absence as a moved answer.

A check that cannot run must not pass -- and must not fail with a FALSE
REASON either.  Diagnosing a cause the evidence does not establish is worse
than reporting nothing, because it sends the next reader to the wrong file.
Arm (f) now distinguishes the two and says which one it is.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtests_verdict import verdict  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/hydraulics/moody01_friction_correlations"
PIPE = ROOT / "src/unitOperations/hydraulics/Pipe.cpp"
BIN = ROOT / "choupoProps"

MODELS = ["Blasius", "Churchill", "Colebrook", "Haaland"]
fails = []


def main():
    if not BIN.exists():
        print(f"check_friction_correlations: FAIL -- {BIN} missing; run `make all`")
        return 1

    p = subprocess.run([str(BIN)], cwd=str(CASE), capture_output=True,
                       text=True, timeout=300)
    out = p.stdout + p.stderr
    if p.returncode != 0:
        print("check_friction_correlations: FAIL -- the witness case exited "
              f"{p.returncode}\n{out[-800:]}")
        return 1

    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    diag = {}
    for op in (js or {}).get("operationResults", []):
        if op["name"] == "moody":
            diag = op.get("diagnostics", {})

    # ---- (a) every correlation verifies, with window AND citation --------
    for name in MODELS:
        if f"dev_{name}" not in diag:
            fails.append(f"{name} is not registered -- the family lost a member")
            continue
        if diag[f"dev_{name}"] > 0.03:
            fails.append(f"{name} deviates {100*diag[f'dev_{name}']:.4f} % from "
                         "its anchor (tolerance 3.00 %)")
    if "window:" not in out:
        fails.append("no validity window printed for any correlation")
    for name in MODELS:
        #  the citation line must name a year, which is the cheapest proof
        #  that a SOURCE was printed rather than a restatement of the formula
        blk = out.split(name, 1)[-1][:900] if name in out else ""
        if "source:" not in blk or not re.search(r"\(1[89]\d\d\)|\(20\d\d\)", blk):
            fails.append(f"no citation printed for {name}")

    # ---- (b) the anchors say what kind of check they are -----------------
    if "checks the ARITHMETIC, not the physics" not in out:
        fails.append("Blasius's anchor does not admit that it checks the "
                     "arithmetic rather than the physics -- a 0.000 % "
                     "deviation would then read as a validation")
    if "EXACT laminar law" not in out:
        fails.append("Churchill's anchor no longer names the laminar limit it "
                     "must reproduce")

    # ---- (c) the two spreads, RECOMPUTED here ---------------------------
    fs = {n: diag.get(f"f_{n}") for n in MODELS}
    if any(v is None for v in fs.values()):
        fails.append("the comparison did not publish a value for every model")
    else:
        allv = list(fs.values())
        spread = 100.0 * (max(allv) - min(allv)) / min(allv)
        #  Blasius is the one out of window at this point; the in-window set
        #  is the other three.  Named explicitly rather than read from the
        #  engine's own flag -- an auditor that reuses the auditee's
        #  classification checks nothing.
        inw = [fs[n] for n in MODELS if n != "Blasius"]
        wspread = 100.0 * (max(inw) - min(inw)) / min(inw)
        for label, mine, theirs in (("spread_pct", spread, diag.get("spread_pct")),
                                    ("spread_inWindow_pct", wspread,
                                     diag.get("spread_inWindow_pct"))):
            if theirs is None:
                fails.append(f"{label} is not published")
            elif abs(mine - theirs) > 1e-3:
                fails.append(f"{label}: the run says {theirs:.4f} %, a "
                             f"recount of its own values gives {mine:.4f} %")
        if spread - wspread < 10.0:
            fails.append(f"the two spreads ({spread:.2f} % vs {wspread:.2f} %) "
                         "no longer differ enough for the witness to make its "
                         "point -- the comparison point stopped exercising a "
                         "window")

    # ---- (d) Blasius flagged, with the reason ---------------------------
    if diag.get("n_outside_window") != 1:
        fails.append(f"n_outside_window is {diag.get('n_outside_window')}, "
                     "expected 1")
    if "OUTSIDE ITS WINDOW" not in out:
        fails.append("Blasius is NOT flagged outside its window at "
                     "eps/D = 1e-3")
    if "no roughness term" not in out.lower():
        fails.append("the out-of-window note does not name the REASON (that "
                     "Blasius carries no roughness term)")

    # ---- (e) the unit op keeps no private arithmetic --------------------
    src = PIPE.read_text()
    for dead in ("f_churchill", "f_haaland", "f_colebrook", "f_laminar"):
        if re.search(r"^\s*scalar\s+" + dead + r"\s*\(", src, re.M):
            fails.append(f"Pipe.cpp defines its own friction arithmetic "
                         f"({dead}) -- the decision has two homes again")
    if src.count("FrictionFactorCorrelation::New") < 2:
        fails.append("Pipe.cpp reaches the factory fewer than twice -- it has "
                     "two call sites (single-phase and the two-phase lambda) "
                     "and both must go through it")

    # ---- (f) the pipe's own answer is unmoved ---------------------------
    #
    #  A CHECK THAT CANNOT RUN MUST NOT PASS -- AND MUST NOT FAIL WITH A
    #  FALSE REASON EITHER.  Found by this gate's own sabotage run: three of
    #  four sabotages reported "pipe01's golden moved" while touching nothing
    #  the pipe computes.  `bin/runTests` REFUSES outright while a destructive
    #  session's journal is open (and aborts on a stale build), so it never
    #  printed a PASS line -- and the arm read that absence as a moved answer.
    #  Diagnosing a cause the evidence does not establish is worse than
    #  reporting nothing: it sends the next reader to the wrong file.
    #  THE VERDICT QUESTION HAS ONE HOME (runtests_verdict, 2026-08-27).  The
    #  list of "declined" phrases below used to live here, and it was a list
    #  of the reasons ALREADY SEEN -- so a NEW way for the harness to produce
    #  no verdict read as a moved answer again.  It did, on 2026-08-27, when
    #  bin/runTests was edited while running.  The claim is positive now.
    pipe = ROOT / "tutorials/steady/hydraulics/pipe01_water_line"
    state, _rout, reason = verdict(pipe)
    if state == "could-not-run":
        fails.append("the pipe-golden arm COULD NOT RUN.  This is NOT a "
                     "statement about pipe01's answer, and the arm refuses to "
                     "make one: " + reason)
    elif state == "fail":
        fails.append("pipe01_water_line no longer reproduces its golden -- a "
                     "refactor that moves an answer is not a refactor")

    if fails:
        print("check_friction_correlations: FAIL")
        for f in fails:
            print("  - moody: " + f if not f.startswith(("Pipe.cpp", "pipe01"))
                  else "  - " + f)
        return 1

    print(f"check_friction_correlations: OK -- all {len(MODELS)} correlations "
          "verify against their own anchors and print BOTH their validity "
          "window and a dated primary citation; the two spreads "
          f"({diag['spread_pct']:.2f} % over all four, "
          f"{diag['spread_inWindow_pct']:.2f} % over the three inside their "
          "windows) are recomputed here from the published values rather than "
          "read from the log; Blasius is flagged out of window at eps/D = 1e-3 "
          "with the reason named; Pipe.cpp keeps NO private friction "
          "arithmetic and reaches the factory at both call sites; pipe01's "
          "golden is unmoved.  NOT CHECKED: that any correlation is RIGHT -- "
          "two anchors are self-consistency by construction and Haaland's is "
          "agreement with Colebrook, which is the claim he published, not an "
          "independent measurement; the corpus holds no friction data at all. "
          " Also not covered: the transition band, and Ergun/two-phase "
          "multipliers, which are still unit-op-private.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
