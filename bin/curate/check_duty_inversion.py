#!/usr/bin/env python3
"""Gate: a Q-specified heater's OUTLET STATE satisfies H_out - H_in = Q.

    bin/curate/check_duty_inversion.py

WHY THIS EXISTS.  `heater` is credo-pure -- the hardware is Q and the outlet
is a RESULT -- and until 2026-08-09 it computed that result by inverting a
SENSIBLE enthalpy relation.  That is the same answer as the first law only
while the stream stays on one side of its bubble point.  Cross it, and the
inversion walks the temperature straight past saturation without paying one
joule of latent heat.

`process02_reactor_hx_flash` declared Q = 0.40 kW and wrote a 362 K outlet
which, resolved at its own (T, P, z), was two-phase and cost **3.31 kW** --
an **827.62 %** energy closure.  The case's own comment said the heater was
"credo-pure: hardware = Q, T_out is a RESULT", and it was: the wrong result.

So the claim pinned here is the first law over the unit, on the ELEMENTS
datum, against the state (T, P, z) actually RESOLVES to (R-E5 of
docs/design/tp-stream-energy-coherence.md -- one stream-H convention on
every surface):

    H(outlet state) - H(inlet state) = Q

WHAT THIS CHECKS, all from fresh runs of corpus cases:

  (a) WITNESS -- process02's heater closes at 100 +- 0.5 %, read from
      `reports/balances/energyBalance_byUnit.csv`: the report prices the
      outlet the unit produced, and gets the declared Q back.
  (b) THE WITNESS ACTUALLY CROSSES THE DOME.  Its outlet vapour fraction is
      strictly inside (0, 1).  Without this arm the gate would pass just as
      happily on a heater that never leaves the liquid, and prove nothing
      about the defect it exists for -- a green gate over a case that cannot
      reach the bug is the permanently-green shape (check_true_ions, 2026-08-05).
  (c) A SECOND PUBLICATION PATH agrees, with the report AND with Q.  The
      result JSON's per-stream `H_kW` is written by `Flowsheet.cpp`, which
      re-flashes only a stream whose CARRIED vapour fraction is already
      inside (0, 1) -- so it is a genuinely different reading from the
      report's, and under the defect the two differed by the whole latent
      share (0.40 kW published on the streams, 3.31 kW in the report, for
      one heater).  Stated plainly: both read the same thermo kernel, so
      this is not independent THERMODYNAMICS -- it is an independent
      pricing of the unit's answer, which is exactly what disagreed.
  (d) NO OVERREACH -- a single-phase heater keeps its single-phase answer.
      `air01_heater_expand` heats air 298 -> 468 K: closure 100 +- 0.5 and
      `vf_out` still exactly 1.  A fix that dragged every heater into a
      two-phase reading would be measuring its own wish.
  (e) THE SENSIBLE PATH IS A NAMED GAP, NEVER A SILENT ONE.
      `flash_pseudoComponent_petCut`'s cooler runs on pseudo-components that
      carry no elements-datum enthalpy, so the inversion has no latent leg
      and CANNOT see a phase change.  It must say so in its own log.

SABOTAGE-VERIFIED 2026-08-09, twice, and the OBSERVED output is recorded
here rather than the output that was expected.

Sabotage 1 -- the fix reverted (`useFormation = false`: the pre-2026-08-09
sensible inversion, the outlet written at the inlet's vapour fraction):

    check_duty_inversion: FAILED
      process02_reactor_hx_flash: heater energy closure 827.62 % -- the
        outlet state does not satisfy H_out - H_in = Q (the inversion is
        not on the elements datum over the resolved state)
      process02_reactor_hx_flash: heater outlet vf = 0.000000 -- the witness
        must CROSS the saturation dome or this gate proves nothing
      process02_reactor_hx_flash: the published stream enthalpies say 0.4000
        kW across the heater and the balance report says 3.3105 kW -- two
        surfaces pricing ONE stream, disagreeing (R-E5)

The third line is the arm that had to be REWRITTEN after the first run.
It originally compared the published stream enthalpies against the declared
Q alone -- and under sabotage those two AGREED (0.4000 vs 0.4000), because
`Flowsheet.cpp` prices a stream on the vapour fraction it CARRIES, which
the broken heater had set to the same liquid the broken inversion assumed.
Two wrongs agreeing is not a check.  Comparing that path against the
REPORT's is, and it is the comparison that names the missing latent share.

Sabotage 2 -- the announcement removed from the sensible fall-back:

    check_duty_inversion: FAILED
      flash_pseudoComponent_petCut: its cooler has no elements-datum
        enthalpy, so the inversion cannot see a phase change -- and it did
        not SAY so.  A gap the engine does not announce is a gap the reader
        cannot find.

Restoring returns every arm to silence.

ARMS (f)-(h), 2026-10-05 (DEV.md §4c C36 item 3) -- A PURE STREAM ON ITS
SATURATION PLATEAU.  For one component H(T) jumps by the whole latent heat
at Tsat(P), so a target enthalpy inside the jump has no root in T: the
exchanger's bisection closed onto Tsat and published the nearer single
phase, short of its duty (`utility02_hitec_csp_heater` at 40 bar, 3.06 kW).
The witness `heatExchanger03_pure_water_plateau` puts BOTH sides of one
exchanger inside their jumps (100 bar steam partly condensing, 40 bar
feedwater partly boiling) and then a `heater` on the wet steam, whose inlet
is the exchanger's PINNED plateau outlet and whose target lands inside the
jump again.

  (f) each exchanger outlet leaves with 0 < vf < 1 at T = Tsat(P), the
      latter RECOMPUTED here from the case's own Antoine record (never read
      off the engine), each side's published dH equals the duty to 1e-4 kW,
      and the unit's own `H_closure_gap_kW` is <= 1e-4 kW;
  (g) the heater's outlet is on the plateau too (0 < vf_out < 1, T_out ==
      T_in) and its published dH equals Q to 1e-4 kW;
  (h) the energy report leaves <= 1e-4 kW unattributed on either unit.

SABOTAGE-VERIFIED 2026-10-05, by hand, sources restored byte-identical and
rebuilt (`make all`) after each; OBSERVED output:

Sabotage 4 -- the exchanger's plateau disabled (the target shifted out of
the plateau test, `Htarget + 1.0e12`):

    boilerHX outlet 'wetSteam' vf = 1 -- ... must leave ON the plateau
    boilerHX side 'steam' -> 'wetSteam' changes H by -130.728458 kW against
      a duty of -172.897340 kW
    boilerHX outlet 'wetFeed' vf = 1 -- ...
    boilerHX side 'feedwater' -> 'wetFeed' changes H by 1065.534373 kW
      against a duty of 172.897340 kW
    boilerHX.H_closure_gap_kW = 934.805914829
    the energy report leaves 934.8059 kW unattributed on 'boilerHX'

  Worth knowing: the defect does not always fall SHORT.  The side at Tsat
  is labelled by whichever side of the curve the last digits of T select,
  and here both read VAPOUR -- the feedwater "boiled" completely and was
  credited 892.6 kW it never received.

Sabotage 5 -- the exchanger's outlet pin dropped (`phasePinned = false` on
both outlets; the vapour fraction is still written):

    trimCooler changes H by -457.831119 kW against Q = -500 kW
    the energy report leaves 42.1689 kW unattributed on 'trimCooler'

  The exchanger itself still closes -- its own arms PASS -- because a pin is
  for the READER: the heater re-resolved its inlet at (T, P, z), got one side
  of the curve, and inverted from the wrong enthalpy.  Only (g)/(h) see it.

Sabotage 6 -- the heater ignores its inlet's pin (`pinnedPureQuality`
replaced by an empty optional): the same two lines as sabotage 5, to the
digit -- the two ends of one contract, caught by the same arms.

WHAT THIS DOES NOT CHECK, said plainly:
  * Whether T_out is RIGHT in absolute terms.  The first law fixes the
    outlet ENTHALPY; the temperature that enthalpy corresponds to is only as
    good as the vapour-pressure and Cp records behind it.  That is each
    case's golden, and no golden here is validated against measurement.
  * Any unit other than `heater`, EXCEPT the exchanger's pure-plateau
    outlet of arms (f)/(h).  The exchanger's DUTY still comes from eps-NTU
    on a sensible Cp, by the method's own definition; since 2026-09-08 its
    outlet STATE is inverted from the enthalpy, and only the plateau half of
    that inversion is held here.  `phaseChanger` tests its plateau before
    any search and has no jump to land on; its plateau ENDS share the
    exchanger's home (`flash/PureSaturationPlateau.H`) and are held by its
    own cases' goldens, not by this gate.
  * The `cooler` direction beyond what process02 and the pseudo-component
    case exercise.  `cooler` is not a distinct unit: it is this same code
    with Q < 0, so it is fixed and broken by the same line.
"""
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]

