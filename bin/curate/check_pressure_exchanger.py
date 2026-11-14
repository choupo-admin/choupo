#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the rotary pressure exchanger (DEV.md 4c C192) is three balances on
three declared numbers, its sheet is an array of rotors from a declared rated
flow, and the GUI draws the sheet the engine wrote.

    bin/curate/check_pressure_exchanger.py

WHY THIS EXISTS.  `pressureExchanger` (src/unitOperations/rotating/
PressureExchanger.cpp) carries no physics beyond three algebraic balances --
volume less the leakage, composition by the volumetric mixing, pressure by
Stover's efficiency -- and a golden pins only what the run PRINTS, so a
balance written wrong and stable would pass every golden for ever (the
2026-09-04 dryer shape).  This gate recomputes the three from the witness's
own result JSON, outside the engine, and holds the refusals, the sizer's one
computation and the GUI's transcription of the sheet.

WHAT THIS CHECKS, on `tutorials/steady/membranes/membrane27_swro_energy_recovery`:

  (a) THE THREE BALANCES RECOMPUTE.  From the result JSON's streams (F, z)
      and the unit's KPIs (the declared efficiency, mixing, leakage, P_LPout,
      the stream pressures and the published volumetric flows):
        volume    Q_HPout = (1 - lambda) Q_HPin,  Q_LPout = Q_LPin + lambda Q_HPin,
                  each to 1e-6 relative (the result JSON's 12 figures,
                  less what a remainder loses), and Q_HPin + Q_LPin = Q_HPout + Q_LPout;
        salt      the HP outlet's NaCl flow = m Q_HPout (n_b/Q_b) + (1 - m)
                  Q_HPout (n_s/Q_s) with n/Q each inlet's molar density, and
                  the LP outlet the remainder of EVERY component (matter
                  closes), each to 1e-6 relative;
        pressure  eta (Q_HPin P_HPin + Q_LPin P_LPin) = Q_HPout P_HPout
                  + Q_LPout P_LPout with the stream pressures, to 1e-6
                  relative, P_LPin < P_HPout < P_HPin, and P_recovered_bar
                  = (P_HPout - P_LPin)/1e5;
        salinity  feedSalinityIncrease = the solute MASS fraction of the HP
                  outlet against the seawater inlet, recomputed from z and
                  the molar masses the result's stream table carries
                  (mdot / F), to 1e-6 relative;
        energy    Q_kW = 0 and dissipation_kW = (1 - eta) x (input) / 1000.
  (b) THE REFUSALS, BY NAME, on fixtures built from the witness in a
      temporary directory (the engine is RUN, never patched):
        - `efficiency` deleted  -> "REQUIRED and absent", naming Stover;
        - `efficiency 1.2`      -> "must lie in (0, 1]";
        - `mixing -0.1`         -> "must lie in [0, 1)";
        - `source` deleted      -> "`source`" REQUIRED;
        - `P_LPout` deleted     -> the drain pressure REQUIRED;
        - the seawater inlet authored as a VAPOUR (400 K, 0.5 bar, the
          exchanger fed directly, no pumps) -> the acceptance contract's
          "is not a liquid" clause, BEFORE any unit runs;
        - a NON-AQUEOUS feed (benzene in place of water) -> the contract's
          "carries no water" clause.
      Each fixture exits non-zero and its message carries the words.
  (c) THE SIZER: `rotors` on the published sheet = ceil(Q_LP /
      ratedFlowPerUnit) recomputed from the same sheet, `flowPerRotor` =
      Q_LP / rotors, the item is listed NOT COSTED and carries no cost, and
      a fixture whose `ratedFlowPerUnit` is halved below Q_LP publishes
      rotors = 2 -- the one arithmetic the sizer does, moved and seen.
  (d) THE SHEET AND ITS DRAWING: every `sizing {}` line of
      design/PX/pressureExchanger is `key value unit;` with a unit word
      (a dimensionless one in the bracket form), the four port blocks carry
      a pressure, and the transcription in
      gui/tests/pressureExchangerSchematic.test.ts holds every header word,
      sizing triple and port line of the sheet the run just wrote (the
      check_design_sheet (l) rule, applied here because that gate's fixture
      list is its own); the drawing module registers `pressureExchanger`
      in SCHEMATIC_KINDS and its builder letters the rotor count, the
      rated flow and "provenance not published" (source arm).

