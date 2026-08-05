#!/usr/bin/env python3
"""Gate: a declared validity window must be a window.

    bin/curate/check_validity_windows.py

WHY THIS EXISTS.  Invariant I4 says a number outside its fitted range is
ANNOUNCED, never silently extrapolated -- the professor extrapolates on
purpose, but knows he did.  That announcement is driven by a declared
interval, and nothing ever checked that the interval is one.

The 2026-08-05 provenance audit found six component records declaring
`Trange (hi lo)` with hi <= lo:

    neon           (30  27)      krypton        (121 120)
    Xe             (166 165)     D2             (24  24)
    OrthoDeuterium (24  24)      ParaDeuterium  (24  24)

all inside `liquidHeatCapacity`, all under a comment claiming a real fit
("fitted to CoolProp saturated-liquid cp") with a FOUR-TERM polynomial.
A cubic cannot be fitted over a 1 K span, and it cannot be fitted at all
over a 0 K one.

The consequence is not cosmetic: an empty or inverted interval makes the
I4 announcement either DEAD (nothing is ever outside it, if the test is
lo <= T <= hi and the set is empty -- so it fires always) or MEANINGLESS.
Either way the user is told something false about the domain of a number
he is about to use.  A validity field nobody validates is exactly the
"declared but unenforceable" shape this project keeps finding.

WHAT IS AND IS NOT CHECKED.  This gate makes the WEAKEST claim that is
certainly true: an interval's upper bound must exceed its lower bound.
It deliberately does NOT check that a range is physically sensible (inside
the liquid span, say), because that requires knowing what was fitted and
this gate does not.  A weak check that cannot be wrong beats a strong one
that guesses.

RESOLVED 2026-08-05 -- THE SIX ARE MIGRATED AND THE ENGINE NOW REFUSES.
The gap was that a curator with no recoverable window had no way to SAY so:
omitting the key is indistinguishable from never having considered it, so an
impossible interval was the only way to signal "unknown", and the engine
merely announced it.  `Trange unknown;` is that missing form.  All six records
declare it now, `PolynomialCp` REFUSES an inverted interval by name at
construction, and an `unknown` window announces on every run.

An inverted interval is not extrapolation -- which I4 explicitly permits --
it is a MALFORMED CLAIM about where a correlation holds, and there is nothing
to extrapolate from.  That distinction is why refusing here does not
contradict I4.

The original pin text follows, because the reasoning still binds anyone
tempted to "fix" the six by guessing:  They are NOT fixed by
inventing a range: the fit's true domain is a fact about the regression
that produced it, and fabricating it would put a made-up number where a
measured one belongs -- the estimate-dressed-as-measurement failure I3
forbids.  They are pinned so the gate is GREEN on today's tree and turns
RED the moment a SEVENTH appears, and the pin list is the curation
work-list.  Removing a name from the pin list without fixing the record
makes the gate fail, by design.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  The interval keys this project uses for a declared validity window.
#  `Trange (lo hi)` is the common one; pRange appears on adsorption records.
PAT = re.compile(r'\b(Trange|pRange)\s*\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)')

#  KNOWN-BAD, pinned 2026-08-05.  Each is a CoolProp-derived liquid-Cp fit
#  whose declared window is inverted or degenerate.  The remedy is to
#  re-derive the window from the regression that produced the coefficients
#  -- a CURATION act, not a code change.  Do not "fix" these by guessing.
PINNED = set()
SCAN = ["data/standards", "tutorials"]

#  A LIVE PROBE, because none of the six records is used by any tutorial.
#  A refusal no case fires is not a refusal -- the gate would be asserting
#  engine behaviour it never observed.  So the engine is actually run: once
#  over a record declaring `Trange unknown;` (must announce, must succeed) and
#  once over a deliberately inverted one (must refuse by name, must fail).
PROBE_CASE = "tutorials/electrochem/ed01_nacl_desalination"
PROBE_RECORD = "constant/components/water.dat"


def probe_engine():
    """RUN the engine.  Three states, three observed outcomes.

    None of the six migrated records is used by any tutorial, so nothing in
    the corpus would ever have exercised either behaviour -- the gate would be
    asserting engine conduct it had never seen.  So it uses a case that DOES
    carry a `liquidHeatCapacity` polynomial and rewrites that one field in a
    scratch copy.  The standards tree is never touched.

    Two findings came out of building this probe, and both were invisible to a
    clean build and a green static check:

      * detecting `unknown` via `lookupWordOrDefault` THROWS on a list rather
        than returning its default, so the first version refused every
        component in the catalogue that declares a numeric window;
      * the `unknown` announcement was emitted from inside `Cp(T)`, so a case
        that loads the component without evaluating its liquid Cp printed
        nothing.  It is announced at CONSTRUCTION now -- the fact is about the
        record, not about a temperature.
    """
    import shutil, subprocess, tempfile
    src = ROOT / PROBE_CASE
    if not src.is_dir():
        return ["probe case %s is gone -- the probe is stale, not the engine"
                % PROBE_CASE]
    exe = ROOT / "choupoSolve"
    if not exe.exists():
        return ["choupoSolve is not built -- the probe cannot run, and a check "
                "that cannot run must not pass"]

    out = []
    tmp = Path(tempfile.mkdtemp(prefix="choupo-vw-"))
    try:
        for label, repl, want_rc, want_text in [
            ("clean",   None,                    0, None),
            ("inverted", "Trange        (373  273);", None,
             "is not an interval"),
            ("unknown",  "Trange        unknown;",   0,
             "declares `Trange unknown;`"),
        ]:
            d = tmp / label
            shutil.copytree(src, d)
            if repl is not None:
                rec = d / PROBE_RECORD
                txt = rec.read_text()
                m = re.search(r'(liquidHeatCapacity\s*\{.*?)Trange\s*\([^)]*\);',
                              txt, re.S)
                if not m:
                    out.append("probe: %s has no liquidHeatCapacity Trange -- "
                               "the probe is stale" % PROBE_RECORD)
                    continue
                rec.write_text(txt[:m.start(0)] + m.group(1) + repl
                               + txt[m.end(0):])
            r = subprocess.run([str(exe), "."], cwd=str(d),
                               capture_output=True, text=True, timeout=300)
            blob = r.stdout + r.stderr
            if want_rc is not None and r.returncode != want_rc:
                out.append("probe[%s]: exit %d, expected %d"
                           % (label, r.returncode, want_rc))
            if want_rc is None and r.returncode == 0:
                out.append("probe[%s]: the engine ACCEPTED an impossible "
                           "validity window -- an inverted interval is not "
                           "extrapolation, it is a malformed claim about where "
                           "a correlation holds" % label)
            if want_text and want_text not in blob:
                out.append("probe[%s]: the engine did not say %r"
                           % (label, want_text))
            if label == "clean" and "Trange unknown" in blob:
                out.append("probe[clean]: an untouched record announced an "
                           "unknown window -- an absence must keep meaning "
                           "what it meant")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out


def main() -> int:
    bad, pinned_seen, nfiles, nwindows = [], set(), 0, 0
    for root in SCAN:
        for p in sorted((ROOT / root).rglob("*.dat")):
            try:
                text = p.read_text()
            except (UnicodeDecodeError, OSError):
                continue
            nfiles += 1
            rel = p.relative_to(ROOT).as_posix()
            for n, line in enumerate(text.splitlines(), 1):
                m = PAT.search(line)
                if not m:
                    continue
                nwindows += 1
                key, lo, hi = m.group(1), float(m.group(2)), float(m.group(3))
                if hi > lo:
                    continue
                if rel in PINNED:
                    pinned_seen.add(rel)
                    continue
                bad.append(f"{rel}:{n}  {key} ({lo} {hi})"
                           f"  -- upper bound {'equals' if hi == lo else 'is below'}"
                           f" the lower")

    #  A pin that no longer fires means the record was fixed (good) or moved
    #  (needs attention).  Either way the pin is stale and must not linger:
    #  a pin list that outlives its reason is a second home for a fact.
    stale = sorted(PINNED - pinned_seen)

    bad.extend(probe_engine())

    if bad or stale:
        print("check_validity_windows: FAILED")
        for b in bad:
            print("  NEW inverted/empty window: " + b)
        for s in stale:
            print(f"  STALE PIN: {s} no longer declares a bad window "
                  "-- remove it from PINNED")
        return 1

    print(f"check_validity_windows: OK -- {nwindows} declared window(s) across "
          f"{nfiles} record(s); every one has hi > lo, except {len(PINNED)} "
          "pinned CoolProp liquid-Cp fits awaiting re-derivation of their "
          "regression domain (a curation act, not a guess)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