WITNESS = "tutorials/steady/flowsheets/process02_reactor_hx_flash"
WITNESS_UNIT = "heater"
WITNESS_IN = "reactorOut"
WITNESS_OUT = "hotStream"

SINGLE_PHASE = "tutorials/steady/thermo/air01_heater_expand"
SINGLE_PHASE_UNIT = "airHeater"

NO_DATUM = "tutorials/steady/flash/flash_pseudoComponent_petCut"

#  (f)-(h): a PURE stream whose target enthalpy lies inside its latent jump
#  (C36 item 3, 2026-10-05).
PLATEAU = "tutorials/steady/heat/heatExchanger03_pure_water_plateau"
PLATEAU_HX = "boilerHX"
PLATEAU_HX_SIDES = (("steam", "wetSteam"), ("feedwater", "wetFeed"))
PLATEAU_HEATER = "trimCooler"
PLATEAU_HEATER_IN, PLATEAU_HEATER_OUT = "wetSteam", "condensate"
PLATEAU_KW = 1.0e-4     # a unit on the plateau must close to this, in kW
PLATEAU_TSAT_K = 1.0e-6 # T_out against Tsat(P) recomputed from the record

BAND_PCT = 0.5          # closure, percentage points around 100
BAND_KW_REL = 5.0e-3    # cross-check of the two publication paths