SABOTAGES, by hand, 2026-11-01 (each restored, the gate re-run to exit 0;
the engine sabotages rebuilt with `make all`):
  S1  the salt balance drops the mixing (`V_brine_HP = 0; V_sea_HP =
      Q_HPout;` after the mix is formed in PressureExchanger.cpp; rebuilt).
      FAILED, verbatim:
        (a) salt: the HP outlet's NaCl flow 1.2786e-03 kmol/s is not the
            volumetric mix m*brine + (1-m)*seawater = 1.3162e-03 kmol/s
            (rel 2.858e-02)
        (d) the GUI fixture in gui/tests/pressureExchangerSchematic.test.ts
            no longer matches design/PX/pressureExchanger.  Absent: P_HPin
            54.164505 bar;; P_HPout 53.427243 bar;; ...
      Measured, not predicted: the SALINITY arm stayed green, because the
      `feedSalinityIncrease` KPI is computed from the same (sabotaged)
      outlet the streams carry -- the KPI and the streams agree with each
      other, so only an arm that recomputes the MIX from the inlets can
      see it, which is why the salt arm exists beside the salinity arm.
      The whole plant moved with the composition (the recycle), so arm (d)
      fired too; the volume and pressure arms stayed green, as they read no
      composition.
  S2  the efficiency defaulted (`eta = 0.96` when the key is absent, in
      place of the refusal; rebuilt).  FAILED, one line:
        (b) no-efficiency: the run EXITED 0 -- the efficiency was defaulted,
            not refused
  S3  the sizer's `std::ceil` replaced by `std::floor` (rebuilt).  FAILED,
      and NOT by the line predicted: floor(8.39/60) is 0, the sizer's own
      guard refused "no rotor is needed for no flow", the sheet was not
      written, and arm (c) reported
        (c) the run wrote no design/PX/pressureExchanger
      -- the halved-rating fixture (which would have seen rotors 1 against
      ceil 2) was never reached, because (c) returns at the missing sheet.
      Recorded as measured: a floor is caught, but by the sheet's absence,
      not by the count.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER STOVER'S DEFINITION IS THE MAKER'S.  The efficiency is applied
    to the absolute pressures the streams carry; the paper is not read here.
  * WHETHER THE THREE NUMBERS ARE RIGHT FOR ANY DEVICE: they are the case's.
  * THE FIRST LAW.  On membrane01's component set the plant's energy balance
    is UNAVAILABLE (NaCl carries no liquid heat capacity), so nothing here
    reads a residual; the device's `Q_kW = 0` is held, not a closure.
  * THE MEMBRANE: the stage's answer is check_membrane_modules' subject.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials" / "steady" / "membranes" / "membrane27_swro_energy_recovery"
UNIT_CPP = ROOT / "src" / "unitOperations" / "rotating" / "PressureExchanger.cpp"
GUI_TS = ROOT / "gui" / "src" / "case" / "equipmentSchematic.ts"
GUI_TEST = ROOT / "gui" / "tests" / "pressureExchangerSchematic.test.ts"
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")

fails = []
#  THE TOLERANCE IS THE CHANNEL'S, not the arithmetic's: the result JSON
#  carries 12 significant figures, and a remainder of two such numbers or a
#  ratio of their products keeps fewer (measured: 5e-8 on the salt mix,
#  1e-7 on the remainders).  A tolerance tighter than the serialiser
#  measures the serialiser (the 2026-09-16 lesson); 1e-6 is two decades
#  above what the channel loses and four below any arithmetic sabotage.
TOL = 1e-6


def rel(a, b):
    return abs(a - b) / abs(b) if b != 0 else abs(a)


def run_case(case: Path):
    """stdout of a run, exit code; the suite's cached output where present."""
    if _CACHE and case == CASE:
        f = Path(_CACHE) / (case.relative_to(ROOT).as_posix().replace("/", "__") + ".out")
        try:
            return f.read_text(errors="replace"), 0
        except OSError:
            pass
    r = subprocess.run([str(ROOT / "choupoSolve"), str(case)],
                       capture_output=True, text=True, env=ENV)
    return r.stdout + r.stderr, r.returncode


def result_json(out: str):
    """The result JSON block the run prints between its own markers."""
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return None
    try:
        return json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    except ValueError:
        return None


