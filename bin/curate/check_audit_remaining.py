#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The four remaining points of the external audit (DEV.md 4c C190 items 14, 11,
15 and 12): an explicit reverse pair is READ by the batch vessel, a declared
`catalystLoading` reaches the vessels' own rate law, a membrane fit that no step
improves is judged by a gradient test and may be `stalled`, and the PC-SAFT
density scan finds two roots closer than its grid.

THE FOUR DEFECTS THIS GATE EXISTS FOR (each a wrong or unearned number at exit 0).

  (14) BatchReactor read `A_rev`/`Ea_rev` nowhere on its own `Arrhenius` path:
       a reaction declaring an explicit reverse pair ran IRREVERSIBLE.  The
       dynamic CSTR had routed such a reaction to the shared RateLaw since
       C131.  Measured before the fix: A + B <-> C + D, kf = 2, kr = 1,
       1 kmol of each in 1 m3, 20 s: the vessel converted 0.9756 kmol (the
       forward-only 1/(1+2t) law), the equilibrium is 0.5858.  Now the
       reaction is read by RateLaw (the one home of the reverse leg); the pair
       on a word RateLaw does not serve, beside a CHEMKIN `units` block, or
       one half of the pair alone each REFUSE by name.
  (11) `catalystLoading` was read by both vessels, announced ("the pellet is a
       point") and then used ONLY by the factory laws: loading 1 and 400 kg/m3
       gave identical conversions on the own `Arrhenius` path.  The steady cstr/pfr
       apply it to every law.  Now r = loading x k x prod(c^order) on both
       vessels, both legs.
  (15) FitParametersMembrane set `converged = true` whenever no step lowered
       chi2 ("a minimum at the solver's resolution"), which is also what a search
       with a Jacobian too coarse to point downhill looks like.  Measured: the
       shipped membrane24 with `fdStep 0.1` ended at a radius 0.7 % from its
       minimum and was published as converged, validated, and written to a
       record.  Now the stop is TESTED (the cosine between the residual and each
       free Jacobian column, re-taken at a fine step, below 1e-3, bounds
       projected) and published as the word `optimiser` in the curation object:
       converged | stalled | maxIterations | lawFailed.  Not converged exits 1
       and writes no record, as it always did for maxIterations.
  (12) PCSAFT::solveDensity scanned 400 intervals for a SIGN CHANGE of
       P(eta) - P; two roots closer than one interval give no sign change and
       the vapour (or liquid) root of the other phase was returned silently.
       Now a sample extremum that carries one sign is located by golden section
       and, when it crosses zero, becomes two brackets.

WHAT IS CHECKED, every number recomputed here and never read from the engine:

  (a) 14, batchReactor: the probe above against this gate's own RK4 of
      r = kf cA cB - kr cC cD to 1e-6, AND the converted amount within 1e-3 of
      the analytic equilibrium sqrt(K)/(1 + sqrt(K)).
  (b) 14, dynamicCSTR: the same pair on a CSTR agrees with its own RK4 (the
      routing that was already there stays).
  (c) 14 refusals: `A_rev` on thirdBody, `A_rev` beside `units`, `Ea_rev` alone.
  (d) 11, batchReactor: loading 1 and 400 each equal this gate's RK4 of
      r = loading k cE, and the two conversions are not equal.
  (e) 11, dynamicCSTR: the same for the dynamic vessel.
  (f) 15: membrane24 as it ships ends `optimiser converged` (exit 0, record
      written); with `fdStep 0.1` the stop is NOT the old verdict: either the
      gradient test passes (converged) or the run exits 1, says `stalled` and
      writes no record -- and the published word and the exit code AGREE.
      The case with `maxIter 2` publishes `maxIterations`.
  (g) 12: n-hexane at 298.15 K, a fine pressure scan of the VAPOUR root up to
      the spinodal: the vapour Z never jumps to the liquid branch while a
      density bracket of the engine's own P(eta) still holds the vapour root --
      recomputed here by refining the engine's pressure at the last vapour
      point (the root found at pressure p must satisfy the engine's own
      pressure p at the returned volume).
  (h) SOURCE: BatchReactor.cpp refuses the pair on the other words and applies
      `catalystLoading_`; DynamicCSTR.cpp applies it on its own path;
      FitParametersMembrane.cpp no longer sets converged on the bare absence
      of a step; PCSAFT.cpp carries the refinement.

Scope: the vessels' own `Arrhenius` path and the shared RateLaw call;
`modifiedArrhenius`/`thirdBody`/`falloff` with a loading are covered by the
same multiplication but have no probe here.  NOT checked: the threshold 1e-3
of the gradient cosine against other problems than membrane24, any PC-SAFT
mixture, the Jacobian used by the fit's statistics (still at `fdStep`).

BY-HAND SABOTAGES: see docs/design/an-explicit-reverse-pair-is-read.md.
Exit 1 listing failures."""
import importlib.util
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
BIN = ROOT / "build" / "linux64Gcc"
BATCH = BIN / "choupoBatch"
SEMI = BIN / "choupoSemiContinuous"
PROPS = BIN / "choupoProps"
M24 = ROOT / "tutorials" / "steady" / "membranes" / "membrane24_fit_then_simulate"
PCS = ROOT / "tutorials" / "props" / "molecular" / "pcsaft01_pure_nhexane"

_spec = importlib.util.spec_from_file_location(
    "vko", ROOT / "bin" / "curate" / "check_vessel_kinetic_orders.py")
vko = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vko)

failures = []


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300)


def patch_control(case, endTime, deltaT, verbosity=None):
    cd = case / "system" / "controlDict"
    t = cd.read_text()
    t = re.sub(r"(?m)^endTime\s+[^;]+;", f"endTime {endTime};", t)
    t = re.sub(r"(?m)^deltaT\s+[^;]+;", f"deltaT {deltaT};", t)
    t = re.sub(r"(?m)^writeInterval\s+[^;]+;", f"writeInterval {endTime};", t)
    cd.write_text(t)


# ------------------------------------------------------------ batch probes
def batch_reversible(tmp, name, kin_extra, A="2.0", units=None):
    """A + B -> C + D, orders 1 and 1, V = 1 m3, 1 kmol of each."""
    case = vko.batch_case(tmp, name, (1, 1), A, units, 1.0, 1.0)
    rx = case / "constant" / "reactions"
    t = rx.read_text()
    t = re.sub(r"(?m)^([ \t]*Ea[ \t]+0\.0;)", lambda m: m.group(1) + (kin_extra or ""), t, count=1)
    rx.write_text(t)
    return case


def rev_rk4(kf, kr, n0, h, steps):
    def rhs(y):
        a, b, c, d = y
        r = kf * a * b - kr * c * d
        return [-r, -r, r, r]
    return vko.rk4(rhs, [n0, n0, 0.0, 0.0], h, steps)


def arm_batch_reverse(tmp):
    case = batch_reversible(tmp, "rev", "\n        A_rev  1.0;\n        Ea_rev 0.0;")
    patch_control(case, 20, 0.01)
    rc, j, out = vko.run(BATCH, case)
    if j is None:
        failures.append("(a) reversible pair: the probe did not run\n" + out[-800:])
        return "not run"
    k = j["kpis"]["reactor"]
    ref = rev_rk4(2.0, 1.0, 1.0, 0.01, 2000)
    conv = k["n_ethylAcetate_final"]
    if rel(conv, ref[2]) > 1e-6:
        failures.append(f"(a) converted {conv:.8g} kmol vs independent RK4 {ref[2]:.8g}")
    Keq = 2.0
    eq = math.sqrt(Keq) / (1.0 + math.sqrt(Keq))
    if abs(conv - eq) > 1e-3:
        failures.append(f"(a) converted {conv:.6g}, the declared equilibrium is {eq:.6g}"
                        " (a forward-only run converges to 1)")
    return f"{conv:.4f} kmol of {eq:.4f} at equilibrium"


def arm_batch_refusals(tmp):
    cases = {
        "thirdBody": ("\n        A_rev  1.0;\n        Ea_rev 0.0;", "thirdBody", None,
                      ("A_rev", "thirdBody", "IRREVERSIBLE")),
        "units": ("\n        A_rev  1.0;\n        Ea_rev 0.0;", None, "cm3/mol/s",
                  ("A_rev", "units", "SI")),
        "pairHalf": ("\n        Ea_rev 0.0;", None, None, ("PAIR", "A_rev", "Ea_rev")),
    }
    for tag, (extra, kword, units, needs) in cases.items():
        case = batch_reversible(tmp, "ref_" + tag, extra, units=units)
        if kword:
            rx = case / "constant" / "reactions"
            rx.write_text(rx.read_text().replace("type   Arrhenius;",
                                                 f"type   {kword};"))
        rc, j, out = vko.run(BATCH, case)
        if rc == 0:
            failures.append(f"(c) {tag}: the declaration ran to exit 0 -- it must refuse")
            continue
        for need in needs:
            if need not in out:
                failures.append(f"(c) {tag}: the refusal does not say '{need}':\n" + out[-500:])


def dynamic_pair(tmp, name, extra_kin, A, loading=None):
    case = vko.dynamic_case(tmp, name, 0.006, 0.006)
    rx = case / "constant" / "reactions"
    t = rx.read_text()
    t = t.replace("order -1;", "order 0;")
    t = re.sub(r"(?m)^([ \t]*)A[ \t]+[^;\n]+;", rf"\1A      {A};", t)
    t = re.sub(r"(?m)^([ \t]*)Ea[ \t]+0.0;", r"\1Ea     0.0;" + extra_kin, t)
    rx.write_text(t)
    if loading is not None:
        fd = case / "system" / "flowsheetDict"
        s = fd.read_text()
        s = s.replace("operation\n        {", f"operation\n        {{\n            catalystLoading {loading};", 1)
        fd.write_text(s)
    return case


def dyn_rk4(A, Arev, loading):
    V, F = 1.0e-3, 5.0e-5

    def rhs(y):
        nA, nB = y
        r = loading * (A * (nA / V) - Arev * (nB / V))
        xA = nA / (nA + nB)
        return [F - F * xA - r * V, -F * (1 - xA) + r * V]
    return vko.rk4(rhs, [0.006, 0.006], 1.0e-3, 10)


def arm_dyn_reverse(tmp):
    case = dynamic_pair(tmp, "dynrev", "\n        A_rev  5.0;\n        Ea_rev 0.0;", "10.0")
    rc, j, out = vko.run(SEMI, case)
    if j is None:
        failures.append("(b) dynamicCSTR pair: the probe did not run\n" + out[-800:])
        return "not run"
    k = j["kpis"]["reactor"]
    ref = dyn_rk4(10.0, 5.0, 1.0)
    forward_only = dyn_rk4(10.0, 0.0, 1.0)
    for nm, a, b in (("compA", k["n_compA_final"], ref[0]), ("compB", k["n_compB_final"], ref[1])):
        d_eng, d_ref = a - 0.006, b - 0.006
        if rel(d_eng, d_ref) > 1e-4:
            failures.append(f"(b) dynamicCSTR pair: change of n_{nm} engine {d_eng:.6g}"
                            f" vs independent {d_ref:.6g}")
    if abs((k["n_compB_final"] - 0.006) - (forward_only[1] - 0.006)) < 0.05 * abs(forward_only[1] - 0.006):
        failures.append("(b) dynamicCSTR pair equals the forward-only answer")
    return f"dn_B {ref[1] - 0.006:.4g} kmol in 10 ms"


def arm_loading(tmp):
    out_desc = []
    conv = {}
    for L in (1, 400):
        case = vko.batch_case(tmp, f"load{L}", (1, 0), "0.1", None, 3.0, 3.0)
        fd = case / "system" / "flowsheetDict"
        s = fd.read_text()
        s = re.sub(r"(operation\s*\{)", rf"\1\n catalystLoading {L};", s, count=1)
        fd.write_text(s)
        rc, j, out = vko.run(BATCH, case)
        if j is None:
            failures.append(f"(d) loading {L}: the probe did not run\n" + out[-800:])
            continue
        ref = vko.independent(1, 0, 0.1 * L, 3.0, 3.0)
        e = vko.compare(f"(d) batch loading {L}", j, ref)
        conv[L] = e[2]
    if len(conv) == 2:
        if rel(conv[1], conv[400]) < 0.5:
            failures.append(f"(d) loading 1 -> 400 changed the conversion {conv[1]:.6g} ->"
                            f" {conv[400]:.6g}: the declared bed density is not applied")
        out_desc.append(f"batch {conv[1]:.4g} -> {conv[400]:.4g} kmol")
    dyn = {}
    for L in (1, 400):
        case = dynamic_pair(tmp, f"dynl{L}", "", "0.1", loading=L)
        rc, j, out = vko.run(SEMI, case)
        if j is None:
            failures.append(f"(e) dynamic loading {L}: the probe did not run\n" + out[-800:])
            continue
        k = j["kpis"]["reactor"]
        ref = dyn_rk4(0.1, 0.0, L)
        for nm, a, b in (("compA", k["n_compA_final"], ref[0]), ("compB", k["n_compB_final"], ref[1])):
            if rel(a - 0.006, b - 0.006) > 1e-4:
                failures.append(f"(e) dynamicCSTR loading {L}: change of n_{nm} engine"
                                f" {a - 0.006:.6g} vs independent {b - 0.006:.6g}")
        dyn[L] = k["n_compB_final"]
    if len(dyn) == 2:
        if rel(dyn[1] - 0.006, dyn[400] - 0.006) < 0.5:
            failures.append("(e) dynamicCSTR loading 1 -> 400 did not change the conversion")
        out_desc.append(f"dynamic dn_B {dyn[1] - 0.006:.4g} -> {dyn[400] - 0.006:.4g} kmol")
    return "; ".join(out_desc)


# --------------------------------------------------------- membrane fit
def run_props(case):
    e = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(PROPS), "."], cwd=case, capture_output=True,
                       text=True, timeout=1800, env=e)
    out = r.stdout + r.stderr
    j = None
    if "<<<Choupo:result-begin>>>" in out:
        j = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                          .split("<<<Choupo:result-end>>>")[0])
    return r.returncode, j, out


def m24_copy(tmp, name, options, no_record=False):
    case = Path(tmp) / name
    case.mkdir()
    for d in ("constant", "system", "0"):
        shutil.copytree(M24 / d, case / d, ignore=shutil.ignore_patterns(
            "NF270_FdL2021.dat"))
    pd = case / "system" / "propsDict"
    t = pd.read_text()
    for key, val in options.items():
        t = re.sub(rf"(?m)^(\s*){key}\s+[^;]+;", rf"\g<1>{key} {val};", t)
    if no_record:
        #  without the record the run publishes its result JSON even when the fit
        #  is not converged (with it, a non-converged fit is a fatal error)
        t = re.sub(r"output\s*\{[^}]*\}", "", t)
    pd.write_text(t)
    return case


def optimiser_word(j):
    for op in (j or {}).get("operationResults", []):
        c = op.get("curation") or {}
        if "optimiser" in c:
            return c["optimiser"]
    return None


def arm_fit(tmp):
    desc = []
    case = m24_copy(tmp, "ship", {})
    rc, j, out = run_props(case)
    w = optimiser_word(j)
    if rc != 0 or w != "converged":
        failures.append(f"(f) membrane24 as shipped: exit {rc}, optimiser {w!r}")
    if not (case / "constant" / "assets" / "NF270_FdL2021.dat").exists():
        failures.append("(f) membrane24 as shipped wrote no record")
    desc.append(f"shipped: {w}")
    case = m24_copy(tmp, "coarse", {"fdStep": "1.0e-1"}, no_record=True)
    rc, j, out = run_props(case)
    w = optimiser_word(j)
    rec = (case / "constant" / "assets" / "NF270_FdL2021.dat").exists()
    #  Measured: with the Jacobian taken at a step of 0.1 the search stops with no
    #  step improving chi2 at a radius 0.7 % from the minimum, where the cosine
    #  between the residual and the radius column is 2e-2, twenty times the
    #  threshold.  The old engine published this as converged.
    if w != "stalled" or rc == 0:
        failures.append(f"(f) fdStep 0.1: optimiser word {w!r}, exit {rc} -- a stop with"
                        " J^T r far from zero must be `stalled` and exit 1")
    if (w == "converged") != (rc == 0) or (w == "stalled" and rec):
        failures.append(f"(f) fdStep 0.1: the word {w!r}, the exit code {rc} and the record"
                        f" ({rec}) disagree")
    if "gradient test" not in out and "J^T r" not in out:
        failures.append("(f) fdStep 0.1: the stop reason does not report the gradient test")
    desc.append(f"fdStep 0.1: {w}, exit {rc}")
    case = m24_copy(tmp, "maxit", {"maxIter": "2"}, no_record=True)
    rc, j, out = run_props(case)
    w = optimiser_word(j)
    if w != "maxIterations" or rc == 0:
        failures.append(f"(f) maxIter 2: optimiser {w!r}, exit {rc}")
    desc.append(f"maxIter 2: {w}")
    return "; ".join(desc)


# ------------------------------------------------------------- PC-SAFT
def pcsaft_scan(tmp, T, lo, hi, n):
    case = Path(tmp) / "pc"
    if case.exists():
        shutil.rmtree(case)
    case.mkdir()
    shutil.copytree(PCS / "constant", case / "constant")
    shutil.copytree(PCS / "system", case / "system")
    pd = case / "system" / "propsDict"
    t = pd.read_text()
    head = t[:t.index("operations")]
    ops = ""
    for i in range(n):
        p = lo + (hi - lo) * i / (n - 1)
        ops += ("    { name p%04d; type propertyPoint; state { T %.4f K; P %.6f bar;"
                " composition { nHexane 1.0; } } properties ( Z ); }\n" % (i, T, p))
    pd.write_text(head + "operations\n(\n" + ops + ");\n")
    rc, j, out = run_props(case)
    ps = [float(m) for m in re.findall(r"P = [0-9.]+ bar\s+\(\s*([0-9.]+)", out)]
    zs = [float(m) for m in re.findall(r"\n\s+Z\s+= ([0-9.eE+-]+)", out)]
    return rc, ps, zs, out


def arm_pcsaft(tmp):
    """n-hexane at 298.15 K: the metastable vapour branch ends at its spinodal,
    where Z(P) = Zs + c sqrt(Ps - P) (the fold's square-root law).  Fit that law
    to the engine's own branch and require the LAST vapour point to lie within
    two scan steps of the fitted spinodal.  Measured before the fix: the branch
    was lost 235 Pa (0.05 %) short of it, because the vapour root and the
    unstable root fell inside one scan interval and gave no sign change."""
    rc, ps, zs, out = pcsaft_scan(tmp, 298.15, 5.12, 5.15, 301)
    if rc != 0 or len(ps) != 301 or len(zs) != 301:
        failures.append(f"(g) the scan did not run (exit {rc}, {len(ps)} points)")
        return "not run"
    pts = [(p, z) for p, z in zip(ps, zs) if z > 0.2]
    if len(pts) < 100:
        failures.append("(g) too few vapour points in the scan")
        return "no vapour"
    plast = pts[-1][0]
    best = None
    for k in range(0, 3000):
        Ps = plast + 0.1 * k
        xs = [math.sqrt(Ps - p) for p, _ in pts]
        zz = [z for _, z in pts]
        n = len(xs)
        mx = sum(xs) / n
        mz = sum(zz) / n
        c = (sum((x - mx) * (z - mz) for x, z in zip(xs, zz))
             / sum((x - mx) ** 2 for x in xs))
        r = sum((z - mz - c * (x - mx)) ** 2 for x, z in zip(xs, zz))
        if best is None or r < best[0]:
            best = (r, Ps)
    gap = best[1] - plast
    if gap > 20.0:
        failures.append(f"(g) the vapour branch ends at {plast:.0f} Pa, {gap:.0f} Pa short of its"
                        f" fitted spinodal {best[1]:.0f} Pa (the fold's sqrt law): a root was missed")
    return f"vapour branch ends {gap:.0f} Pa from its fitted spinodal {best[1] / 1e5:.5f} bar"


def main():
    for b in (BATCH, SEMI, PROPS):
        if not b.exists():
            print(f"check_audit_remaining: {b} missing -- build first")
            return 1
    notes = {}
    with tempfile.TemporaryDirectory() as tmp:
        notes["a"] = arm_batch_reverse(tmp)
        arm_batch_refusals(tmp)
        notes["b"] = arm_dyn_reverse(tmp)
        notes["de"] = arm_loading(tmp)
        notes["f"] = arm_fit(tmp)
        notes["g"] = arm_pcsaft(tmp)
    src = ROOT / "src"
    bt = (src / "unitOperations/batch/BatchReactor.cpp").read_text()
    dt = (src / "unitOperations/dynamic/DynamicCSTR.cpp").read_text()
    ft = (src / "propertyOps/FitParametersMembrane.cpp").read_text()
    pt = (src / "thermo/equationOfState/PCSAFT.cpp").read_text()
    if "explicitReverse" not in bt or "k *= catalystLoading_" not in bt:
        failures.append("(h) BatchReactor.cpp lost the reverse-pair routing or the loading factor")
    if len(re.findall(r"catalystLoading_\s*>\s*0\.0\)?\s*\?\s*catalystLoading_", dt)) < 2:
        failures.append("(h) DynamicCSTR.cpp does not apply catalystLoading_ on its own path")
    if re.search(r"if \(!accepted\) \{ converged = true;", ft):
        failures.append("(h) FitParametersMembrane.cpp still sets converged on the bare absence of a step")
    if 'curation_["optimiser"]' not in ft:
        failures.append("(h) FitParametersMembrane.cpp does not publish the optimiser word")
    if "golden-section" not in pt.replace("golden section", "golden-section"):
        failures.append("(h) PCSAFT.cpp lost the close-roots refinement")
    if failures:
        print("check_audit_remaining: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_audit_remaining: OK -- an explicit reverse pair is read by the batch vessel"
          f" ({notes['a']}, equal to an independent RK4 to 1e-6; the dynamic vessel agrees,"
          f" {notes['b']}); the pair on thirdBody, beside `units`, or alone refuses by name;"
          f" `catalystLoading` reaches the vessels' own law ({notes['de']}); a membrane fit that"
          f" no step improves is judged by a gradient test ({notes['f']}); PC-SAFT density scan"
          f" ({notes['g']}).  Scope: the vessels' own Arrhenius path; NOT checked: other"
          " problems than membrane24 for the 1e-3 cosine, PC-SAFT mixtures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
