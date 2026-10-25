#!/usr/bin/env python3
"""check_reactor_limits -- the reactors refuse or announce where their own
formulation stops holding, and the equilibrium reactor answers the question
the gibbsReactor answers.

WHY.  The C131 reactors review (docs/design/review-c131-reactors.md,
2026-10-25) found seven places where a reactor ran to exit 0 on a premise its
own formulation does not satisfy.  Each arm below builds the case that showed
it (a scratch copy of a corpus case with one edit, or a three-species MTBE
fixture from the standard catalogue) and requires the engine to say so.

WHAT IT CHECKS
  R1  liquid-basis detailed balance with sum(nu) != 0 (isobutene + methanol
      <-> MTBE, `reversible true;`) is REFUSED on the four paths that read it:
      the single-reaction `pfr` and `cstr`, and both `reactions ( ... )`
      paths.  It used to run to 99.95 % against the 92.26 % ideal-solution
      equilibrium of the same records, the Kc being the ideal-gas one in
      kmol/m3 under concentrations in mol/m3.  NEGATIVE: cstr02 and pfr02
      (the water-gas shift, sum(nu) = 0) still run.  R1b (refutation,
      2026-10-25): a law that does not read `reversible` (`type
      expression`) keeps its OWN refusal -- the W1 text's remedy
      (`A_rev`/`Ea_rev`) is not its grammar.
  R2  an AUTOCATALYTIC law on the multi-reaction `cstr` (cstr04's
      esterification with order 1 on the product, fed none) announces BOTH
      roots of its extent equation, the washout one UNSTABLE and REPORTED;
      a cubic law (order 2 on the product, a trace fed) announces THREE.
      It used to report the washout at X = 0 silently.  NEGATIVE: cstr03
      (monotone laws, two reactions) and cstr04 as shipped say nothing.
      R2b (refutation): the same law under `thermalMode adiabatic` says the
      other root is NOT a steady state of this reactor (at the reported T
      only the reported extent satisfies the energy balance) and reads no
      isothermal stability off it -- the first text called every root "a
      steady state of this CSTR" in every mode.
  R3  a gibbsReactor whose equilibrium forms a LIQUID and that declares ONE
      outlet REFUSES (the condensate used to be dropped: mass closure
      0.254 %).  NEGATIVE: gibbs09 (two outlets) runs.
  R4  the equilibriumReactor folds the fugacity coefficients in: on the
      same feed (N2 + 3 H2, 700 K, 200 bar, SRK) it and the gibbsReactor
      give y_NH3 equal to 1e-4 (they parted at 0.3001 vs 0.3239).
  R5  the equilibriumReactor's duty is H_out - H_in on the package's own
      surface: equil01 fed at 700 K publishes the energy report's dH (it
      published the heat of reaction alone, 59.64 kW against 80.43 kW), and
      R4's SRK fixture closes too.
  R6  the equilibriumReactor REFUSES a gas-phase equilibrium that leaves a
      condensable supersaturated (equil01 at 350 K, water at y P 0.75 bar
      against Psat 0.42 bar).  NEGATIVE: equil01 as shipped runs.  R6b
      (refutation): TWO condensables each below its own Psat but together
      above their dew point (water y P/Psat 0.70 and methanol 0.68 at 330 K,
      1 bar; vf 0.81 on the package) are refused too -- the per-component
      test alone published that outlet at exit 0.
  R7  the dynamicCSTR ANNOUNCES a mole-changing reaction, at its site and in
      the caveat block (its F_out = F_in drains the holdup: 1.24 -> 0.051
      kmol in 20 residence times; check_ctrl_balance runs such a vessel on
      purpose to prove the ledger, so it is said, not refused), and
      honours `reversible true;` on its own Arrhenius word (ctrl11 with the
      key moves its holdup; it used to be identical, the reverse leg
      dropped).

WHAT IT DOES NOT CHECK, stated so nothing is implied:
  * whether any reactor's answer is RIGHT beyond the cross-checks named
    (R4 holds two reactors to each other, not to a measurement);
  * a set of SEVERAL reactions on the cstr for extent multiplicity (R2 is a
    one-reaction audit, as the engine's own is);
  * the liquid standard state for a reversible liquid reaction (refused,
    not implemented -- a proposal in the review record).

FAIL-FIRST, observed 2026-10-25 on the engine of origin/main (f871943a9):
R1 the four probes RAN (X = 99.953 % / 99.943 %); R2 printed no root list
(xi = 0 at exit 0); R3 RAN with mass closure 0.254 %; R4 y_NH3 0.3001 vs
0.3239; R5 Q 59.64 kW vs dH 80.43 kW (134.86 %) and 102.78 % on SRK; R6
RAN at vf = 1; R7 the mole-changing vessel ran SILENTLY and ctrl11 with
`reversible true`
ended at n_ethanol 1.11333560e-02 either way.  Record:
docs/design/review-c131-reactors.md.

Exit 0 = every arm holds.
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
BIN = ROOT / "build/linux64Gcc"
T = ROOT / "tutorials"

failures = []
oks = []


def run(case: Path, binary: str = "choupoSolve"):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BIN / binary), str(case)], capture_output=True,
                       text=True, env=env)
    return p.returncode, p.stdout + p.stderr


def probe(src: Path, dst: Path) -> Path:
    shutil.copytree(src, dst)
    for junk in ("converged", "reports", "design", "expected", "latest",
                 "constant/propertyManifest"):
        t = dst / junk
        if t.is_dir():
            shutil.rmtree(t)
        elif t.exists():
            t.unlink()
    for d in list(dst.iterdir()):          # time directories of a dynamic run
        if d.is_dir() and re.fullmatch(r"[0-9.eE+-]+", d.name) and d.name != "0":
            shutil.rmtree(d)
    return dst


def edit(path: Path, old: str, new: str, arm: str) -> bool:
    t = path.read_text()
    if old not in t:
        failures.append(f"{arm}: the fixture could not be built -- {path.name}"
                        f" no longer contains {old!r}")
        return False
    path.write_text(t.replace(old, new, 1))
    return True


def result_json(out: str):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>",
                  out, re.S)
    return json.loads(m.group(1)) if m else None


def kpi(out: str, unit: str, key: str):
    r = result_json(out)
    try:
        return r["kpis"][unit][key]
    except Exception:
        return None


def expect_refusal(arm, case, needles, binary="choupoSolve"):
    rc, out = run(case, binary)
    if rc == 0:
        failures.append(f"{arm}: the probe RAN (exit 0) -- it must refuse")
        return False
    for nd in needles:
        if nd not in out:
            failures.append(f"{arm}: the refusal does not name {nd!r}")
            return False
    return True


def expect_runs(arm, case, binary="choupoSolve"):
    rc, out = run(case, binary)
    if rc != 0:
        tail = "\n".join(out.splitlines()[-4:])
        failures.append(f"{arm}: the negative {case.name} did not run (exit {rc}):\n{tail}")
        return None
    return out


CONTROL = """application   choupoSolve;
description   "check_reactor_limits fixture";
verbosity     3;
"""
MTBE_THERMO = """recordType    thermophysicalPropertySystem;
schemaVersion 2;
components       ( isoButene methanol methylTertButylEther );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
"""
MTBE_RXN = """mtbe
{
    limitingReactant   isoButene;
    reversible         true;
    stoichiometry
    (
        { component isoButene;            nu -1;  order 1; }
        { component methanol;             nu -1;  order 1; }
        { component methylTertButylEther; nu  1;  order 0; }
    );
    kinetics { type Arrhenius; A 1.0e-3; Ea 0.0; }
}
"""
MTBE_RXN_EXPR = """mtbeX
{
    reversible         true;
    stoichiometry
    (
        { component isoButene;            nu -1; }
        { component methanol;             nu -1; }
        { component methylTertButylEther; nu  1; }
    );
    kinetics { type expression; rate "0"; }
}
"""
MTBE_FEED = """componentMolarFlows { isoButene 1.0 kmol/h; methanol 1.0 kmol/h; }
T 343.15 K;
P 20 bar;
phase liquid;
"""
MTBE_OUT = """componentMolarFlows { isoButene 0.5 kmol/h; methanol 0.5 kmol/h;
                      methylTertButylEther 0.5 kmol/h; }