# ---------------------------------------------------------------------------
#  (a) the three balances
# ---------------------------------------------------------------------------
def arm_a(res):
    k = res.get("kpis", {}).get("PX")
    st = res.get("streams", {})
    if not k or not all(n in st for n in ("brine", "toPX", "pxHPout", "spentBrine")):
        fails.append("(a) the witness published no PX KPIs or not its four streams")
        return
    eta, m, lam = k["efficiency"], k["mixing"], k["leakage"]
    Q = {n: k[n] / 3600.0 for n in ("Q_HPin_m3h", "Q_LPin_m3h", "Q_HPout_m3h", "Q_LPout_m3h")}
    Qhi, Qli, Qho, Qlo = Q["Q_HPin_m3h"], Q["Q_LPin_m3h"], Q["Q_HPout_m3h"], Q["Q_LPout_m3h"]
    # volume
    if rel(Qho, (1 - lam) * Qhi) > TOL:
        fails.append("(a) volume: Q_HPout %.6g != (1 - leakage) Q_HPin %.6g" % (Qho, (1 - lam) * Qhi))
    if rel(Qlo, Qli + lam * Qhi) > TOL:
        fails.append("(a) volume: Q_LPout %.6g != Q_LPin + leakage Q_HPin %.6g" % (Qlo, Qli + lam * Qhi))
    if rel(Qhi + Qli, Qho + Qlo) > TOL:
        fails.append("(a) volume: the four flows do not conserve volume")
    # salt and matter
    b, s, ho, lo = st["brine"], st["toPX"], st["pxHPout"], st["spentBrine"]
    comps = sorted(set(b["composition"]) | set(s["composition"]))
    n = lambda S, c: S["F"] * S["composition"].get(c, 0.0)
    for c in comps:
        want_ho = m * Qho * (n(b, c) / Qhi) + (1 - m) * Qho * (n(s, c) / Qli)
        if c == "NaCl" and rel(n(ho, c), want_ho) > TOL:
            fails.append("(a) salt: the HP outlet's NaCl flow %.4e kmol/s is not the volumetric"
                         " mix m*brine + (1-m)*seawater = %.4e kmol/s (rel %.3e)"
                         % (n(ho, c), want_ho, rel(n(ho, c), want_ho)))
        want_lo = n(b, c) + n(s, c) - n(ho, c)
        if rel(n(lo, c), want_lo) > TOL:
            fails.append("(a) matter: %s in the LP outlet %.6e is not the remainder %.6e"
                         % (c, n(lo, c), want_lo))
    # pressure
    Phi, Pli, Pho, Plo = b["P"], s["P"], ho["P"], lo["P"]
    if rel(Pho, k["P_HPout"]) > 1e-12 or rel(Plo, k["P_LPout"]) > 1e-12:
        fails.append("(a) pressure: the outlet streams do not carry the KPI pressures")
    lhs = eta * (Qhi * Phi + Qli * Pli)
    rhs = Qho * Pho + Qlo * Plo
    if rel(lhs, rhs) > TOL:
        fails.append("(a) pressure: eta x (Q P)_in = %.6e != (Q P)_out = %.6e" % (lhs, rhs))
    if not (Pli < Pho < Phi):
        fails.append("(a) pressure: P_LPin %.4g < P_HPout %.4g < P_HPin %.4g does not hold" % (Pli, Pho, Phi))
    if rel(k["P_recovered_bar"], (Pho - Pli) / 1e5) > TOL:
        fails.append("(a) pressure: P_recovered_bar is not (P_HPout - P_LPin)/1e5")
    # salinity, from the stream table's own masses: MW_mix = mdot / F
    #  The solute MASS fraction needs each component's molar mass, which the
    #  result does not carry; two streams of different composition give two
    #  equations  F_mass/F = z_w MW_w + z_s MW_s  in the two unknowns.
    A = [[b["composition"].get("water", 0.0), b["composition"].get("NaCl", 0.0)],
         [s["composition"].get("water", 0.0), s["composition"].get("NaCl", 0.0)]]
    y = [b["F_mass"] / b["F"], s["F_mass"] / s["F"]]
    det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
    if abs(det) > 1e-12:
        MWw = (y[0] * A[1][1] - A[0][1] * y[1]) / det
        MWs = (A[0][0] * y[1] - y[0] * A[1][0]) / det
        wf = lambda S: (S["composition"].get("NaCl", 0.0) * MWs) / (S["composition"].get("water", 0.0) * MWw + S["composition"].get("NaCl", 0.0) * MWs)
        inc = (wf(ho) - wf(s)) / wf(s)
        if rel(k["feedSalinityIncrease"], inc) > 1e-6:
            fails.append("(a) salinity: feedSalinityIncrease %.6f is not the recomputed solute"
                         " mass-fraction rise %.6f" % (k["feedSalinityIncrease"], inc))
    else:
        fails.append("(a) salinity: the two inlets have one composition; the molar masses"
                     " cannot be separated to recompute it")
    # energy posture
    if k.get("Q_kW", 1.0) != 0.0:
        fails.append("(a) energy: Q_kW is %r, not 0" % k.get("Q_kW"))
    if rel(k["dissipation_kW"], (1 - eta) * (Qhi * Phi + Qli * Pli) / 1000.0) > TOL:
        fails.append("(a) energy: dissipation_kW is not (1 - eta) x (Q P)_in")


