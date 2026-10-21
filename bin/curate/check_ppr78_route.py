#!/usr/bin/env python3
"""Gate: route P -- a PPR78 / E-PPR78 kij is EVALUATED ONCE at a declared
temperature, WRITTEN into the case, READ by the phi-phi builder and said on
the run; a cubic's kij can be REGRESSED to bubble pressures; a compressor
takes the header it discharges into.

    bin/curate/check_ppr78_route.py

WHY THIS EXISTS (DEV.md 4c C123, 2026-10-21).  Vitor's ruling for the
benchmark cases was "Rota P, kij a T declarada, e sim a tudo": the
group-contribution kij of Jaubert and co-workers are not a kij(T) hidden
inside the cubic but CONSTANTS a student can read, evaluated at the
temperature a unit declares and written into the case.  Five pieces of
engine were built for it, and none is exercised by any corpus case (the
benchmarks live outside bin/runTests by C123's stated default), so a probe
of each lives here.

WHAT THIS GATE CHECKS.

  (a) THE `ppr78Kij` OP REPRODUCES EQ. 7 FROM THE TABLE, INDEPENDENTLY.
      A two-component probe (CO2 + N2 on the 2017 table's one pair) is run
      through the op at 300 K, and the kij it writes is recomputed HERE --
      PR78's a_i(T), b_i from the catalogue's own Tc, Pc, omega, the group
      double sum, the MPa -> Pa factor -- and must agree to 1e-7.  The
      recomputation shares no code with the op: the arm is the second
      opinion the op's own arithmetic cannot give itself.

  (b) THE SET REACHES THE PR, AND THE RUN SAYS SO.  A flash case declares
      the written set by `source`; the run must announce the set with its
      temperature and the "held CONSTANT" default, and the PR's own
      consumption line must print the SAME kij the set carries.  A
      sabotage that writes the set and never reads it is invisible without
      the second half.

  (c) AN EXTRAPOLATION IS WRITTEN AND REPEATED.  The same probe with the
      table's data window below 300 K must mark the pair `extrapolated yes`
      in the set and the plant run must repeat "EXTRAPOLATED in T" with the
      window -- the 2017 table's loop pairs are exactly this case.

  (d) AN INLINE kij IS A VALUE UNDER REGRESSION, OR IT REFUSES.  The same
      flash with `{ i; j; kij; }` and no `origin` must refuse by name; with
      `origin fitParameters;` it must run and announce the value as INLINE.

  (e) `fitParameters` RECOVERS A PLANTED kij FROM BUBBLE PRESSURES.  Bubble
      pressures of CO2 + methanol are generated at kij = 0.05 (a `mode
      evaluate` P_bubble op's parity CSV: the engine's own curve, three
      isotherms), then a fit from kij = 0 on two of them with the third
      held out and a 1 % band must land within 1e-3 of 0.05 with verdict
      `validated`, and write an `eosBinaryInteraction` record carrying it.
      `weighting` beside a P_bubble residual must refuse.

  (f) THE COMPRESSOR'S TWO FORMS ARE INVERSES.  A compressor declared by
      `P_out` publishes a W_shaft; the same compressor declared by THAT
      W_shaft must publish the same P_out to 1e-6 relative.  Both keys, or
      neither, must refuse by name.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply
it.  No number here is checked against a MEASURED phase equilibrium: (a)
proves the op computes the equation the article prints, not that the
equation is right; (e) proves the fit recovers what the engine planted,
not that a fitted pair describes Brunner's data (that verdict is the
benchmark's, outside this suite).  The 2010 and 2017 tables' values are
not re-read here; the transcription's check is the record of that.
"""

import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROPS = BUILD / "choupoProps"
SOLVE = BUILD / "choupoSolve"
INIT0 = ROOT / "bin" / "choupo-init0"

