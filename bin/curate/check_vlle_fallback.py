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

WHAT THIS DOES NOT CHECK.  Whether the split is RIGHT: the witness's NRTL
pair is Choupo's own case-local regression and predicts a second liquid its
own evidence does not show (that is why the witness can reach the fallback at
all); it is a STRUCTURAL witness.  The VL fallback (a VLLE search that finds
one liquid) has no corpus witness.  The THREE-PHASE answer's duty and its
F_alpha / F_beta KPIs are not checked here (vlle03 pins what they print).
The propertyOps VL / one-phase classification still reads the regime string
(PropertyScanTernary) and is not checked.

SABOTAGES (by hand, 2026-10-05; each restored with git and `make all`):
  S1  restore the substring test at the VLLE fallback
      (`const bool llFallback = sol.regime.find("VL") == std::string::npos;`)
      -> (a) FAILS (vapour port carries the beta liquid), (c) FAILS (the
      phantom latent heat returns), (d) FAILS (`regime.find(` in source).
  S2  drop `sol.liquidLiquid = true;` at the VLLE LL fallback only
      -> (a), (b) and (d) FAIL.
  S3  keep the port fix but decide the KPI block on `phaseSet` alone
      (`const bool isLL = (opts.phaseSet == PhaseSet::LL);`)
      -> (b) FAILS (V_over_F, K_ ratios and a duty published for two liquids).
Measured results are recorded in DEV.md section 5's entry.
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
          "string, in IsothermalFlash.cpp and the three propertyOps readers.  "
          "NOT checked: whether the split is right (a structural witness), "
          "the VL fallback (no witness), the fallback's own material imbalance (the dropped sub-1 %% vapour, inside the band), the three-phase duty, and the "
          "ternary scan's VL / one-phase classification (still the string).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
