#!/usr/bin/env python3
"""Gate: a stream is fixed by TWO variables, and the engine says so.

    bin/curate/check_overspecified_stream.py

WHY THIS EXISTS.  Vitor opened the landing case, flash01_benzene_toluene, and
read its 0/feed: a 40/60 benzene/toluene mixture declaring T 370 K, P 1 bar
AND `vaporFraction 0.3039835731` (2026-10-01: "Se especificas fracao de vapor
nao podes especificar uma das outras variaveis na corrente de entrada!  Como
se torna isto claro para os alunos?!").  By Duhem's theorem a stream of known
component flows is fixed by TWO intensive variables; for a MIXTURE (T, P)
already fix the split, so the third value is redundant or a contradiction.
Three defects were measured on a scratch copy:

  (1) the WRITER emitted `vaporFraction` beside T and P for every 0 < vf < 1
      (its comment "T,P alone do not fix the split" is true of a PURE
      component on its saturation curve and false of a mixture), so every
      converged/ view and every choupo-init0 seed re-created the
      over-specification -- 142 tracked 0/ files carried it, 133 of them a
      mixture's two-phase split, one and the same value stamped across every
      stream of ammoniaStaged01-04;
  (2) the READER accepted all three in silence while its header promised
      "THREE top-level state vars over-specify -> FATAL": with `vaporFraction
      0.9` the run exited 0, the table and the GUI printed 0.900 and the
      first law priced the feed at its resolved 0.304 -- the number shown was
      not the number used;
  (3) the STREAM TABLE and the result JSON printed the CARRIED vf, so with the
      line removed (the correct declaration) the feed showed vf = 0.000 and
      H = 37 807 J/mol (1050 kW, a liquid) while the first law used
      1325.78 kW: 275 kW of disagreement about one stream between two surfaces
      of one run, and the energy report then accused the feed of an
      IMPOSSIBLE liquid label, reading the same default.

WHAT THIS GATE CHECKS, each arm through the real reader / engine on a fixture
case this gate writes (never on a shipped case that someone may fix):

  (a) THE REFUSAL FIRES on a mixture declaring T, P and 0 < q < 1, naming the
      rule (TWO intensive variables, Duhem), the THREE values it found, and
      BOTH remedies (delete the line and let (T, P) resolve; the deferred
      (T, q)/(P, q) closures said plainly as not implemented).
  (b) THE PURE EXCEPTION: the same file with one present component is
      accepted -- on a pure component's saturation curve (T, P) genuinely do
      not fix the split, and the pin is information.
  (c) THE 0/1 REMEDY: `vaporFraction 0` on a mixture refuses naming `phase
      liquid;`, `vaporFraction 1` naming `phase gas;` -- a single phase
      spelled as a number has a legible spelling, and the refusal gives it.
  (d) THE SURFACE AGREES WITH THE FIRST LAW on flash01 (T and P only): the
      result JSON's feed `vf` equals the flash's own V_over_F, the JSON's
      feed `H_kW` equals the report's `H_feeds_kW` (the 275 kW of defect 3),
      the run prints no IMPOSSIBLE INLET PHASE about the feed, and the
      converged/feed the writer produces carries no `vaporFraction` (so the
      case cannot re-create the over-specification by being run).
  (e) THE WRITER KEEPS THE PURE PIN: condenser01_film_nusselt's wet
      condensate (pure water, two-phase) is written back WITH `vaporFraction`
      -- the exception is kept where it is information.
  (f) THE CORPUS CARRIES NO MIXTURE FILE WITH ALL THREE: the migration tool's
      own classifier (`migrate_overspecified_vf.classify`, one home) finds
      nothing to delete and nothing to replace under tutorials/, so the
      migration cannot silently regress.

WHAT THIS GATE DOES NOT CHECK, said plainly:

  * a unit that reads its inlet's `vf` BARE during the solve (the valve, the
    adiabatic flash, the exchanger, the storage tank) still sees the carried
    default there; this gate checks the SURFACE and the report, not every
    unit's duty (named in docs/ai/pitfalls.md);
  * the under-specified half of the header's promise (one state variable
    alone), which is not implemented and is not claimed;
  * a pure-component flash AT saturation, which returns its bisection
    midpoint (docs/design/the-word-that-was-not-there.md) -- arm (b) checks
    that the pin is ACCEPTED, not that the degenerate flash is right.

SABOTAGES PERFORMED 2026-10-03 (each applied to the tree, read back, the gate
run, then reverted; results recorded in
docs/design/a-stream-is-fixed-by-two-variables.md):

  S1  the reader's refusal disabled (`nPresent > 1` -> `nPresent > 99`):
      arms (a) and (c) FAIL (three refusals that did not fire).  Arm (d)
      does NOT fire -- flash01 declares T and P only, so the reader's rule
      has no bearing on it; predicted to fire, observed not to.
  S2  the writer's pure-only condition removed (`if (nPresent == 1)` ->
      `if (true)`): arm (d)'s converged/feed arm FAILS (a `vaporFraction`
      line written for the mixture).  Nothing else fires: the reader still
      refuses, the surface still resolves.
  S3  the post-solve resolution pass disabled (its `continue` made
      unconditional): arm (d) FAILS on vf (0 against 0.30398357314) and on
      H_kW (1050.19 against 1325.78 -- the 275.582 kW of defect 3).  The
      IMPOSSIBLE INLET PHASE arm did NOT fire, because the report's label
      check is gated on `phasePinned` and flash01's feed is unpinned in this
      shape; predicted to fire, observed not to.  [Observed 2026-10-03.]
  S4  a `vaporFraction 0.3;` line re-added to flash02's 0/feed (a shipped
      mixture file): arm (f) FAILS naming the file, q and component count.
  S5  the pure exception removed in the reader (`nPresent > 1` ->
      `nPresent >= 1`): arm (b) FAILS (the pure fixture refused) and arm (e)
      FAILS (condenser01 refuses its own 0/condensate at load, "MIXTURE of 1
      components (water)" -- a sentence only this sabotage can produce).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate_prereq import require_solver  # noqa: E402
import migrate_overspecified_vf as migrate  # noqa: E402

SOLVER = ROOT / "choupoSolve"
FLASH01 = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"
PURE = ROOT / "tutorials" / "steady" / "heat" / "condenser01_film_nusselt"

CONTROL = """\
application   choupoSolve;
description   "check_overspecified_stream fixture";
verbosity     2;
"""

FLOWSHEET = """\
units
(
    {
        name        drum;
        type        isothermalFlash;
        model       rachfordRice;
        in          feed;
        outputs     ( liquid  vapor );
        operation   { T 370.0 K;  P 1.0 bar; }
    }
);
"""

FEED = """\
componentMolarFlows
{
%(flows)s}

