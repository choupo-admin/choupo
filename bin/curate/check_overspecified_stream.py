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

  (g) THE UNDER-SPECIFIED PURE STREAM (DEV.md C36 item 1, 2026-10-05): a
      PURE stream declared by T and P alone ON its own saturation curve is
      REFUSED, because there (T, P) are one condition and the phase would be
      chosen by the last digits of T.  The arm FINDS the curve with the
      engine's own reading -- it bisects T between a liquid-classified and a
      vapour-classified pure benzene feed, reading each run's resolved feed
      `vf` -- and requires that the bisection meets a REFUSING temperature
      before the bracket closes below the band (the flash's tolerance), so
      the band is shown to exist on the engine and not only in prose.  The
      refusal must name UNDETERMINED, the component, both remedies (`phase
      liquid;`, `phase gas;`), the file, and the flash's tolerance as the
      band.  (g2) the same T with `phase gas;` RUNS with feed vf = 1 and
      with `phase liquid;` RUNS with vf = 0.  (g3) a MIXTURE at its own
      bubble point (found the same way, to the same width) is untouched: it
      runs and is never called UNDETERMINED.

  (h) THE SAME RULE IN A UNIT'S OWN WORLD (DEV.md C37 item 5): a unit that
      consumes an authored pure inlet under its own `thermo {}` resolves it
      in THAT world, whose saturation curve need not be the global one's.
      A splitter carrying `thermo { equilibrium { vapour { fugacityModel
      SRK; } } }` over flash01's ideal package splits a pure benzene feed;
      the arm bisects T on the BRANCH's vf (the splitter's own reading, in
      its own world) and requires a refusal that names the unit's own world
      before the bracket closes below the band.  (h2) the SAME T in the SAME
      case without the unit's override RUNS: the global curve is elsewhere,
      so only the unit's world can have refused.
  (i) THE SAME RULE IN THE TIME-INTEGRATED CLASS (DEV.md C37 item 5): the
      dynamic driver's authored inlets (consumed, produced by no unit) are
      checked at load.  unsteady02_tanks_in_series feeds PURE compA; a
      steady splitter probe on the SAME constant/ finds compA's curve by the
      engine's own reading (as (g)), and choupoSemiContinuous fed at that T
      must refuse prefixed by its own name, naming UNDETERMINED and the
      file.  (i2) 1 K above the curve the same fixture RUNS.

