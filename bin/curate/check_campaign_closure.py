#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: no shipped case shows a broken mass, element or energy balance.

    bin/curate/check_campaign_closure.py                 # static + live (the sweep's form)
    bin/curate/check_campaign_closure.py --static        # the golden files alone, no run
    bin/curate/check_campaign_closure.py --cases DIR...  # live arm on these cases only
    bin/curate/check_campaign_closure.py --check-expected FILE   # record time

WHY THIS EXISTS (DEV.md 4c C258, 2026-11-09).  The owner opened a shipped
adsorber tutorial and the Global balances view read "mass closure 4.16E-2,
worst element closure 1.13E-1 (He)"; the dryers read 21.6 % and 31 %.  The
suite had called every one of them PASS, for two reasons that are the whole
design of this gate: (1) a golden PINS what a run prints, so a violated
balance that was recorded once is "unchanged" for ever; (2) check_mass_closure
reads STEADY cases only -- no time-integrated case (batch, ctrl, semicontinuous)
was ever asked whether it conserves anything.  "No shipped case may show a
broken balance that only its log explains."

THREE POINTS, all failing loudly, none skippable (the owner's order: "garante
que isto JAMAIS volta a acontecer sem que a suite diga que o caso falhou"):

  (i)   STATIC.  Every `expected` file under tutorials/ is read, every key that
        is a mass, element, solute or energy CLOSURE is checked against the
        tolerance, and a pinned value above it FAILS.  No run is needed, so
        bin/runTests calls this arm at its start in EVERY mode -- the full
        sweep, --fast, --scope, --gui and --witnesses (it is the first gate,
        before any mode branches).
  (ii)  AT RECORD TIME.  `bin/runTests --record` and `--record-append` hand the
        generated golden to `--check-expected` and REFUSE to write one whose
        closure exceeds the tolerance, naming the key and the value.  A golden
        must never again freeze a violated balance.
  (iii) AT RUN TIME.  Every time-integrated case's OWN published campaign
        closure (the engine's numbers, read from its result block, never
        recomputed here -- the balance has one home) is held to the same
        tolerance on the live run.  Under --fast / --scope it judges the cases
        that pass ran and says so.

NO DECLARED-CAUSE EXEMPTION (the owner's ruling, same day: "Mesmo que haja
arraste, tem de se criar uma corrente extra para apanhar a massa").  A
modelling assumption that creates or destroys matter is a NAMED STREAM that
carries exactly that mass (the fixed bed's `carrierMakeUp`, the dryer's
evaporated water), so every balance CLOSES and the stream is the explanation.
There is therefore no list here and no pin: a mass or element closure above
the tolerance is a defect, whatever its cause.  ENERGY has one honest
posture and no list: where the engine REFUSES the claim
(`energy_balance_available 0`, named gaps in its log) there is no number shown
as closed and nothing to judge; where it CLAIMS the balance, the number is
held, and an assumption that implies heat (the isothermal bed's wall duty) is
a NAMED HEAT STREAM of the energy ledger, so the claim closes.  The steady
gates' own KNOWN_OPEN lists (check_energy_closure, check_element_closure) are
about steady plants and are not touched.

THE TOLERANCES, one home each.
  * mass / element / solute closure (a fraction): CAMPAIGN_TOL = 1e-3 (0.1 %).
    The steady gate's band (check_mass_closure BAND, 0.5 %) exists for plants
    with recycle tears that converge to a declared tolerance; a campaign is an
    ODE integration with no tear, the engine itself calls a campaign non-
    converged above 1e-6, and the worst shipped NUMERICAL residual is 1.4e-4
    (batch17, an Ergun bed).  0.1 % is the owner's own threshold and sits
    above every honest campaign and below every defect this was built for.
  * energy closure: the steady energy gate's BAND, READ FROM ITS SOURCE below
    (never copied), because the first-law closure is one rule.

WHAT THIS DOES NOT CHECK, said plainly: that a closing balance is RIGHT (a
stream that carries exactly the missing mass closes any balance -- the stream
must be a physical statement the case's lesson can defend, and each one is
named and announced by the engine); steady cases (their own gates); absolute
energy gaps in kW (`H_closure_gap_kW`, check_energy_closure's); and a case that
publishes no closure key at all, which is COUNTED and NAMED below, never
silently skipped.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from suite_cache import SCOPED, scope_sentence, stdout_of, no_subject   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

CAMPAIGN_TOL = 1.0e-3

#  The keys the engine emits that ARE a mass / element / solute closure
#  (matched from the engine's source -- grep '"[A-Za-z_]*closure[A-Za-z_]*"'
#  over src/ -- not by guess).  `model_closure_*` and `mass_closure_<species>`
#  are the fixed bed's telescopic DISCRETISATION identities, not a physical
#  closure; `carrier_makeup_rel` is the SIZE of an assumption, not a closure.
MASS_ELEMENT_KEY = re.compile(
    r"^(mass_closure_rel|solute_closure_rel|closure_worst_rel"
    r"|element_worst_closure_rel|element_worst_closure_vs_declared_rel"
    r"|element_[A-Za-z]+_closure_rel"
    r"|kpi_(mass|solute)_closure_rel_final)$")
ENERGY_KEY = "energy_closure_rel"
ENERGY_AVAILABLE = "energy_balance_available"


def energy_tol():
    """The steady energy gate's BAND (per cent), read from its source."""
    txt = (ROOT / "bin/curate/check_energy_closure.py").read_text()
    m = re.search(r"^BAND\s*=\s*([0-9.eE+-]+)", txt, re.M)
    if not m:
        raise SystemExit("check_campaign_closure: cannot read BAND from "
                         "check_energy_closure.py -- the one home moved")
    return float(m.group(1)) / 100.0


ENERGY_TOL = energy_tol()

def judge(unit_kpis, case=None):
    """unit_kpis: {unit: {key: value}} -> list of (unit, key, value, tol).
    `case` is accepted for call-site symmetry and used for nothing: there is
    NO exemption for any case, mass, element or energy."""
    bad = []
    for unit, kv in unit_kpis.items():
        for key, v in kv.items():
            if not isinstance(v, (int, float)):
                continue
            if MASS_ELEMENT_KEY.match(key):
                if abs(v) > CAMPAIGN_TOL:
                    bad.append((unit, key, v, CAMPAIGN_TOL))
            elif key == ENERGY_KEY:
                if kv.get(ENERGY_AVAILABLE, 1) == 0:
                    continue          # the engine REFUSED the claim: no number
                if abs(v) > ENERGY_TOL:
                    bad.append((unit, key, v, ENERGY_TOL))
    return bad


# ---- (i) / (ii): the golden files ------------------------------------------
def read_expected(path):
    kv = {}
    n = 0
    for line in Path(path).read_text(errors="replace").splitlines():
        p = line.split()
        if len(p) < 5 or p[0] != "kpi":
            continue
        try:
            kv.setdefault(p[1], {})[p[2]] = float(p[3])
            n += 1
        except ValueError:
            pass
    return kv


def static_findings():
    out, files = [], 0
    for f in sorted(ROOT.glob("tutorials/**/expected")):
        files += 1
        kv = read_expected(f)
        for unit, key, v, tol in judge(kv, f.parent.name):
            out.append("%s: pinned %s.%s = %.6g exceeds %.3g -- a golden must "
                       "not freeze a violated balance; fix the case (name the "
                       "stream that carries the matter) and re-record"
                       % (f.parent.relative_to(ROOT), unit, key, v, tol))
    return out, files


# ---- (iii): the live run ----------------------------------------------------
APP = re.compile(r"^\s*application\s+(\w+)\s*;", re.M)
TIME_APPS = ("choupoBatch", "choupoCtrl", "choupoSemiContinuous")
RESULT = re.compile(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                    re.S)


ONLY = None     # set by --cases: the live arm judges these directories alone


def time_cases():
    for cd in sorted(ROOT.glob("tutorials/**/system/controlDict")):
        m = APP.search(cd.read_text(errors="ignore"))
        if not m or m.group(1) not in TIME_APPS:
            continue
        case = cd.parent.parent
        if ONLY is not None and case.resolve() not in ONLY:
            continue
        if (case.parent / "system" / "controlDict").is_file():
            continue                   # a sector, run through its parent
        yield case, m.group(1)


def kpis_of(text):
    m = RESULT.search(text)
    if not m:
        return None
    try:
        return json.loads(m.group(1)).get("kpis", {})
    except ValueError:
        return None


def live(case, app):
    txt = stdout_of(case)
    if txt is not None:
        return txt
    if SCOPED:
        return None
    p = subprocess.run([str(ROOT / app), str(case)], capture_output=True,
                       text=True, timeout=900)
    return p.stdout + p.stderr


def run_arm():
    findings, judged, none_pub, skipped, optout = [], 0, [], 0, []
    for case, app in time_cases():
        if (case / ".expect-nonconvergence").exists() \
                or (case / ".known-broken").exists():
            optout.append(case.name)
            continue
        txt = live(case, app)
        if txt is None:
            skipped += 1
            continue
        k = kpis_of(txt)
        if k is None:
            findings.append("%s: no result block in the run output -- a case "
                            "this gate cannot read is not a case it can pass"
                            % case.relative_to(ROOT))
            continue
        has = any(MASS_ELEMENT_KEY.match(key) or key == ENERGY_KEY
                  for kv in k.values() for key in kv)
        if not has:
            none_pub.append(case.name)
            continue
        judged += 1
        for unit, key, v, tol in judge(k, case.name):
            findings.append("%s: the run's own %s.%s = %.6g exceeds %.3g -- a "
                            "broken balance on screen; book the matter as a "
                            "named stream or fix the leak"
                            % (case.relative_to(ROOT), unit, key, v, tol))
    return findings, judged, none_pub, skipped, optout


def main(argv):
    if len(argv) >= 2 and argv[1] == "--check-expected":
        bad = judge(read_expected(argv[2]),
                    Path(argv[2]).resolve().parent.name)
        for unit, key, v, tol in bad:
            print("REFUSED to record: %s.%s = %.6g exceeds the campaign "
                  "closure tolerance %.3g -- a golden must never freeze a "
                  "violated balance.  Name the stream that carries the "
                  "matter (or fix the leak), then record."
                  % (unit, key, v, tol))
        return 1 if bad else 0

    global ONLY
    if "--cases" in argv:
        ONLY = {Path(a).resolve() for a in argv[argv.index("--cases") + 1:]}
    static, nfiles = static_findings()
    if "--static" in argv:
        for s in static:
            print("FAIL " + s)
        if static:
            return 1
        print("check_campaign_closure --static: OK -- %d expected file(s) read, "
              "no pinned mass/element/solute closure above %.3g and no "
              "energy closure above %.3g where the claim stands."
              % (nfiles, CAMPAIGN_TOL, ENERGY_TOL))
        return 0

    cases = list(time_cases())
    if SCOPED and not any(stdout_of(c) is not None for c, _ in cases):
        rc = no_subject("check_campaign_closure",
                        "no time-integrated case was run in this pass")
        if rc is not None:
            #  the static arm still judges the golden files, always
            if static:
                for s in static:
                    print("FAIL " + s)
                return 1
            return rc
    runf, judged, none_pub, skipped, optout = run_arm()
    fails = static + runf
    for s in fails:
        print("FAIL " + s)
    if fails:
        return 1
    claim = ("check_campaign_closure: OK -- %d expected file(s) hold no "
             "closure above tolerance; %d time-integrated case(s) run, every "
             "one's own mass/element/solute closure within %.3g and every "
             "claimed energy closure within %.3g (no declared-cause "
             "exemption exists)."
             % (nfiles, judged, CAMPAIGN_TOL, ENERGY_TOL))
    if none_pub:
        claim += ("  %d case(s) publish no closure key and were not judged: "
                  "%s." % (len(none_pub), ", ".join(none_pub)))
    if optout:
        claim += ("  %d case(s) carry a declared opt-out marker and produce "
                  "no answer: %s." % (len(optout), ", ".join(optout)))
    claim += scope_sentence(judged + len(none_pub), skipped)
    print(claim)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