def run(case: pathlib.Path):
    for junk in case.glob("log.*"):
        junk.unlink()
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(case)],
                       capture_output=True, text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    log = case / "log.choupoSolve"
    return r.returncode, (log.read_text() if log.is_file() else "") + r.stdout + r.stderr


def result(log: str):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  log, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def closure(case: pathlib.Path, unit: str):
    """(dH_kW, items_kW, closure_pct) for one unit's row, or None."""
    f = case / "reports" / "balances" / "energyBalance_byUnit.csv"
    if not f.is_file():
        return None
    for line in f.read_text().splitlines():
        p = [c.strip() for c in line.split(",")]
        if len(p) >= 6 and p[0] == unit:
            try:
                return float(p[3]), float(p[4]), float(p[5])
            except ValueError:
                return None
    return None


def antoine_tsat(case: pathlib.Path, component: str, P_Pa: float):
    """Tsat(P) [K] from the case's OWN Antoine record, recomputed here, never
    read off the engine: log10(P/bar) = A - B/(T + C).  None if the record
    does not carry that form."""
    rec = case / "constant" / "components" / (component + ".dat")
    if not rec.is_file() or P_Pa <= 0.0:
        return None
    txt = rec.read_text()
    m = re.search(r"vaporPressure\s*\{[^}]*model\s+Antoine\s*;[^}]*"
                  r"coefficients\s*\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+"
                  r"([-+0-9.eE]+)\s*\)", txt, re.S)
    if not m:
        return None
    A, B, C = (float(g) for g in m.groups())
    return B / (A - math.log10(P_Pa / 1.0e5)) - C