WHAT THIS GATE DOES NOT CHECK, said plainly:

  * a unit that reads its inlet's `vf` BARE during the solve (the valve, the
    adiabatic flash, the exchanger, the storage tank) still sees the carried
    default there; this gate checks the SURFACE and the report, not every
    unit's duty (named in docs/ai/pitfalls.md);
  * the under-specified half of the header's promise (one state variable
    alone), which is not implemented and is not claimed;
  * a pure-component flash AT saturation, which returns its bisection
    midpoint (docs/design/the-word-that-was-not-there.md) -- arm (b) checks
    that the pin is ACCEPTED, not that the degenerate flash is right;
  * arm (h) reaches a unit's own world through ONE override (an SRK
    vapour on a splitter); a property-context world (`propertyContextBase`,
    a fractal sector's own constant/) goes through the same `thermoFor` call
    and is not exercised here;
  * choupoBatch, which reads no `0/<stream>` file (its vessels start from
    holdups), so it has no authored inlet to check.

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
      unconditional): arm (d) FAILS on vf (0 against 0.30398357314), on
      H_kW (1050.19 against 1325.78 -- the 275.582 kW of defect 3) AND on
      the impossible-label line.  ON THE FIRST RUN the third did NOT fire:
      the arm matched the report FILE's phrase (IMPOSSIBLE INLET PHASE)
      against stdout, where the sentence reads `[phase] stream 'feed' is
      priced as LIQUID ... cannot hold that label` -- an arm that could never
      fire, found only because the sabotage was predicted to trip it.  The
      regex was corrected and S3 re-run: all three fire.
  S4  a `vaporFraction 0.3;` line re-added to flash02's 0/feed (a shipped
      mixture file): arm (f) FAILS naming the file, q and component count.
  S5  the pure exception removed in the reader (`nPresent > 1` ->
      `nPresent >= 1`): arm (b) FAILS (the pure fixture refused) and arm (e)
      FAILS (condenser01 refuses its own 0/condensate at load, "MIXTURE of 1
      components (water)" -- a sentence only this sabotage can produce).

SABOTAGE PERFORMED 2026-10-05 for (h)/(i) (DEV.md C37 item 5), applied to the
engine source, built, the gate run, then restored by copy and rebuilt:

  S6  BOTH new checks disarmed in one build -- the unit-world loop skips
      every unit (`continue` before its refusal) and the dynamic driver
      skips every inlet.  (h) FAILS: 33 runs bisected the splitter's own
      reading to 351.9253291527 K with no refusal (the global world's curve
      is 352.826 K, so (g) still passes).  (i) FAILS four ways: the
      time-integrated fixture at compA's curve (455.6082597 K) names neither
      the binary, the file nor the component, and exits 0.  (h2) and (i2)
      stay green -- they are the negatives.
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

T               %(T)s K;
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


def build_fixture(root: Path, flows: str, pin: str, T: str = "370") -> Path:
    case = root / "overspecProbe"
    if case.exists():
        shutil.rmtree(case)
    (case / "system").mkdir(parents=True)
    (case / "0").mkdir()
    shutil.copytree(FLASH01 / "constant", case / "constant")
    (case / "constant" / "propertyManifest").unlink(missing_ok=True)
    (case / "system" / "controlDict").write_text(CONTROL)
    (case / "system" / "flowsheetDict").write_text(FLOWSHEET)
    (case / "0" / "feed").write_text(FEED % {"flows": flows, "pin": pin, "T": T})
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


def feed_vf(out: str):
    r = result_json(out)
    if r is None:
        return None
    return r.get("streams", {}).get("feed", {}).get("vf")


def find_curve(root: Path, flows: str, lo: float, hi: float, width: float):
    """Bisect T between a liquid-read (vf == 0) and a not-liquid-read feed,
    reading the ENGINE's resolved feed vf.  Returns (T, rc, out, steps) at the
    first run that is refused as UNDETERMINED, or at the midpoint once the
    bracket is narrower than `width`.  The engine decides which side each T
    is on; this function only keeps the bracket."""
    steps = 0
    while True:
        mid = 0.5 * (lo + hi)
        case = build_fixture(root, flows, "", T=repr(mid))
        rc, out = run(case)
        steps += 1
        if "UNDETERMINED" in out or hi - lo < width:
            return mid, rc, out, steps
        vf = feed_vf(out) if rc == 0 else None
        if vf is None:
            return mid, rc, out, steps
        if vf <= 0.0:
            lo = mid
        else:
            hi = mid


#  (h): a splitter in its OWN thermo world over flash01's package.
SPLIT_OWN_WORLD = """\
units
(
    {
        name        S1;
        type        splitter;
        inputs      ( feed );
        outputs     ( a  b );
        operation   { fractions ( 0.5 0.5 ); }
%(thermo)s    }
);
"""
OWN_WORLD = "        thermo { equilibrium { vapour { fugacityModel SRK; } } }\n"
#  (i): the time-integrated witness whose feed is PURE compA.
DYN = ROOT / "tutorials" / "unsteady" / "unsteady02_tanks_in_series"
SPLIT_PROBE = """\
units
(
    {
        name        S1;
        type        splitter;
        inputs      ( feed );
        outputs     ( a  b );
        operation   { fractions ( 0.5 0.5 ); }
    }
);
"""


def set_T(text: str, T: str) -> str:
    out, n = re.subn(r"^T\s+[0-9.eE+-]+\s*(K)?\s*;", f"T               {T} K;",
                     text, count=1, flags=re.M)
    assert n == 1, "no T line to set"
    return out


def build_own_world(root: Path, T: str, own: bool) -> Path:
    case = root / "ownWorldProbe"
    if case.exists():
        shutil.rmtree(case)
    (case / "system").mkdir(parents=True)
    (case / "0").mkdir()
    shutil.copytree(FLASH01 / "constant", case / "constant")
    (case / "constant" / "propertyManifest").unlink(missing_ok=True)
    (case / "system" / "controlDict").write_text(CONTROL)
    (case / "system" / "flowsheetDict").write_text(
        SPLIT_OWN_WORLD % {"thermo": OWN_WORLD if own else ""})
    for nm in ("feed", "a", "b"):
        (case / "0" / nm).write_text(FEED % {"flows": PURE_FLOWS, "pin": "",
                                             "T": T})
    return case


def build_dyn_probe(root: Path, T: str) -> Path:
    """A STEADY splitter on the time-integrated witness's own constant/: the
    engine's reading of its pure feed at T (the surface vf)."""
    case = root / "dynProbe"
    if case.exists():
        shutil.rmtree(case)
    (case / "system").mkdir(parents=True)
    (case / "0").mkdir()
    shutil.copytree(DYN / "constant", case / "constant")
    (case / "system" / "controlDict").write_text(CONTROL)
    (case / "system" / "flowsheetDict").write_text(SPLIT_PROBE)
    feed = set_T((DYN / "0" / "feed").read_text(), T)
    for nm in ("feed", "a", "b"):
        (case / "0" / nm).write_text(feed)
    return case


def build_dyn(root: Path, T: str) -> Path:
    case = root / "dynFixture"
    if case.exists():
        shutil.rmtree(case)
    shutil.copytree(DYN, case, ignore=shutil.ignore_patterns(
        "expected", "log.*", "reports", "[0-9]*.[0-9]*", "converged"))
    for d in case.iterdir():                     # written time directories
        if d.is_dir() and re.fullmatch(r"[0-9.eE+-]+", d.name) and d.name != "0":
            shutil.rmtree(d)
    cd = case / "system" / "controlDict"
    cd.write_text(re.sub(r"^endTime\s+[0-9.eE+-]+\s*;", "endTime         5;",
                         cd.read_text(), count=1, flags=re.M))
    (case / "0" / "feed").write_text(set_T((case / "0" / "feed").read_text(), T))
    return case


def run_dyn(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(ROOT / "choupoSemiContinuous"), "."], cwd=str(case),
                       env=env, capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def bisect(build, read_vf, lo: float, hi: float, width: float):
    """`find_curve` with the fixture and the reading as arguments."""
    steps = 0
    while True:
        mid = 0.5 * (lo + hi)
        rc, out = run(build(repr(mid)))
        steps += 1
        if "UNDETERMINED" in out or hi - lo < width:
            return mid, rc, out, steps
        vf = read_vf(out) if rc == 0 else None
        if vf is None:
            return mid, rc, out, steps
        if vf <= 0.0:
            lo = mid
        else:
            hi = mid


def stream_vf(name):
    def f(out):
        r = result_json(out)
        if r is None:
            return None
        return r.get("streams", {}).get(name, {}).get("vf")
    return f


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

        # ---- (g) a pure stream ON its saturation curve is under-specified -
        #  Benzene's normal boiling point is ~353.2 K, so 340 K reads liquid
        #  and 370 K vapour at 1 bar under flash01's package; the bisection
        #  keeps the bracket and the engine decides each side.  The band is
        #  the flash's own tolerance on |ln K| (1e-8); with d ln K/dT ~ 0.035/K
        #  for benzene there that is ~3e-7 K, so a bracket of 1e-8 K that has
        #  met no refusal means the band does not exist.
        T_g, rc, out, steps = find_curve(tmp, PURE_FLOWS, 340.0, 370.0, 1.0e-8)
        if "UNDETERMINED" not in out:
            failures.append(
                f"(g) bisecting a PURE benzene feed's T between a liquid and a "
                f"vapour reading ({steps} runs, last T = {T_g!r} K, exit {rc}) "
                "never met a refusal.  A pure stream declared by T and P alone "
                "ON its saturation curve was classified by the last digits of "
                "T again (DEV.md C36 item 1).")
        else:
            for what, pat in (
                ("the word UNDETERMINED", r"UNDETERMINED STREAM STATE"),
                ("the component", r"is PURE benzene"),
                ("the file to edit", r"stream 'feed' \(0/feed\)"),
                ("remedy `phase liquid;`", r"`phase liquid;`"),
                ("remedy `phase gas;`", r"`phase gas;`"),
                ("the band, as the flash's tolerance",
                 r"<= 1e-08 \(the flash's own convergence tolerance"),
                ("the reason (the last digits of T)", r"last digits of T"),
            ):
                if not re.search(pat, out):
                    failures.append(
                        f"(g) the undetermined-state refusal never names {what}.")
            if rc == 0:
                failures.append("(g) the refusal was printed but the run exited 0.")
            # (g2) the same T, declared: runs, and the declaration is the state
            for pin, want in (("phase           gas;\n", 1.0),
                              ("phase           liquid;\n", 0.0)):
                word = pin.split()[1]
                case = build_fixture(tmp, PURE_FLOWS, pin, T=repr(T_g))
                rc2, out2 = run(case)
                vf2 = feed_vf(out2) if rc2 == 0 else None
                if rc2 != 0 or "UNDETERMINED" in out2:
                    failures.append(
                        f"(g2) the SAME pure stream at T = {T_g!r} K declaring "
                        f"`phase {word}` did not run (exit {rc2}); a declared "
                        "phase is exactly the remedy the refusal asks for.")
                elif vf2 is None or abs(vf2 - want) > 1.0e-12:
                    failures.append(
                        f"(g2) declared `phase {word}` at T = {T_g!r} K, the "
                        f"feed was published at vf = {vf2}, not {want}.")
        # (g3) a mixture at its own bubble point is untouched
        T_b, rc3, out3, steps3 = find_curve(tmp, MIX, 340.0, 380.0, 1.0e-8)
        if "UNDETERMINED" in out3:
            failures.append(
                f"(g3) a benzene/toluene MIXTURE at its bubble point (T = "
                f"{T_b!r} K) was refused as UNDETERMINED: the rule is for a "
                "PURE component, whose (T, P) collapse to one condition on its "
                "curve; a mixture's (T, P) fix its state there.")
        elif rc3 != 0:
            failures.append(
                f"(g3) the mixture at its bubble point (T = {T_b!r} K) did not "
                f"run (exit {rc3}) -- the negative is untested while this stands.")
        # ---- (h) the rule in a UNIT's own world (C37 item 5) ---------------
        T_h, rc, out, steps = bisect(lambda T: build_own_world(tmp, T, True),
                                     stream_vf("a"), 340.0, 370.0, 1.0e-8)
        if "UNDETERMINED" not in out:
            failures.append(
                f"(h) bisecting a PURE benzene feed's T on the reading of a "
                f"splitter in its OWN thermo world (SRK vapour; {steps} runs, "
                f"last T = {T_h!r} K, exit {rc}) never met a refusal: the "
                "unit's world classifies the stream by the last digits of T.")
        else:
            if not re.search(r"OWN thermophysical world of unit 'S1'", out):
                failures.append(
                    "(h) the refusal at the unit-world curve does not name the "
                    "unit's own world -- it is the global check refusing, or "
                    "the unit's check lost its sentence.")
            if rc == 0:
                failures.append("(h) the refusal was printed but the run "
                                "exited 0.")
            rc2, out2 = run(build_own_world(tmp, repr(T_h), False))
            if rc2 != 0 or "UNDETERMINED" in out2:
                failures.append(
                    f"(h2) WITHOUT the unit's override the same pure feed at "
                    f"T = {T_h!r} K did not run (exit {rc2}): the global "
                    "world refuses it too, so (h) cannot tell the unit's "
                    "check from the global one.")
        # ---- (i) the rule in the time-integrated class (C37 item 5) --------
        T_i, rc, out, steps = bisect(lambda T: build_dyn_probe(tmp, T),
                                     stream_vf("feed"), 440.0, 470.0, 1.0e-8)
        if "UNDETERMINED" not in out:
            failures.append(
                f"(i) the steady probe on {DYN.name}'s constant/ never met the "
                f"refusal ({steps} runs, last T = {T_i!r} K, exit {rc}) -- the "
                "time-integrated arm has no curve to test at.")
        else:
            rcd, outd = run_dyn(build_dyn(tmp, repr(T_i)))
            for what, pat in (
                ("the binary", r"choupoSemiContinuous: UNDETERMINED STREAM STATE"),
                ("the file to edit", r"stream 'feed' \(0/feed\)"),
                ("the component", r"is PURE compA"),
            ):
                if not re.search(pat, outd):
                    failures.append(
                        f"(i) choupoSemiContinuous fed PURE compA at its own "
                        f"curve (T = {T_i!r} K) never names {what}: the "
                        "time-integrated class classifies its authored inlet by "
                        "the last digits of T.")
            if rcd == 0:
                failures.append("(i) the time-integrated fixture at the curve "
                                "exited 0.")
            rcn, outn = run_dyn(build_dyn(tmp, repr(T_i + 1.0)))
            if rcn != 0 or "UNDETERMINED" in outn:
                failures.append(
                    f"(i2) the time-integrated fixture 1 K above the curve "
                    f"(T = {T_i + 1.0!r} K) did not run (exit {rcn}): the rule "
                    "refuses far from the curve, or the fixture is broken.")
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
          "vaporFraction written back for the mixture; no tracked 0/ file "
          "under tutorials/ declares all three on a mixture; and a PURE stream "
          "declared by T and P alone ON its saturation curve (found by "
          "bisecting the engine's own reading to the flash's tolerance) is "
          "REFUSED as UNDETERMINED naming `phase liquid;` and `phase gas;`, "
          "runs once declared, while a mixture at its bubble point is "
          "untouched.  SCANNED: a fixture case written by this gate (five "
          "variants plus the two bisections), flash01, condenser01, every "
          "tracked 0/ file under tutorials/.  The SAME refusal reaches a "
          "unit's OWN thermo world (a splitter under an SRK vapour, bisected "
          "on its own branch reading, refuses naming that world; without the "
          "override the same T runs) and the time-integrated class "
          "(choupoSemiContinuous fed unsteady02's pure compA at its curve "
          "refuses by its own name; 1 K above, it runs).  NOT CHECKED: units "
          "that read their inlet's vf bare during the solve (valve, "
          "adiabaticFlash, heatExchanger, storageTank); a property-context "
          "world (same call, not exercised); choupoBatch (no authored "
          "inlet); the degenerate pure-component flash at saturation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
