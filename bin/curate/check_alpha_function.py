#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the cubic's per-component Mathias-Copeman alpha function (DEV.md 4c
C408, slice 0).

    bin/curate/check_alpha_function.py

WHY THIS EXISTS.  SRK with the engine's generalised Soave slope misses water's
normal-boiling vapour pressure by -8.8 % and methanol's by -2.7 % (design
record finding F2).  Slice 0 adds an OPT-IN alpha function whose three
constants are fitted BY CURATION to each record's own vapour-pressure law and
stored in the record (`cubicAlpha { SRK {...} PengRobinson {...} }`).  The
fit, the record, the loader and the cubic are four places a number can go
wrong without any case noticing, because the default path never reads them.

WHAT THIS GATE CHECKS (every number recomputed here, in Python, sharing no
code with the C++ cubic).

  (a) THE RECORDS.  Every component record with a `cubicAlpha` block: its
      form, c1-c3 and Trange are complete; Trange IS the window of the
      record's vapour-pressure law; the provenance entry says `origin
      derived`, names the law it was fitted to, repeats the window, and its
      `valueSha256` is the sha256 of the constants as printed; the stored
      `maxDeviation_pct` is what an independent saturation-pressure solve of
      the cubic reproduces (to 0.01 %-points) and is within the fitted
      tolerance (0.5 %).  Water and methanol must carry both cubics.
  (b) THE WITNESS CASE.  tutorials/props/molecular/alpha01_water_methanol_psat
      is run (on a copy): the engine's pure-liquid P_bubble under SRK-Soave and
      under SRK-MathiasCopeman equals the independent solve to 1e-4 relative at
      every scanned T, the Mathias-Copeman curve sits within the record's
      stored deviation of the record's own law, and the Soave curve misses it
      by more than 5 % somewhere in the window (the finding the remedy exists
      for).
  (c) THE ANALYTIC DERIVATIVE.  The `mixingRules` op's `dadT_mix` (the
      analytic d a_mix/dT the enthalpy and entropy departures read) equals a
      central finite difference of its `a_mix` to 1e-5 relative, for the
      mixture and for each pure component, below Tc, ACROSS Tc (methanol's Tc
      is bracketed: the Tr > 1 branch hands over with a continuous slope) and
      far above it.  The engine has no second derivative of alpha in any
      departure (H_R and S_R read da/dT only); the closed form
      CubicEoS::mathiasCopemanG returns d2g/dT2 for the Cp departure of a later
      slice and is checked here only through its source.
  (d) THE SOAVE LIMIT.  A record whose block is c1 = m(omega), c2 = c3 = 0 gives
      the SAME a_i and da_mix/dT as the default alpha function to 1e-12
      relative, at Tr < 1 and Tr > 1: absent constants mean today's behaviour.
  (e) THE DEFAULT IS UNTOUCHED.  Records that carry the block, with the
      selector ABSENT, give the engine's Graboski-Daubert Soave a_i
      (recomputed here from SRK.cpp's slope) to 1e-9.
  (f) THE REFUSALS.  `alphaFunction MathiasCopeman;` on a component whose record
      lacks the block exits non-zero and the message names the component, the
      block and bin/curate/fit_alpha_function.py; an unknown alpha function
      word is refused; PC-SAFT with an alphaFunction is refused; the curation
      tool REFUSES CO2 (its Antoine law is the sublimation line).

WHAT THIS GATE DOES NOT CHECK.  That the constants are right outside the
window they were fitted over (they extrapolate; the gate only checks that the
record SAYS the window), that the Tr > 1 branch reproduces a measured
supercritical behaviour (Mathias & Copeman 1983 is not held; the branch is the
engine's own continuous extension), or anything about a mixing rule.
Sabotage (C408 slice 0): a record constant edited without its sha FAILS (a);
a dropped c3 term in the cubic FAILS (b), (c) and (d); a sign error in the
Tr > 1 derivative FAILS (c).
"""
import hashlib
import json
import math
import re
import shutil
import case_records  # noqa: E402  (the probe copy has one home)
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
COMPONENTS = ROOT / "data" / "standards" / "components"
CASE = ROOT / "tutorials" / "props" / "molecular" / "alpha01_water_methanol_psat"
TOOL = ROOT / "bin" / "curate" / "fit_alpha_function.py"
FIT_TOL_PCT = 1.0     # water's IAPWS curve over 273-634 K: the cubic follows it to 0.65 % (SRK), 0.51 % (PR)

import record_psat  # noqa: E402  (Antoine or Wagner, from the record's own text)
import fit_alpha_function as fit  # noqa: E402  (the tool's own numerics, used as the INDEPENDENT second opinion)


# ---------------------------------------------------------------------------
def record_scalar(text, key):
    m = re.search(r"(?m)^\s*%s\s+([-+0-9.eE]+)\s*;" % key, text)
    return float(m.group(1)) if m else None


def antoine(text):
    """(law(T) -> Pa, [Tlo, Thi]) of the record's OWN vapour-pressure law (Antoine or Wagner, read by
    record_psat, the second opinion every Psat gate shares).  The window is the law's own, CUT at
    0.98 Tc: a cubic's saturation line has no liquid-vapour pair as T -> its Tc, and water's IAPWS
    equation runs to 647.096 K (the tool says so in the record's provenance)."""
    blocks = fit.top_blocks(text)
    s, o, c = blocks["vaporPressure"]
    vp = re.sub(r"//[^\n]*", "", text[o + 1:c])
    tr = [float(v) for v in re.search(r"Trange\s*\(([^)]*)\)", vp).group(1).split()]
    Tc = record_scalar(text, "Tc")
    if tr[1] > 0.98 * Tc:
        tr[1] = float("%.7g" % (0.98 * Tc))
    return (lambda T: record_psat.psat_pa(text, T)), tr


def cubic_alpha(text):
    """{cubic: {c1,c2,c3,Trange,form}} and {cubic: provenance dict of words}."""
    blocks = fit.top_blocks(text)
    vals, prov = {}, {}
    if "cubicAlpha" in blocks:
        s, o, c = blocks["cubicAlpha"]
        for cub, (ss, so, sc) in fit.sub_blocks(text, o, c).items():
            b = text[so + 1:sc]
            d = {k: record_scalar(b, k) for k in ("c1", "c2", "c3")}
            d["form"] = (re.search(r"form\s+(\w+)", b) or [None, None])[1]
            tr = re.search(r"Trange\s*\(([^)]*)\)", b)
            d["Trange"] = [float(v) for v in tr.group(1).split()] if tr else None
            d["raw"] = {k: re.search(r"(?m)^\s*%s\s+(\S+?)\s*;" % k, b).group(1) for k in ("c1", "c2", "c3")} \
                if all(d[k] is not None for k in ("c1", "c2", "c3")) else None
            vals[cub] = d
    if "provenance" in blocks:
        s, o, c = blocks["provenance"]
        pb = fit.sub_blocks(text, o, c)
        if "cubicAlpha" in pb:
            ps, po, pc = pb["cubicAlpha"]
            for cub, (ss, so, sc) in fit.sub_blocks(text, po, pc).items():
                prov[cub] = text[so + 1:sc]
    return vals, prov


def engine_run(case_dir, timeout=300):
    p = subprocess.run([str(PROPS), str(case_dir)], capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def op_diags(out):
    res = {}
    for line in out.splitlines():
        m = re.match(r'\s*\{ "name": "([^"]+)", "type": "[^"]+", "diagnostics": (\{.*?\}),', line)
        if m:
            res[m.group(1)] = json.loads(m.group(2))
    return res


PHIPHI = """recordType thermophysicalPropertySystem;
schemaVersion 1;
components ( %s );
equilibrium
{
    formulation phiPhi;
    equationOfState { model %s; %s }
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


def make_probe(tmp, name, comps, eos_extra, ops, records=None, model="SRK"):
    d = Path(tmp) / name
    (d / "system").mkdir(parents=True)
    (d / "constant" / "components").mkdir(parents=True)
    for c in comps:
        src = (records or {}).get(c) or (COMPONENTS / (c + ".dat"))
        case_records.copy_variation(src, d / "constant" / "components" / (c + ".dat"))
    (d / "system" / "controlDict").write_text("application choupoProps;\nverbosity 2;\n")
    (d / "constant" / "thermoPhysPropDict").write_text(PHIPHI % (" ".join(comps), model, eos_extra))
    (d / "system" / "propsDict").write_text("operations\n(\n" + ops + "\n);\n")
    return d


def mixing_ops(prefix, T, comp):
    c = " ".join("%s %g;" % kv for kv in comp.items())
    return "    { name %s; type mixingRules; state { T %.10g K; P 1 bar; composition { %s } } }\n" % (prefix, T, c)


# ---------------------------------------------------------------------------
def soave_a(text, T, GD=True):
    Tc, Pc, w = (record_scalar(text, k) for k in ("Tc", "Pc", "omega"))
    Pc *= 1e5
    ac = 0.42747 * 8.314462618 ** 2 * Tc * Tc / Pc   # R cancels only in Z; a carries R -> use the engine's R below
    return Tc, Pc, w


def engine_R():
    m = re.search(r"R\s*=\s*([0-9.]+)", (ROOT / "src" / "core" / "Constants.H").read_text())
    return float(m.group(1))


def main() -> int:
    fails, notes = [], []
    if not PROPS.exists():
        print("check_alpha_function: FAILED -- %s not built" % PROPS)
        return 1
    R = engine_R()
    texts = {p.stem: p.read_text() for p in sorted(COMPONENTS.glob("*.dat"))}
    carriers = {}
    for name, t in texts.items():
        if "cubicAlpha" in t:
            carriers[name] = cubic_alpha(t)

    # ---- (a) the records -----------------------------------------------
    for need in ("water", "methanol"):
        for cub in ("SRK", "PengRobinson"):
            if need not in carriers or cub not in carriers[need][0]:
                fails.append("(a) %s carries no cubicAlpha.%s block" % (need, cub))
    n_blocks = 0
    for name, (vals, prov) in carriers.items():
        t = texts[name]
        Tc, Pc_bar, w = (record_scalar(t, k) for k in ("Tc", "Pc", "omega"))
        Pl, vtr = antoine(t)
        for cub, d in vals.items():
            n_blocks += 1
            tag = "(a) %s.%s" % (name, cub)
            if cub not in ("SRK", "PengRobinson") or d["form"] != "MathiasCopeman" \
                    or d["raw"] is None or d["Trange"] is None:
                fails.append(tag + ": incomplete or unknown block (form %s)" % d["form"])
                continue
            if d["Trange"] != vtr:
                fails.append(tag + ": Trange %s is not the vapour-pressure law's window %s" % (d["Trange"], vtr))
            pv = prov.get(cub)
            if pv is None:
                fails.append(tag + ": no provenance.cubicAlpha entry")
                continue
            for need in (r"origin\s+derived\s*;", r'fittedTo\s+"vaporPressure"\s*;'):
                if not re.search(need, pv):
                    fails.append(tag + ": provenance lacks `%s`" % need)
            win = re.search(r"window\s*\(([^)]*)\)", pv)
            if not win or [float(v) for v in win.group(1).split()] != vtr:
                fails.append(tag + ": provenance window is not the law's window")
            shaw = re.search(r'valueSha256\s+"([0-9a-f]{64})"', pv)
            printed = " ".join([d["raw"]["c1"], d["raw"]["c2"], d["raw"]["c3"],
                                "%.8g" % d["Trange"][0], "%.8g" % d["Trange"][1]])
            want = hashlib.sha256(("%s MathiasCopeman %s" % (cub, printed)).encode()).hexdigest()
            if not shaw or shaw.group(1) != want:
                fails.append(tag + ": valueSha256 does not match the constants as printed (edited by hand?)")
            md = re.search(r"maxDeviation_pct\s+([0-9.eE+-]+)\s*;", pv)
            if not md:
                fails.append(tag + ": provenance carries no maxDeviation_pct")
                continue
            # independent recomputation of the in-sample deviation
            Tg = [vtr[0] + (vtr[1] - vtr[0]) * k / 200 for k in range(201)]
            errs = []
            for T in Tg:
                p = fit.psat(T, fit.mc_g(T, Tc, d["c1"], d["c2"], d["c3"]), Tc, Pc_bar * 1e5, cub, Pl(T))
                errs.append(None if p is None else abs(100 * (p / Pl(T) - 1)))
            if None in errs:
                fails.append(tag + ": the cubic has no liquid-vapour pair at some window point")
                continue
            mx = max(errs)
            if abs(mx - float(md.group(1))) > 0.01:
                fails.append(tag + ": stored maxDeviation_pct %s but an independent solve gives %.4f" % (md.group(1), mx))
            if mx > FIT_TOL_PCT:
                fails.append(tag + ": in-sample deviation %.3f %% exceeds the fitted tolerance %.1f %%" % (mx, FIT_TOL_PCT))
    notes.append("(a) %d record blocks (%s) self-consistent, sha and window checked, in-sample Psat deviation recomputed <= %.1f %%"
                 % (n_blocks, ", ".join(sorted(carriers)), FIT_TOL_PCT))

    with tempfile.TemporaryDirectory() as tmp:
        # ---- (b) the witness case -----------------------------------------
        wc = Path(tmp) / "witness"
        case_records.copytree(CASE, wc, ignore=shutil.ignore_patterns("*.csv", "expected"))
        rc, out = engine_run(wc)
        if rc != 0:
            fails.append("(b) the witness case did not run (rc %d): %s" % (rc, out[-400:]))
        else:
            soave_worst = {}
            for comp in ("water", "methanol"):
                t = texts[comp]
                Tc, Pc_bar, w = (record_scalar(t, k) for k in ("Tc", "Pc", "omega"))
                Pc = Pc_bar * 1e5
                m = 0.48508 + 1.55171 * w - 0.15613 * w * w
                c = carriers[comp][0]["SRK"]
                pmd = float(re.search(r"maxDeviation_pct\s+([0-9.eE+-]+)", carriers[comp][1]["SRK"]).group(1))
                Pl, _ = antoine(t)
                for tag in ("soave", "mathiasCopeman"):
                    rows = [r.split(",") for r in (wc / (comp + "_" + tag + ".csv")).read_text().split()[1:]]
                    worst_vs_law = 0.0
                    for r in rows:
                        T, Pe, Plaw = float(r[0]), float(r[1]), float(r[2])
                        g = (1 + m * (1 - math.sqrt(T / Tc))) if tag == "soave" else fit.mc_g(T, Tc, c["c1"], c["c2"], c["c3"])
                        Pp = fit.psat(T, g, Tc, Pc, "SRK", Pl(T))
                        if Pp is None or abs(Pe / Pp - 1) > 1e-4:
                            fails.append("(b) %s %s at %g K: engine P_bubble %.6g vs independent %s" % (comp, tag, T, Pe, Pp))
                        if abs(Plaw / Pl(T) - 1) > 1e-6:
                            fails.append("(b) %s Psat_%s at %g K is not the record's Antoine law" % (tag, comp, T))
                        worst_vs_law = max(worst_vs_law, abs(100 * (Pe / Plaw - 1)))
                    if tag == "mathiasCopeman" and worst_vs_law > pmd + 0.02:
                        fails.append("(b) %s Mathias-Copeman is %.3f %% from the record's law, stored %.4f %%" % (comp, worst_vs_law, pmd))
                    if tag == "soave":
                        soave_worst[comp] = worst_vs_law
            for comp, v in soave_worst.items():
                if v < 5.0:
                    fails.append("(b) the Soave curve of %s is within %.2f %% of the law -- the witness no longer shows the finding" % (comp, v))
            diags = op_diags(out)
            for comp, Tb, tol in (("water", 373.1243, 3e-2), ("methanol", 337.85, 1e-2)):
                d = diags.get(comp + "_mathiasCopeman_Tb", {})
                if abs(d.get("P_bubble", 0.0) / 101325.0 - 1) > tol:
                    fails.append("(b) %s Mathias-Copeman P_bubble at %g K = %s, not 101325 Pa within %g" % (comp, Tb, d.get("P_bubble"), tol))
            if "MathiasCopeman" not in out or "alpha function MathiasCopeman" not in out:
                fails.append("(b) the run does not announce the alpha function / the resolved view does not name it")
            notes.append("(b) witness case: engine P_bubble = independent solve to 1e-4 at every point under Soave and Mathias-Copeman; "
                         "Soave misses the law by %s %% (max), Mathias-Copeman by <= its stored deviation; the choice is announced and in the view"
                         % "/".join("%.0f" % soave_worst[c] for c in ("water", "methanol")))

        # ---- (c) analytic derivative against finite differences ------------
        cases = [("mix", {"water": 0.5, "methanol": 0.5}), ("water", {"water": 1.0}), ("methanol", {"methanol": 1.0})]
        Ts = [350.0, 450.0, 512.64, 520.0, 800.0]    # below Tc, mid, AT methanol's Tc, above methanol's Tc, above both
        h = 0.05
        for cname, comp in cases:
            ops = ""
            for T in Ts:
                for k, dT in (("m", -h), ("0", 0.0), ("p", h)):
                    ops += mixing_ops("T%g_%s" % (T, k), T + dT, comp)
            d = make_probe(tmp, "fd_" + cname, ["water", "methanol"],
                           "alphaFunction MathiasCopeman;", ops)
            rc, out = engine_run(d)
            if rc != 0:
                fails.append("(c) FD probe %s did not run: %s" % (cname, out[-300:]))
                continue
            dg = op_diags(out)
            for T in Ts:
                am, ap = dg["T%g_m" % T]["a_mix"], dg["T%g_p" % T]["a_mix"]
                fd = (ap - am) / (2 * h)
                an = dg["T%g_0" % T]["dadT_mix"]
                #  AT a Tc d2alpha/dT2 jumps (c2, c3 drop out), so a central
                #  difference across it carries an O(h) error: 1e-4 there.
                at_tc = any(abs(T - record_scalar(texts[c], "Tc")) < 2 * h for c in comp)
                if abs(an - fd) > (1e-4 if at_tc else 1e-5) * max(abs(fd), 1e-6):
                    fails.append("(c) %s at %g K: analytic dadT %.9g vs finite difference %.9g" % (cname, T, an, fd))
        notes.append("(c) dadT_mix = central finite difference of a_mix to 1e-5 for the mixture and both pure components at %s K (below, at and above Tc)"
                     % "/".join("%g" % T for T in Ts))

        # ---- (d) the Soave limit -------------------------------------------
        recs = {}
        for comp in ("water", "methanol"):
            t = texts[comp]
            w = record_scalar(t, "omega")
            m = 0.48508 + 1.55171 * w - 0.15613 * w * w
            b = fit.top_blocks(t)["cubicAlpha"]
            s_, o_, c_ = b
            body = (t[:s_] + "cubicAlpha\n{\n    SRK\n    {\n        form MathiasCopeman;\n        c1 %.17g;\n        c2 0;\n        c3 0;\n"
                    "        Trange (%g %g);\n    }\n}\n" % (m, *antoine(t)[1]) + t[c_ + 1:])
            p = Path(tmp) / (comp + "_soaveLimit.dat")
            p.write_text(body)
            recs[comp] = p
        Td = [350.0, 500.0, 800.0]
        ops = "".join(mixing_ops("L%g" % T, T, {"water": 0.5, "methanol": 0.5}) for T in Td)
        d_mc = make_probe(tmp, "limit_mc", ["water", "methanol"], "alphaFunction MathiasCopeman;", ops, records=recs)
        d_so = make_probe(tmp, "limit_soave", ["water", "methanol"], "", ops)
        r1, o1 = engine_run(d_mc)
        r2, o2 = engine_run(d_so)
        if r1 or r2:
            fails.append("(d) Soave-limit probes did not run: %s %s" % (o1[-200:], o2[-200:]))
        else:
            g1, g2 = op_diags(o1), op_diags(o2)
            for T in Td:
                for key in ("a_water", "a_methanol", "a_mix", "dadT_mix"):
                    x, y = g1["L%g" % T][key], g2["L%g" % T][key]
                    if abs(x - y) > 1e-9 * max(abs(y), 1e-30):   # engine prints 12 digits
                        fails.append("(d) c2 = c3 = 0 at %g K: %s %.12g vs Soave %.12g" % (T, key, x, y))
        notes.append("(d) the block c1 = m, c2 = c3 = 0 reproduces the default Soave a_i, a_mix and da_mix/dT (to the 12 digits printed) at %s K"
                     % "/".join("%g" % T for T in Td))

        # ---- (e) the default is untouched ----------------------------------
        T = 400.0
        d = make_probe(tmp, "default", ["water", "methanol"], "", mixing_ops("D", T, {"water": 0.5, "methanol": 0.5}))
        rc, out = engine_run(d)
        if rc != 0:
            fails.append("(e) default probe did not run")
        else:
            dg = op_diags(out)["D"]
            for comp in ("water", "methanol"):
                t = texts[comp]
                Tc, Pc_bar, w = (record_scalar(t, k) for k in ("Tc", "Pc", "omega"))
                m = 0.48508 + 1.55171 * w - 0.15613 * w * w
                a = 0.42747 * R * R * Tc * Tc / (Pc_bar * 1e5) * (1 + m * (1 - math.sqrt(T / Tc))) ** 2
                if abs(dg["a_" + comp] / a - 1) > 1e-9:
                    fails.append("(e) default a_%s %.10g vs Graboski-Daubert Soave %.10g" % (comp, dg["a_" + comp], a))
        notes.append("(e) with the selector absent, records that carry the block still give the Graboski-Daubert Soave a_i to 1e-9")

        # ---- (f) the refusals ------------------------------------------------
        d = make_probe(tmp, "refuse_missing", ["water", "ethanol"], "alphaFunction MathiasCopeman;",
                       mixing_ops("R", 400.0, {"water": 0.5, "ethanol": 0.5}))
        rc, out = engine_run(d)
        if rc == 0 or not all(s in out for s in ("ethanol", "cubicAlpha.SRK", "bin/curate/fit_alpha_function.py")):
            fails.append("(f) a component without the block was not refused by name with the tool as the remedy (rc %d)" % rc)
        d = make_probe(tmp, "refuse_word", ["water", "methanol"], "alphaFunction Twu;",
                       mixing_ops("R", 400.0, {"water": 0.5, "methanol": 0.5}))
        rc, out = engine_run(d)
        if rc == 0 or "alphaFunction 'Twu'" not in out:
            fails.append("(f) an unknown alpha function word was not refused (rc %d)" % rc)
        d = make_probe(tmp, "refuse_pcsaft", ["water", "methanol"], "alphaFunction MathiasCopeman;",
                       mixing_ops("R", 400.0, {"water": 0.5, "methanol": 0.5}), model="PCSAFT")
        rc, out = engine_run(d)
        if rc == 0 or "PCSAFT has none" not in out:
            fails.append("(f) PCSAFT with an alphaFunction was not refused (rc %d)" % rc)
        p = subprocess.run([sys.executable, "-W", "ignore", str(TOOL), "CO2", "--cubic", "SRK"],
                           capture_output=True, text=True, cwd=ROOT)
        if p.returncode != 2 or "SUBLIMATION" not in p.stderr:
            fails.append("(f) the curation tool did not refuse CO2 by name (rc %d)" % p.returncode)
        notes.append("(f) refused by name: a record without the block (names the component, the block and the tool), an unknown word, PC-SAFT, the tool on CO2")

    # ---- source arm: the closed form for a later Cp slice exists ----------
    src = (ROOT / "src" / "thermo" / "equationOfState" / "CubicEoS.cpp").read_text()
    if "d2gdT2" not in src or "mathiasCopemanG" not in src:
        fails.append("CubicEoS.cpp no longer carries the analytic second derivative mathiasCopemanG")

    if fails:
        print("check_alpha_function: FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("check_alpha_function: OK -- " + "; ".join(notes) + "."
          "  NOT COVERED: the constants outside the window they were fitted over, the Tr > 1 branch against any"
          " measurement (Mathias & Copeman 1983 is not held), the second derivative d2alpha/dT2 in any engine path"
          " (no departure reads it today), and any mixing rule.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
