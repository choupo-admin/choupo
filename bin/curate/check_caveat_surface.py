#!/usr/bin/env python3
"""Gate: the end-of-run caveat block is real, named, silent when it should be,
and agrees with the JSON.

    bin/curate/check_caveat_surface.py

WHY THIS EXISTS.  Choupo announces an extrapolated Cp, an unverified record, an
estimate standing in for a measurement -- each at its site, in the middle of a
long log.  A warning a thousand lines above the answer has been DELIVERED and
not RECEIVED, so `core/AdvisorySummary.H` replays them once at the end, grouped.

The surface shipped without a gate, which by this project's own three-part
criterion means it was not consolidated: contract written, engine behaviour
present, *no case firing it*.  This is that third part.

WHAT IS CHECKED, and the shape is deliberate.  It is modelled on
`check_review_status`, which caught a real regression hours earlier precisely
because it does NOT merely assert that an announcement exists:

  (a) A RUN THAT REALLY EXTRAPOLATES lists it under EXTRAPOLATIONS AND
      VALIDITY *and names the component*.  An anonymous caveat -- "polynomial
      Cp declares ..." in a twenty-component flowsheet -- is one the reader
      cannot act on, and the engine printed exactly that until the owner was
      stamped.

  (b) A CLEAN RUN SAYS "none raised", explicitly.  This is the arm that
      matters most.  A block that appears only when there is something to say
      cannot be distinguished from a block that failed to run, and "announced"
      then becomes a louder form of silence.  The same reasoning as *a check
      that cannot run must not pass*.

  (c) THE BLOCK AND THE JSON AGREE.  Every advisory printed in the block must
      appear in the result JSON that the GUI reads.  Two surfaces disagreeing
      about what the run announced would be a second home for one fact -- and
      the JSON is what a student never sees, so it is the one that rots.

  (e) A CASE WITH AN OUTER DRIVER PRINTS IT TOO, and says WHICH PASS.  This
      arm exists because arm (d) is a SOURCE check and could not see that the
      one `printAdvisorySummary` call in choupoSolve sat inside the `else` of
      `if (outerDict)`: the string was present, the gate was green, and 23
      corpus cases printed no block at all.  `gibbs04_wgs_temperature_sweep`
      carried four advisories saying the vapour pressures it returned were not
      vapour pressures, and printed none of them.  So this arm RUNS two cases
      -- a sweep (no representative pass) and a designSpec (one) -- and
      requires the block, the scope line, and the right word for which pass
      each is describing.  It does not check WHICH advisories a swept run
      should report: that is a stated design decision (the last pass, never a
      union), not something a gate can derive.

  (f) A ONCE-PER-PROCESS FACT IS IN THE PASS THAT CONSUMED IT (2026-09-27).
      The block under an outer driver describes one pass and the log is
      cleared per pass; six sites put their advisory INSIDE a once-per-process
      console latch, so every pass after the first lost it -- `cavett01`
      listed UNVERIFIED DATA (7) run directly and NONE under a 2-point sweep.
      This arm runs both, in scratch copies (the sweep's last point is the
      design point), and requires the swept block to list every unverified
      record the direct run lists.

  (g) THE DYNAMIC DRIVER PARTITIONS TOO.  `ctrl20_bode_cstr` (a choupoCtrl
      sweep over the synthetic component compA -- the case whose block said
      "none raised" when a per-pass reset was first tried) must name "the LAST
      pass only" and still list compA.

  (h) NO ADVISORY BEHIND A PROCESS-LIFETIME LATCH, as a SOURCE scan over
      every src/**/*.{cpp,H}: an `AdvisoryLog::instance().add(` governed by an
      `announceOnce(` (in the `if` condition, its statement, or the rest of
      the block after `if (!announceOnce(...)) return;`).  It carries a probe
      of the three shapes that were in the tree, which must be flagged, and of
      the replacement, which must not.

SABOTAGES PERFORMED BY HAND on 2026-09-27 against (f)-(h), each restored and
the engine rebuilt:

  S1  Database's interim site back inside its `announceOnce` latch -> (f)
      "cavett01_recycle_train under a 2-point sweep lists 0 of the 7 ..." and
      (h) "... latch at src/thermo/Database.cpp:600".
  S2  the synthetic site back to `announceOnce(...) && add(...)` -> (g)
      "ctrl20_bode_cstr runs on the SYNTHETIC component compA and its
      last-pass block does not list it" and (h) naming Database.cpp.
  S3  `addAnnouncedOnce` returning before it records when the key is not new
      to the PROCESS (the loss moved into the log itself) -> (f) and (g); (h)
      stays green, as it must: the sites are right and the log is wrong.

  (d) ALL FIVE BINARIES emit it.  A caveat surface present in one application
      and absent from three teaches the reader that its absence means "nothing
      to report".  `choupoProps` was in fact MISSED when the block was first
      wired, and the commit that wired the other three claimed all four -- this
      arm exists because that claim was false when it was made.

SABOTAGES PERFORMED BY HAND on 2026-09-07 against arm (e), each restored and
the engine rebuilt.  The lines are what the gate printed:

  S3  the whole outer-driver block deleted from choupoSolve's main (the state
      the engine was in until that day) -> "gibbs04_wgs_temperature_sweep
      ships an outerDict and printed NO caveat-scope line. ..." and the same
      for compressor02_designspec_pout.
  S4  the block kept, but the phrase naming WHICH pass replaced by "what the
      run announced" -> "gibbs04_wgs_temperature_sweep printed the caveat
      block but does not say it describes 'the LAST pass only'. ..." and
      "compressor02_designspec_pout ... 'the REPRESENTATIVE pass'."

S4 is the arm that matters more than S3: a block that runs and does not say
which of many passes it describes invites the reader to take it for all of
them, which is a new way of being wrong rather than the old silence.

WHAT IS NOT CHECKED: whether an advisory is JUSTIFIED -- whether a Cp really
should have been extrapolated, whether a record really is unreviewed.  Those
are curation judgements, and each has its own gate (`check_cp_range_announced`,
`check_review_status`).  This gate checks the SURFACE, not the physics.
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
SOLVE = ROOT / "choupoSolve"

#  A case that really evaluates a Cp outside its declared window, and one that
#  does not.  Both are ordinary corpus cases -- no fixture, no sabotage.
LOUD = "tutorials/steady/drying/solidDryer01_sugar"
#  A case that genuinely raises NOTHING.  It was `flash01_benzene_toluene`
#  until 2026-08-06, and losing that role is worth recording, because it is
#  this gate's own thesis turned one level up.
#
#  flash01 runs at 370 K.  Benzene's Antoine window ends at 354.07 K.  Every
#  K-value in the flagship first flash a student meets had been computed
#  16 K past the correlation's declared validity -- and the case looked CLEAN,
#  because nothing in the tree had ever compared a temperature against a
#  `Trange`.  Its empty caveat block was indistinguishable from a caveat block
#  whose checks were not wired, and it was the second.
#
#  So the replacement is not chosen for being quiet.  It is chosen for being
#  quiet FOR A CHECKED REASON: ethanol/water at 351 K, both components well
#  inside their declared windows, verified by running it.  If a future check
#  finds something here too, repoint again and write down what it found --
#  that is the gate working, not the gate breaking.
#
#  IT HAPPENED AGAIN, 2026-08-19, and the note above is the reason this is a
#  two-line edit rather than an argument.  `PolynomialCp::H`/`S` integrate the
#  polynomial from the 298.15 K datum to the state and had never once compared
#  that PATH against the declared window -- only `Cp(T)` did, and the integral
#  is the route every enthalpy actually travels.  flash02 flashes at 355 K and
#  ethanol's liquid-Cp fit is declared over (280 351): the case had been
#  integrating 4 K past the fit since it existed.  Its caveat block was empty
#  for the same reason flash01's was in 2026-08: THE CHECK WAS NOT WIRED.
#  Twice now, this gate's silent witness has been an unexamined case rather
#  than a clean one -- which is this gate's own thesis about caveat blocks,
#  landing on the gate itself.
#
#  heatExchanger01_water_water replaces it, and is chosen to EXERCISE the
#  machinery rather than dodge it: a water/water exchanger integrates a liquid
#  Cp on both sides, and water's window (273 373) contains the whole path from
#  the datum to either stream temperature.  Silent because the physics is in
#  range, not because nothing was computed.  Verified by running every case
#  the corpus offers: 12 of the 110 that raise no Cp advisory also print
#  "none raised", and this is one of them.
SILENT = "tutorials/steady/heat/heatExchanger01_water_water"

#  (e) Two outer-driver cases, one of each kind.  SWEPT has no representative
#  pass and raises real advisories (four vapour pressures above Tc); REPRESENT
#  replays at its design point, so the block describes that pass.
SWEPT     = "tutorials/steady/gibbs/gibbs04_wgs_temperature_sweep"
REPRESENT = "tutorials/steady/rotating/compressor02_designspec_pout"
SCOPE     = "[caveats] this run made"

#  (f) A case whose records announce ONCE PER PROCESS (seven interim imports),
#  run directly and under a 2-point sweep whose LAST point is the case's own
#  design point -- so the swept block, which describes the last pass only,
#  must list the same unverified records the direct run lists.
PERPASS   = "tutorials/steady/flowsheets/cavett01_recycle_train"
PERPASS_SWEEP = """type    sweep;
parameter
{
    target    units[0].operation.T;
    range     ( 320  322.039 );
    nPoints   2;
}
responses ( FL2.T );
"""
#  (g) The dynamic driver under an outer driver: a Bode sweep over a
#  SYNTHETIC component, the case whose block said "none raised" when a
#  per-pass reset was first tried there.
DYN_SWEPT = "tutorials/ctrl/ctrl20_bode_cstr"
CTRL      = ROOT / "choupoCtrl"

HEADER = "ASSUMPTIONS AND CAVEATS"
NONE_LINE = "ASSUMPTIONS AND CAVEATS: none raised."
BINARIES = ["choupoSolve", "choupoBatch", "choupoCtrl", "choupoSemiContinuous",
            "choupoProps"]


def run(case):
    p = subprocess.run([str(SOLVE), "."], cwd=str(ROOT / case),
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def run_copy(case, binary, outer=None):
    """Run a COPY of `case` (so an added outerDict never touches the tree)."""
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    with tempfile.TemporaryDirectory(prefix="caveat_") as tmp:
        dst = Path(tmp) / Path(case).name
        shutil.copytree(ROOT / case, dst)
        if outer is not None:
            (dst / "system" / "outerDict").write_text(outer)
        p = subprocess.run([str(binary), "."], cwd=str(dst), env=env,
                           capture_output=True, text=True, timeout=600)
        return p.returncode, p.stdout + p.stderr


def unverified_items(out, after=None):
    """The UNVERIFIED DATA lines of the (last) caveat block, as a set."""
    if after is not None:
        i = out.rfind(after)
        if i < 0:
            return None
        out = out[i:]
    i = out.rfind(HEADER)
    if i < 0:
        return None
    block = out[i:]
    j = block.find("UNVERIFIED DATA")
    if j < 0:
        return set()
    items = set()
    for line in block[j:].splitlines()[1:]:
        m = re.match(r'^\s{4}- (.+)$', line)
        if not m:
            break
        items.add(m.group(1))
    return items


def strip_code(text):
    """Blank out comments and string/char literal CONTENTS, keeping offsets,
    so parenthesis and brace matching is not fooled by a message such as
    "(standards beats local; local fills gaps)"."""
    out, i, n = list(text), 0, len(text)
    while i < n:
        c = text[i]
        if text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if out[k] != "\n":
                    out[k] = " "
            i = j
        elif c in "\"'":
            j = i + 1
            while j < n and text[j] != c:
                j += 2 if text[j] == "\\" else 1
            for k in range(i + 1, min(j, n)):
                if out[k] != "\n":
                    out[k] = " "
            i = j + 1
        else:
            i += 1
    return "".join(out)


def match_close(s, i, op, cl):
    """Index of the bracket closing the one at s[i] (== op)."""
    depth = 0
    for k in range(i, len(s)):
        if s[k] == op:
            depth += 1
        elif s[k] == cl:
            depth -= 1
            if depth == 0:
                return k
    return len(s) - 1


LATCH = "announceOnce("
ADD = "AdvisoryLog::instance().add("


def latched_adds(text):
    """Every `AdvisoryLog::instance().add(` governed by a process-lifetime
    `announceOnce(` latch -- the shape that erased a fact from every pass
    after the first.  Two governing forms are recognised:
      * `if (... announceOnce(...) ...) <statement>` -- the add is in the
        condition or the statement;
      * `if (!announceOnce(...)) return|continue;` -- the add is anywhere in
        the rest of the enclosing block."""
    s = strip_code(text)
    hits = []
    for m in re.finditer(r'\bif\s*\(', s):
        open_ = m.end() - 1
        close = match_close(s, open_, "(", ")")
        cond = s[open_:close + 1]
        if LATCH not in cond:
            continue
        k = close + 1
        while k < len(s) and s[k].isspace():
            k += 1
        if k < len(s) and s[k] == "{":
            end = match_close(s, k, "{", "}")
        else:
            end = s.find(";", k)
            end = len(s) - 1 if end < 0 else end
        body = s[k:end + 1]
        region = cond + body
        if re.match(r'\s*(return|continue)\b', body) and "!" + LATCH in cond.replace(" ", ""):
            depth, e = 0, end + 1
            while e < len(s):
                if s[e] == "{":
                    depth += 1
                elif s[e] == "}":
                    if depth == 0:
                        break
                    depth -= 1
                e += 1
            region = s[end + 1:e]
        if ADD in region:
            hits.append(text.count("\n", 0, m.start()) + 1)
    return hits


#  The scanner's own probe: the two shapes that were in the tree on
#  2026-09-27 (Database's in-gate add, HenrysLaw's early-return latch) MUST
#  be flagged, and the shape that replaced them MUST NOT.  A scanner that
#  cannot see its own subject passes everything.
PROBE_BAD = [
    'void a() { if (announceOnce("interim:" + n))\n'
    '  { AdvisoryLog::instance().add("provenance", "w", "c (x)", "m");\n'
    '    std::cerr << "[unreviewed] (not checked)\\n"; } }',
    'void b() { if (!announceOnce("henryTrange:" + p)) return;\n'
    '  std::string m = "evaluated (x)";\n'
    '  AdvisoryLog::instance().add("validity", "w", "Henry", m); }',
    'void c() { if (announceOnce("hxHgap:" + s)\n'
    '    && AdvisoryLog::instance().add("balance", "w", "hx", m))\n'
    '  std::cerr << "[hx]\\n"; }',
]
PROBE_GOOD = [
    'void d() { if (AdvisoryLog::instance().addAnnouncedOnce("interim:" + n,\n'
    '    "provenance", "w", "c", "m")) std::cerr << "[unreviewed]\\n"; }',
    'void e() { if (announceOnce("unmarked:" + n)) std::cerr << "x\\n";\n'
    '  AdvisoryLog::instance().add("provenance", "w", "c", "unrelated"); }',
]


def block_items(out):
    """The '- locus: message' lines of the caveat block."""
    i = out.find(HEADER)
    if i < 0:
        return None
    tail = out[i:]
    return re.findall(r'^\s{4}- ([^:]+): (.+)$', tail, re.M)


def json_advisories(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1)).get("advisories", [])
    except json.JSONDecodeError:
        return None


def main() -> int:
    fail, checked = [], []
    if not SOLVE.exists():
        print("check_caveat_surface: FAILED\n  choupoSolve is not built -- the "
              "probe cannot run, and a check that cannot run must not pass")
        return 1

    # ---- (a) the loud case names its components ------------------------
    rc, out = run(LOUD)
    if rc != 0:
        fail.append(f"{Path(LOUD).name} does not run (exit {rc})")
    else:
        items = block_items(out)
        if items is None:
            fail.append(f"{Path(LOUD).name} extrapolates and printed NO caveat "
                        "block at all")
        else:
            extrap = [(l, m) for l, m in items if "OUTSIDE its declared" in m]
            if not extrap:
                fail.append(f"{Path(LOUD).name} evaluates a Cp outside its "
                            "window yet the block lists no extrapolation")
            elif any(not l.startswith("component '") for l, _ in extrap):
                anon = [l for l, _ in extrap if not l.startswith("component '")]
                fail.append("an extrapolation caveat does not NAME its "
                            f"component ({anon}).  A reader cannot act on "
                            "'polynomial Cp' in a multi-component flowsheet.")
            else:
                checked.append(f"{len(extrap)} named extrapolation(s) listed "
                               f"({Path(LOUD).name})")

            # ---- (c) the block and the JSON agree ----------------------
            advs = json_advisories(out)
            if advs is None:
                fail.append("the result JSON has no parseable advisories array "
                            "-- the machine-readable half of the surface is "
                            "missing")
            else:
                jmsgs = {(a.get("locus", ""), a.get("message", "")) for a in advs}
                orphan = [i for i in items if tuple(i) not in jmsgs]
                if orphan:
                    fail.append(
                        f"{len(orphan)} caveat(s) printed in the block are NOT "
                        "in the result JSON, e.g. " + repr(orphan[0]) + ".  The "
                        "block must replay the log, never author its own "
                        "entries -- two surfaces disagreeing about what a run "
                        "announced is a second home for one fact.")
                else:
                    checked.append(f"all {len(items)} block item(s) present in "
                                   "the result JSON")

    # ---- (b) the clean case says so, explicitly ------------------------
    rc, out = run(SILENT)
    if rc != 0:
        fail.append(f"{Path(SILENT).name} does not run (exit {rc})")
    elif NONE_LINE not in out:
        fail.append(f"{Path(SILENT).name} raises no advisory and does not say "
                    "so.  A block that appears only when it has something to "
                    "say is indistinguishable from one that failed to run.")
    else:
        checked.append("clean run states 'none raised' explicitly")

    # ---- (e) an outer-driver run prints the block, and names its pass ---
    for case, word in ((SWEPT, "the LAST pass only"),
                       (REPRESENT, "the REPRESENTATIVE pass")):
        rc, out = run(case)
        name = Path(case).name
        if rc != 0:
            fail.append(f"{name} does not run (exit {rc})")
            continue
        if SCOPE not in out:
            fail.append(
                f"{name} ships an outerDict and printed NO caveat-scope line."
                "  The block used to sit inside the `else` of"
                " `if (outerDict)`, so every case with an outer driver printed"
                " neither it nor the divergence banner -- which is exactly the"
                " state AdvisorySummary.H forbids: silence must mean the"
                " engine raised nothing, never that the block did not run.")
        elif word not in out:
            fail.append(
                f"{name} printed the caveat block but does not say it"
                f" describes {word!r}.  An outer driver runs the simulator"
                " many times; a block that does not name the pass it is about"
                " invites the reader to take it for all of them.")
        elif HEADER not in out and NONE_LINE not in out:
            fail.append(f"{name} printed the scope line but no block after it")
        else:
            checked.append(f"outer-driver run {name} prints the block and"
                           f" names its pass ({word})")

    # ---- (f) a once-per-process fact is in the pass that consumed it -----
    #  The block under an outer driver describes ONE pass.  A record whose
    #  console line is printed once per PROCESS used to put its advisory
    #  inside that latch, so the per-pass clear erased it from every pass
    #  after the first: cavett01 listed UNVERIFIED DATA (7) run directly and
    #  NONE under a 2-point sweep, whose last pass consumed the same seven
    #  records.  The sweep's last point IS the design point, so its block must
    #  list exactly the unverified records the direct run lists.
    rc_d, out_d = run_copy(PERPASS, SOLVE)
    rc_s, out_s = run_copy(PERPASS, SOLVE, PERPASS_SWEEP)
    name = Path(PERPASS).name
    if rc_d != 0 or rc_s != 0:
        fail.append(f"{name} does not run (direct exit {rc_d}, swept exit {rc_s})")
    else:
        direct = unverified_items(out_d)
        swept = unverified_items(out_s, after=SCOPE)
        if not direct:
            fail.append(f"{name} run directly lists no UNVERIFIED DATA -- the "
                        "witness has lost its subject (seven interim records), "
                        "so this arm could not see the loss it exists for.  "
                        "Repoint it at a case whose records announce once per "
                        "process.")
        elif swept is None:
            fail.append(f"{name} under a sweep printed no caveat block after "
                        "its scope line")
        elif direct - swept:
            lost = sorted(direct - swept)
            fail.append(
                f"{name} under a 2-point sweep lists {len(swept)} of the "
                f"{len(direct)} unverified records its LAST pass consumed; "
                f"missing e.g. {lost[0]!r}.  A fact whose console line is "
                "printed once per process must still be RECORDED by every "
                "pass that consumes it (AdvisoryLog::addAnnouncedOnce) -- "
                "otherwise the block that describes one pass lists only what "
                "that pass happened to raise first.")
        else:
            checked.append(f"a swept run's last-pass block lists all "
                           f"{len(direct)} once-per-process records its direct "
                           f"twin lists ({name})")

    # ---- (g) the dynamic driver partitions per pass too ------------------
    if not CTRL.exists():
        fail.append("choupoCtrl is not built -- arm (g) cannot run, and a "
                    "check that cannot run must not pass")
    else:
        rc, out = run_copy(DYN_SWEPT, CTRL)
        name = Path(DYN_SWEPT).name
        items = unverified_items(out, after=SCOPE)
        if rc != 0:
            fail.append(f"{name} does not run (exit {rc})")
        elif SCOPE not in out or "the LAST pass only" not in out:
            fail.append(f"{name} (choupoCtrl, sweep) does not say its block "
                        "describes 'the LAST pass only'.  The dynamic driver "
                        "clears its log per pass, as choupoSolve does, and "
                        "must name the pass it reports.")
        elif not items or not any("'compA'" in it for it in items):
            fail.append(f"{name} runs on the SYNTHETIC component compA and its "
                        "last-pass block does not list it.  This is the loss "
                        "that made the first per-pass reset here be reverted: "
                        "a once-per-process fact dropped from every pass after "
                        "the first.")
        else:
            checked.append(f"the dynamic driver's last-pass block keeps the "
                           f"once-per-process synthetic-record fact ({name})")

    # ---- (h) no advisory behind a process-lifetime latch (source) --------
    #  The behavioural arms see the witnesses; this sees the SHAPE everywhere.
    #  It carries a probe: the two shapes that were in the tree must be
    #  flagged and the replacement must not, or the scanner is blind.
    probe_miss = [p for p in PROBE_BAD if not latched_adds(p)]
    probe_false = [p for p in PROBE_GOOD if latched_adds(p)]
    if probe_miss or probe_false:
        fail.append(f"the latch scanner failed its own probe ({len(probe_miss)} "
                    f"known-bad shape(s) not flagged, {len(probe_false)} good "
                    "shape(s) flagged) -- it cannot be trusted on the tree")
    else:
        found = []
        nfiles = 0
        for p in sorted((ROOT / "src").rglob("*")):
            if p.suffix not in (".cpp", ".H") or not p.is_file():
                continue
            nfiles += 1
            for line in latched_adds(p.read_text(errors="replace")):
                found.append(f"{p.relative_to(ROOT)}:{line}")
        if found:
            fail.append(
                "an AdvisoryLog add sits behind a process-lifetime "
                f"announceOnce latch at {', '.join(found)}.  The per-pass "
                "clear then erases the fact from every pass after the first; "
                "use AdvisoryLog::addAnnouncedOnce(key, ...), which records "
                "the entry per pass and returns true once per process for the "
                "console line.")
        else:
            checked.append(f"no advisory behind an announceOnce latch in "
                           f"{nfiles} source files (source scan, probe passed)")

    # ---- (d) every binary emits it -------------------------------------
    #  MATCH THE CALL, not the header name.  A first version looked for
    #  "AdvisorySummary" anywhere in the file -- which the call
    #  `printAdvisorySummary(...)` contains as a substring, so deleting the
    #  include alone left this arm green on a binary that would not compile.
    #  A sabotage a gate survives is a gate that was not testing what it said.
    #
    #  THIS ARM IS A SOURCE CHECK, not an observed run, and the OK line says
    #  so.  Driving all five binaries needs a case per application and would
    #  make this the slowest gate in the suite; arms (a)-(c) observe the real
    #  output of the one that can be driven cheaply.  Stating the limit is the
    #  difference between partial coverage and overclaimed coverage.
    #  A main that DELEGATES its run to a shared driver carries the call in
    #  the driver, not in main.cpp (choupoCtrl and choupoSemiContinuous both
    #  run src/dynamicDriver/ since 2026-09-20).  The scan therefore reads the
    #  main AND every `#include "dynamicDriver/..."` it names -- the file the
    #  binary actually runs -- never a hand-kept per-binary list, so a third
    #  application over the same driver is covered the day it includes it.
    def run_sources(b):
        main = ROOT / "src" / "applications" / b / "main.cpp"
        texts = [main.read_text()]
        for inc in re.findall(r'^\s*#\s*include\s+"(dynamicDriver/[^"]+)"',
                              texts[0], re.M):
            cpp = (ROOT / "src" / inc).with_suffix(".cpp")
            if cpp.exists():
                texts.append(cpp.read_text())
        return "".join(texts)
    missing = [b for b in BINARIES if "printAdvisorySummary(" not in run_sources(b)]
    if missing:
        fail.append("binaries with no caveat block: " + ", ".join(missing)
                    + ".  A surface present in some applications teaches the "
                      "reader that its absence means 'nothing to report'.")
    else:
        checked.append(f"all {len(BINARIES)} binaries CALL the summary (source check of each main and the driver it delegates to, not an observed run)")

    if fail:
        print("check_caveat_surface: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_caveat_surface: OK -- " + "; ".join(checked)
          + ".  The gate checks the SURFACE (named, silent when empty, "
            "agreeing with the JSON, present in every binary), never whether "
            "an advisory is JUSTIFIED -- that is curation, and "
            "check_cp_range_announced and check_review_status own those "
            "judgements.  DOMAIN: choupoSolve's own output on five corpus "
            "cases (cavett01 both directly and under a scratch 2-point sweep), "
            "choupoCtrl's on one, a source scan of the five binaries' main.cpp "
            "(and the driver two of them delegate to), and a source scan of "
            "src/ for an advisory behind an announceOnce latch.  "
            "LIMITS: arm (d) is a source check and cannot see an enclosing "
            "`if` -- which is how the outerDict silence survived it -- and "
            "arm (e) requires the block to RUN under an outer driver and to "
            "name its pass, never that the pass it names is the right one to "
            "report (that is a stated decision, recorded in main.cpp and in "
            "docs/design/three-silences-at-exit-zero.md); arm (h) sees "
            "`announceOnce` latches only, not a `static bool` or a once_flag; "
            "arm (g) cannot see a MISSING per-pass clear in the dynamic driver, "
            "because on ctrl20 the union and the last pass hold the same "
            "entry (docs/design/a-fact-raised-once-per-process.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