# ---------------------------------------------------------------------------
#  (b) the refusals
# ---------------------------------------------------------------------------
def fixture(tmp: Path, name: str, edit) -> Path:
    dst = tmp / name
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns("converged", "design",
                    "reports", "iterations", "log.*", "*.json"))
    edit(dst)
    return dst


def sub_file(p: Path, old: str, new: str, must=True):
    s = p.read_text()
    if must and old not in s:
        raise RuntimeError("fixture edit: %r not in %s" % (old, p))
    p.write_text(s.replace(old, new))


DIRECT = '''units
(
    {
        name        PX;
        type        pressureExchanger;
        inputs      ( brineIn  seaIn );
        outputs     ( pxHPout  spentBrine );
        operation
        {
            efficiency      0.96;
            mixing          0.03;
            leakage         0.015;
            P_LPout         1.3 bar;
            source          "fixture";
        }
    }
);
'''


def direct_case(dst: Path, sea_state: str, comps=("water", "NaCl")):
    """The exchanger fed DIRECTLY from two authored inlets: no pumps, no
    recycle, so the pre-solve acceptance pass is what judges the feed."""
    fd = dst / "system" / "flowsheetDict"
    s = fd.read_text()
    s = s[:s.index("tearStreams")] + DIRECT
    fd.write_text(s)
    for f in (dst / "0").iterdir():
        f.unlink()
    (dst / "0" / "brineIn").write_text(
        "componentMolarFlows { %s 440 kmol/h; %s 9.45 kmol/h; }\nT 298.15 K;\nP 54 bar;\n" % comps)
    (dst / "0" / "seaIn").write_text(sea_state)
    (dst / "0" / "pxHPout").write_text(
        "componentMolarFlows { %s 440 kmol/h; %s 4.7 kmol/h; }\nT 298.15 K;\nP 53 bar;\n" % comps)
    (dst / "0" / "spentBrine").write_text(
        "componentMolarFlows { %s 440 kmol/h; %s 9.45 kmol/h; }\nT 298.15 K;\nP 1.3 bar;\n" % comps)
    sd = dst / "system" / "solverDict"
    if sd.exists():
        sd.unlink()
    pd = dst / "system" / "postDict"
    if pd.exists():
        pd.unlink()


def arm_b(tmp: Path):
    oper = CASE / "system" / "flowsheetDict"
    cases = []
    def drop(key):
        return lambda d: sub_file(d / "system" / "flowsheetDict",
                                  re.search(r"^\s*%s\s.*\n" % key, oper.read_text(), re.M).group(0), "")
    cases.append(("no-efficiency", drop("efficiency"), ["REQUIRED and absent", "Stover"]))
    cases.append(("efficiency-1.2", lambda d: sub_file(d / "system" / "flowsheetDict",
                  "efficiency      0.96;", "efficiency      1.2;"), ["must lie in (0, 1]"]))
    cases.append(("mixing-negative", lambda d: sub_file(d / "system" / "flowsheetDict",
                  "mixing          0.03;", "mixing          -0.1;"), ["must lie in [0, 1)"]))
    cases.append(("no-source", drop("source"), ["`operation { source", "REQUIRED"]))
    cases.append(("no-drain", drop("P_LPout"), ["P_LPout", "REQUIRED", "drain"]))
    cases.append(("vapour-seawater", lambda d: direct_case(d,
                  "componentMolarFlows { water 440 kmol/h; NaCl 4.7 kmol/h; }\nT 400 K;\nP 0.5 bar;\nphase gas;\n"),
                  ["is not a liquid", "checked before any unit runs"]))
    def nonaqueous(d):
        #  The witness (membrane27) is SEALED since 2026-11-03, and a sealed
        #  case refuses a component its constant/components does not carry --
        #  which would fire BEFORE the contract this arm exists to hit.  The
        #  probe is about the acceptance contract, not the seal, so the staged
        #  copy reads the live catalogue (no manifest), as it did unsealed.
        (d / "constant" / "propertyManifest").unlink(missing_ok=True)
        direct_case(d, "componentMolarFlows { benzene 440 kmol/h; NaCl 4.7 kmol/h; }\nT 298.15 K;\nP 2 bar;\n",
                    comps=("benzene", "NaCl"))
        sub_file(d / "constant" / "thermoPhysPropDict", "components       ( water  NaCl );",
                 "components       ( water  benzene  NaCl );")
        (d / "0" / "brineIn").write_text(
            "componentMolarFlows { benzene 440 kmol/h; NaCl 9.45 kmol/h; }\nT 298.15 K;\nP 54 bar;\n")
    cases.append(("non-aqueous", nonaqueous, ["carries no water"]))
    n = 0
    for name, edit, words in cases:
        d = fixture(tmp, name, edit)
        out, code = run_case(d)
        if code == 0:
            fails.append("(b) %s: the run EXITED 0 -- %s" % (name,
                         "the efficiency was defaulted, not refused" if name == "no-efficiency"
                         else "not refused"))
            continue
        missing = [w for w in words if w not in out]
        if missing:
            fails.append("(b) %s: refused, but not naming %r.  Tail:\n%s" % (name, missing, out[-700:]))
        n += 1
    return n


