#!/usr/bin/env python3
"""Gate: a VLLE flash that finds two LIQUIDS publishes two liquids.

    bin/curate/check_vlle_fallback.py

WHY THIS EXISTS (DEV.md section 5, entry dated 2026-10-05).  A `phaseSet
VLLE` isothermalFlash always emits three ports (vapour, liquid alpha, liquid
beta).  When its Gibbs minimisation finds the vapour fraction below 1 %, the
solver demotes the answer to a liquid-liquid split -- and the unit then
decided WHICH two-phase fallback it held by searching the regime's
human-readable string for "VL".  The LL fallback's own string reads
"two-phase liquid (LL, VLLE attempt found V beta ~ 0)": "VLLE" contains "VL".
So the beta LIQUID left on the VAPOUR port with vf = 1, the second liquid
port carried zero, and the energy report booked a latent heat that never
happened (498.03 kW on a 100 kmol/h ethanol + cyclohexane decanter).  Nothing
refused it; no corpus case reached it, because the only `phaseSet VLLE` case
(vlle03) solves three phases.

THE RULE: a string meant for a human is not a channel the engine parses.  The
flash solution carries its KIND as a typed field (`FlashSolution::
liquidLiquid`), set at the two sites that produce a liquid-liquid split, and
every reader that must tell a second liquid from a vapour reads it.

WHAT THIS CHECKS:
  (a) BEHAVIOUR, on a fresh run of the witness
      tutorials/steady/flash/vlle04_two_liquids_decanter (a COPY, in a
      temporary directory): the `vapour` port carries ZERO flow; `liquidAlpha`
      and `liquidBeta` both carry flow, and both with vf = 0; the two liquid
      ports conserve the feed.
  (b) THE LL VOCABULARY: the unit publishes `betaFraction` and NOT
      `V_over_F`, no `K_<component>` ratio and no `Q_kW` -- the same posture
      as a `phaseSet LL` flash (an LL split priced without an
      excess-of-mixing route has no conclusive duty).
  (c) THE FIRST LAW: the plant boundary residual (`globalEnergyBoundary.
      residual_kW`) is within 0.05 kW of zero -- the phantom latent heat is
      gone (498.03 kW before; the band is argued beside TOL_KW below).
  (d) SOURCE: IsothermalFlash.cpp parses `regime` for nothing (no
      `regime.find(` outside comments), sets `liquidLiquid = true` at BOTH
      liquid-liquid sites, and the three propertyOps readers that used to
      search for "two-phase liquid" read the field instead.
  (e) THE THREE-PHASE ANSWER (DEV.md section 5, the same entry, closed
      2026-10-05), on fresh runs of a COPY of
      tutorials/steady/flash/vlle03_audit_artificial:
      (e1) the three port flows sum to the feed; F_vapor, F_alpha and
           F_beta each EQUAL their port (vapor, liquidA, liquidB); the
           published V_over_F is the VAPOUR port's share of the feed; no
           bare `K_<component>` is published (a three-phase answer names
           the pair: K_vapor_alpha_<i>, K_vapor_beta_<i>); a duty is
           published.  Before: F_alpha = F(1 - beta_alpha) = 0.01647
           against a liquidA port of 0.01131, F_beta = the alpha flow,
           V_over_F = beta_alpha = 0.4071, and K_<i> = x_beta/x_alpha.
      (e2) THE DUTY IS THE REPORT'S: a FIXTURE copy of vlle03 whose three
           synthetic components gain a `standardThermochemistry` block (the
           shipped case has none, so its energy report is UNAVAILABLE and
           cannot be compared with anything; the fixture's datum is
           invented and only differences of it are read) must leave the
           unit's `energyClosures` row with |remaining_kW| <= 1e-4 kW.
           Before: the unit priced its beta LIQUID as a vapour and left the
           real vapour out -- Q = 2.149 kW against the report's dH =
           186.482 kW on that fixture.

WHAT THIS DOES NOT CHECK.  Whether the split is RIGHT: the witness's NRTL
pair is Choupo's own case-local regression and predicts a second liquid its
own evidence does not show (that is why the witness can reach the fallback at
all); it is a STRUCTURAL witness.  The VL fallback (a VLLE search that finds
one liquid) has no corpus witness.  Whether the THREE-PHASE duty is the
physically right number on (e2)'s fixture: it agrees with the report, and
the report resolves an unpinned stream with a VAPOUR-LIQUID flash only, so
it prices that fixture's unpinned feed (at the drum's own T and P) as ONE
liquid where the VLLE search finds three phases -- the 186.48 kW is the
vapour's latent heat charged against a feed state that is not its own
equilibrium.  The shipped case (no datum, sensible route) resolves its feed
with the unit's own VLLE options and reads Q = 0.
The propertyOps VL / one-phase classification still reads the regime string
(PropertyScanTernary) and is not checked.

SABOTAGES (by hand, 2026-10-05; each restored with `git checkout` and
`make all`; results as MEASURED, not predicted):
  S1  restore the substring test at the VLLE fallback
      (`llFallback = sol.regime.find("VL") == std::string::npos`)
      -> (d) FAILS (`regime.find(` in source); (a) FAILS (vapour port
      F = 0.01339 kmol/s, liquidBeta 0, feed not conserved by the liquid
      ports); (c) FAILS at -498.039 kW, the defect reproduced to the kW.
      (b) does NOT fire: the KPI block reads the field, not the ports.
  S2  drop `sol.liquidLiquid = true;` at the VLLE LL fallback only
      -> (d) FAILS (1 site), (a) FAILS as S1, (b) FAILS (V_over_F, K ratios
      and a Q_kW of 0.0048 kW published for two liquids), (c) FAILS at
      -498.034 kW.
  S3  keep the ports right but decide the KPI block on `phaseSet` alone
      (`isLL = (opts.phaseSet == PhaseSet::LL)`)
      -> ONLY (b) FAILS (V_over_F, K ratios, Q_kW = -0.0038 kW) -- the arm
      exists because neither the ports nor the first law can see this.
  S4  restore PropertyScanBinary's `regime.find("two-phase liquid")`
      (source only; no witness runs that op) -> ONLY (d) FAILS, twice.
  S5  (arm (e), 2026-10-05) restore the two-phase blend for a three-phase
      answer on the datum route (`if (sol.threePhase || feedSol.threePhase)`
      -> `if (false)`) -> ONLY (e2) FAILS: Q = 0 kW against the report's
      186.48 kW (the feed's own VLLE resolution is mispriced the SAME way as
      the outlet, so the blend now reads an identity -- a different wrong
      number from the 2.149 kW before, caught by the same arm).
  S6  restore `F_alpha = F(1 - V_over_F)` in the VLLE KPI block
      -> ONLY (e1) FAILS: F_alpha 0.016470 against liquidA 0.011308 kmol/s.
  S7  publish the solution's alpha fraction as V_over_F again
      -> ONLY (e1) FAILS: V_over_F 0.40707 against a vapour share 0.18580.
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
WITNESS = "tutorials/steady/flash/vlle04_two_liquids_decanter"
UNIT = "decanter01"
FLASH_SRC = ROOT / "src/unitOperations/flash/IsothermalFlash.cpp"
PROPS_READERS = [
    "src/propertyOps/PropertyScanBinary.cpp",
    "src/propertyOps/PropertyScanTernary.cpp",
    "src/propertyOps/PropertyEvaluator.cpp",
]
#  (c)'s band, MEASURED rather than wished: the fallback that demotes a
#  three-phase answer with beta_V < 1 % keeps the two liquid compositions
#  and renormalises their fractions, so the dropped vapour's material leaves
#  a component imbalance (1.0e-7 kmol/s of ethanol traded for cyclohexane on
#  the witness, element closure off by 0.0008 %), priced at -0.0125 kW.  The
#  defect this gate exists for was 498.03 kW; 0.05 kW sits four orders of
#  magnitude below it and above the measured imbalance.  The imbalance itself
#  is a separate finding (DEV.md section 5), not this gate's to hide.
TOL_KW = 5.0e-2
FLOW_EPS = 1.0e-12     # kmol/s
#  (e): the three-phase witness, its KPI -> port map, and the unit-arm band
#  `check_energy_closure` uses for a unit that publishes its own duty.
WITNESS3 = "tutorials/steady/flash/vlle03_audit_artificial"
PORTS3 = {"F_vapor": "vapor", "F_alpha": "liquidA", "F_beta": "liquidB"}
TOL_UNIT_KW = 1.0e-4


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def run(case: pathlib.Path):
    for junk in case.glob("log.*"):
        junk.unlink()
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(case)],
                       capture_output=True, text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    log = case / "log.choupoSolve"
    return r.returncode, (log.read_text() if log.is_file() else "") + r.stdout + r.stderr


def result_json(log: str):
    """The machine-readable result block, between the engine's own markers."""
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  log, flags=re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def main() -> int:
    fail = []
    if not (ROOT / "choupoSolve").exists():
        print("check_vlle_fallback: FAILED -- no choupoSolve binary; run "
              "`make all` first (a check that cannot run must not pass)")
        return 1

    # (d) SOURCE ------------------------------------------------------------
    flash = strip_comments(FLASH_SRC.read_text())
    if re.search(r"\bregime\s*\.\s*find\s*\(", flash):
        fail.append("(d) IsothermalFlash.cpp parses `regime` with .find( -- "
                    "the split's KIND is the typed field `liquidLiquid`, "
                    "never a substring of prose meant for a human")
    n_set = len(re.findall(r"\bsol\.liquidLiquid\s*=\s*true\s*;", flash))
    if n_set < 2:
        fail.append(f"(d) IsothermalFlash.cpp sets `sol.liquidLiquid = true` "
                    f"{n_set} time(s); both liquid-liquid sites (the LL Gibbs "
                    "minimisation and the VLLE search that finds no vapour) "
                    "must set it")
    for rel in PROPS_READERS:
        src = strip_comments((ROOT / rel).read_text())
        if re.search(r'regime\s*\.\s*find\s*\(\s*"(two-phase liquid|\(LL|liquid \(LL)',
                     src):
            fail.append(f"(d) {rel} still decides a liquid-liquid split by "
                        "searching the regime string")
        if not re.search(r"\bliquidLiquid\b", src):
            fail.append(f"(d) {rel} does not read `liquidLiquid`")

    # (a)-(c) BEHAVIOUR -------------------------------------------------------
    with tempfile.TemporaryDirectory() as td:
        case = pathlib.Path(td) / "vlle04"
        shutil.copytree(ROOT / WITNESS, case,
                        ignore=shutil.ignore_patterns("converged", "reports",
                                                      "log.*", "iterations"))
        rc, log = run(case)
        res = result_json(log)
        if rc != 0 or res is None:
            fail.append(f"(a) the witness did not run to a result (exit {rc})")
        else:
            st = res.get("streams", {})

            def flow(name):
                s = st.get(name)
                return None if s is None else float(s.get("F", float("nan")))

            def vf(name):
                s = st.get(name)
                return None if s is None else s.get("vf")

            fV, fA, fB, fF = (flow("vapour"), flow("liquidAlpha"),
                              flow("liquidBeta"), flow("feed"))
            if fV is None or abs(fV) > FLOW_EPS:
                fail.append(f"(a) the vapour port carries F = {fV} kmol/s: a "
                            "VLLE search that found no vapour sent a liquid "
                            "out as a gas")
            for nm, f in (("liquidAlpha", fA), ("liquidBeta", fB)):
                if f is None or not f > FLOW_EPS:
                    fail.append(f"(a) {nm} carries F = {f} kmol/s: both "
                                "liquids of the split must leave on the liquid "
                                "ports")
                if vf(nm) != 0.0:
                    fail.append(f"(a) {nm} published vf = {vf(nm)}; a liquid "
                                "port carries vf = 0")
            if None not in (fA, fB, fF) and abs(fA + fB - fF) > 1e-9 * max(fF, 1.0):
                fail.append(f"(a) the liquid ports do not conserve the feed: "
                            f"{fA} + {fB} != {fF} kmol/s")

            kp = res.get("kpis", {}).get(UNIT, {})
            if "betaFraction" not in kp:
                fail.append("(b) the unit does not publish betaFraction for a "
                            "liquid-liquid answer")
            for bad in ("V_over_F", "Q_kW"):
                if bad in kp:
                    fail.append(f"(b) the unit publishes {bad} = {kp[bad]} for "
                                "two LIQUIDS (an LL split speaks the LL "
                                "vocabulary)")
            ks = [k for k in kp if k.startswith("K_")]
            if ks:
                fail.append(f"(b) the unit publishes vapour-liquid K ratios "
                            f"{ks} for a liquid-liquid split")

            geb = res.get("globalEnergyBoundary") or {}
            r_kw = geb.get("residual_kW")
            if r_kw is None or abs(float(r_kw)) > TOL_KW:
                fail.append(f"(c) the plant first law does not close: "
                            f"residual {r_kw} kW (tolerance {TOL_KW} kW) -- "
                            "a latent heat that never happened")

    # (e) THE THREE-PHASE ANSWER ---------------------------------------------
    with tempfile.TemporaryDirectory() as td:
        ignore = shutil.ignore_patterns("converged", "reports", "log.*",
                                        "iterations")
        case = pathlib.Path(td) / "vlle03"
        shutil.copytree(ROOT / WITNESS3, case, ignore=ignore)
        rc, log = run(case)
        res = result_json(log)
        if rc != 0 or res is None:
            fail.append(f"(e1) vlle03 did not run to a result (exit {rc})")
        else:
            st = res.get("streams", {})
            kp = res.get("kpis", {}).get(UNIT, {})
            fl = {k: float(st[k]["F"]) for k in ("feed",) + tuple(PORTS3.values())
                  if k in st}
            if len(fl) != 4:
                fail.append(f"(e1) vlle03 does not publish feed + three ports: "
                            f"{sorted(fl)}")
            else:
                fF = fl["feed"]
                tot = sum(fl[p] for p in PORTS3.values())
                if abs(tot - fF) > 1e-9 * fF:
                    fail.append(f"(e1) the three ports do not conserve the "
                                f"feed: {tot} != {fF} kmol/s")
                for kpi, port in PORTS3.items():
                    v = kp.get(kpi)
                    if v is None or abs(float(v) - fl[port]) > 1e-9 * fF:
                        fail.append(f"(e1) {kpi} = {v} kmol/s but its port "
                                    f"{port} carries {fl[port]} kmol/s")
                vf = kp.get("V_over_F")
                share = fl[PORTS3["F_vapor"]] / fF
                if vf is None or abs(float(vf) - share) > 1e-9:
                    fail.append(f"(e1) V_over_F = {vf} but the vapour port "
                                f"carries {share} of the feed")
            bare = [k for k in kp if re.fullmatch(r"K_comp[A-C]", k)]
            if bare:
                fail.append(f"(e1) a three-phase answer publishes unnamed "
                            f"K ratios {bare} (which pair?)")
            if "Q_kW" not in kp:
                fail.append("(e1) a three-phase answer publishes no duty")

        fx = pathlib.Path(td) / "vlle03_datum"
        shutil.copytree(ROOT / WITNESS3, fx, ignore=ignore)
        for dat in sorted((fx / "constant" / "components").glob("comp*.dat")):
            with dat.open("a") as f:
                f.write("\n// FIXTURE (check_vlle_fallback arm (e2)): an "
                        "invented datum so the energy report can run.\n"
                        "standardThermochemistry\n{\n    dHf_298   0.0;\n"
                        "    s_298     200.0;\n}\n")
        rc, log = run(fx)
        res = result_json(log)
        if rc != 0 or res is None:
            fail.append(f"(e2) the vlle03 datum fixture did not run (exit {rc})")
        else:
            kp = res.get("kpis", {}).get(UNIT, {})
            rows = [r for r in res.get("energyClosures", [])
                    if r.get("unit") == UNIT]
            if "Q_kW" not in kp or not rows:
                fail.append("(e2) the fixture publishes no duty or no energy "
                            "closure row for the decanter -- nothing to compare")
            else:
                rem = float(rows[0].get("remaining_kW", float("nan")))
                if not abs(rem) <= TOL_UNIT_KW:
                    fail.append(f"(e2) the three-phase duty Q = {kp['Q_kW']} kW "
                                f"leaves {rem} kW the energy report cannot "
                                f"attribute (tolerance {TOL_UNIT_KW} kW): the "
                                "duty is not priced the way the report prices "
                                "the ports")

    if fail:
        print("check_vlle_fallback: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_vlle_fallback: OK -- a phaseSet VLLE flash whose search "
          "finds no vapour publishes TWO LIQUIDS (witness vlle04: vapour port "
          "F = 0, both liquid ports nonzero at vf = 0, LL vocabulary, plant "
          f"first law within {TOL_KW} kW), and the split's kind is read off "
          "the typed `liquidLiquid` field, never parsed from the regime "
          "string, in IsothermalFlash.cpp and the three propertyOps readers; "
          "and a THREE-PHASE answer (witness vlle03) publishes each phase "
          "flow equal to its port, the ports summing to the feed, V_over_F "
          "as the vapour's share, K ratios named by pair, and a duty the "
          f"energy report closes to within {TOL_UNIT_KW} kW (datum fixture).  "
          "NOT checked: whether the split is right (a structural witness), "
          "the VL fallback (no witness), the fallback's own material imbalance (the dropped sub-1 % vapour, inside the band), whether the report's "
          "VL-only resolution of an unpinned VLLE feed is its equilibrium, and the "
          "ternary scan's VL / one-phase classification (still the string).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