T               370 K;
P               100000 Pa;
%(pin)s"""

PRODUCT = """\
componentMolarFlows
{
    benzene    20 kmol/h;
    toluene    30 kmol/h;
}

T               370 K;
P               100000 Pa;
%(pin)s"""


def build_fixture(root: Path, flows: str, pin: str) -> Path:
    case = root / "overspecProbe"
    if case.exists():
        shutil.rmtree(case)
    (case / "system").mkdir(parents=True)
    (case / "0").mkdir()
    shutil.copytree(FLASH01 / "constant", case / "constant")
    (case / "constant" / "propertyManifest").unlink(missing_ok=True)
    (case / "system" / "controlDict").write_text(CONTROL)
    (case / "system" / "flowsheetDict").write_text(FLOWSHEET)
    (case / "0" / "feed").write_text(FEED % {"flows": flows, "pin": pin})
    (case / "0" / "liquid").write_text(PRODUCT % {"pin": "phase           liquid;\n"})
    (case / "0" / "vapor").write_text(PRODUCT % {"pin": "phase           gas;\n"})
    return case


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVER), "."], cwd=str(case), env=env,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def strip_banner(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def result_json(out: str):
    """The result block the run prints (the GUI's and the goldens' reader)."""
    m = re.search(r"^\{ \"version\": 1,.*?^\}\s*$", out, re.S | re.M)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


MIX = "    benzene    40 kmol/h;\n    toluene    60 kmol/h;\n"
PURE_FLOWS = "    benzene    40 kmol/h;\n"


def main() -> int:
    require_solver(SOLVER)
    failures = []
    tmp = Path(tempfile.mkdtemp(prefix="choupo-overspec-"))
    try:
        # ---- (a) the refusal, and what it must say -----------------------
        case = build_fixture(tmp, MIX, "vaporFraction   0.3039835731;\n")
        rc, out = run(case)
        if rc == 0:
            failures.append(
                "(a) a MIXTURE declaring T, P AND vaporFraction RAN TO EXIT 0.  "
                "Three values on a two-variable state were accepted in silence "
                "again, which is defect (2): the table shows the declared "
                "number and the first law uses the resolved one.")
        else:
            for what, pat in (
                ("the word OVER-SPECIFIED", r"OVER-SPECIFIED"),
                ("the two-variable rule", r"fixed by TWO\s+intensive variables"),
                ("Duhem", r"Duhem"),
                ("the declared T", r"T = 370 K"),
                ("the declared P", r"P = 100000 Pa"),
                ("the declared vaporFraction", r"vaporFraction = 0\.3039835731"),
                ("the mixture named", r"MIXTURE of 2 components \(benzene, toluene\)"),
                ("remedy 1 (delete the line)", r"delete the `vaporFraction` line"),
                ("remedy 2 (q-closure not implemented)", r"does not do that today"),
                ("the pure exception stated", r"PURE component keeps `vaporFraction q;`"),
            ):
                if not re.search(pat, out):
                    failures.append(
                        f"(a) the refusal never names {what} -- a reader met "
                        "cold by this message must see the rule, the three "
                        "values and both remedies, or it teaches only unease.")

        # ---- (b) the pure exception --------------------------------------
        case = build_fixture(tmp, PURE_FLOWS, "vaporFraction   0.3039835731;\n")
        rc, out = run(case)
        if "OVER-SPECIFIED" in out:
            failures.append(
                "(b) a PURE component declaring T, P and vaporFraction was "
                "refused as over-specified.  On its saturation curve (T, P) do "
                "not fix the split; the pin is information and must be kept.")
        elif rc != 0:
            failures.append(
                f"(b) the pure-component fixture did not run (exit {rc}) for a "
                "reason other than over-specification; the exception is "
                "untested while this stands.  Tail:\n"
                + "\n".join(out.strip().splitlines()[-6:]))

        # ---- (c) the 0/1 remedy names `phase` -----------------------------
        for q, word in (("0.0", "liquid"), ("1.0", "gas")):
            case = build_fixture(tmp, MIX, f"vaporFraction   {q};\n")
            rc, out = run(case)
            if rc == 0:
                failures.append(
                    f"(c) `vaporFraction {q}` on a mixture RAN TO EXIT 0 -- a "
                    "single phase spelled as a number beside T and P is the "
                    "same over-specification and must refuse.")
            elif f"`phase {word};`" not in out:
                failures.append(
                    f"(c) `vaporFraction {q}` on a mixture refused without "
                    f"naming the legible spelling `phase {word};` -- the "
                    "refusal must give the edit, not only the rule.")
            elif "spelled as a number" not in out:
                failures.append(
                    f"(c) `vaporFraction {q}` refused, but the message does "
                    "not say WHY the number is the wrong spelling.")

        # ---- (d) flash01: one number on every surface ---------------------
        feed = strip_banner((FLASH01 / "0" / "feed").read_text())
        if re.search(r"(?m)^\s*vaporFraction\s", feed):
            failures.append(
                "(d) flash01's 0/feed declares `vaporFraction` again.  The "
                "landing case declares T and P only (Vitor, 2026-10-01).")
        rc, out = run(FLASH01)
        if rc != 0:
            failures.append(f"(d) flash01 did not run (exit {rc})")
        else:
            r = result_json(out)
            if r is None:
                failures.append("(d) flash01 printed no result JSON to read")
            else:
                vf_feed = r.get("streams", {}).get("feed", {}).get("vf")
                h_feed = r.get("streams", {}).get("feed", {}).get("H_kW")
                vof = r.get("kpis", {}).get("flash01", {}).get("V_over_F")
                gb = r.get("globalEnergyBoundary", {})
                h_feeds = gb.get("H_feeds_kW")
                if vf_feed is None or vof is None:
                    failures.append(
                        f"(d) the JSON lacks feed.vf ({vf_feed}) or "
                        f"flash01.V_over_F ({vof}); the surface arm cannot "
                        "compare two numbers it does not have")
                elif abs(vf_feed - vof) > 1.0e-9:
                    failures.append(
                        f"(d) flash01's feed shows vf = {vf_feed} while the "
                        f"flash at the SAME (T, P) gives V_over_F = {vof}.  "
                        "The stream table is drawing the carried default, not "
                        "the resolved state -- defect (3).")
                if h_feed is None or h_feeds is None:
                    failures.append(
                        f"(d) the JSON lacks feed.H_kW ({h_feed}) or "
                        f"globalEnergyBoundary.H_feeds_kW ({h_feeds})")
                elif abs(h_feed - h_feeds) > 1.0e-6 * max(1.0, abs(h_feeds)):
                    failures.append(
                        f"(d) flash01's feed is priced H_kW = {h_feed} on the "
                        f"stream surface and {h_feeds} in the first law: two "
                        "surfaces of one run disagree about one stream by "
                        f"{h_feeds - h_feed:.3f} kW -- defect (3).")
            #  The console form is `[phase] stream 'feed' is priced as LIQUID
            #  (vf = 0) ... cannot hold that label` (stderr) and the same
            #  sentence in the caveat block; the phrase IMPOSSIBLE INLET PHASE
            #  goes to the report FILE only.  A first draft matched the file's
            #  phrase against stdout and could never fire -- found by sabotage
            #  S3, which this arm was predicted to catch and did not.
            if re.search(r"stream 'feed'[^\n]*cannot hold that label", out):
                failures.append(
                    "(d) the energy report accuses flash01's feed of an "
                    "impossible phase label.  The label it reads is the "
                    "carried default, not the resolved state.")
            conv = FLASH01 / "converged" / "feed"
            if not conv.exists():
                failures.append("(d) flash01 wrote no converged/feed to inspect")
            elif re.search(r"(?m)^\s*vaporFraction\s", strip_banner(conv.read_text())):
                failures.append(
                    "(d) the writer put `vaporFraction` back into "
                    "converged/feed for a MIXTURE -- running the case would "
                    "re-create the over-specification the reader refuses.")

        # ---- (e) the writer keeps the pure pin ---------------------------
        rc, out = run(PURE)
        if rc != 0:
            failures.append(
                f"(e) {PURE.name} did not run (exit {rc}).  Its 0/condensate "
                "is a pure two-phase stream declaring T, P and vaporFraction; "
                "if the reader refused it the pure exception is gone.  Tail:\n"
                + "\n".join(out.strip().splitlines()[-6:]))
        else:
            conv = PURE / "converged" / "condensate"
            if not conv.exists():
                failures.append(f"(e) {PURE.name} wrote no converged/condensate")
            elif not re.search(r"(?m)^\s*vaporFraction\s+0\.\d", strip_banner(conv.read_text())):
                failures.append(
                    f"(e) {PURE.name}'s converged/condensate carries no "
                    "`vaporFraction`: the writer dropped the pin on a PURE "
                    "two-phase stream, where (T, P) do not fix the split and "
                    "the pin is the only record of it.")

        # ---- (f) the corpus ----------------------------------------------
        offenders = []
        for f in migrate.state_files([str(ROOT / "tutorials")]):
            action, q, n, _why = migrate.classify(f)
            if action in ("delete", "phase"):
                offenders.append(f"{f.relative_to(ROOT)} (q = {q}, {n} components)")
        if offenders:
            failures.append(
                f"(f) {len(offenders)} tracked 0/ file(s) declare T, P and "
                "vaporFraction on a MIXTURE:\n      "
                + "\n      ".join(offenders)
                + "\n      Run bin/curate/migrate_overspecified_vf.py on them; "
                "the reader refuses each at load.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        print("check_overspecified_stream: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_overspecified_stream: OK -- a MIXTURE stream file declaring "
          "T, P and vaporFraction is REFUSED naming the two-variable rule "
          "(Duhem), the three values and both remedies; vaporFraction 0/1 on "
          "a mixture refuses naming `phase liquid|gas;`; a PURE two-phase "
          "stream keeps its pin and the writer writes it back; flash01 (T and "
          "P only) shows ONE feed state on the stream surface, the flash KPI "
          "and the first law, with no impossible-phase accusation and no "
          "vaporFraction written back for the mixture; and no tracked 0/ file "
          "under tutorials/ declares all three on a mixture.  SCANNED: a "
          "fixture case written by this gate (five variants), flash01, "
          "condenser01, every tracked 0/ file under tutorials/.  NOT CHECKED: "
          "units that read their inlet's vf bare during the solve (valve, "
          "adiabaticFlash, heatExchanger, storageTank); the under-specified "
          "half of the header's promise (not implemented); the degenerate "
          "pure-component flash at saturation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
