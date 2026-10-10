#!/usr/bin/env python3
"""Gate: every heat duty a unit publishes is allocated, carried or LISTED --
never dropped -- and a declared utility is held to what it can serve.

    bin/curate/check_unit_duty_allocation.py

WHY THIS EXISTS (DEV.md 4c C52, 2026-10-10).  Vítor, on the green-ammonia
converter: "o reator gibbs não devia ter utilidade de calor?!!!"  The
converter, an isothermal gibbsReactor at 460 C, publishes Q_kW = -30 605 kW;
the energy report priced it; the utility allocation read only the KPI `Q`
in W (plus a column's two port keys) and so DROPPED it -- and the same for
every cstr, conversionReactor, equilibriumReactor, pfr and crystalliser in
the corpus.  Not allocated, not listed unserved, absent from C_UT and from
the economics' count of unpriced duties.  Two readers asking "does this unit
have a duty" with two key lists.  The answer has ONE home now,
`reporting::unitHeatDuties` (src/reporting/BalanceMath.H), derived from the
same `energyItemKpis()` the first law reads.

WHAT THIS CHECKS:
  (a) SOURCE.  The allocation reads duties ONLY through `unitHeatDuties`
      (no `kf("Q")`, no port-key literal of its own); `unitHeatDuties` reads
      `energyItemKpis()`; the auto-pick skips a credit and filters on
      `canServe`; the economics count of unpriced duties skips a CARRIED row.
  (b) COVERAGE.  Over the witness and five small cases (a jacketed cstr, a
      cooled gibbsReactor, a TSA with two ported duties, a crystalliser, a
      cooling tower): every boundary heat duty the run publishes (|Q| >= 1 W,
      keys and ports READ from `heatDutyPorts()` in BalanceMath.H, never
      typed here) has an allocation row on its port.
  (c) THE WITNESS.  greenAmmoniaIndustrialN2: the Converter's row is the
      DECLARED steamGenerationHP, allocated, its duty the unit's own Q_kW,
      its cost NEGATIVE (a credit); C_UT_credit equals the credit rows times
      the declared operating hours; and the economics' "N duties could not be
      allocated" counts exactly the UNSERVED rows (the carried FEHE is not
      one).
  (d) A CREDIT IS NEVER AUTO-PICKED.  The same case with the declaration
      removed allocates the converter to a utility that is not the credit,
      at a positive cost.
  (e) REFUSALS, each fired through the real engine on a damaged COPY: a
      declared utility of the wrong tier, one not in the catalogue, a credit
      declared on a duty too cold for it to receive heat, and a declaration
      on a unit that publishes no generic duty.  Each must exit non-zero and
      say WHY in the words the engine uses.

THE NEGATIVES: the undamaged copies run clean and allocate; without that a
gate would pass an engine that refused everything.

SABOTAGES, by hand, 2026-10-10, each rebuilt and the gate run, then restored:
  S1  `unitHeatDuties` skips a `Q_kW` with no `Q` twin (the old reading):
      caught by (b) on four cases, (c) (the witness REFUSES: its declared
      utility now serves nothing), (d) and (e) -- the defect, reproduced.
  S2  `pickForDuty` no longer skips a credit: caught by (d) -- the undeclared
      converter auto-picked steamGenerationHP.  (a) did NOT catch it: the
      sabotage left the `u.cost < 0.0` text in place behind `false &&`, so the
      behavioural arm is the one that sees it.
  S3  the economics counts a carried row as unpriced: caught by (a) and (c)
      (2 said, 1 unserved).
  S4  a declared utility is no longer held to `canServe`: caught by (e) on
      the wrong-tier and too-cold probes, both exiting 0.

NOT CHECKED, said plainly: whether a declared price is RIGHT (the credit's
-18 EUR/GJ is an author-set assumption, stated in its record); the GUI half
(gui/tests/reactorDutyStub.test.ts holds it); the pinch pass and the
utilities consumption report, which ask different questions (a stream
segment, a utility stream's delivered duty) and are left on their own keys.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
LABEL = "check_unit_duty_allocation"

WITNESS = "tutorials/plant/greenAmmoniaIndustrialN2"
SMALL = [
    "tutorials/steady/reactors/cstr06_jacketed",
    "tutorials/steady/gibbs/gibbs07_wgs_cooled",
    "tutorials/steady/separation/tsa01_co2_twin_bed",
    "tutorials/steady/crystallisation/crystalliser01_sugar",
    "tutorials/steady/heat/coolingTower01_merkel",
]
GIBBS = "tutorials/steady/gibbs/gibbs07_wgs_cooled"
TSA = "tutorials/steady/separation/tsa01_co2_twin_bed"
CREDIT = "steamGenerationHP"


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def copy(case: str, td: Path) -> Path:
    dst = td / Path(case).name
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(ROOT / case, dst, ignore=shutil.ignore_patterns(
        "converged", "design", "reports", "iterations", "postProcessing"))
    return dst


def run(case: Path):
    p = subprocess.run([str(SOLVE), str(case)], capture_output=True, text=True,
                       timeout=900, cwd=str(ROOT))
    out = p.stdout + p.stderr
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  p.stdout, re.S)
    res = None
    if m:
        try:
            res = json.loads(m.group(1))
        except ValueError:
            res = None
    return p.returncode, out, res


def duty_ports():
    """[(kpi, port)] from heatDutyPorts() in BalanceMath.H -- READ, not typed."""
    src = (ROOT / "src/reporting/BalanceMath.H").read_text(errors="replace")
    m = re.search(r"heatDutyPorts\(\)\s*\{(.*?)return ports;", src, re.S)
    if not m:
        return []
    return re.findall(r'\{\s*"(Q_\w+)"\s*,\s*"(\w*)"\s*,\s*"\w*"\s*\}', m.group(1))


def main() -> int:
    fail, claims = [], []
    if not SOLVE.exists():
        print(f"{LABEL}: FAILED\n  choupoSolve not built")
        return 1

    # ---- (a) source --------------------------------------------------------
    ua = strip_comments((ROOT / "src/reporting/UtilityAllocationReport.cpp")
                        .read_text(errors="replace"))
    if "reporting::unitHeatDuties(" not in ua:
        fail.append("(a) UtilityAllocationReport.cpp no longer calls"
                    " reporting::unitHeatDuties -- the one home of a unit's duty")
    for lit in ('kf("Q")', '"Q_reboiler_kW"', '"Q_condenser_kW"', '"Q_kW"'):
        if lit in ua:
            fail.append(f"(a) UtilityAllocationReport.cpp reads {lit} itself --"
                        " a second key list for 'this unit has a duty'")
    bm = strip_comments((ROOT / "src/reporting/BalanceMath.H")
                        .read_text(errors="replace"))
    body = bm.split("unitHeatDuties(", 1)[-1] if "unitHeatDuties(" in bm else ""
    if "energyItemKpis()" not in body or "isInternalMediumDutyKpi" not in body:
        fail.append("(a) unitHeatDuties no longer derives from energyItemKpis()"
                    " / isInternalMediumDutyKpi -- the first law and the"
                    " allocation would read two lists")
    cat = strip_comments((ROOT / "src/thermo/utility/UtilityCatalogue.cpp")
                         .read_text(errors="replace"))
    pick = cat.split("UtilityCatalogue::pickForDuty", 1)[-1].split(
        "UtilityCatalogue::canServe", 1)[0]
    if "u.cost < 0.0" not in pick or "canServe(" not in pick:
        fail.append("(a) pickForDuty no longer skips a credit (cost < 0) and"
                    " filters on canServe")
    eco = strip_comments((ROOT / "src/postProcessing/EconomicsPass.cpp")
                         .read_text(errors="replace"))
    if "!a.carried" not in eco:
        fail.append("(a) EconomicsPass counts a CARRIED row as an unpriced duty")
    ports = duty_ports()
    if len(ports) < 3:
        fail.append("(a) could not read heatDutyPorts() from BalanceMath.H")
    claims.append(f"source: one home, {len(ports)} duty port(s) read")

    td = Path(tempfile.mkdtemp(prefix="c52_"))
    try:
        # ---- (c) the witness, and (b) its coverage --------------------------
        wit = copy(WITNESS, td)
        rc, out, res = run(wit)
        results = []
        if rc != 0 or res is None:
            fail.append(f"(c) {WITNESS} does not run clean (exit {rc})")
        else:
            results.append((WITNESS, res))
            rows = res.get("utilityAllocation") or []
            conv = [r for r in rows if r.get("unit") == "Converter"]
            qkw = (res.get("kpis") or {}).get("Converter", {}).get("Q_kW")
            if len(conv) != 1:
                fail.append(f"(c) the Converter has {len(conv)} allocation"
                            " row(s); its Q_kW is dropped or doubled")
            else:
                c = conv[0]
                if c.get("utility") != CREDIT or c.get("allocated") is not True:
                    fail.append(f"(c) the Converter is served by"
                                f" {c.get('utility')!r}, not the DECLARED {CREDIT}")
                if not (isinstance(c.get("eur_h"), (int, float)) and c["eur_h"] < 0):
                    fail.append("(c) the Converter's steam is not a CREDIT"
                                f" (eur_h {c.get('eur_h')})")
                if qkw is None or abs(c.get("duty_kW", 0) - qkw) > 1e-9 * abs(qkw):
                    fail.append(f"(c) the allocated duty {c.get('duty_kW')} kW is"
                                f" not the unit's own Q_kW {qkw}")
            econ = (res.get("kpis") or {}).get("economics", {})
            pf = (wit / "system/postDict").read_text(errors="replace")
            m = re.search(r"^\s*streamFactor\s+([0-9.]+)", pf, re.M)
            H = float(m.group(1)) * 8760.0 if m else None
            credit = sum(r["eur_h"] for r in rows
                         if r.get("allocated") and r.get("eur_h", 0) < 0)
            got = econ.get("C_UT_credit")
            if H is None or got is None or abs(got - credit * H) > 1e-6 * abs(credit * H):
                fail.append(f"(c) C_UT_credit {got} is not the credit rows x H"
                            f" ({credit} EUR/h x {H} h)")
            unserved = sum(1 for r in rows
                           if not r.get("allocated") and not r.get("carried"))
            m = re.search(r"\[economics\] (\d+) heat duty/duties could not be"
                          r" allocated", out)
            said = int(m.group(1)) if m else 0
            if said != unserved:
                fail.append(f"(c) the economics says {said} duty/duties could"
                            f" not be allocated; the run lists {unserved}"
                            " UNSERVED (carried rows are not unpriced)")
            claims.append(f"witness: Converter -> {CREDIT}, credit"
                          f" {got:.0f} EUR/yr, {unserved} unserved counted"
                          if got is not None else "witness ran")

        for case in SMALL:
            rc, out, res = run(copy(case, td))
            if rc != 0 or res is None:
                fail.append(f"(b) {case} does not run clean (exit {rc})")
                continue
            results.append((case, res))

        ncov = 0
        for case, res in results:
            rows = res.get("utilityAllocation") or []
            have = {(r.get("unit"), r.get("port") or "") for r in rows}
            for unit, k in (res.get("kpis") or {}).items():
                for kpi, port in ports:
                    v = k.get(kpi)
                    if v is None and kpi == "Q_kW":
                        v = k.get("Q")
                        v = None if v is None else v / 1000.0
                    if v is None or abs(v) * 1000.0 < 1.0:
                        continue
                    ncov += 1
                    if (unit, port) not in have:
                        fail.append(f"(b) {case}: unit '{unit}' publishes"
                                    f" {kpi} = {v} kW and the allocation has"
                                    f" NO row for port '{port or '-'}' -- a"
                                    " duty dropped in silence")
        claims.append(f"coverage: {ncov} published duty/duties over"
                      f" {len(results)} case(s), each with a row")

        # ---- (d) a credit is never auto-picked ------------------------------
        (td / "nodecl").mkdir()
        nod = copy(WITNESS, td / "nodecl")
        cf = nod / "Converter/system/flowsheetDict"
        txt = cf.read_text()
        txt2 = re.sub(r"^\s*utility\s+" + CREDIT + r"\s*;\s*$", "", txt, flags=re.M)
        if txt2 == txt:
            fail.append("(d) the witness's Converter declares no utility to remove")
        else:
            cf.write_text(txt2)
            rc, out, res = run(nod)
            if rc != 0 or res is None:
                fail.append(f"(d) the undeclared witness does not run (exit {rc})")
            else:
                conv = [r for r in res.get("utilityAllocation") or []
                        if r.get("unit") == "Converter"]
                if not conv or conv[0].get("utility") == CREDIT \
                        or not conv[0].get("allocated") \
                        or not conv[0].get("eur_h", 0) > 0:
                    fail.append("(d) undeclared, the Converter is"
                                f" {conv[0] if conv else 'MISSING'} -- a credit"
                                " was picked, or the duty went unserved")
                else:
                    claims.append(f"undeclared: auto-pick {conv[0]['utility']},"
                                  " never the credit")

        # ---- (e) refusals --------------------------------------------------
        def declare(case: str, word: str, sub: str, after: str,
                    credit_record: bool = False) -> Path:
            d = td / sub
            d.mkdir()
            c = copy(case, d)
            fd = c / "system/flowsheetDict"
            t = fd.read_text()
            t2 = re.sub(after, lambda m: m.group(0) + "\n        utility " + word + ";",
                        t, count=1, flags=re.M)
            fd.write_text(t2)
            if credit_record:
                u = c / "constant/utilities"
                u.mkdir(parents=True, exist_ok=True)
                shutil.copy(ROOT / WITNESS / "constant/utilities" / (CREDIT + ".dat"), u)
            return c

        g_ok = None
        (td / "neg").mkdir()
        rc, out, res = run(copy(GIBBS, td / "neg"))
        if rc != 0 or not res or not res.get("utilityAllocation"):
            fail.append(f"(e) undamaged {GIBBS} does not run and allocate (exit {rc})")
        else:
            g_ok = True
        probes = [
            ("wrong tier", GIBBS, "steamHP", r"^\s*type\s+gibbsReactor;", False,
             ["utility allocation refused", "cannot serve", "tier is 'heating'"]),
            ("not in catalogue", GIBBS, "noSuchUtility", r"^\s*type\s+gibbsReactor;",
             False, ["utility allocation refused", "not in the loaded catalogue"]),
            ("credit too cold", GIBBS, CREDIT, r"^\s*type\s+gibbsReactor;", True,
             ["utility allocation refused", "cannot serve", "above the process T"]),
            ("no generic duty", TSA, "coolingWater", r"^\s*type\s+tsaTwinBed;", False,
             ["utility allocation refused", "publishes no heat duty"]),
        ]
        nref = 0
        for i, (name, case, word, after, cr, needles) in enumerate(probes):
            c = declare(case, word, f"p{i}", after, cr)
            rc, out, _ = run(c)
            missing = [n for n in needles if n not in out]
            if rc == 0 or missing:
                fail.append(f"(e) {name}: `utility {word};` on {case} exited"
                            f" {rc}; missing from the message: {missing}")
            else:
                nref += 1
        claims.append(f"refusals: {nref}/{len(probes)} fired with their reason"
                      + ("" if g_ok else " (NEGATIVE FAILED)"))
    finally:
        shutil.rmtree(td, ignore_errors=True)

    if fail:
        print(f"{LABEL}: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print(f"{LABEL}: OK -- every boundary heat duty a unit publishes reaches the"
          " utility allocation through ONE home (reporting::unitHeatDuties);"
          " " + "; ".join(claims) + ".  NOT CHECKED: whether a declared price"
          " is right, the GUI half (gui/tests/reactorDutyStub.test.ts), and the"
          " pinch / utilities-consumption readers, which ask other questions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