# ---------------------------------------------------------------------------
#  (c) the sizer, (d) the sheet and its drawing
# ---------------------------------------------------------------------------
def sheet_of(case: Path):
    p = case / "design" / "PX" / "pressureExchanger"
    if not p.is_file():
        return None, None
    text = re.sub(r'/\*.*?\*/', '', p.read_text(errors="replace"), flags=re.S)
    m = re.search(r'^sizing\s*\n\{(.*?)\n\}', text, re.S | re.M)
    vals = {}
    if m:
        for line in m.group(1).splitlines():
            t = line.strip().rstrip(";").split()
            if not t:
                continue
            if len(t) >= 7 and t[1] == "[0":
                vals[t[0]] = (float(t[6]), "-")
            elif len(t) == 3:
                vals[t[0]] = (float(t[1]), t[2])
            else:
                vals[t[0]] = (float(t[1]) if len(t) > 1 else float("nan"), "")
    return text, vals


def arm_c(res, out, tmp: Path):
    text, vals = sheet_of(CASE)
    if vals is None:
        fails.append("(c) the run wrote no design/PX/pressureExchanger")
        return
    Q, rated, rot = vals["Q_LP"][0], vals["ratedFlowPerUnit"][0], vals["rotors"][0]
    if rot != math.ceil(Q / rated - 1e-12):
        fails.append("(c) rotors %g on the sheet; ceil(%.4g/%.4g) = %d" % (rot, Q, rated, math.ceil(Q / rated)))
    if rel(vals["flowPerRotor"][0], Q / rot) > 1e-9:
        fails.append("(c) flowPerRotor is not Q_LP / rotors")
    item = [e for e in res.get("equipment", []) if e.get("item") == "PX"]
    if not item:
        fails.append("(c) no PX item in the result's equipment list")
    elif "cost" in item[0]:
        fails.append("(c) the PX item carries a cost; it must be NOT COSTED")
    if "NOT costed" not in out and "notCostedBecause" not in json.dumps(item):
        fails.append("(c) the run does not say the exchanger is NOT costed")
    # the halved-rating fixture: ceil must move
    d = fixture(tmp, "halved-rating", lambda d: sub_file(d / "system" / "postDict",
                "ratedFlowPerUnit  60 m3/h;", "ratedFlowPerUnit  5 m3/h;"))
    out2, code = run_case(d)
    if code != 0:
        fails.append("(c) the halved-rating fixture did not run")
    else:
        _, v2 = sheet_of(d)
        want = math.ceil(v2["Q_LP"][0] / 5.0 - 1e-12) if v2 else None
        if not v2 or v2["rotors"][0] != want:
            fails.append("(c) rotors %s on the halved-rating fixture; ceil(%.4g/5) = %s"
                         % (v2["rotors"][0] if v2 else "?", v2["Q_LP"][0] if v2 else float("nan"), want))
    # a sizer with no rated flow refuses by name
    d = fixture(tmp, "no-rated-flow", lambda d: sub_file(d / "system" / "postDict",
                "ratedFlowPerUnit  60 m3/h;", ""))
    out3, _ = run_case(d)
    if "ratedFlowPerUnit" not in out3 or "REQUIRED" not in out3:
        fails.append("(c) the sizer did not refuse a missing ratedFlowPerUnit by name")
    return text, vals