T 343.15 K;
P 20 bar;
"""


def mtbe_case(dst: Path, unit_block: str) -> Path:
    for d in ("system", "constant", "0"):
        (dst / d).mkdir(parents=True)
    (dst / "f.cho").write_text("")
    (dst / "system/controlDict").write_text(CONTROL)
    (dst / "system/flowsheetDict").write_text("units\n(\n" + unit_block + "\n);\n")
    (dst / "constant/thermoPhysPropDict").write_text(MTBE_THERMO)
    (dst / "constant/reactions").write_text(MTBE_RXN)
    (dst / "0/feed").write_text(MTBE_FEED)
    (dst / "0/out").write_text(MTBE_OUT)
    return dst


def unit(type_, extra, rxn):
    return ("    { name r; type " + type_ + "; in feed; outputs ( out );\n"
            "      operation { " + extra + " }\n      " + rxn + " }")


def main() -> int:
    if not (BIN / "choupoSolve").exists():
        print("check_reactor_limits: choupoSolve missing -- build first")
        return 1
    with tempfile.TemporaryDirectory(prefix="reactor_limits_") as td:
        td = Path(td)

        # -- R1: liquid-basis detailed balance, sum(nu) = -1, four paths
        ok = True
        for tag, typ, extra, rxn in (
                ("pfr single", "pfr", "V_R 5.0; nSteps 200;", "reaction mtbe;"),
                ("cstr single", "cstr", "V_R 5.0;", "reaction mtbe;"),
                ("pfr multi", "pfr", "V_R 5.0; nSteps 200;", "reactions ( mtbe );"),
                ("cstr multi", "cstr", "V_R 5.0;", "reactions ( mtbe );")):
            c = mtbe_case(td / ("r1_" + tag.replace(" ", "_")), unit(typ, extra, rxn))
            ok &= expect_refusal(f"R1 ({tag})", c,
                                 ["reversible true", "sum of nu = -1", "LIQUID basis",
                                  "A_rev"])
        for neg in ("cstr02_reversible_wgs", "pfr02_reversible_wgs"):
            ok &= expect_runs(f"R1 negative", probe(T / "steady/reactors" / neg,
                                                    td / ("r1n_" + neg))) is not None
        #  R1b (refutation): a law that does not READ `reversible` (here
        #  `type expression`) keeps its own refusal; the W1 text, whose remedy
        #  is `A_rev`/`Ea_rev`, is not its grammar.
        c = mtbe_case(td / "r1b_expression", unit("cstr", "V_R 5.0;", "reactions ( mtbeX );"))
        (c / "constant/reactions").write_text(MTBE_RXN_EXPR)
        rc, out = run(c)
        if rc == 0 or "is not read by a `type expression` law" not in out \
                or "sum of nu = -1" in out:
            failures.append("R1b: an expression law declaring `reversible true;`"
                            " did not get its own refusal (it got the W1 text,"
                            " or ran)")
            ok = False
        if ok:
            oks.append("R1 sum(nu) != 0 detailed balance refused on 4 paths, an"
                       " expression law keeps its own refusal; WGS (sum 0) runs")

        # -- R2: autocatalysis on the multi-reaction cstr
        ok = True
        c4 = T / "steady/reactors/cstr04_adiabatic"
        a = probe(c4, td / "r2_auto")
        if (edit(a / "system/flowsheetDict", "thermalMode  adiabatic;",
                 "thermalMode  isothermal;", "R2")
                and edit(a / "constant/reactions",
                         "{ component ethylAcetate;  nu  1;  order 0; }",
                         "{ component ethylAcetate;  nu  1;  order 1; }", "R2")
                and edit(a / "constant/reactions", "A      1.0e8;", "A      1.0e5;", "R2")):
            out = expect_runs("R2 (autocatalytic)", a)
            if out is not None:
                m = re.search(r"MULTIPLE STEADY STATES IN THE EXTENT: .*?has (\d+) roots", out)
                if not m or m.group(1) != "2":
                    failures.append("R2: the autocatalytic CSTR did not announce its"
                                    " TWO extent roots")
                    ok = False
                elif "UNSTABLE [REPORTED]" not in out or "0.895" not in out:
                    failures.append("R2: the announcement does not mark the washout"
                                    " UNSTABLE and REPORTED beside X = 0.895")
                    ok = False
        cub = probe(c4, td / "r2_cubic")
        if (edit(cub / "system/flowsheetDict", "thermalMode  adiabatic;",
                 "thermalMode  isothermal;", "R2c")
                and edit(cub / "constant/reactions",
                         "{ component ethylAcetate;  nu  1;  order 0; }",
                         "{ component ethylAcetate;  nu  1;  order 2; }", "R2c")
                and edit(cub / "constant/reactions", "A      1.0e8;", "A      11.8;", "R2c")
                and edit(cub / "0/feed", "    aceticAcid    0.5 kmol/h;",
                         "    aceticAcid    0.5 kmol/h;\n    ethylAcetate  0.005 kmol/h;",
                         "R2c")):
            out = expect_runs("R2 (cubic)", cub)
            if out is not None:
                m = re.search(r"MULTIPLE STEADY STATES IN THE EXTENT: .*?has (\d+) roots", out)
                if not m or m.group(1) != "3":
                    failures.append("R2: the cubic autocatalytic CSTR did not announce"
                                    " THREE extent roots")
                    ok = False
        #  R2b (refutation): the SAME autocatalytic law under `thermalMode
        #  adiabatic`.  At the reported T only the reported extent satisfies
        #  the energy balance, so the other root is NOT a steady state of this
        #  reactor and no isothermal stability may be read off it.
        ad = probe(c4, td / "r2_auto_adiabatic")
        if (edit(ad / "constant/reactions",
                 "{ component ethylAcetate;  nu  1;  order 0; }",
                 "{ component ethylAcetate;  nu  1;  order 1; }", "R2b")
                and edit(ad / "constant/reactions", "A      1.0e8;", "A      1.0e5;", "R2b")):
            out = expect_runs("R2b (adiabatic)", ad)
            if out is not None:
                ln = next((l for l in out.splitlines()
                           if "MULTIPLE STEADY STATES IN THE EXTENT" in l), "")
                if not ln or "NOT steady states of this reactor" not in ln \
                        or "each root is a steady state" in ln \
                        or "UNSTABLE" in ln or " stable" in ln:
                    failures.append("R2b: under thermalMode adiabatic the extent"
                                    " roots at the reported T are announced as steady"
                                    " states of the reactor (or with an isothermal"
                                    " stability)")
                    ok = False
        for neg in ("cstr03_series_selectivity", "cstr04_adiabatic"):
            out = expect_runs("R2 negative", probe(T / "steady/reactors" / neg,
                                                   td / ("r2n_" + neg)))
            if out is None:
                ok = False
            elif "MULTIPLE STEADY STATES IN THE EXTENT" in out:
                failures.append(f"R2: {neg} (monotone laws) announced an extent"
                                " multiplicity")
                ok = False
        if ok:
            oks.append("R2 autocatalytic cstr announces 2 roots (washout UNSTABLE, "
                       "REPORTED), cubic 3; monotone cases silent")

        # -- R3: a condensate with one declared outlet
        g = mtbe_case(td / "r3_gibbs", """    { name g; type gibbsReactor; model directMin;
      in feed; outputs ( out );
      operation { T 343.15 K; P 20.0 bar; elements ( C H );
        species ( { name isoButene; atoms ( 4 8 ); }
                  { name methanol; atoms ( 1 4 ); }
                  { name methylTertButylEther; atoms ( 5 12 ); } ); } }""")
        ok = expect_refusal("R3", g, ["LIQUID formed", "ONE outlet", "condensate"])
        ok &= expect_runs("R3 negative", probe(T / "steady/gibbs/gibbs09_wgs_cooled_directmin",
                                                td / "r3n")) is not None
        if ok:
            oks.append("R3 a gibbs condensate with one outlet refused; gibbs09 runs")

        # -- R4 / R5 (SRK): the equilibriumReactor beside the gibbsReactor
        n = td / "r4_nh3"
        for d in ("system", "constant", "0"):
            (n / d).mkdir(parents=True)
        (n / "n.cho").write_text("")
        (n / "system/controlDict").write_text(CONTROL)
        (n / "constant/thermoPhysPropDict").write_text(
            MTBE_THERMO.replace("isoButene methanol methylTertButylEther", "N2 H2 NH3")
                       .replace("idealGas", "SRK"))
        (n / "constant/reactions").write_text(
            "synth { stoichiometry ( { component N2; nu -1; } { component H2; nu -3; }"
            " { component NH3; nu 2; } ); }\n")
        (n / "system/flowsheetDict").write_text("""units