def main() -> int:
    fail = []
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)

        # ---- (a) (b) (c) the witness ----------------------------------
        case = tmp / pathlib.Path(WITNESS).name
        shutil.copytree(ROOT / WITNESS, case)
        rc, log = run(case)
        if rc != 0:
            fail.append(f"{case.name}: run failed (rc={rc})")
        else:
            row = closure(case, WITNESS_UNIT)
            if row is None:
                fail.append(f"{case.name}: no '{WITNESS_UNIT}' row in "
                            "energyBalance_byUnit.csv -- the claim cannot be "
                            "read, which is not the same as it holding")
            elif abs(row[2] - 100.0) > BAND_PCT:
                fail.append(f"{case.name}: heater energy closure {row[2]:.2f} % "
                            "-- the outlet state does not satisfy "
                            "H_out - H_in = Q (the inversion is not on the "
                            "elements datum over the resolved state)")

            res = result(log)
            if res is None:
                fail.append(f"{case.name}: no result block")
            else:
                kpi = res.get("kpis", {}).get(WITNESS_UNIT, {})
                vf = kpi.get("vf_out")
                if vf is None:
                    fail.append(f"{case.name}: the heater publishes no "
                                "'vf_out' -- the outlet's vapour fraction is "
                                "half of its state and must be a result")
                elif not (1.0e-6 < vf < 1.0 - 1.0e-6):
                    fail.append(f"{case.name}: heater outlet vf = {vf:.6f} -- "
                                "the witness must CROSS the saturation dome "
                                "or this gate proves nothing")
                q = kpi.get("Q_kW")
                s = res.get("streams", {})
                if q is not None and WITNESS_IN in s and WITNESS_OUT in s:
                    dH = s[WITNESS_OUT]["H_kW"] - s[WITNESS_IN]["H_kW"]
                    band = max(BAND_KW_REL * abs(q), 1.0e-6)
                    if abs(dH - q) > band:
                        fail.append(f"{case.name}: the published stream "
                                    f"enthalpies say {dH:.4f} kW across the "
                                    f"heater, the unit declares {q:.4f} kW")
                    if row is not None and abs(dH - row[0]) > band:
                        fail.append(f"{case.name}: the published stream "
                                    f"enthalpies say {dH:.4f} kW across the "
                                    f"heater and the balance report says "
                                    f"{row[0]:.4f} kW -- two surfaces pricing "
                                    "ONE stream, disagreeing (R-E5)")
                else:
                    fail.append(f"{case.name}: the heater's Q_kW or its two "
                                "streams are not published -- the second "
                                "publication path cannot be read")

        # ---- (d) no overreach: a single-phase heater stays single-phase
        gas = tmp / pathlib.Path(SINGLE_PHASE).name
        shutil.copytree(ROOT / SINGLE_PHASE, gas)
        rc, log = run(gas)
        if rc != 0:
            fail.append(f"{gas.name}: run failed (rc={rc})")
        else:
            row = closure(gas, SINGLE_PHASE_UNIT)
            if row is None or abs(row[2] - 100.0) > BAND_PCT:
                got = "no row" if row is None else f"{row[2]:.2f} %"
                fail.append(f"{gas.name}: closure {got} -- a single-phase gas "
                            "heater must close too")
            res = result(log) or {}
            vf = res.get("kpis", {}).get(SINGLE_PHASE_UNIT, {}).get("vf_out")
            if vf is None or abs(vf - 1.0) > 1.0e-9:
                fail.append(f"{gas.name}: heated air left at vf = {vf} -- a "
                            "stream nowhere near a dome must stay exactly "
                            "where it was; a fix that drags every heater "
                            "two-phase is measuring its own wish")

        # ---- (e) the sensible path announces that it cannot see a phase change
        gap = tmp / pathlib.Path(NO_DATUM).name
        shutil.copytree(ROOT / NO_DATUM, gap)
        rc, log = run(gap)
        if rc != 0:
            fail.append(f"{gap.name}: run failed (rc={rc})")
        elif "SENSIBLE enthalpy path" not in log:
            fail.append(f"{gap.name}: its cooler has no elements-datum "
                        "enthalpy, so the inversion cannot see a phase "
                        "change -- and it did not SAY so.  A gap the engine "
                        "does not announce is a gap the reader cannot find.")

        # ---- (f) (g) (h) a pure stream ON its saturation plateau ----------
        pl = tmp / pathlib.Path(PLATEAU).name
        shutil.copytree(ROOT / PLATEAU, pl)
        rc, log = run(pl)
        res = result(log) if rc == 0 else None
        if rc != 0 or res is None:
            fail.append(f"{pl.name}: run failed (rc={rc}) or published no "
                        "result block")
        else:
            s = res.get("streams", {})
            kx = res.get("kpis", {}).get(PLATEAU_HX, {})
            kh = res.get("kpis", {}).get(PLATEAU_HEATER, {})
            q = kx.get("Q_kW")
            # (f) the exchanger: both outlets ON the plateau, at Tsat(P), and
            #     each side delivering exactly the duty
            for side, (sin, sout) in enumerate(PLATEAU_HX_SIDES):
                if sin not in s or sout not in s or q is None:
                    fail.append(f"{pl.name}: '{sin}'/'{sout}' or {PLATEAU_HX}"
                                ".Q_kW not published -- the claim cannot be "
                                "read")
                    continue
                o = s[sout]
                if not (1.0e-6 < o.get("vf", -1.0) < 1.0 - 1.0e-6):
                    fail.append(f"{pl.name}: {PLATEAU_HX} outlet '{sout}' "
                                f"vf = {o.get('vf')} -- a pure stream whose "
                                "target lies inside its latent jump must "
                                "leave ON the plateau (0 < vf < 1), not as "
                                "the nearer single phase")
                tsat = antoine_tsat(pl, "water", o.get("P", 0.0))
                if tsat is None:
                    fail.append(f"{pl.name}: cannot recompute Tsat from the "
                                "case's water record (Antoine form)")
                elif abs(o.get("T", 0.0) - tsat) > PLATEAU_TSAT_K:
                    fail.append(f"{pl.name}: '{sout}' T = {o.get('T')} K, "
                                f"but Tsat(P) from the record is {tsat:.6f} "
                                "K -- on the plateau the temperature IS Tsat")
                dH = o["H_kW"] - s[sin]["H_kW"]
                want = -q if side == 0 else q
                if abs(dH - want) > PLATEAU_KW:
                    fail.append(f"{pl.name}: {PLATEAU_HX} side '{sin}' -> "
                                f"'{sout}' changes H by {dH:.6f} kW against "
                                f"a duty of {want:.6f} kW -- short by the "
                                "unboiled (or uncondensed) fraction's latent "
                                "heat")
            gap = kx.get("H_closure_gap_kW")
            if gap is None or abs(gap) > PLATEAU_KW:
                fail.append(f"{pl.name}: {PLATEAU_HX}.H_closure_gap_kW = "
                            f"{gap} -- the unit must close in H to "
                            f"{PLATEAU_KW} kW")
            # (g) the heater: its inlet is the exchanger's PINNED plateau
            #     outlet, and its outlet lands on the plateau again
            if PLATEAU_HEATER_IN in s and PLATEAU_HEATER_OUT in s and kh:
                vo = kh.get("vf_out", -1.0)
                if not (1.0e-6 < vo < 1.0 - 1.0e-6):
                    fail.append(f"{pl.name}: {PLATEAU_HEATER} vf_out = {vo} "
                                "-- its target lies inside the jump too")
                if abs(kh.get("T_out", 0.0) - kh.get("T_in", 1.0)) > \
                        PLATEAU_TSAT_K:
                    fail.append(f"{pl.name}: {PLATEAU_HEATER} moved T from "
                                f"{kh.get('T_in')} to {kh.get('T_out')} K -- "
                                "on the plateau only the quality changes")
                dH = (s[PLATEAU_HEATER_OUT]["H_kW"]
                      - s[PLATEAU_HEATER_IN]["H_kW"])
                if abs(dH - kh.get("Q_kW", float("nan"))) > PLATEAU_KW \
                        or kh.get("Q_kW") is None:
                    fail.append(f"{pl.name}: {PLATEAU_HEATER} changes H by "
                                f"{dH:.6f} kW against Q = {kh.get('Q_kW')} kW")
            else:
                fail.append(f"{pl.name}: {PLATEAU_HEATER} or its streams not "
                            "published")
            # (h) the REPORT prices the same states: every unit's remaining
            #     imbalance <= PLATEAU_KW (a pin dropped between the two units
            #     shows up here, as the heater's inlet priced on one side of
            #     the curve)
            f = pl / "reports" / "balances" / "energyBalance_byUnit.csv"
            rows = {}
            if f.is_file():
                lines = f.read_text().split("\n\n")[0].splitlines()
                hdr = [c.strip() for c in lines[0].split(",")] if lines else []
                for line in lines[1:]:
                    p = [c.strip() for c in line.split(",")]
                    if len(p) == len(hdr):
                        rows[p[0]] = dict(zip(hdr, p))
            for unit in (PLATEAU_HX, PLATEAU_HEATER):
                r = rows.get(unit)
                try:
                    rem = float(r["remaining_kW"]) if r else None
                except (KeyError, ValueError):
                    rem = None
                if rem is None:
                    fail.append(f"{pl.name}: no '{unit}' row with a "
                                "remaining_kW in energyBalance_byUnit.csv")
                elif abs(rem) > PLATEAU_KW:
                    fail.append(f"{pl.name}: the energy report leaves "
                                f"{rem} kW unattributed on '{unit}' -- the "
                                "report and the unit price the plateau "
                                "state differently")

    if fail:
        print("check_duty_inversion: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_duty_inversion: OK -- a Q-specified heater's outlet state "
          f"satisfies H_out - H_in = Q within {BAND_PCT} percentage points of "
          "closure on process02 (whose outlet genuinely crosses the "
          "saturation dome, vf strictly inside (0,1)), the result JSON's own "
          "stream enthalpies agree with the unit's declared Q, a single-phase "
          "gas heater is left exactly single-phase, and a case with no "
          "elements-datum enthalpy ANNOUNCES that its sensible inversion "
          "cannot see a phase change; and a PURE stream whose target lies "
          "inside its latent jump (heatExchanger03: a 100 bar partial "
          "condenser and a 40 bar boiler in one exchanger, then a heater) "
          "leaves ON its plateau -- 0 < vf < 1 at Tsat(P) recomputed from the "
          f"case's own Antoine record to {PLATEAU_TSAT_K} K -- with each side "
          f"and the heater delivering its duty to {PLATEAU_KW} kW and the "
          "energy report agreeing.  NOT CHECKED: whether T_out is right in "
          "absolute terms (the first law fixes the outlet ENTHALPY, not the "
          "records behind the temperature), `phaseChanger` (it tests its "
          "plateau first and has no jump to land on), and a mixture.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
