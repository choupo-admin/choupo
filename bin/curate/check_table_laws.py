#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a property given as points (the law type `table`) computes what its points and
its declared interpolation say, refuses outside them, and is read from the right file.

    bin/curate/check_table_laws.py

WHY (DEV.md 4c C398 slice (c), the review rows TG-01..14 and TB-01..05 of its
second round, TG-17..21 and TB-06 of its third).  The view gate compares a table with itself (the view's value and
the object's come from one code path), so the arithmetic of a table, its hard
ends and the file a pin reads are held HERE, by running the engine on copies of
the shipped witnesses and recomputing in this gate, independently, what the
points say.  Every arm runs the engine; nothing is read from a stale output.

ARMS
  (a) ARITHMETIC OF THE FOUR INTERPOLATIONS (TG-11).  A copy of table01 whose
      four variants pin water's liquid viscosity to the case's table under
      linear, logLinear, logReciprocal and monotoneCubic, evaluated at five
      temperatures that are NOT nodes; each value must equal this gate's own
      evaluation of the same points (Fritsch-Carlson limiter included) to the
      last printed digit (5e-12 relative: the result block prints %.12g).
  (b) A HEAT-CAPACITY TABLE AND ITS INTEGRALS (TG-11, TB-03, TG-20).  A copy of
      table03 pinning the case's Cp table (linear, monotoneCubic, monotoneCubic
      with `extend { upTo 105 degC; }`, and monotoneCubic with `extend { downTo
      260 K; }`): Cp at non-node temperatures (one in the segment where the
      limiter acts) and inside BOTH extensions against this gate's evaluation
      (5e-12); the liquid enthalpy and entropy differences
      between two temperatures, priced by (P, H) flashes, against this gate's
      Gauss-Legendre integrals of the same interpolant -- as the difference
      from the record's constant-Cp law over the same interval, so that every
      term that is not Cp cancels -- to 1e-8 of the interval's sensible part,
      over one interval into the upper extension and one into the lower.
  (c) A HARD REFUSAL IS NEVER A NUMBER (TG-01).  pipe01 with a caloric table pin
      and the feed at 380 K: the run must exit non-zero and name the table.
  (d) THE TRIAL-STATE LESSON IS ASSERTED (TG-03).  table03 (an EXPECTED-FAIL
      case the suite does not run) must exit non-zero; its first operation must
      announce the extension at 262 K, its second must be refused with the
      text the guide quotes.
  (e) THE LARGEST EXCURSION OVER EVERY PACKAGE (TB-01).  Two packages of one
      table, the larger excursion first: the end-of-run statement names it; a
      scan across the extension's upper bound refuses exactly its point 0.1 K
      past it (the bound is held).
  (f) A SECTOR'S PIN READS THE SECTOR'S FILE (TG-02, TG-15).  table05: the two
      sectors' packages print the SAME definition fingerprint and DIFFERENT
      package identities (the table's own text and file are in the identity);
      each pipe's viscosity is its own sector's table at 300 K (this gate's
      logReciprocal), and neither is the root decoy's.
  (g) RECORD REFUSALS (TG-10, TB-02): a record table without a source; `extend`
      in a record; a per-mass column on a record with MW <= 0.
  (h) REFUSALS BY NAME (TG-08, TG-12, TG-14, TB-06): a value <= 0 under a linear
      interpolation, printed as the file writes it, with its unit; a density point's mass fraction in `deg`, its density in
      `ppm`, its temperature in `degC`; an `extend` bound in bar names the
      table; a caloric table pin of a component the system does not hold says
      "not in the system".
  (i) `experimentsDir` IS NOT A WORD A DICTIONARY WRITES (TG-17): written in a
      table pin (pointing at a decoy outside the case) and in a density
      measurement entry, it is refused by name.
  (j) A UNIT'S INLINE `thermo {}` READS THE UNIT'S OWN constant/ (TG-19): a copy
      of table05 whose sector-A pipe pins the table in its own flowsheetDict,
      with a different file in that unit's constant/experiments/: the pipe takes
      that file's value (neither its sector's, nor the root decoy's); without
      the file, the run refuses naming the unit's path (no walk up).
  (k) THE PRICED-SET SELECTION DROPS ONLY A COMPONENT ABOVE ITS Tc (TG-18): the
      catch in PricedDensity.cpp rethrows every other hard refusal, and the mark
      it reads is set only at the two critical-temperature tests; apalutamide01,
      whose recovered-solvent tank carries dissolved N2, runs and says the N2 is
      left out.  The rethrow path is reached by NO input today: the density
      route the selection calls (ThermoPackage::density) refuses outside a hard
      domain only above Tc; the arm holds the source so that the next such
      refusal is rethrown, as ruled.

NOT CHECKED: whether the handbook's numbers are right (they are transcribed and
cited); a table in a unit's search other than the (P, H) flash and the pipe; a
solid heat-capacity table (no witness: no read solid table in the literature
archive); 2-D tables (none exist).

    reads: src/thermo/PropertyTable.cpp src/thermo/heatCapacity/TableCp.cpp
    reads: src/thermo/transport/TableViscosity.cpp src/thermo/RecordLaws.cpp
    reads: src/thermo/liquidProperty/ExperimentsFile.cpp src/thermo/Database.cpp
    reads: src/thermo/PricedDensity.cpp src/thermo/ThermoPackage.cpp
    reads: src/thermo/liquidProperty/PureFluidLeaf.cpp src/unitOperations/flowsheet/Flowsheet.cpp
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
import sys as _sys_cr  # noqa: E402
from pathlib import Path as _Path_cr  # noqa: E402
_sys_cr.path.insert(0, str(_Path_cr(__file__).resolve().parent))
import case_records  # noqa: E402  (C420: the probe copy has one home)

