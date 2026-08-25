#!/usr/bin/env python3
"""Gate: an advisory says WHICH STATE it is about -- the answer, or the path.

    bin/curate/check_advisory_attribution.py

WHY THIS EXISTS.  `core/AdvisorySummary.H` was built because a warning a
thousand lines above the answer has been delivered and not received.  It
worked, and then the reactive path reintroduced the same failure from the
other side: not too few announcements, too many.

An iterative solver WALKS.  It evaluates the physics at compositions it
invented, reads the residual, and throws nearly all of them away.  On an
electrolyte feed most of those states are out of Davies' band, so most of
them raise a caveat -- and until 2026-08-24 nothing distinguished a caveat
about a discarded trial from a caveat about the published answer.

`column13_sour_water_stage_identity` announced 103 advisories.  Ninety-five
of them described compositions that appear nowhere in its answer, including
ionic strengths of 8.01, 7.93 and 6.77 mol/kg -- states no sour water is in.
The eight that DO qualify published numbers were among them, indistinguishable
and unread.  Ninety-nine near-identical sentences are read by nobody, so the
block's own failure mode had returned by a different road.

THE FIX IS A STAMP, NOT A FILTER.  `AdvisoryLog` stamps every advisory with
the innermost open `AdvisoryFrame` and whether any open frame declared itself
a search (`core/Advisory.H`).  The default is `accepted`: a site that says
nothing keeps exactly its old behaviour, so nothing is silently demoted by a
mechanism nobody opted into.  Three solvers opt in, and the deepest of them
-- `ReactiveVLE`'s outer Newton -- is where the reactive path's advisories
are actually born, so one frame there serves every caller that reaches it.

WHAT THIS GATE CHECKS.

  (a) THE FLOOD IS GONE, and by the mechanism claimed.  column13's caveat
      block carries a small number of `accepted` advisories and a much
      larger `trial` count, and the trial count is attributed to named
      frames.  A bound is asserted in BOTH directions (see (b)).

  (b) THE ANSWER STILL SPEAKS -- the arm that matters most.  The dangerous
      failure of this design is not the flood, which is merely unreadable;
      it is OVER-DEMOTION, which is silence wearing the fix's clothes.  If
      the frame stayed open across the converged re-evaluation, every true
      caveat would be filed under "the solver's path" and the block would
      report nothing about the answer -- quieter than before, and wrong.
      So this gate requires column13 to keep announcing that its published
      speciation blocks sit beyond Davies' trust range, and requires the
      accepted count to be NON-ZERO.

  (c) BOTH BANDS ARE REAL, not an artefact of one case.  A molecular case
      that opens no frame must print its caveats exactly as before, with
      NO "THE SOLVER'S PATH" section at all.  Without this arm the gate
      would pass just as happily if every advisory in the corpus were
      demoted.

  (d) STATUS ONLY MOVES TOWARD THE ANSWER.  The same sentence is usually
      raised first by some trial and only later at the answer.  If dedup
      simply suppressed the second, the entry would keep the status of
      whichever evaluation happened to run first -- iteration order deciding
      truth.  Checked directly against the sink's promotion rule, in
      isolation, by compiling and running the header.

  (e) EVERY ADVISORY IN THE RESULT JSON CARRIES A `status`.  A reader must
      never have to infer "accepted" from a missing key.

  (f) THE FRAMES ARE NAMED WHERE THEY ARE OPENED, one home each, and the
      close sits BELOW the last search -- checked textually, because the
      first draft of the column's frame closed between its two Newtons and
      left the second one's ~96 discarded states marked `accepted`.  That
      is the defect wearing the fix's clothes, and it passed every runtime
      arm this gate had at the time.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.

  * It does not check that the RIGHT solvers are framed.  Three are, named
    below; every other iterative solver in the engine (the recycle Wegstein,
    the Gibbs multi-start, the MESH's Wang-Henke sweep, the batch and ctrl
    integrators) still reports its path as though it were its answer.  That
    is a known, deliberate boundary of this slice and not a claim of
    completeness.
  * It does not check that a `trial` advisory is genuinely uninteresting.
    They ride in full in the result JSON precisely because this gate cannot
    make that judgement and neither can the engine.
  * It says NOTHING about the DATA RACE the same commit closed.  The sink
    is written from `newtonND`'s parallel finite-difference Jacobian, and
    an unguarded `push_back` from N threads is undefined behaviour.  It did
    not manifest in 18 consecutive runs of column13 on a two-thread box --
    identical count, identical order -- which is evidence about that machine
    and not about the contract.  A mutex now guards it; no test here can
    demonstrate the absence of UB, so none is claimed.

SABOTAGE-VERIFIED 2026-08-24, five times; OBSERVED output recorded below,
verbatim -- not what was predicted, which was wrong twice.

Sabotage 1 -- `walk.close()` in ReactiveVLE commented out, so the frame stays
open across the JOINT acceptance and the converged re-evaluation is filed as
a trial:

    check_advisory_attribution: OK -- ...

    IT SURVIVED, and that is the most useful result in this list.  The
    prediction was that arm (b) would fire.  It did not, because on column13
    every ACCEPTED advisory arrives by a path that opens no frame at all --
    the post-solve pass in `Flowsheet::solve` that speciates each converged
    stream as a liquid.  Measured directly: with and without the close, the
    tally is byte-identical (12 accepted, 5 + 3 + 87 trial, same frames).
    So the close is TODAY INERT on the corpus.  It stays (see the comment at
    its site: without it, whether the reader is told anything about the
    answer would depend on an unrelated pass in another subsystem continuing
    to exist), and this gate does not pretend to demonstrate it.  Arm (b) is
    instead proven by sabotage 5, which attacks the mechanism rather than
    one caller.

Sabotage 2 -- the ReactiveVLE frame declares itself NOT a search
(`AdvisoryFrame walk("...", false)`):

    check_advisory_attribution: FAILED
      column13_sour_water_stage_identity: 68 advisory(ies) reported as being about the ANSWER, expected at most 30 -- the path is being reported as the result

Sabotage 3 -- the promotion branch removed from `AdvisoryLog::add`:

    check_advisory_attribution: FAILED
      an advisory first raised inside a search and later raised at the answer stayed `trial` -- iteration order decided whether a caveat is about the result

Sabotage 4 -- the result JSON stops carrying `status`:

    check_advisory_attribution: FAILED
      column13_sour_water_stage_identity: an advisory in the result JSON carries no `status` -- a reader would have to infer it from a missing key
      flash01_benzene_toluene: an advisory in the result JSON carries no `status` -- a reader would have to infer it from a missing key

Sabotage 5 -- `bool trial = true;` unconditionally in the sink, i.e. EVERY
advisory demoted.  This is the over-demotion failure in its pure form: the
block goes quieter than it was before any of this existed, and says nothing
about the answer.

    check_advisory_attribution: FAILED
      column13_sour_water_stage_identity: NOTHING is reported about the answer -- every advisory was filed under the solver's path.  A frame left open across the converged re-evaluation silences the true caveats; that is quieter than the flood and wrong
      column13_sour_water_stage_identity: its published speciation blocks sit beyond Davies' trust range and the caveat block no longer says so ABOVE the path section -- the true caveat was demoted
      flash01_benzene_toluene opens no frame, yet its block reports a solver's path -- an absence stopped meaning what it meant
      an advisory first raised inside a search and later raised at the answer stayed `trial` -- iteration order decided whether a caveat is about the result
      an advisory raised at the answer was DEMOTED by a later trial raising the same sentence (got `trial`) -- status must only ever move toward the answer

    ON ITS FIRST RUN the first of those five lines was ABSENT.  The accepted
    counter matched every line starting "    - " in the whole block, and the
    path section's own per-frame lines start exactly that way -- so with
    everything demoted it counted 3 and the `accepted == 0` clause could
    never fire.  It had also been over-reporting the healthy case as 15 when
    the truth was 12.  A counter that measures the wrong thing, inside the
    gate built to catch exactly that.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
SRC = ROOT / "src"

#  The reactive witness: a MESH column over a chemistry, reached through
#  three nested searches.  Its 103-advisory block is what provoked this.
REACTIVE = ("column13_sour_water_stage_identity",
            "tutorials/steady/distillation/column13_sour_water_stage_identity")

#  A molecular case that opens no frame.  It must be untouched: caveats in
#  full, and no path section at all.  (c)
MOLECULAR = ("flash01_benzene_toluene",
             "tutorials/steady/flash/flash01_benzene_toluene")

#  Where each frame is opened, and the phrase that names it.  ONE home each.
FRAMES = {
    "src/thermo/electrolyte/ReactiveVLE.cpp":
        "reactive equilibrium: outer Newton search",
    "src/unitOperations/distillation/DistillationColumn.cpp":
        "' MESH search",
    "src/unitOperations/flash/AdiabaticFlash.cpp":
        "adiabaticFlash outlet-T search",
}

PATH_HEADING = "THE SOLVER'S PATH"
DAVIES = "beyond its ~0.5 mol/kg trust range"

#  column13's block was 103 lines.  A handful qualify published numbers; the
#  rest are the path.  These bounds are deliberately loose -- they pin the
#  SHAPE (a small accepted band, a large trial band), not a recorded count
#  that would have to be re-recorded on every numerical nudge.
MAX_ACCEPTED = 30
MIN_TRIAL = 40


def run(binary, case):
    p = subprocess.run([str(BUILD / binary), str(ROOT / case)],
                       capture_output=True, text=True, timeout=900)
    return p.stdout + p.stderr


def caveat_block(out):
    i = out.find("ASSUMPTIONS AND CAVEATS")
    if i < 0:
        return ""
    j = out.find("<<<Choupo:result-begin>>>", i)
    return out[i:j if j > 0 else len(out)]


def main():
    failures = []

    # ---- (a) + (b): the reactive witness ---------------------------------
    out = run("choupoSolve", REACTIVE[1])
    block = caveat_block(out)
    if not block:
        failures.append(f"{REACTIVE[0]}: no ASSUMPTIONS AND CAVEATS block at all")
    else:
        #  ABOVE the path heading only.  The path section's own per-frame
        #  lines start with the same "    - ", so counting the whole block
        #  folded them into the accepted tally -- it read 15 where the truth
        #  was 12, and under sabotage 5 (everything demoted) it read 3 and
        #  kept the `accepted == 0` clause from ever firing.  A counter that
        #  measures the wrong thing is the defect this gate exists to catch,
        #  inside the gate.
        head = block.split(PATH_HEADING)[0]
        accepted = len(re.findall(r"^    - ", head, re.M))
        m = re.search(re.escape(PATH_HEADING) + r"\s+\((\d+)\)", block)
        trial = int(m.group(1)) if m else 0

        if trial < MIN_TRIAL:
            failures.append(
                f"{REACTIVE[0]}: only {trial} advisory(ies) attributed to a "
                f"solver's path, expected at least {MIN_TRIAL} -- the framed "
                "searches are not stamping their trials")
        if accepted > MAX_ACCEPTED:
            failures.append(
                f"{REACTIVE[0]}: {accepted} advisory(ies) reported as being "
                f"about the ANSWER, expected at most {MAX_ACCEPTED} -- the "
                "path is being reported as the result")
        #  (b) THE ARM THAT MATTERS: the answer must still speak.
        if accepted == 0:
            failures.append(
                f"{REACTIVE[0]}: NOTHING is reported about the answer -- every "
                "advisory was filed under the solver's path.  A frame left "
                "open across the converged re-evaluation silences the true "
                "caveats; that is quieter than the flood and wrong")
        if DAVIES not in head:
            failures.append(
                f"{REACTIVE[0]}: its published speciation blocks sit beyond "
                "Davies' trust range and the caveat block no longer says so "
                "ABOVE the path section -- the true caveat was demoted")
        for frame in ("reactive equilibrium: outer Newton search",
                      "MESH search", "adiabaticFlash outlet-T search"):
            if frame not in block:
                failures.append(
                    f"{REACTIVE[0]}: no advisory attributed to `{frame}` -- "
                    "that frame is not reached, so it pins nothing")

    # ---- (c) the negative: an unframed case is untouched -------------------
    mout = run("choupoSolve", MOLECULAR[1])
    mblock = caveat_block(mout)
    if not mblock:
        failures.append(f"{MOLECULAR[0]}: no ASSUMPTIONS AND CAVEATS block")
    elif PATH_HEADING in mblock:
        failures.append(
            f"{MOLECULAR[0]} opens no frame, yet its block reports a solver's "
            "path -- an absence stopped meaning what it meant")

    # ---- (d) promotion, in isolation --------------------------------------
    probe = ROOT / "build" / "advisoryPromotionProbe.cpp"
    probe.write_text(r'''
#include "core/Advisory.H"
#include <cstdio>
int main()
{
    auto& L = Choupo::AdvisoryLog::instance();
    {   Choupo::AdvisoryFrame walk("search");
        L.add("model", "warning", "l", "same sentence");     // raised as a trial
    }
    L.add("model", "warning", "l", "same sentence");         // ... then at the answer
    {   Choupo::AdvisoryFrame walk("search");
        L.add("model", "warning", "l", "same sentence");     // a later trial must NOT demote
    }
    L.add("model", "warning", "l", "only ever a trial's twin");
    {   Choupo::AdvisoryFrame walk("search");
        L.add("model", "warning", "l", "only ever a trial's twin");
    }
    for (const auto& e : L.entries())
        std::printf("%s|%s|%s\n", e.message.c_str(), e.status.c_str(),
                    e.where.c_str());
    return 0;
}
''')
    exe = ROOT / "build" / "advisoryPromotionProbe"
    c = subprocess.run(["g++", "-std=c++17", f"-I{SRC}", "-o", str(exe),
                        str(probe)], capture_output=True, text=True)
    if c.returncode != 0:
        failures.append("promotion probe did not compile: " + c.stderr.strip()[:300])
    else:
        got = dict(l.split("|")[:2] for l in
                   subprocess.run([str(exe)], capture_output=True, text=True)
                   .stdout.strip().splitlines())
        if got.get("same sentence") != "accepted":
            failures.append(
                "an advisory first raised inside a search and later raised at "
                f"the answer stayed `{got.get('same sentence')}` -- iteration "
                "order decided whether a caveat is about the result")
        if got.get("only ever a trial's twin") != "accepted":
            failures.append(
                "an advisory raised at the answer was DEMOTED by a later "
                f"trial raising the same sentence (got "
                f"`{got.get(chr(39).join(['only ever a trial', 's twin']))}`) "
                "-- status must only ever move toward the answer")
    probe.unlink(missing_ok=True)
    exe.unlink(missing_ok=True)

    # ---- (e) every advisory in the JSON carries a status -------------------
    for label, o in ((REACTIVE[0], out), (MOLECULAR[0], mout)):
        for entry in re.findall(r'\{ "category": .*?\}', o, re.S):
            if '"status":' not in entry:
                failures.append(
                    f"{label}: an advisory in the result JSON carries no "
                    "`status` -- a reader would have to infer it from a "
                    "missing key")
                break

    # ---- (f) one home per frame; the close sits below the last search -----
    for rel, phrase in FRAMES.items():
        text = (ROOT / rel).read_text(errors="ignore")
        opens = text.count("AdvisoryFrame walk(")
        if opens != 1:
            failures.append(f"{rel}: {opens} frame(s) opened, expected exactly 1")
        if phrase not in text:
            failures.append(f"{rel}: does not name its frame `{phrase}`")
        close = text.find("walk.close()")
        if close < 0:
            failures.append(f"{rel}: the frame is never closed explicitly, so "
                            "the report below it is marked as a trial")
            continue
        #  The close must come AFTER the last search call in the file's
        #  frame region -- the column's first draft closed between two
        #  Newtons and marked the second one's states `accepted`.
        last_search = max(text.rfind("newtonND(", 0, len(text)),
                          text.rfind("newton1D(", 0, len(text)))
        opened = text.find("AdvisoryFrame walk(")
        searches = [m.start() for m in
                    re.finditer(r"newton(ND|1D)\(", text)
                    if opened < m.start()]
        if searches and close < max(searches):
            failures.append(
                f"{rel}: `walk.close()` sits ABOVE a later search call -- that "
                "search's discarded states are being reported as the answer")

    if failures:
        print("check_advisory_attribution: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_advisory_attribution: OK -- column13's caveat block reports "
          f"{accepted} advisory(ies) about its ANSWER (still naming Davies "
          f"beyond its trust range on the published blocks) and attributes "
          f"{trial} to three named solver searches, where it used to print "
          "103 indistinguishable lines; a molecular case that opens no frame "
          "prints no path section at all; status only ever moves toward the "
          "answer (checked against the sink in isolation, both directions); "
          "every advisory in the result JSON carries a status; and each frame "
          "has one home whose close sits below its last search.  NOT covered: "
          "which solvers OUGHT to be framed -- the recycle Wegstein, the "
          "Gibbs multi-start, Wang-Henke and both time integrators still "
          "report their paths as answers -- whether any given trial advisory "
          "is uninteresting, and the absence of the data race the same "
          "change closed (no test can demonstrate that).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