def arm_d(text, vals):
    if text is None:
        return
    for key, (v, u) in vals.items():
        if u == "":
            fails.append("(d) sizing key %s carries no unit word" % key)
    for blk in ("inlets", "outlets"):
        m = re.search(r'^%s\s*\n\{(.*?)\n\}' % blk, text, re.S | re.M)
        if not m or len(re.findall(r'^\s*P\s+[0-9.eE+-]+ Pa;', m.group(1), re.M)) != 2:
            fails.append("(d) the sheet's %s block does not carry two port pressures" % blk)
    # the GUI fixture is the engine's own output (check_design_sheet (l)'s rule)
    if not GUI_TEST.is_file():
        fails.append("(d) %s is gone" % GUI_TEST.relative_to(ROOT))
    else:
        norm = lambda s: " ".join(s.split())
        chunks = [norm(c) for c in re.split(r"(?<!\\)`", GUI_TEST.read_text(errors="replace"))]
        want = []
        for k in ("recordType", "unit", "equipment", "material", "basis"):
            m = re.search(r'^\s*%s\s+.*;' % k, text, re.M)
            if m:
                want.append(m.group(0))
        for block in ("sizing", "inlets", "outlets"):
            m = re.search(r'^%s\s*\n\{(.*?)\n\}' % block, text, re.S | re.M)
            if m:
                want += [l for l in m.group(1).splitlines() if l.strip()]
        want = [norm(w) for w in want]
        best = None
        for c in chunks:
            gap = [w for w in want if w not in c]
            if best is None or len(gap) < len(best):
                best = gap
        if best:
            fails.append("(d) the GUI fixture in %s no longer matches design/PX/pressureExchanger."
                         "  Absent: %s" % (GUI_TEST.relative_to(ROOT), "; ".join(best[:4])))
    ts = GUI_TS.read_text(errors="replace")
    if not re.search(r'SCHEMATIC_KINDS[^=]*=\s*\[[^\]]*"pressureExchanger"', ts):
        fails.append("(d) equipmentSchematic.ts does not register 'pressureExchanger' in SCHEMATIC_KINDS")
    for need in ("export function pressureExchangerSvg", "provenance not published",
                 "ratedFlowPerUnit", '"rotors"', "boosterPower"):
        if need not in ts:
            fails.append("(d) equipmentSchematic.ts no longer carries %r" % need)


def main():
    if not (ROOT / "choupoSolve").exists():
        print("check_pressure_exchanger: FAILED -- no choupoSolve build")
        return 1
    out, code = run_case(CASE)
    if code != 0:
        print("check_pressure_exchanger: FAILED -- the witness did not run (exit %d)\n%s" % (code, out[-1500:]))
        return 1
    res = result_json(out)
    if res is None:
        print("check_pressure_exchanger: FAILED -- no result JSON in the witness's output")
        return 1
    arm_a(res)
    tmp = Path(tempfile.mkdtemp(prefix="check_pressure_exchanger_"))
    try:
        nb = arm_b(tmp)
        text, vals = arm_c(res, out, tmp) or (None, None)
        arm_d(text, vals)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if fails:
        print("check_pressure_exchanger: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_pressure_exchanger: OK -- on %s the exchanger's three balances recompute "
          "from the result JSON outside the engine (volume less the leakage and the four flows "
          "conserving it, every component's LP outlet the remainder of the volumetric mix, "
          "Stover's efficiency on the stream pressures, each to 1e-6, the salinity rise from the "
          "streams' own masses, Q_kW = 0 and the dissipation (1 - eta) of the input); %d "
          "fixtures refuse by name (efficiency absent, 1.2; mixing -0.1; no source; no drain "
          "pressure; a vapour seawater and a non-aqueous feed through the acceptance contract, "
          "before any unit runs); the sheet's rotors = ceil(Q_LP / ratedFlowPerUnit) and move "
          "to 2 on a halved rating, the item is NOT costed and a missing rating refuses; every "
          "sizing value carries a unit, both port blocks carry pressures, and the GUI fixture "
          "is the sheet the run just wrote.  NOT CHECKED: whether Stover's definition is the "
          "maker's, whether the three numbers fit any device, the first law (UNAVAILABLE on "
          "this component set), the membrane's answer." % (CASE.name, nb))
    return 0


if __name__ == "__main__":
    sys.exit(main())