ROOT = Path(__file__).resolve().parents[2]
#  Its one directory walk (arm h, the measurement file of a COPY of
#  liquidDensity04) reaches only the gate's own scratch copy under a temporary
#  directory; the cases it copies are named below, not walked.
SCAN_ROOTS = ()
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"
T01 = ROOT / "tutorials/props/transport/table01_water_viscosity_points"
T02 = ROOT / "tutorials/props/heat/table02_water_liquid_cp_points"
T03 = ROOT / "tutorials/props/heat/table03_trial_state_refused"
T05 = ROOT / "tutorials/steady/flowsheets/table05_sector_table_pins"
PIPE = ROOT / "tutorials/steady/hydraulics/pipe01_water_line"
DENS = ROOT / "tutorials/steady/thermo/liquidDensity04_NaOHpoint"
APAL = ROOT / "tutorials/batch/plant/apalutamide01_tablets"
fails = []
said = []
PRINTED = 5.0e-12   # the result block prints %.12g: agreement to its last digit


def fail(arm, msg):
    fails.append(f"({arm}) {msg}")


def run(binary, case, timeout=900, env_extra=None):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    if env_extra:
        env.update(env_extra)
    r = subprocess.run([str(binary), str(case)], capture_output=True, text=True, env=env,
                       timeout=timeout, cwd=str(case))
    return r.returncode, r.stdout + r.stderr


def result(text):
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", text, re.S)
    return json.loads(m.group(1)) if m else None


def op(res, name):
    for o in (res or {}).get("operationResults", []):
        if o.get("name") == name:
            return o.get("diagnostics", {})
    return {}


def copy(src, tmp, name):
    d = Path(tmp) / name
    case_records.copytree(src, d, ignore=shutil.ignore_patterns(
        "converged", "postProcessing", "reports", "log.*", "*.csv", "expected"))
    return d


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300)


# ---- this gate's own reading of a table, independent of the engine ---------

def read_table(path, mw=None):
    """(x in K, y in SI) of an experiments file of two columns."""
    text = re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", Path(path).read_text(), flags=re.S))
    cols = re.findall(r"\{\s*name\s+(\S+);\s*unit\s+(\S+);\s*\}", text)
    data = [float(v) for v in re.search(r"data\s*\((.*?)\);", text, re.S).group(1).split()]
    (tn, tu), (yn, yu) = cols
    xs, ys = data[0::2], data[1::2]
    xs = [v + 273.15 for v in xs] if tu == "degC" else xs
    yf = {"uPa.s": 1e-6, "mPa.s": 1e-3, "Pa.s": 1.0, "J/mol/K": 1.0}.get(yu)
    if yu == "J/g/K":
        yf = mw                       # J/g/K x M [g/mol] = J/(mol K)
    return xs, [v * yf for v in ys]