SYSTEM_PHIPHI = """recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( %s );
equilibrium
{
    formulation phiPhi;
    equationOfState { model PengRobinson;  mixingRule vanDerWaalsOneFluid; %s }
    liquid { fugacityRoute equationOfState; root liquid; }
    vapour { fugacityRoute equationOfState; root vapour; }
}
caloric
{
    energyBasis elementsDatum;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
"""

#  Xu, Lasala, Privat & Jaubert (2017) Table 3, the N2-CO2 cell (MPa) -- two
#  numbers of a primary, cited; the probe's one pair.
A_N2_CO2, B_N2_CO2 = 113.92, 212.41
TABLE = """recordType ppr78GroupTable;
schemaVersion 1;
method E-PPR78;
eos PengRobinson;
units MPa;
Tref 298.15 K;
source "Xu, Lasala, Privat & Jaubert, Int. J. Greenh. Gas Control 56 (2017) 126, Table 3, N2-CO2";
reviewStatus interim;
licence primaryCitation;
groups ( CO2 N2 );
interactions ( { k N2; l CO2; A %g; B %g; } );
decompositions { CO2 { CO2 1; }  N2 { N2 1; } }
%s
"""


def run(binary, case, timeout=900):
    p = subprocess.run([str(binary), str(case)], capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def record_scalar(name, key):
    """A component record's scalar, read from data/standards by regex."""
    txt = (ROOT / "data" / "standards" / "components" / (name + ".dat")).read_text()
    m = re.search(r"^\s*%s\s+([-+0-9.eE]+)" % key, txt, re.M)
    return float(m.group(1))


def engine_R():
    txt = (ROOT / "src" / "core" / "Constants.H").read_text()
    m = re.search(r"R\s*=\s*([0-9.]+)", txt)
    return float(m.group(1))


def kij_recomputed(T, comps, A, B, Tref=298.15):
    """Eq. 7 of Jaubert et al. 2010 on PR78, independently of the op."""
    R = engine_R()
    delta = []
    for c in comps:
        Tc, Pc, w = record_scalar(c, "Tc"), record_scalar(c, "Pc") * 1e5, record_scalar(c, "omega")
        m = (0.37464 + 1.54226 * w - 0.26992 * w * w) if w <= 0.491 else \
            (0.379642 + 1.48503 * w - 0.164423 * w ** 2 + 0.016666 * w ** 3)
        a = 0.45724 * R * R * Tc * Tc / Pc * (1 + m * (1 - math.sqrt(T / Tc))) ** 2
        b = 0.07780 * R * Tc / Pc
        delta.append(math.sqrt(a) / b)
    # single-group molecules: the double sum is -2 A (Tref/T)^(B/A-1), times -1/2
    E = A * 1e6 * (Tref / T) ** (B / A - 1.0)
    return (E - (delta[0] - delta[1]) ** 2) / (2 * delta[0] * delta[1])


def main() -> int:
    fails, notes = [], []
    for exe in (PROPS, SOLVE):
        if not exe.exists():
            print("check_ppr78_route: FAILED -- %s not built" % exe)
            return 1

    # ---- source arms -----------------------------------------------------
    builder = (ROOT / "src" / "thermo" / "ThermoPackageBuilder.cpp").read_text()
    for needle, what in (("eosBinaryInteractionSet", "the kij SET record reader"),
                         ("held CONSTANT", "the once-at-T announcement"),
                         ("EXTRAPOLATED in T", "the extrapolation announcement"),
                         ("is an INLINE value (origin", "the inline-under-regression announcement")):
        if needle not in builder:
            fails.append("ThermoPackageBuilder.cpp no longer carries %s ('%s')" % (what, needle))
    fitsrc = (ROOT / "src" / "propertyOps" / "FitParameters.cpp").read_text()
    if "P_bubble" not in fitsrc or "BubblePoint::pressure" not in fitsrc:
        fails.append("FitParameters.cpp no longer carries the P_bubble kind on BubblePoint::pressure")
    comp = (ROOT / "src" / "unitOperations" / "rotating" / "Compressor.cpp").read_text()
    if '"P_out"' not in comp or "solveT_for_S" not in comp:
        fails.append("Compressor.cpp no longer carries the P_out form on the isentropic inner solve")
    if fails:
        print("check_ppr78_route: FAILED")
        for f in fails:
            print("  -", f)
        return 1
    notes.append("the four source homes are in place")

    with tempfile.TemporaryDirectory(prefix="choupo-ppr78-") as td:
        td = Path(td)

        # ---- (a) the op against an independent recomputation --------------
        kij = td / "kij"
        (kij / "system").mkdir(parents=True)
        (kij / "constant" / "parameters" / "PPR78").mkdir(parents=True)
        (kij / "constant" / "parameters" / "PengRobinson").mkdir(parents=True)
        (kij / "system" / "controlDict").write_text("application choupoProps;\nverbosity 3;\n")
        (kij / "constant" / "thermoPhysPropDict").write_text(SYSTEM_PHIPHI % ("CO2 N2", ""))
        (kij / "constant" / "parameters" / "PPR78" / "probe.dat").write_text(TABLE % (A_N2_CO2, B_N2_CO2, ""))
        (kij / "system" / "propsDict").write_text(
            "operations\n(\n    {\n        name k300;\n        type ppr78Kij;\n"
            "        groupTable \"constant/parameters/PPR78/probe.dat\";\n        T 300 K;\n"
            "        output { record \"constant/parameters/PengRobinson/set300.dat\"; }\n    }\n);\n")
        rc, out = run(PROPS, kij)
        setp = kij / "constant" / "parameters" / "PengRobinson" / "set300.dat"
        if rc != 0 or not setp.exists():
            fails.append("(a) the ppr78Kij op did not run or wrote no set (exit %d): %s" % (rc, out[-600:]))
            kij_op = None
        else:
            m = re.search(r"kij\s+([-+0-9.eE]+);", setp.read_text())
            kij_op = float(m.group(1)) if m else None
            expect = kij_recomputed(300.0, ["CO2", "N2"], A_N2_CO2, B_N2_CO2)
            if kij_op is None:
                fails.append("(a) the set record carries no `kij` value")
            elif abs(kij_op - expect) > 1e-7:
                fails.append("(a) the op writes kij(CO2,N2; 300 K) = %.8f; Eq. 7 recomputed here from the"
                             " catalogue's Tc/Pc/omega gives %.8f" % (kij_op, expect))
            else:
                notes.append("the op's kij(CO2,N2; 300 K) = %.6f reproduces Eq. 7 recomputed independently" % kij_op)
            if "recordType     eosBinaryInteractionSet" not in setp.read_text():
                fails.append("(a) the written set is not a `recordType eosBinaryInteractionSet` record")

        # ---- (b) the set reaches the PR ---------------------------------------
        def flash_case(name, bi_block, extra_files=()):
            c = td / name
            (c / "system").mkdir(parents=True)
            (c / "constant" / "parameters" / "PengRobinson").mkdir(parents=True)
            (c / "0").mkdir()
            (c / "system" / "controlDict").write_text("application choupoSolve;\nverbosity 3;\n")
            (c / "constant" / "thermoPhysPropDict").write_text(SYSTEM_PHIPHI % ("CO2 N2", "binaryInteractions { %s }" % bi_block))
            (c / "system" / "flowsheetDict").write_text(
                "units\n(\n    {\n        name F;\n        type isothermalFlash;\n        in feed;\n"
                "        outputs ( L V );\n        operation { T 250 K;  P 30 bar; }\n    }\n);\n")
            (c / "0" / "feed").write_text(
                "componentMolarFlows { CO2 0.8 kmol/s;  N2 0.2 kmol/s; }\nT 250 K;\nP 30 bar;\n")
            for src, dst in extra_files:
                (c / dst).write_text(Path(src).read_text())
            subprocess.run([str(INIT0), str(c)], capture_output=True, text=True)
            return c

        if kij_op is not None:
            c = flash_case("setcase", 'ppr { source "constant/parameters/PengRobinson/set300.dat"; }',
                           [(setp, "constant/parameters/PengRobinson/set300.dat")])
            rc, out = run(SOLVE, c)
            if rc != 0:
                fails.append("(b) the flash declaring the set did not run (exit %d): %s" % (rc, out[-600:]))
            else:
                if not re.search(r"kij set ppr: 1 pair\(s\) from E-PPR78 evaluated ONCE at T = 300\.000 K and held CONSTANT", out):
                    fails.append("(b) the run does not announce the set with its temperature and the"
                                 " held-CONSTANT default")
                m = re.search(r"\[eos\] kij\(CO2,N2\) = ([-+0-9.eE]+)", out)
                if not m:
                    fails.append("(b) the PR never announced consuming kij(CO2,N2) -- the set did not reach it")
                elif abs(float(m.group(1)) - kij_op) > 1e-6:
                    fails.append("(b) the PR consumed kij(CO2,N2) = %s, not the set's %.8f" % (m.group(1), kij_op))
                else:
                    notes.append("the set reaches the PR and the run says at which T it was evaluated")

        # ---- (c) extrapolation written and repeated ---------------------------
        (kij / "constant" / "parameters" / "PPR78" / "probe.dat").write_text(
            TABLE % (A_N2_CO2, B_N2_CO2, "dataWindows ( { k N2; l CO2; T ( 208.53 298.15 ); } );"))
        rc, out = run(PROPS, kij)
        txt = setp.read_text() if setp.exists() else ""
        if rc != 0 or "extrapolated yes" not in txt or "208.53-298.15 K" not in txt:
            fails.append("(c) a pair evaluated at 300 K outside its 208.53-298.15 K data window is not"
                         " written `extrapolated yes` with the window")
        else:
            c = flash_case("extrapcase", 'ppr { source "constant/parameters/PengRobinson/set300.dat"; }',
                           [(setp, "constant/parameters/PengRobinson/set300.dat")])
            rc, out = run(SOLVE, c)
            if rc != 0 or "EXTRAPOLATED in T for CO2-N2 (fitted 208.53-298.15 K)" not in out:
                fails.append("(c) the plant run reading an extrapolated set does not repeat the"
                             " extrapolation with its window")
            else:
                notes.append("an extrapolated pair is written as one and repeated on the run with its window")

        # ---- (d) inline: refused without origin, announced with it ----------------
        c = flash_case("inlineNoOrigin", "p { i CO2; j N2; kij 0.1; }")
        rc, out = run(SOLVE, c)
        if rc == 0 or "origin names the operation varying it" not in out:
            fails.append("(d) an inline kij with no `origin` was accepted (exit %d) -- an invented number" % rc)
        c = flash_case("inlineOrigin", "p { i CO2; j N2; kij 0.1; origin fitParameters; }")
        rc, out = run(SOLVE, c)
        if rc != 0 or "is an INLINE value (origin fitParameters)" not in out:
            fails.append("(d) an inline kij under regression (origin named) did not run and announce itself"
                         " (exit %d)" % rc)
        elif not fails or all("(d)" not in f for f in fails):
            notes.append("an inline kij refuses without origin and is announced with one")

        # ---- (e) the P_bubble fit recovers a planted kij ------------------------
        fit = td / "fit"
        (fit / "system").mkdir(parents=True)
        (fit / "constant" / "experiments").mkdir(parents=True)
        (fit / "constant" / "parameters" / "PengRobinson").mkdir(parents=True)
        (fit / "system" / "controlDict").write_text("application choupoProps;\nverbosity 2;\n")
        planted = 0.05
        (fit / "constant" / "thermoPhysPropDict").write_text(SYSTEM_PHIPHI % (
            "methanol CO2", "binaryInteractions { p { i CO2; j methanol; kij %g; origin fitParameters; } }" % planted))
        xs = [0.05, 0.10, 0.15, 0.20, 0.25]

        def dataset(T, pressures):
            return ("property binaryVLE.P_bubble;\nsystem ( CO2 methanol );\nT %g K;\n"
                    "provenance { source synthetic; reviewStatus checked; citation \"planted by check_ppr78_route\"; }\n"
                    "columns ( { name x[CO2]; unit -; } { name p; unit bar; } );\ndata\n(\n%s);\n"
                    % (T, "".join("    %g  %.8g\n" % (x, p) for x, p in zip(xs, pressures))))

        # generate: evaluate mode on a placeholder P column -> the parity CSV holds P_model
        for T in (298.15, 323.15, 348.15):
            (fit / "constant" / "experiments" / ("gen%d.dat" % int(T))).write_text(dataset(T, [10.0] * len(xs)))
        ops = "".join(
            "    {\n        name gen%d;\n        type fitParameters;\n        mode evaluate;\n"
            "        dataset \"constant/experiments/gen%d.dat\";\n"
            "        residual { kind P_bubble; components ( CO2 methanol ); }\n"
            "        output { parity gen%d.csv; }\n    }\n" % (int(T), int(T), int(T))
            for T in (298.15, 323.15, 348.15))
        (fit / "system" / "propsDict").write_text("operations\n(\n%s);\n" % ops)
        rc, out = run(PROPS, fit)
        gen_ok = rc == 0
        planted_data = {}
        if gen_ok:
            for T in (298.15, 323.15, 348.15):
                csv = fit / ("gen%d.csv" % int(T))
                if not csv.exists():
                    gen_ok = False
                    break
                rows = [l.split(",") for l in csv.read_text().splitlines()[1:]]
                # x_1,T_exp,P_model(bar in file? no: the evaluate parity writes T_model column as the model value)
                vals = [float(r[2]) for r in rows]
                planted_data[T] = vals
        if not gen_ok:
            fails.append("(e) could not generate bubble pressures at the planted kij (exit %d): %s" % (rc, out[-800:]))
        else:
            for T, vals in planted_data.items():
                (fit / "constant" / "experiments" / ("syn%d.dat" % int(T))).write_text(
                    dataset(T, [v / 1.0e5 for v in vals]))
            (fit / "constant" / "thermoPhysPropDict").write_text(SYSTEM_PHIPHI % (
                "methanol CO2", "binaryInteractions { p { i CO2; j methanol; kij 0.0; origin fitParameters; } }"))
            (fit / "system" / "propsDict").write_text(
                "operations\n(\n    {\n        name recover;\n        type fitParameters;\n"
                "        parameters ( { path equilibrium.equationOfState.binaryInteractions.p.kij; initial 0.0; min -0.5; max 0.5; } );\n"
                "        evidence\n        (\n"
                "            { dataset \"constant/experiments/syn298.dat\"; role fit; }\n"
                "            { dataset \"constant/experiments/syn323.dat\"; role fit; }\n"
                "            { dataset \"constant/experiments/syn348.dat\"; role validation; }\n"
                "        );\n"
                "        acceptance { maxAAD 1 percent; origin \"planted data: the engine's own curve, so 1 % is generous\"; }\n"
                "        residual { kind P_bubble; components ( CO2 methanol ); }\n"
                "        options { maxIter 40; tolerance 1e-9; fdStep 1e-4; lambda0 1e-3; }\n"
                "        output { proposal \"constant/parameters/PengRobinson/CO2-methanol.dat\"; }\n    }\n"
                "    {\n        name weighted;\n        type fitParameters;\n"
                "        parameters ( { path equilibrium.equationOfState.binaryInteractions.p.kij; initial 0.0; } );\n"
                "        dataset \"constant/experiments/syn298.dat\";\n"
                "        residual { kind P_bubble; components ( CO2 methanol ); weighting uncertainty; }\n    }\n);\n")
            rc, out = run(PROPS, fit)
            rec = fit / "constant" / "parameters" / "PengRobinson" / "CO2-methanol.dat"
            m = re.search(r"binaryInteractions\.p\.kij = ([-+0-9.eE]+)", out)
            if not m:
                fails.append("(e) the P_bubble fit printed no fitted kij: %s" % out[-800:])
            elif abs(float(m.group(1)) - planted) > 1e-3:
                fails.append("(e) the fit recovered kij = %s where %g was planted" % (m.group(1), planted))
            elif not re.search(r"VERDICT\n\s+validated", out):
                fails.append("(e) the recovered fit was not judged `validated` on the held-out isotherm")
            elif not rec.exists() or "recordType  eosBinaryInteraction;" not in rec.read_text() \
                    or "validated" not in rec.read_text():
                fails.append("(e) the fit wrote no eosBinaryInteraction record carrying its verdict")
            else:
                notes.append("the P_bubble fit recovers a planted kij (%s vs %g) with verdict validated and"
                             " writes the pair record" % (m.group(1), planted))
            if "`weighting` is not read by this kind" not in out:
                fails.append("(e) `weighting` beside a P_bubble residual was not refused by name")

        # ---- (f) the compressor's two forms are inverses ---------------------------
        def comp_case(name, oper):
            c = td / name
            (c / "system").mkdir(parents=True)
            (c / "constant").mkdir()
            (c / "0").mkdir()
            (c / "system" / "controlDict").write_text("application choupoSolve;\nverbosity 2;\n")
            (c / "constant" / "thermoPhysPropDict").write_text(SYSTEM_PHIPHI % ("CO2 N2", ""))
            (c / "system" / "flowsheetDict").write_text(
                "units\n(\n    {\n        name K;\n        type compressor;\n        in feed;\n"
                "        outputs ( out );\n        operation { %s }\n    }\n);\n" % oper)
            (c / "0" / "feed").write_text(
                "componentMolarFlows { CO2 0.5 kmol/s;  N2 0.5 kmol/s; }\nT 320 K;\nP 5 bar;\nphase gas;\n")
            subprocess.run([str(INIT0), str(c)], capture_output=True, text=True)
            return c

        rc, out = run(SOLVE, comp_case("compP", "P_out 20 bar;  eta 0.75;"))
        m = re.search(r"\"W_shaft\": ([-+0-9.eE]+)", out)
        if rc != 0 or not m:
            fails.append("(f) the compressor by P_out did not run or published no W_shaft (exit %d): %s" % (rc, out[-500:]))
        else:
            W = float(m.group(1))
            rc2, out2 = run(SOLVE, comp_case("compW", "W_shaft %.10g W;  eta 0.75;" % W))
            m2 = re.search(r"\"P_out\": ([-+0-9.eE]+)", out2)
            if rc2 != 0 or not m2:
                fails.append("(f) the compressor by the published W_shaft did not run (exit %d)" % rc2)
            elif abs(float(m2.group(1)) - 20.0e5) / 20.0e5 > 1e-6:
                fails.append("(f) P_out %.6g bar -> W_shaft %.6g W -> P_out %s Pa: the two forms are not"
                             " inverses" % (20.0, W, m2.group(1)))
            else:
                notes.append("the compressor's P_out and W_shaft forms are inverses (20 bar <-> %.4g kW)" % (W / 1e3))
        rc, out = run(SOLVE, comp_case("compBoth", "P_out 20 bar;  W_shaft 1 MW;  eta 0.75;"))
        if rc == 0 or "EXACTLY ONE of `W_shaft`" not in out:
            fails.append("(f) a compressor with BOTH W_shaft and P_out was not refused by name")
        rc, out = run(SOLVE, comp_case("compNone", "eta 0.75;"))
        if rc == 0 or "EXACTLY ONE of `W_shaft`" not in out:
            fails.append("(f) a compressor with NEITHER W_shaft nor P_out was not refused by name")

    if fails:
        print("check_ppr78_route: FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("check_ppr78_route: OK -- " + "; ".join(notes) + ".  NOT COVERED: no number is"
          " checked against a MEASURED equilibrium (the op is held to the equation it"
          " implements, the fit to what the engine planted); the 2010 / 2017 tables' values"
          " are not re-read here.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