(
    { name gibbs; type gibbsReactor; in feedA; outputs ( outA );
      operation { T 700.0 K; P 200.0 bar; elements ( N H );
        species ( { name N2; atoms ( 2 0 ); } { name H2; atoms ( 0 2 ); }
                  { name NH3; atoms ( 1 3 ); } ); } }
    { name requil; type equilibriumReactor; in feedB; outputs ( outB );
      operation { T 700 K; } reactions ( synth ); }
);
""")
        feed = "componentMolarFlows { N2 1.0 kmol/h; H2 3.0 kmol/h; }\nT 700 K;\nP 200 bar;\nphase gas;\n"
        outs = "componentMolarFlows { N2 0.7 kmol/h; H2 2.1 kmol/h; NH3 0.6 kmol/h; }\nT 700 K;\nP 200 bar;\n"
        for f, txt in (("feedA", feed), ("feedB", feed), ("outA", outs), ("outB", outs)):
            (n / "0" / f).write_text(txt)
        out = expect_runs("R4", n)
        if out is not None:
            r = result_json(out)
            yg = kpi(out, "gibbs", "y_NH3")
            try:
                ze = r["streams"]["outB"]["composition"]["NH3"]
            except Exception:
                ze = None
            if yg is None or ze is None or abs(yg - ze) > 1.0e-4:
                failures.append(f"R4: the equilibriumReactor (y_NH3 {ze}) and the"
                                f" gibbsReactor ({yg}) part under SRK")
            else:
                oks.append(f"R4 SRK: equilibriumReactor y_NH3 {ze:.4f} = gibbsReactor"
                           f" {yg:.4f}")
            if "ENERGY BALANCE FAILED -- unit 'requil'" in out:
                failures.append("R5 (SRK): the equilibriumReactor's duty does not"
                                " close against the energy report")

        # -- R5: equil01 fed at 700 K
        e = probe(T / "steady/reactors/equil01_reforming", td / "r5_feedT")
        if edit(e / "0/feed", "T               1100 K;", "T               700 K;", "R5"):
            out = expect_runs("R5", e)
            if out is not None:
                q = kpi(out, "reformer", "Q_kW")
                if "ENERGY BALANCE FAILED -- unit 'reformer'" in out or q is None \
                        or abs(q - 80.43) > 0.01:
                    failures.append(f"R5: equil01 fed at 700 K publishes Q = {q} kW;"
                                    " the energy report reads 80.43 kW")
                else:
                    oks.append(f"R5 equil01 fed at 700 K: Q = {q:.2f} kW = report dH")

        # -- R6: supersaturation
        s = probe(T / "steady/reactors/equil01_reforming", td / "r6_cond")
        if (edit(s / "0/feed", "T               1100 K;", "T               350 K;", "R6")
                and edit(s / "0/feed", "phase           gas;\n", "", "R6")
                and edit(s / "system/flowsheetDict", "operation   { T 1100 K; }",
                         "operation   { T 350 K; }", "R6")):
            ok = expect_refusal("R6", s, ["supersaturated", "water", "gibbsReactor"])
            ok &= expect_runs("R6 negative", probe(T / "steady/reactors/equil01_reforming",
                                                   td / "r6n")) is not None
            #  R6b (refutation): TWO condensables each below its own Psat but
            #  together above their dew point (water y P/Psat 0.70, methanol
            #  0.68 at 330 K, 1 bar) -- the per-component test passes it, the
            #  package's own resolution of the outlet finds 19 % liquid.
            dw = td / "r6b_dew"
            src = T / "steady/reactors/equil02_methanol_declared_pathways"
            for sub in ("system", "0"):
                (dw / sub).mkdir(parents=True)
            shutil.copytree(src / "constant", dw / "constant",
                            ignore=shutil.ignore_patterns("propertyManifest"))
            (dw / "w.cho").write_text("")
            (dw / "system/controlDict").write_text(CONTROL)
            (dw / "system/flowsheetDict").write_text(
                "units\n(\n    { name r; type equilibriumReactor; in feed; outputs ( out );"
                " operation { T 330 K; } reactions ( waterGasShift ); }\n);\n")
            st = ("componentMolarFlows { H2 0.19 kmol/h; CO2 0.19 kmol/h;"
                  " water 0.12 kmol/h; methanol 0.5 kmol/h; }\nT 330 K;\nP 1 bar;\n")
            (dw / "0/feed").write_text(st)
            (dw / "0/out").write_text(st)
            ok &= expect_refusal("R6b", dw, ["dew point", "gibbsReactor"])
            if ok:
                oks.append("R6 supersaturated gas-phase equilibrium refused, by"
                           " component and at the mixture's dew point; equil01 runs")

        # -- R7: the dynamicCSTR
        d = probe(T / "ctrl/ctrl11_esterification_jacket", td / "r7_mole")
        ok = True
        if edit(d / "constant/reactions",
                "{ component water;         nu  1;  order 0; }", "", "R7"):
            out = expect_runs("R7 (sum nu != 0)", d, "choupoCtrl")
            if out is None:
                ok = False
            else:
                warn = [ln for ln in out.splitlines()
                        if "[dynamicCSTR] WARNING" in ln
                        and "changes the number of moles" in ln and "DRAINS" in ln]
                blk = out[out.find("ASSUMPTIONS AND CAVEATS"):]
                if not warn or "changes the number of moles" not in blk:
                    failures.append("R7: a mole-changing reaction in the dynamicCSTR"
                                    " (F_out = F_in) is not announced at its site"
                                    " and in the caveat block")
                    ok = False
        base = probe(T / "ctrl/ctrl11_esterification_jacket", td / "r7_base")
        rev = probe(T / "ctrl/ctrl11_esterification_jacket", td / "r7_rev")
        if edit(rev / "constant/reactions", "    limitingReactant   ethanol;",
                "    limitingReactant   ethanol;\n    reversible         true;", "R7"):
            ends = []
            for c in (base, rev):
                if expect_runs("R7 (reverse leg)", c, "choupoCtrl") is None:
                    ok = False
                    break
                ends.append((c / "trajectory.csv").read_text().strip().splitlines()[-1]
                            .split(",")[1])
            if len(ends) == 2 and ends[0] == ends[1]:
                failures.append(f"R7: `reversible true` left the dynamicCSTR's holdup"
                                f" unmoved (n_ethanol {ends[0]} either way) -- the"
                                f" reverse leg is dropped")
                ok = False
            elif len(ends) == 2:
                oks.append(f"R7 dynamicCSTR announces sum(nu) != 0; reverse leg moves"
                           f" n_ethanol {ends[0]} -> {ends[1]}")

    if failures:
        print("check_reactor_limits: FAIL")
        for f in failures:
            print("  - " + f)
        return 1
    print("check_reactor_limits: OK -- " + "; ".join(oks)
          + " (NOT checked: several-reaction extent multiplicity, a liquid"
            " standard state for reversible liquid reactions)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