def fc_slopes(x, y):
    n = len(x)
    d = [(y[k + 1] - y[k]) / (x[k + 1] - x[k]) for k in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for k in range(1, n - 1):
        m[k] = 0.0 if d[k - 1] * d[k] <= 0.0 else 0.5 * (d[k - 1] + d[k])
    for k in range(n - 1):
        if d[k] == 0.0:
            m[k] = m[k + 1] = 0.0
            continue
        a, b = m[k] / d[k], m[k + 1] / d[k]
        if a * a + b * b > 9.0:
            t = 3.0 / math.sqrt(a * a + b * b)
            m[k], m[k + 1] = t * a * d[k], t * b * d[k]
    return m


def seg(x, t):
    k = 0
    while k + 2 < len(x) and t > x[k + 1]:
        k += 1
    return k


def interp(x, y, how, t, up=None, down=None):
    """The value at t (an end segment's chord inside an extension up to `up` or
    down to `down`)."""
    if t > x[-1]:
        assert up is not None and t <= up
        k = len(x) - 2
        return chord(x, y, how, k, t)
    if t < x[0]:
        assert down is not None and t >= down
        return chord(x, y, how, 0, t)
    k = seg(x, t)
    if t in x:
        return y[x.index(t)]
    if how != "monotoneCubic":
        return chord(x, y, how, k, t)
    m = fc_slopes(x, y)
    h = x[k + 1] - x[k]
    w = (t - x[k]) / h
    return ((2 * w ** 3 - 3 * w ** 2 + 1) * y[k] + (w ** 3 - 2 * w ** 2 + w) * h * m[k]
            + (-2 * w ** 3 + 3 * w ** 2) * y[k + 1] + (w ** 3 - w ** 2) * h * m[k + 1])


def chord(x, y, how, k, t):
    if how in ("linear", "monotoneCubic"):
        return y[k] + (t - x[k]) / (x[k + 1] - x[k]) * (y[k + 1] - y[k])
    if how == "logLinear":
        w = (t - x[k]) / (x[k + 1] - x[k])
    else:
        w = (1 / t - 1 / x[k]) / (1 / x[k + 1] - 1 / x[k])
    return math.exp(math.log(y[k]) + w * (math.log(y[k + 1]) - math.log(y[k])))


def gauss(f, a, b, x):
    """Integral of f on [a, b], split at the nodes x, 20-point Gauss-Legendre per piece."""
    nodes, weights = _gl20()
    cuts = [a] + [v for v in x if a < v < b] + [b]
    s = 0.0
    for lo, hi in zip(cuts, cuts[1:]):
        c, r = 0.5 * (lo + hi), 0.5 * (hi - lo)
        s += sum(w * f(c + r * z) for z, w in zip(nodes, weights)) * r
    return s


def _gl20():
    n = 20
    zs, ws = [], []
    for i in range(1, n + 1):
        z = math.cos(math.pi * (i - 0.25) / (n + 0.5))
        for _ in range(100):
            p0, p1 = 1.0, z
            for k in range(2, n + 1):
                p0, p1 = p1, ((2 * k - 1) * z * p1 - (k - 1) * p0) / k
            dp = n * (z * p1 - p0) / (z * z - 1)
            dz = p1 / dp
            z -= dz
            if abs(dz) < 1e-16:
                break
        zs.append(z)
        ws.append(2 / ((1 - z * z) * dp * dp))
    return zs, ws


# ---- the arms ----------------------------------------------------------------

def arm_a(tmp):
    d = copy(T01, tmp, "arith")
    xs, ys = read_table(d / "constant/experiments/crcWaterMu.dat")
    hows = ["linear", "logLinear", "logReciprocal", "monotoneCubic"]
    ts = [278.15, 299.37, 316.85, 341.0, 368.5]
    tp = d / "constant/thermoPhysPropDict"
    t = tp.read_text()
    var = "".join(
        f"    v_{h}\n    {{\n        transport {{ liquid {{ viscosity {{\n"
        f"            pin ( {{ component water;  table crcWaterMu;  interpolation {h};\n"
        f"                    reason \"check_table_laws (a)\"; }} );\n        }} }} }}\n    }}\n"
        for h in hows)
    tp.write_text(t.replace("variants\n{\n", "variants\n{\n" + var, 1))
    ops = "".join(
        f"    {{ name a_{h}_{i}; type propertyPoint; thermo v_{h};\n"
        f"      state {{ T {T!r} K; P 1 bar; composition {{ water 1.0; }} }} properties ( viscosity_liquid ); }}\n"
        for h in hows for i, T in enumerate(ts))
    (d / "system/propsDict").write_text("operations\n(\n" + ops + ");\n")
    rc, out = run(PROPS, d)
    if rc != 0:
        return fail("a", f"the arithmetic copy did not run (exit {rc}): {out[-400:]}")
    res = result(out)
    worst = 0.0
    for h in hows:
        for i, T in enumerate(ts):
            got = op(res, f"a_{h}_{i}").get("viscosity_liquid")
            if got is None:
                fail("a", f"{h} at {T} K published no value")
                continue
            want = interp(xs, ys, h, T)
            worst = max(worst, rel(got, want))
            if rel(got, want) > PRINTED:
                fail("a", f"{h} at {T} K: engine {got!r}, this gate {want!r} (rel {rel(got, want):.2e})")
    said.append(f"(a) 4 interpolations x 5 non-node temperatures, worst rel {worst:.1e}")


def arm_b(tmp):
    d = copy(T03, tmp, "cp")
    mw = 18.01528
    rec = (ROOT / "data/standards/components/water.dat").read_text()
    m = re.search(r"^MW\s+([0-9.eE+-]+)\s*;", rec, re.M)
    if m:
        mw = float(m.group(1))
    xs, ys = read_table(d / "constant/experiments/crcWaterCp.dat", mw)
    tp = d / "constant/thermoPhysPropDict"
    t = tp.read_text()
    var = ("    c_linear { caloric { liquidHeatCapacity { pin ( { component water;  table crcWaterCp;"
           "  interpolation linear;  reason \"check_table_laws (b)\"; } ); } } }\n"
           "    c_mono { caloric { liquidHeatCapacity { pin ( { component water;  table crcWaterCp;"
           "  interpolation monotoneCubic;  reason \"check_table_laws (b)\"; } ); } } }\n"
           "    c_ext { caloric { liquidHeatCapacity { pin ( { component water;  table crcWaterCp;"
           "  interpolation monotoneCubic;  extend { upTo 105 degC;  reason \"check_table_laws (b)\"; }"
           "  reason \"check_table_laws (b)\"; } ); } } }\n"
           "    c_down { caloric { liquidHeatCapacity { pin ( { component water;  table crcWaterCp;"
           "  interpolation monotoneCubic;  extend { downTo 260 K;  reason \"check_table_laws (b)\"; }"
           "  reason \"check_table_laws (b)\"; } ); } } }\n")
    tp.write_text(t.replace("variants\n{\n", "variants\n{\n" + var, 1))
    cps = [("c_linear", "linear", 299.37), ("c_linear", "linear", 341.0),
           ("c_mono", "monotoneCubic", 308.15), ("c_mono", "monotoneCubic", 341.0),
           ("c_ext", "monotoneCubic", 376.0), ("c_down", "monotoneCubic", 264.0)]
    ops = "".join(
        f"    {{ name b_cp{i}; type propertyPoint; thermo {v};\n"
        f"      state {{ T {T!r} K; P 5 bar; composition {{ water 1.0; }} }} properties ( Cp_liquid_water ); }}\n"
        for i, (v, h, T) in enumerate(cps))
    pairs = [(310.0, 336.6), (310.0, 376.0)]
    down = [(264.0, 290.0)]
    for v, ps, lo in (("", pairs + down, 261.0), ("c_ext", pairs, 300.0), ("c_down", down, 261.0)):
        for T in sorted({p for q in ps for p in q}):
            th = f" thermo {v};" if v else ""
            ops += (f"    {{ name b_h_{v or 'const'}_{T!r}; type flashSpec;{th} composition {{ water 1; }}\n"
                    f"      spec {{ pair PH; P 5 bar; targetFrom {{ T {T!r} K; P 5 bar; }} seed {T!r} K; }}\n"
                    f"      window {{ Tmin {lo!r} K; Tmax 378 K; }} }}\n")
    (d / "system/propsDict").write_text("operations\n(\n" + ops + ");\n")
    (d / ".expect-nonconvergence").unlink(missing_ok=True)
    rc, out = run(PROPS, d)
    if rc != 0:
        return fail("b", f"the heat-capacity copy did not run (exit {rc}): {out[-400:]}")
    res = result(out)
    worst = 0.0
    for i, (v, h, T) in enumerate(cps):
        got = op(res, f"b_cp{i}").get("Cp_liquid_water")
        want = interp(xs, ys, h, T, up=378.15, down=260.0)
        if got is None or rel(got, want) > PRINTED:
            fail("b", f"Cp {h} at {T} K: engine {got!r}, this gate {want!r}")
        else:
            worst = max(worst, rel(got, want))
    f = lambda T: interp(xs, ys, "monotoneCubic", T, up=378.15, down=260.0)
    for v, (a, b) in [("c_ext", p) for p in pairs] + [("c_down", p) for p in down]:
        hc = op(res, f"b_h_const_{b!r}").get("ref_H", math.nan) - op(res, f"b_h_const_{a!r}").get("ref_H", math.nan)
        ht = op(res, f"b_h_{v}_{b!r}").get("ref_H", math.nan) - op(res, f"b_h_{v}_{a!r}").get("ref_H", math.nan)
        sc = op(res, f"b_h_const_{b!r}").get("S", math.nan) - op(res, f"b_h_const_{a!r}").get("S", math.nan)
        st = op(res, f"b_h_{v}_{b!r}").get("S", math.nan) - op(res, f"b_h_{v}_{a!r}").get("S", math.nan)
        wantH = gauss(lambda T: f(T) - 75.5, a, b, xs)
        wantS = gauss(lambda T: (f(T) - 75.5) / T, a, b, xs)
        scaleH = 75.5 * (b - a)
        scaleS = 75.5 * math.log(b / a)
        if not (abs((ht - hc) - wantH) <= 1e-8 * scaleH):
            fail("b", f"H({b} K) - H({a} K): table minus constant {ht - hc!r} J/mol, this gate "
                      f"{wantH!r} (sensible part {scaleH:.1f})")
        if not (abs((st - sc) - wantS) <= 1e-8 * scaleS):
            fail("b", f"S({b} K) - S({a} K): table minus constant {st - sc!r}, this gate {wantS!r}")
    said.append(f"(b) Cp at 6 temperatures (worst rel {worst:.1e}), H and S over 3 intervals, one into"
                " each extension (upTo, downTo)")


def arm_c(tmp):
    d = copy(PIPE, tmp, "tg01")
    (d / "constant/experiments").mkdir(exist_ok=True)
    shutil.copy(T03 / "constant/experiments/crcWaterCp.dat", d / "constant/experiments/crcWaterCp.dat")
    feed = (d / "0/feed").read_text()
    (d / "0/feed").write_text(re.sub(r"^T\s+300 K;", "T               380 K;", feed, flags=re.M))
    tp = d / "constant/thermoPhysPropDict"
    tp.write_text(tp.read_text() + "\ncaloric { liquidHeatCapacity { pin ( { component water;  table crcWaterCp;"
                  "  interpolation monotoneCubic;  reason \"check_table_laws (c)\"; } ); } }\n")
    rc, out = run(SOLVE, d)
    if rc == 0 or "liquidHeatCapacity law `crcWaterCp`" not in out or "OUTSIDE the table's points" not in out:
        fail("c", f"a liquid feed past a Cp table was not refused by name (exit {rc}); a refusal "
                  "turned into a number is the defect this arm exists for")
    else:
        said.append("(c) a liquid feed at 380 K on a 273-373 K Cp table refuses by name")


def arm_d(tmp):
    d = copy(T03, tmp, "lesson")
    rc, out = run(PROPS, d)
    ext = "evaluated at T = 262.000000 K, past its first point, by the case's extension"
    #  The second operation's refusal: the variant WITHOUT an extension, so the
    #  sentence goes straight on to "REFUSES." (the extended one would say
    #  "REFUSES (the case's extension reaches ...").
    ref = ("the computation asked for the liquid heat capacity integral at T = 262.000000 K, OUTSIDE"
           " the table's points (273.150000 K to 373.150000 K).  A table has no value beyond its"
           " points, so this REFUSES.")
    if rc == 0:
        fail("d", "table03 exited 0: its second operation must be refused")
    elif ext not in out:
        fail("d", "table03's first operation did not announce the extension at 262 K")
    elif ref not in out or ">>>  Operation [1]" not in out:
        fail("d", "table03's second operation was not refused with the text the guide quotes")
    else:
        said.append("(d) table03: the extension announced at 262 K, then the trial state refused by name")


def arm_e(tmp):
    d = copy(T01, tmp, "excursion")
    tp = d / "constant/thermoPhysPropDict"
    var = "".join(
        f"    e{k}\n    {{\n        transport {{ liquid {{ viscosity {{\n"
        f"            pin ( {{ component water;  table crcWaterMu;  interpolation logReciprocal;\n"
        f"                    extend {{ upTo 110 degC;  reason \"check_table_laws (e)\"; }}\n"
        f"                    reason \"check_table_laws (e), package {k}\"; }} );\n        }} }} }}\n    }}\n"
        for k in (1, 2))
    tp.write_text(tp.read_text().replace("variants\n{\n", "variants\n{\n" + var, 1))
    (d / "system/propsDict").write_text(
        "operations\n(\n"
        "    { name e_big; type propertyPoint; thermo e1; state { T 382.15 K; P 2 bar; composition { water 1.0; } }"
        " properties ( viscosity_liquid ); }\n"
        "    { name e_small; type propertyPoint; thermo e2; state { T 376.15 K; P 2 bar; composition { water 1.0; } }"
        " properties ( viscosity_liquid ); }\n);\n")
    rc, out = run(PROPS, d)
    #  The bound, in a run of its own (its 10 K excursion would mask (e)'s).
    d2 = Path(tmp) / "excursion-bound"
    shutil.copytree(d, d2)
    (d2 / "system/propsDict").write_text(
        "operations\n(\n"
        "    { name e_upTo; type propertyScan1D; thermo e1; vary { variable T; from 383.05 K; to 383.25 K; n 3; }"
        " state { P 2 bar; composition { water 1.0; } } properties ( viscosity_liquid ); output { file e.csv; } }\n);\n")
    rc2, out2 = run(PROPS, d2)
    adv = [a for a in (result(out) or {}).get("advisories", []) if a.get("category") == "table"]
    if rc != 0 or not adv:
        fail("e", f"the two-package excursion copy did not run or stated nothing (exit {rc})")
    elif not any("largest excursion 9 K" in a.get("message", "") for a in adv) or \
            any("largest excursion 3 K" in a.get("message", "") for a in adv):
        fail("e", f"the end-of-run statement is not the larger excursion (9 K): {[a['message'][:120] for a in adv]}")
    elif rc2 != 0 or op(result(out2), "e_upTo").get("n_failures") != 1:
        fail("e", f"a scan across upTo (383.05, 383.15, 383.25 K) did not refuse exactly its last point "
                  f"(exit {rc2}): {op(result(out2), 'e_upTo')}")
    else:
        said.append("(e) two packages of one table: the larger excursion (9 K, first) is the one restated;"
                    " 0.1 K past upTo refuses")


def arm_f(tmp):
    d = copy(T05, tmp, "sectors")
    rc, out = run(SOLVE, d)
    if rc != 0:
        return fail("f", f"table05 did not run (exit {rc}): {out[-400:]}")
    fps = re.findall(r"fingerprint ([0-9a-f]{16})", out)
    pkgs = re.findall(r"  package ([0-9a-f]{16})", out)
    if len(fps) < 3 or fps[1] != fps[2]:
        fail("f", f"the two sector dictionaries no longer resolve to one definition {fps}: the arm "
                  "would not see the identity hold them apart")
    elif len(pkgs) < 3 or pkgs[1] == pkgs[2]:
        fail("f", f"the two sectors' packages share an identity {pkgs}: the table's text and file are "
                  "not in it (TG-15)")
    res = result(out)
    got = {}
    for k in ("A", "B"):
        for u in (res or {}).get("propertySources", {}).get("used", []):
            if u.get("unit") == f"{k}.P1" and u.get("property") == "liquidViscosity":
                got[k] = u.get("valueMin")
    for k in ("A", "B"):
        xs, ys = read_table(d / f"sectors/{k}/constant/experiments/crcWaterMu.dat")
        want = interp(xs, ys, "logReciprocal", 300.0)
        xd, yd = read_table(d / "constant/experiments/crcWaterMu.dat")
        decoy = interp(xd, yd, "logReciprocal", 300.0)
        if got.get(k) is None or rel(got[k], want) > PRINTED:
            fail("f", f"sector {k}'s pipe took mu = {got.get(k)!r}, its own table gives {want!r}"
                      f"{' -- the ROOT DECOY gives ' + repr(decoy) if got.get(k) and rel(got[k], decoy) < 1e-9 else ''}")
    if not any(x.startswith("(f)") for x in fails):
        said.append("(f) two sectors, one pin text: one definition, two identities, each pipe on its own file")


def refuse(arm, case, binary, edits, expect, what):
    for rel_, old, new in edits:
        p = case / rel_
        t = p.read_text()
        if old not in t:
            return fail(arm, f"{what}: the witness moved, the probe cannot place its edit ({rel_})")
        p.write_text(t.replace(old, new, 1))
    rc, out = run(binary, case)
    if rc == 0 or expect not in out:
        fail(arm, f"{what}: not refused by name (exit {rc}; expected '{expect}')")
        return False
    return True


def arm_g(tmp):
    rec = "constant/components/water.dat"
    ok = 0
    ok += bool(refuse("g", copy(T02, tmp, "g1"), PROPS,
                      [(rec, "    liquidHeatCapacity\n    {\n        crc82", "    liquidHeatCapacityX\n    {\n        crc82")],
                      "is a table with no source", "a record table without a source"))
    ok += bool(refuse("g", copy(T02, tmp, "g2"), PROPS,
                      [(rec, "        interpolation  monotoneCubic;", "        interpolation  monotoneCubic;\n"
                        "        extend { upTo 400 K; reason \"probe\"; }")],
                      "a record holds what its source", "`extend` in a record"))
    ok += bool(refuse("g", copy(T02, tmp, "g3"), PROPS,
                      [(rec, "\nMW ", "\nMW 0;\nMWold ")],
                      "cannot be converted to a molar heat capacity", "a per-mass column on a record with MW <= 0"))
    if ok == 3:
        said.append("(g) a sourceless record table, `extend` in a record and a per-mass column with MW <= 0 refuse")


def arm_h(tmp):
    exp = "constant/experiments/crcWaterMu.dat"
    tpd = "constant/thermoPhysPropDict"
    ok = 0
    ok += bool(refuse("h", copy(T01, tmp, "h1"), PROPS,
                      [(exp, "     30    797.7", "     30   -797.7"),
                       (tpd, "interpolation logReciprocal;\n                            reason \"the evaluated values the record",
                        "interpolation linear;\n                            reason \"the evaluated values the record")],
                      "gives the liquid viscosity as -797.7 uPa.s -- it is positive by definition",
                      "a value <= 0 under a linear interpolation, printed as written with its unit"))
    ok += bool(refuse("h", copy(T01, tmp, "h2"), PROPS,
                      [(tpd, "extend { upTo 110 degC;", "extend { upTo 2 bar;")],
                      "pin of 'water' (constant/experiments/crcWaterMu.dat): extend: `upTo` must be a temperature",
                      "an `extend` bound in bar"))
    t3 = copy(T03, tmp, "h3")
    (t3 / ".expect-nonconvergence").unlink(missing_ok=True)
    ok += bool(refuse("h", t3, PROPS,
                      [(tpd, "pin ( { component water;  table crcWaterCp;  interpolation monotoneCubic;\n"
                             "                        extend", "pin ( { component methanol;  table crcWaterCp;"
                             "  interpolation monotoneCubic;\n                        extend")],
                      "which is not in the system", "a caloric table pin of a component the system lacks"))
    for name, old, new in (("deg", "unit -; }", "unit deg; }"), ("ppm", "unit kg/m3; }", "unit ppm; }"),
                           ("degC", "{ name T; unit K; }", "{ name T; unit degC; }")):
        d = copy(DENS, tmp, "dens-" + name)
        files = list((d / "constant/experiments").glob("*.dat"))
        if not files:
            fail("h", "liquidDensity04 carries no measurement file; the unit-role probes have no subject")
            break
        t = files[0].read_text()
        if old not in t:
            fail("h", f"liquidDensity04's measurement moved; the `{name}` probe cannot place its edit")
            continue
        files[0].write_text(t.replace(old, new, 1))
        rc, out = run(SOLVE, d)
        if rc == 0 or "is read here in" not in out:
            fail("h", f"a density point declared in `{name}` was accepted (exit {rc}): its role refuses it")
        else:
            ok += 1
    if ok == 6:
        said.append("(h) a value <= 0 (linear), a bound in bar, an absent component, and a density point "
                    "in deg / ppm / degC refuse by name")


def arm_i(tmp):
    ok = 0
    decoy = Path(tmp) / "elsewhere" / "experiments"
    decoy.mkdir(parents=True)
    shutil.copy(T01 / "constant/experiments/crcWaterMu.dat", decoy / "crcWaterMu.dat")
    ok += bool(refuse("i", copy(T01, tmp, "i1"), PROPS,
                      [("constant/thermoPhysPropDict", "table crcWaterMu;",
                        f"table crcWaterMu;  experimentsDir \"{decoy}\";")],
                      "`experimentsDir` is not a word a dictionary writes",
                      "a hand-written experimentsDir in a table pin"))
    ok += bool(refuse("i", copy(DENS, tmp, "i2"), SOLVE,
                      [("constant/thermoPhysPropDict", "NaOH20_303K { use method;",
                        f"NaOH20_303K {{ experimentsDir \"{decoy}\";  use method;")],
                      "`experimentsDir` is not a word a dictionary writes",
                      "a hand-written experimentsDir in a density measurement"))
    if ok == 2:
        said.append("(i) a hand-written experimentsDir (a table pin, a density measurement) refuses by name")


def arm_j(tmp):
    d = copy(T05, tmp, "unitpin")
    unit = d / "sectors/A/unitOperations/P1"
    (unit / "constant/experiments").mkdir(parents=True)
    shutil.copy(d / "sectors/B/constant/experiments/crcWaterMu.dat", unit / "constant/experiments/crcWaterMu.dat")
    #  C402: a unit's own world is a NAMED variant, declared in the unit's own
    #  constant/thermoPhysPropDict (which inherits its sector's) and selected
    #  by `thermo unitTable;` -- the unit's folder reads ITS experiments/.
    (unit / "constant/thermoPhysPropDict").write_text(
        "recordType    thermophysicalPropertySystem;\nschemaVersion 1;\n"
        "inherits \"../../../constant\";\n"
        "variants { unitTable { transport { liquid { viscosity { pin ( { component water;"
        "  table crcWaterMu;  interpolation logReciprocal;  reason \"check_table_laws (j)\"; } );"
        " } } } } }\n")
    fd = unit / "system/flowsheetDict"
    fd.write_text(fd.read_text() + "\nthermo unitTable;\n")
    rc, out = run(SOLVE, d)
    if rc != 0:
        return fail("j", f"the unit-pin copy of table05 did not run (exit {rc}): {out[-400:]}")
    got = None
    for u in (result(out) or {}).get("propertySources", {}).get("used", []):
        if u.get("unit") == "A.P1" and u.get("property") == "liquidViscosity":
            got = u.get("valueMin")
    xs, ys = read_table(unit / "constant/experiments/crcWaterMu.dat")
    want = interp(xs, ys, "logReciprocal", 300.0)
    xa, ya = read_table(d / "sectors/A/constant/experiments/crcWaterMu.dat")
    xr, yr = read_table(d / "constant/experiments/crcWaterMu.dat")
    others = {"its sector's": interp(xa, ya, "logReciprocal", 300.0),
              "the root decoy's": interp(xr, yr, "logReciprocal", 300.0)}
    if got is None or rel(got, want) > PRINTED:
        hit = [k for k, v in others.items() if got is not None and rel(got, v) < 1e-9]
        return fail("j", f"the sector-A pipe's inline pin took mu = {got!r}; the unit's own file gives "
                         f"{want!r}{' -- that is ' + hit[0] + ' file' if hit else ''}")
    shutil.rmtree(unit / "constant/experiments")
    rc2, out2 = run(SOLVE, d)
    if rc2 == 0 or "no file sectors/A/unitOperations/P1/constant/experiments/crcWaterMu.dat" not in out2:
        return fail("j", f"without the unit's file the inline pin was not refused naming the unit's path "
                         f"(exit {rc2}): a walk up found another file, or the refusal is for another reason")
    said.append("(j) a unit's own variant's pin reads the unit's own constant/experiments/, and without it refuses")


def arm_k(tmp):
    src = (ROOT / "src/thermo/PricedDensity.cpp").read_text()
    m = re.search(r"try \{ rhoPure = thermo\.density\(T, P, pure, ph\); \}(.*?)\n\s*if \(rhoPure", src, re.S)
    body = re.sub(r"//[^\n]*", "", m.group(1)) if m else ""
    if not re.search(r"catch \(const PropertyDomainError& e\)\s*\{\s*if \(e\.kind == PropertyDomainError::Kind::"
                     r"outsideHardDomain && !e\.aboveCriticalTemperature\)\s*throw;", body):
        return fail("k", "PricedDensity.cpp's selection no longer rethrows a hard refusal other than a component"
                         " above its Tc (TG-18): a real liquid the run cannot price would be dropped")
    marks = []
    for p in sorted((ROOT / "src").rglob("*.[cH]*")):
        t = p.read_text(errors="replace")
        for mm in re.finditer(r"markedAboveCriticalTemperature\(\)", t):
            if "PropertyDomainError.H" in str(p):
                continue
            before = t[max(0, mm.start() - 1800):mm.start()]
            marks.append((p.relative_to(ROOT).as_posix(), bool(re.search(r"T >= Tc", before))))
    want = {"src/thermo/ThermoPackage.cpp", "src/thermo/liquidProperty/PureFluidLeaf.cpp"}
    if {f for f, _ in marks} != want or not all(ok for _, ok in marks) or len(marks) != 2:
        return fail("k", f"the above-Tc mark is set at {marks}; it belongs at exactly the two critical-"
                         "temperature tests (ThermoPackage's Rackett branch, the pure-fluid leaf)")
    d = copy(APAL, tmp, "apal")
    rc, out = run(SOLVE, d, timeout=1800)
    if rc != 0 or "N2 left out" not in out:
        return fail("k", f"apalutamide01 (dissolved N2 in the recovered-solvent tank) did not run and say "
                         f"the N2 is left out (exit {rc})")
    said.append("(k) the priced-set selection rethrows every hard refusal but a component above Tc, the"
                " mark sits at the two Tc tests, apalutamide01 runs with its N2 left out")


def main():
    for b in (PROPS, SOLVE):
        if not b.exists():
            print(f"check_table_laws: CANNOT RUN -- {b} is not built (make all)")
            return 1
    for c in (T01, T02, T03, T05, PIPE, DENS, APAL):
        if not c.is_dir():
            print(f"check_table_laws: FAIL -- the witness {c} is gone")
            return 1
    with tempfile.TemporaryDirectory(prefix="tablelaws-") as tmp:
        for arm in (arm_a, arm_b, arm_c, arm_d, arm_e, arm_f, arm_g, arm_h, arm_i, arm_j, arm_k):
            try:
                arm(tmp)
            except Exception as e:  # a crashed arm is a failed arm, named
                fail(arm.__name__[-1], f"the arm crashed: {e!r}")
    if fails:
        print("check_table_laws: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_table_laws: OK -- " + "; ".join(said) + ".  NOT CHECKED: the handbook's numbers, a "
          "solid Cp table (no witness), tables in other searches, 2-D tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
