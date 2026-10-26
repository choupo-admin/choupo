#!/usr/bin/env python3
"""Gate: a distillation column solves the thermodynamics its streams carry.

    bin/curate/check_column_thermo_consistency.py [--list] [case ...]

WHY THIS EXISTS (DEV.md 4c C169, an external audit of the distillation
models, 2026-10-26).  Four findings, each measured with the package's own
functions, and none of them visible to a passing suite:

  * the full MESH solved each stage's ENERGY on `ThermoPackage::Hliquid` /
    `Hvapour` (the vapour as Hliq_pure + a Watson latent heat) while the
    streams, the condenser KPI's neighbours and the energy report price on
    the formation-datum surface (`H_stream_formation`).  The two differ in
    their temperature dependence, not by a constant, so an interior stage
    that closed to 1e-8 kW on the internal surface left 3.94 kW (column06)
    and 124.0 kW (column08) on the streams', and the published condenser
    duty differed from the streams' by 22.9 and 93.9 kW.  The column's
    global first law closes BY CONSTRUCTION (Q_reboiler = dH - Q_condenser
    is a plug), so no gate that reads the first law could see it;
  * every column model called stageK(T, P, x, x, x), so the vapour's
    fugacity coefficients were evaluated at the LIQUID composition --
    invisible under an ideal vapour, max |ln(y / (x K(x, y)))| = 9.4e-4 on
    column15 (75 stages, SRK): the published state satisfied the equation
    implemented, not the package's equilibrium;
  * `model fullMESH;` on a reactive column ran the CMO model and said
    nothing (C131 M9).

A golden pins what a run PRINTS; this gate recomputes what the run CLAIMS,
with the package's own functions, through a probe
(`bin/curate/_columnThermoProbe.cpp`) that calls no unit operation -- an
auditor that reuses the auditee's arithmetic checks nothing.

WHAT THIS GATE CHECKS, on every distillation column in the corpus that
converges and publishes its stage profile (the case list is DISCOVERED, never
typed: every flowsheetDict under tutorials/ that declares a
`distillationColumn`), plus two probes built here:

  (a) THE CONDENSER, on the streams' surface, every column.  Total
      condenser: Q = -V_1 [ H_V(T_1, P, y_1) - H_L(T_D, P, x_D) ] with
      V_1 = (R + 1) D, T_D the PUBLISHED distillate temperature.  Partial:
      Q = -[ V_2 H_V(y_2, T_2) - R D H_L(x_1, T_1) - D H_V(y_1, T_1) ].
      Held to the published `Q_condenser_kW`.

  (a2) EVERY STAGE OF A FULL MESH, on the streams' surface.  L_j and V_j
      are RECONSTRUCTED from the published compositions alone -- a top
      envelope per stage, least squares over every component balance and
      the total, with the feeds and side draws read from the case and the
      stream table -- and the reconstruction residual is reported (it is the
      check on the check).  Then every interior stage WITHOUT a feed, stage
      1 under a total condenser (the reflux entering at the published
      distillate temperature) and the reboiler (its own balance against the
      published `Q_reboiler_kW`) are held to their energy balance.  A CMO
      column (Wang-Henke, `simultaneous`) carries no stage energy balance by
      construction -- that is the approximation it declares -- so (a2) does
      not apply to it.

  (b) FUGACITY EQUALITY on the final state, every stage: max over present
      components of |ln(y_i / (x_i K_i(T, P, x, y)))| with the PUBLISHED y
      (normalised) and the package's own Kvec.  Not applied where y is not
      an equilibrium vapour by declaration (a Murphree efficiency) or where
      the stage K is the reactive flash's and not Kvec (a package that
      resolves reactive equilibrium).  The non-ideal-vapour witnesses are
      column14 and column15 (SRK) and a PROBE: column06 copied with
      `fugacityModel SRK;` (its `feedQuality` removed so the feed is read
      from the stream), which also carries arm (a2) onto a real-gas vapour.

  (c) `model fullMESH|MESH|NaphtaliSandholm` on a REACTIVE column REFUSES
      by name, naming the word and the supported reactive model
      (`simultaneous`), and costs no solve: column05 copied three times.

TOLERANCES, sized to what a converged answer and a 12-significant-figure
result JSON can carry, and far from what a defect produces:
  energy:   |r| <= 1e-5 kW + 1e-9 * sum|terms| (the terms are formation
            enthalpies; a 1e-9 Newton tolerance on rows scaled by the
            feed's latent heat and 12 printed figures sit below it);
  fugacity: 1e-7 (a converged bubble point is good to 1e-9).

WHAT THIS DOES NOT CHECK, stated plainly:
  * that the package is RIGHT -- only that the column agrees with it;
  * stages that carry a feed, in arm (a2): pricing a feed needs its
    resolved state, which is the engine's `flashState` and not a primitive
    this probe exposes (the duty block prices feeds through that home);
  * the absorber, the stripper (Kremser units) and `shortcutColumn` -- no
    stage profile to hold;
  * outer-driver cases beyond the pass their result JSON publishes;
  * a column with its own `thermo {}` override (crystalliser09's recovery
    column): the probe builds the case's package, not the unit's world, so
    it is listed as NOT checked rather than held to the wrong surface.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
SOLVE = ROOT / "choupoSolve"
PROBE = BUILD / "columnThermoProbe"
PROBE_SRC = ROOT / "bin" / "curate" / "_columnThermoProbe.cpp"
LABEL = "check_column_thermo_consistency"

E_ABS = 1.0e-5        # kW
E_REL = 1.0e-9        # of sum |terms|
F_TOL = 1.0e-7        # |ln(y / (x K))|
RECON_TOL = 1.0e-7    # reconstruction residual, a fraction of the feed


# ---------------------------------------------------------------- helpers --

def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"//[^\n]*", "", s)


def unit_blocks(text):
    """Every `{ ... }` block that declares `type distillationColumn;`."""
    out = []
    for m in re.finditer(r"\btype\s+distillationColumn\s*;", text):
        depth, i = 0, m.start()
        while i >= 0:
            c = text[i]
            if c == "}":
                depth += 1
            elif c == "{":
                if depth == 0:
                    break
                depth -= 1
            i -= 1
        start, depth, k = i, 0, i
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        out.append(text[start:k + 1])
    return out


def word(block, key):
    m = re.search(r"\b" + key + r"\s+([A-Za-z_][\w.]*)\s*;", block)
    return m.group(1) if m else None


def discover():
    cases = set()
    for f in (ROOT / "tutorials").rglob("flowsheetDict"):
        if "distillationColumn" in f.read_text(errors="replace"):
            case = f.parent.parent
            while not (case / "system" / "controlDict").exists() and case != ROOT:
                case = case.parent
            cases.add(case)
    return sorted(cases)


def run_case(case):
    p = subprocess.run([str(SOLVE), "."], cwd=case, capture_output=True,
                       text=True, env=dict(os.environ, CHOUPO_HOME=str(ROOT)),
                       timeout=1800)
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*)<<<Choupo:result-end>>>",
                  p.stdout, re.S)
    return p.returncode, (json.loads(m.group(1)) if m else None), \
        p.stdout + p.stderr


class Probe:
    def __init__(self, case, comps):
        self.case, self.n, self.reqs = case, len(comps), []

    def add(self, op, T, P, *vecs):
        self.reqs.append(" ".join([op, repr(T), repr(P)]
                                  + [repr(v) for vec in vecs for v in vec]))
        return len(self.reqs) - 1

    def run(self):
        with tempfile.NamedTemporaryFile("w", suffix=".req", delete=False) as f:
            f.write("\n".join(self.reqs) + "\n")
            path = f.name
        try:
            p = subprocess.run([str(PROBE), str(self.case), path],
                               capture_output=True, text=True, timeout=600,
                               env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
        finally:
            os.unlink(path)
        m = re.search(r"<<<PROBE\n(.*)PROBE>>>", p.stdout, re.S)
        if p.returncode != 0 or not m:
            raise RuntimeError("the probe produced no answer (exit %d): %s"
                               % (p.returncode, (p.stdout + p.stderr)[-600:]))
        lines = m.group(1).splitlines()
        res = []
        for l in lines:
            if l.startswith("OK"):
                v = [float(t) for t in l.split()[1:]]
                res.append(v if len(v) > 1 else v[0])
            else:
                res.append(l)
        return res


def lsq2(rows):
    """min sum (a u + b w - c)^2 over (u, w); returns u, w, max |residual|."""
    saa = sum(a * a for a, b, c in rows)
    sab = sum(a * b for a, b, c in rows)
    sbb = sum(b * b for a, b, c in rows)
    sac = sum(a * c for a, b, c in rows)
    sbc = sum(b * c for a, b, c in rows)
    det = saa * sbb - sab * sab
    u = (sac * sbb - sab * sbc) / det
    w = (saa * sbc - sab * sac) / det
    return u, w, max(abs(a * u + b * w - c) for a, b, c in rows)


def norm(v):
    s = sum(v)
    return [x / s for x in v] if s > 0 else v


# ---------------------------------------------------------- one column ----

def check_column(case, name, block, d, info, log=""):
    """Returns a list of (arm, ok, message)."""
    out = []
    comps = d["components"]
    n = len(comps)
    k = d["kpis"][name]
    prof = d["profiles"][name]
    cols = prof["columns"] if "columns" in prof else prof
    N = int(round(k["nStages"]))
    T = cols["T"]
    x = [[cols["x_" + c][j] for c in comps] for j in range(N)]
    yraw = [[cols["y_" + c][j] for c in comps] for j in range(N)]
    y = [norm(v) for v in yraw]
    R, D, B = k["R"], k["D"], k["B"]
    model = word(block, "model") or word(block, "method") or "WangHenke"
    full = model in ("fullMESH", "MESH", "NaphtaliSandholm") \
        and "reaction" not in block
    partial = bool(re.search(r"condenser\s*\{[^}]*\btype\s+partial\s*;",
                             block, re.S))
    murphree = re.search(r"\bmurphreeEfficiency\s+([0-9.eE+-]+)\s*;", block)
    murphree = murphree is not None and float(murphree.group(1)) != 1.0
    xD = y[0]

    # The published distillate and bottoms, found by WHAT THEY ARE (their
    # flow and composition), never by a name a sectored plant qualifies.
    def find_stream(F, z):
        best = None
        for sn, s in d["streams"].items():
            if s.get("aliasOf") or s.get("boundaryLabel"):
                continue
            if abs(s["F"] - F) > 1e-9 * max(F, 1e-12) + 1e-14:
                continue
            dev = max(abs(s["composition"].get(c, 0.0) - z[i])
                      for i, c in enumerate(comps))
            if dev < 1e-8 and (best is None or dev < best[0]):
                best = (dev, sn, s)
        return best[2] if best else None

    dist = find_stream(D, xD)
    bott = find_stream(B, x[N - 1])
    if dist is None or bott is None:
        out.append(("a", False, "%s: the distillate or the bottoms was not"
                    " found in the stream table by its flow and composition"
                    % name))
        return out
    P = dist["P"]
    TD = dist["T"]

    pr = Probe(case, comps)
    iHL = [pr.add("HL", T[j], P, x[j]) for j in range(N)]
    iHV = [pr.add("HV", T[j], P, y[j]) for j in range(N)]
    iHLD = pr.add("HL", TD, P, xD)
    iK = [pr.add("K", T[j], P, x[j], y[j]) for j in range(N)]
    res = pr.run()
    for i in iK:
        if isinstance(res[i], str):
            out.append(("probe", False, "%s: the probe refused a K-value: %s"
                        % (name, res[i][:300])))
            return out
    gap = next((r for r in res if isinstance(r, str)), None)
    if gap is not None:
        #  THE STREAMS' SURFACE CANNOT PRICE THIS COLUMN (a species with no
        #  formation datum).  The column then falls back to the sensible
        #  datum and SAYS so -- the "enthalpy GAP" announcement -- and there
        #  is no streams' surface to hold it to.  Silence here would be the
        #  defect; the announcement is the contract.
        announced = "enthalpy GAP" in log
        out.append(("a-gap", announced,
                    "%s: the streams' surface cannot price this column (%s);"
                    " the column %s the fallback to the sensible datum"
                    % (name, gap[4:160], "ANNOUNCES" if announced
                       else "does NOT announce")))
    hL = [res[i] for i in iHL]
    hV = [res[i] for i in iHV]
    hLD = res[iHLD]
    kW = 1.0   # J/mol x kmol/s

    def etol(terms):
        return E_ABS + E_REL * sum(abs(t) for t in terms)

    # ---- (b) fugacity equality on the final state ---------------------
    if murphree:
        out.append(("b-skip", True, "%s: Murphree efficiency declared -- y is"
                    " not an equilibrium vapour by declaration" % name))
    elif info["reactive"]:
        out.append(("b-skip", True, "%s: the package resolves reactive"
                    " equilibrium -- the stage K is the reactive flash's"
                    % name))
    else:
        worst, wj = 0.0, 0
        for j in range(N):
            K = res[iK[j]]
            for i in range(n):
                if x[j][i] > 0.0 and y[j][i] > 0.0 and K[i] > 0.0:
                    dv = abs(math.log(y[j][i] / (x[j][i] * K[i])))
                    if dv > worst:
                        worst, wj = dv, j + 1
        out.append(("b", worst <= F_TOL,
                    "%s: max |ln(y/(x K(T,P,x,y)))| = %.3e (stage %d)"
                    % (name, worst, wj)))

    if gap is None:
        # ---- (a) the condenser ---------------------------------------------
        if partial:
            terms = [(R + 1.0) * D * hV[1], -R * D * hL[0], -D * hV[0]]
        else:
            V1 = (R + 1.0) * D
            terms = [V1 * hV[0], -V1 * hLD]
        Qc = -sum(terms) * kW
        dq = Qc - k["Q_condenser_kW"]
        out.append(("a", abs(dq) <= etol(terms),
                    "%s: Q_condenser published %.6f kW, on the streams' surface"
                    " %.6f kW (difference %.6f kW)"
                    % (name, k["Q_condenser_kW"], Qc, dq)))

    if not full or gap is not None:
        return out

    # ---- (a2) every stage of a full MESH ------------------------------
    feeds = []          # (stage, F, z)
    fsm = re.search(r"\bfeedStage\s+(\d+)\s*;", block)
    if fsm:
        fs = int(fsm.group(1))
        src = word(block, "in")
        s = d["streams"][src]
        feeds.append((fs, s["F"], [s["composition"].get(c, 0.0) for c in comps]))
    for m in re.finditer(r"\{\s*stream\s+(\w+)\s*;\s*stage\s+(\d+)\s*;", block):
        s = d["streams"][m.group(1)]
        feeds.append((int(m.group(2)), s["F"],
                      [s["composition"].get(c, 0.0) for c in comps]))
    draws = []          # (stage, phase, F)
    om = re.search(r"\boutputs\s*\(([^)]*)\)", block)
    outs = om.group(1).split() if om else []
    dm = re.search(r"sideDraws\s*\((.*?)\)\s*;", block, re.S)
    if dm:
        decl = []
        for b in re.finditer(r"\{([^}]*)\}", dm.group(1)):
            st = int(re.search(r"stage\s+(\d+)", b.group(1)).group(1))
            ph = re.search(r"phase\s+(\w+)", b.group(1))
            ph = ph.group(1) if ph else "liquid"
            decl.append((st, 0 if ph == "liquid" else 1))
        decl.sort()
        for idx, (st, ph) in enumerate(decl):
            draws.append((st, ph, d["streams"][outs[2 + idx]]["F"]))
    feedStages = {f[0] for f in feeds}
    totFeed = sum(f[1] for f in feeds)

    L = [0.0] * (N + 1)     # 1-based
    V = [0.0] * (N + 2)
    V[1] = 0.0 if partial else (R + 1.0) * D
    L[N] = B
    worstRec = 0.0
    for j in range(1, N):
        rows = []
        for i in range(n):
            rhs = D * xD[i]
            for (st, ph, F) in draws:
                if st <= j:
                    rhs += F * (y[st - 1][i] if ph else x[st - 1][i])
            for (st, F, z) in feeds:
                if st <= j:
                    rhs -= F * z[i]
            rows.append((y[j][i], -x[j - 1][i], rhs))
        rhs = D + sum(F for st, ph, F in draws if st <= j) \
            - sum(F for st, F, z in feeds if st <= j)
        rows.append((1.0, -1.0, rhs))
        V[j + 1], L[j], r = lsq2(rows)
        worstRec = max(worstRec, r / totFeed)
    out.append(("a2-recon", worstRec <= RECON_TOL,
                "%s: L, V reconstructed from the published compositions,"
                " worst envelope residual %.2e of the feed" % (name, worstRec)))

    U = [0.0] * (N + 1)
    W = [0.0] * (N + 1)
    for st, ph, F in draws:
        (W if ph else U)[st] += F

    worst = (0.0, 0, 0.0)
    for j in range(1, N + 1):
        if j in feedStages:
            continue
        if j == 1 and partial:
            continue                    # its duty is free: arm (a) holds it
        if j == N:
            terms = [V[N] * hV[N - 1], B * hL[N - 1], U[N] * hL[N - 1],
                     W[N] * hV[N - 1], -L[N - 1] * hL[N - 2]]
            Qr = sum(terms)
            dq = Qr - k["Q_reboiler_kW"]
            out.append(("a2-reboiler", abs(dq) <= etol(terms),
                        "%s: Q_reboiler published %.6f kW, the reboiler's own"
                        " balance on the streams' surface %.6f kW (difference"
                        " %.6f kW)" % (name, k["Q_reboiler_kW"], Qr, dq)))
            continue
        if j == 1:
            terms = [R * D * hLD, V[2] * hV[1], -L[1] * hL[0], -V[1] * hV[0]]
        else:
            terms = [L[j - 1] * hL[j - 2], V[j + 1] * hV[j],
                     -(L[j] + U[j]) * hL[j - 1], -(V[j] + W[j]) * hV[j - 1]]
        r = sum(terms)
        tol = etol(terms)
        if abs(r) / tol > abs(worst[0]) / max(worst[2], 1e-300) or worst[1] == 0:
            worst = (r, j, tol)
    out.append(("a2-stages", abs(worst[0]) <= worst[2],
                "%s: worst stage energy residual on the streams' surface"
                " %.6f kW at stage %d (tolerance %.1e kW)"
                % (name, worst[0], worst[1], worst[2])))
    return out


def probe_info(case):
    """Ask the probe whether the package resolves reactive equilibrium."""
    p = subprocess.run([str(PROBE), str(case), "--info"], capture_output=True,
                       text=True, timeout=600,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
    m = re.search(r"reactive (\d)", p.stdout)
    if p.returncode != 0 or not m:
        raise RuntimeError("probe --info failed: " + (p.stdout + p.stderr)[-400:])
    return {"reactive": m.group(1) == "1"}


def check_case(case, label=None):
    label = label or str(case.relative_to(ROOT))
    rc, d, log = run_case(case)
    if rc != 0 or d is None:
        return label, [("run", False, "%s: did not run to a converged answer"
                        " (exit %d)\n%s" % (label, rc, log[-800:]))]
    text = ""
    for f in case.rglob("flowsheetDict"):
        text += strip_comments(f.read_text(errors="replace")) + "\n"
    results = []
    try:
        info = probe_info(case)
    except Exception as e:
        return label, [("probe", False, "%s: %s" % (label, e))]
    for block in unit_blocks(text):
        name = word(block, "name")
        if name not in d.get("kpis", {}) or name not in (d.get("profiles") or {}):
            continue
        if re.search(r"\bthermo\s*\{", block):
            #  A per-unit `thermo {}` world: the probe builds the CASE'S
            #  package, so it would hold this column to a surface it does not
            #  run on.  Said, never silently passed.
            results.append(("skip", True, "%s :: %s: a per-unit `thermo {}`"
                            " override -- the probe builds the case's package,"
                            " not this unit's world; NOT checked" % (label, name)))
            continue
        try:
            for arm, ok, msg in check_column(case, name, block, d, info, log):
                results.append((arm, ok, label + " :: " + msg))
        except Exception as e:
            results.append(("check", False, "%s :: %s: %r" % (label, name, e)))
    if not results:
        results.append(("run", False, "%s: no distillation column with a"
                        " published profile was found" % label))
    return label, results


def probe_srk_copy(tmp):
    """column06 on an SRK vapour: the non-ideal witness for (b) and (a2)."""
    src = ROOT / "tutorials" / "steady" / "distillation" / "column06_fullMESH"
    dst = Path(tmp) / "column06_srk_probe"
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "reports", "iterations", "design", "economics"))
    tp = dst / "constant" / "thermoPhysPropDict"
    s = tp.read_text()
    s2 = re.sub(r"fugacityModel\s+idealGas\s*;", "fugacityModel SRK;", s)
    if s2 == s:
        raise RuntimeError("column06's package no longer declares an"
                           " idealGas fugacity model to replace")
    tp.write_text(s2)
    fd = dst / "system" / "flowsheetDict"
    fd.write_text(re.sub(r"\n\s*feedQuality[^;]*;", "\n", fd.read_text()))
    return dst


def probe_reactive_refusals(tmp):
    src = ROOT / "tutorials" / "steady" / "distillation" / \
        "column05_reactive_methylacetate"
    out = []
    for model in ("fullMESH", "MESH", "NaphtaliSandholm"):
        dst = Path(tmp) / ("column05_" + model)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
            "converged", "reports", "iterations", "design", "economics"))
        fd = dst / "system" / "flowsheetDict"
        s = fd.read_text()
        s2 = re.sub(r"\bmodel\s+simultaneous\s*;", "model %s;" % model, s)
        if s2 == s:
            out.append(("c", False, "column05 no longer declares `model"
                        " simultaneous;` to replace"))
            continue
        fd.write_text(s2)
        rc, d, log = run_case(dst)
        named = (model in log and "simultaneous" in log
                 and re.search(r"react", log, re.I) is not None)
        verdict = ("ran to a converged answer -- the declared model was NOT"
                   " refused" if rc == 0 else
                   "refused, naming the model and `simultaneous`" if named
                   else "refused, but the message does NOT name the model and"
                        " the supported one")
        out.append(("c", rc != 0 and named,
                    "column05 with `model %s;`: exit %d, %s"
                    % (model, rc, verdict)))
    return out


def build_probe():
    lib = BUILD / "libchoupo.so"
    if not lib.exists():
        return "libchoupo.so is not built -- a check that cannot run must" \
               " not pass"
    p = subprocess.run(
        ["g++", "-std=c++17", "-O2", "-I" + str(ROOT / "src"), "-I" + str(ROOT),
         str(PROBE_SRC), str(lib), "-Wl,-rpath," + str(BUILD), "-o", str(PROBE)],
        capture_output=True, text=True)
    return None if p.returncode == 0 else \
        "the probe did not compile -- the ThermoPackage surface moved:\n" \
        + p.stderr[-1500:]


def main(argv):
    if not SOLVE.exists():
        print(LABEL + ": FAILED\n  choupoSolve is not built -- a check that"
              " cannot run must not pass")
        return 1
    err = build_probe()
    if err:
        print(LABEL + ": FAILED\n  " + err)
        return 1
    cases = [ROOT / a for a in argv if not a.startswith("-")] or discover()
    if "--list" in argv:
        for c in cases:
            print(c.relative_to(ROOT))
        return 0

    tmp = tempfile.mkdtemp(prefix="colthermo.")
    try:
        jobs = [(c, None) for c in cases]
        if not [a for a in argv if not a.startswith("-")]:
            jobs.append((probe_srk_copy(tmp), "PROBE column06 on SRK"))
        with ThreadPoolExecutor(max(1, min(4, os.cpu_count() or 1))) as ex:
            results = list(ex.map(lambda a: check_case(*a), jobs))
        if not [a for a in argv if not a.startswith("-")]:
            results.append(("PROBE column05 reactive", probe_reactive_refusals(tmp)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    fails, lines, counts = [], [], {}
    for label, rs in results:
        for arm, ok, msg in rs:
            counts.setdefault(arm, [0, 0])[0 if ok else 1] += 1
            (lines if ok else fails).append(("    " if ok else "  FAIL ")
                                            + "(" + arm + ") " + msg)
    if "-v" in argv or fails:
        for l in lines:
            print(l)
    for l in fails:
        print(l)
    summary = ", ".join("%s %d/%d" % (a, c[0], c[0] + c[1])
                        for a, c in sorted(counts.items()))
    if fails:
        print(LABEL + ": FAILED -- %d finding(s) [%s]" % (len(fails), summary))
        return 1
    print(LABEL + ": OK -- %d case(s) + 2 probes; every column's condenser,"
          " every full-MESH stage and reboiler on the streams' surface, and"
          " fugacity equality at the published y [%s]; NOT checked: feed"
          " stages, Kremser units, shortcutColumn" % (len(cases), summary))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
