#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_data_reconciliation -- plant flow measurements reconciled under the
node balances, with the gross-error tests and the posterior covariance
(DEV.md 4c C121, 2026-10-20; src/propertyOps/DataReconciliation.cpp).

The op hands its weighted least squares to the engine's ONE home for it
(analysis::reconcileWeightedLeastSquares) and computes the statistics
beside the answer.  This gate RECOMPUTES all of it from the witness's own
files (network, readings, prior -- parsed here, never typed), by routes the
engine does not take, and holds the published numbers to them:

  (a) THE ANSWER, BY ANOTHER ROUTE.  For each of the four operations the
      reconciled flows AND their full posterior covariance come from ONE
      dense KKT solve over ALL seven flows -- [H A^T; A 0] -- with the
      unmeasured flows carried as zero-precision unknowns and a prior
      carried as a SECOND measurement of the same flow (H = 1/sigma^2 +
      1/s^2).  The engine instead projects the balances and combines each
      reading with its prior before the solve; the two routes share no
      step.  The covariance is the top-left block of the KKT inverse (for a
      linearly constrained Gaussian it is M H M = M).  Reconciled flows to
      1e-9 relative, every covariance cell to 1e-9 of the largest.
  (b) THE PRIOR IS EXACT: each pseudo-measurement (combined, combinedSigma)
      is recomputed from the reading and the prior (precision weighting),
      and the prior-data conflict Sum (m - x0)^2 / (sigma^2 + s^2) with it.
      Arm (a) is what shows the completed square is exact -- the stacked
      KKT route never forms a pseudo-measurement.
  (c) THE GLOBAL TEST.  The objective is Sum (a/sigma*)^2 over the published
      adjustments; `dof` is the number of independent balances left once
      the unmeasured flows are eliminated (4 - rank of their columns);
      `pValue` and `chi2Critical` are checked against the chi-square
      survival function in its CLOSED FORM for whole degrees of freedom
      (a finite sum, with erfc for odd nu -- not the series and continued
      fraction the engine uses), and against the printed tables to four
      decimals (9.4877 for 4, 7.8147 for 3, 14.0671 for 7).
  (d) THE MEASUREMENT TEST: z_j = a_j / sqrt(C_jj - Sigma_jj) from the arm
      (a) covariance; the Sidak level 1 - (1 - alpha)^(1/N); the critical
      value satisfies erfc(z/sqrt 2) = beta; the flagged set is exactly
      {F3} on `drifted` and empty on the other three.
  (e) THE MULTIPLIERS AND THE ATTRIBUTION: lambda = (B C B^T)^-1 B m* with B
      rebuilt from each balance's NAME (`reactor+separator` is the sum of
      those two node rows, restricted to the measured flows); x = m* - C B^T
      lambda reproduces the reconciled flows; each `by_<balance>` column is
      -lambda_k B_kj sigma*_j and the columns sum to adjustmentSigma.
  (f) THE EXCLUDED METER: its offset is reading - estimate, its test is that
      over sqrt(sigma^2 + Sigma_jj), and that test EQUALS the measurement
      test the same meter scored while it was still in service (`drifted`)
      -- the measurement test asks exactly "does this meter agree with the
      rest of the plant?", to 1e-9.
  (g) REFUSALS BY NAME, on probe copies: an unobservable exclusion (the
      whole recycle loop F2 F3 F5 F7: a flow circulating round it changes
      no balance), an exclusion that leaves no redundancy (F1 F2 F5 F6), a
      node balance that repeats the others (two extra nodes closed on each
      other), a reading for an unmetered stream, a meter
      with no reading, a drift on an unknown meter, a reporting unit that
      is not a mass flow, a missing `alpha`, and an answer pressed against
      non-negativity (F6 planted 30 t/h low).
  (h) SOURCE: the op calls analysis::reconcileWeightedLeastSquares and
      builds no QP of its own (no activeSetQP, no QPProblem).
  (i) THE EDUTOOL'S KNOB IS SAFE: the drift range the page offers
      (DRIFT_MIN / DRIFT_MAX, read from gui/src/ui/methods/
      dataReconciliationRun.ts) is run at both ends on every meter, the
      meter left in and taken out of service, and every run must finish --
      a range that pressed a flow against zero would show a student the
      engine's refusal of the Gaussian statistics instead of the lesson.

SABOTAGES, performed by hand on 2026-10-20 and restored (each a one-line
edit of DataReconciliation.cpp; the engine rebuilt between them; the
finding counts are the gate's own):
  S1  the precision weighting writes m* = (m + x0) / 2, an unweighted mean
      -> 44 findings: (b) on every flow of `yesterday` (F6: 9.95 against
      10.04) and (a) on its reconciled flows (the stacked KKT route never
      forms a pseudo-measurement, which is why it can see this).
  S2  the posterior covariance published as C instead of C - V ("the
      reconciliation buys nothing") -> 58 findings: (a) on every
      sigmaReconciled and covariance cell (F1: 2 against 1.1757).
  S3  the Sidak level replaced by alpha itself (one test, not seven)
      -> 9 findings: (d) measurementTestLevel 0.05 against 0.0073, zCritical
      1.96, and `drifted` flagging ['F2', 'F3'] where the witness flags F3.
  S4  the chi-square taken with nu = the number of measured flows (7)
      instead of the independent balances (4) -> 16 findings: (c) dof 7
      against 4, the p-value against the closed form, chi2Critical 14.07
      whose tail is 0.0071, not alpha.
  S5  the projection keeps the pivot row that still holds the unmeasured
      column -> the WITNESS ITSELF refuses (driftedWithout: the extra row
      over-constrains the six meters and drives F4 against zero, so the op
      declines to publish its Gaussian statistics) and the gate exits FAILED
      before its arms read anything.  Measured, not predicted: the docstring
      first said (a) and (e) would catch it; a projection error that left a
      feasible problem would reach (a), whose KKT route does not project.

NOT CHECKED, said plainly: a composition or energy balance (the op
reconciles linear mass balances only -- a bilinear one is not built); a
CORRELATED prior (refused by construction: the prior file is per flow); any
real plant's data (the witness is synthetic, and says so); the GUI's
drawing of these numbers (gui/tests/dataReconciliationLesson.test.ts).
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoProps"
WITNESS = ROOT / "tutorials/props/reconciliation/reconcile01_recycle_loop"
SRC = ROOT / "src/propertyOps/DataReconciliation.cpp"
GUI_RUN = ROOT / "gui/src/ui/methods/dataReconciliationRun.ts"

OPS = {  # op name -> (csv prefix, drift, excluded, prior file)
    "honest": ("honest", None, [], None),
    "drifted": ("drifted", ("F3", 15.0), [], None),
    "driftedWithout": ("without", ("F3", 15.0), ["F3"], None),
    "yesterday": ("prior", None, [], "constant/plant/yesterday"),
}

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=300,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout, p.stderr


def result_json(out):
    i = out.find("<<<Choupo:result-begin>>>")
    j = out.find("<<<Choupo:result-end>>>")
    if i < 0 or j < 0:
        return None
    return json.loads(out[i + len("<<<Choupo:result-begin>>>"):j])


def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def block(text, key):
    """The body of `key { ... }` (brace-matched)."""
    m = re.search(r"\b" + re.escape(key) + r"\s*\{", text)
    if not m:
        return None
    i, depth = m.end(), 1
    while depth:
        depth += {"{": 1, "}": -1}.get(text[i], 0)
        i += 1
    return text[m.end():i - 1]


def flows_in(body):
    """`F1 101.4 t/h;` lines -> {name: value} (every flow here is in t/h)."""
    out = {}
    for m in re.finditer(r"\b(\w+)\s+([-+0-9.eE]+)\s+t/h\s*;", body):
        out[m.group(1)] = float(m.group(2))
    return out


def read_network():
    t = strip((WITNESS / "constant/plant/network").read_text())
    if not re.search(r"^\s*unit\s+t/h\s*;", t, re.M):
        fail("the witness network no longer reports in t/h (this gate parses t/h)")
    streams, sigma = [], {}
    for m in re.finditer(r"\b(\w+)\s*\{\s*sigma\s+([0-9.eE+-]+)\s+t/h\s*;\s*\}",
                         block(t, "flows")):
        streams.append(m.group(1))
        sigma[m.group(1)] = float(m.group(2))
    nodes = {}
    for m in re.finditer(r"\b(\w+)\s*\{\s*in\s*\(([^)]*)\)\s*;\s*out\s*\(([^)]*)\)\s*;\s*\}",
                         block(t, "nodes")):
        nodes[m.group(1)] = (m.group(2).split(), m.group(3).split())
    truth = flows_in(block(t, "syntheticTruth"))
    return streams, sigma, nodes, truth


def read_prior(rel):
    t = strip((WITNESS / rel).read_text())
    out = {}
    for m in re.finditer(r"\b(\w+)\s*\{\s*value\s+([0-9.eE+-]+)\s+t/h\s*;\s*"
                         r"sigma\s+([0-9.eE+-]+)\s+t/h\s*;\s*\}", t):
        out[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    return out


def read_csv(path):
    lines = path.read_text().splitlines()
    head = lines[0].split(",")
    rows = {}
    for ln in lines[1:]:
        if ln.strip():
            v = ln.split(",")
            rows[v[0]] = dict(zip(head, v))
    return head, rows


def num(s):
    return float(s) if s not in ("", None) else None


# ---- dense linear algebra, Gauss-Jordan (independent of the engine's LU) ----

def inverse(M):
    n = len(M)
    a = [list(r) + [1.0 if i == j else 0.0 for j in range(n)] for i, r in enumerate(M)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(a[r][c]))
        if abs(a[p][c]) < 1e-300:
            raise ZeroDivisionError("singular")
        a[c], a[p] = a[p], a[c]
        pv = a[c][c]
        a[c] = [v / pv for v in a[c]]
        for r in range(n):
            if r != c and a[r][c] != 0.0:
                f = a[r][c]
                a[r] = [x - f * y for x, y in zip(a[r], a[c])]
    return [r[n:] for r in a]


def matmul(X, Y):
    return [[sum(X[i][k] * Y[k][j] for k in range(len(Y))) for j in range(len(Y[0]))]
            for i in range(len(X))]


def T(X):
    return [list(r) for r in zip(*X)]


# ---- the chi-square survival function, closed form for whole nu -------------

def chi2_sf(nu, x):
    h = x / 2.0
    if nu % 2 == 0:
        return math.exp(-h) * sum(h ** k / math.factorial(k) for k in range(nu // 2))
    s = math.erfc(math.sqrt(h))
    for k in range(1, (nu - 1) // 2 + 1):
        s += math.exp(-h) * h ** (k - 0.5) / math.gamma(k + 0.5)
    return s


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-12)


def check_op(op, prefix, drift, excluded, prior_rel, out, streams, sigma, nodes,
             readings, jres):
    names = list(nodes)
    A = [[(1.0 if s in nodes[k][0] else -1.0 if s in nodes[k][1] else 0.0)
          for s in streams] for k in names]
    m = dict(readings)
    if drift:
        m[drift[0]] += drift[1]
    prior = read_prior(prior_rel) if prior_rel else {}
    n = len(streams)
    _, rows = read_csv(WITNESS / f"{prefix}_streams.csv")
    _, bal = read_csv(WITNESS / f"{prefix}_balances.csv")
    covh, covr = read_csv(WITNESS / f"{prefix}_covariance.csv")
    diag = jres.get(op, {})

    # pseudo-measurements, recomputed (arm b)
    H = [0.0] * n
    h = [0.0] * n
    mstar, sstar, conflict, nconf = {}, {}, 0.0, 0
    for j, s in enumerate(streams):
        reads = s not in excluded
        if reads:
            H[j] += 1.0 / sigma[s] ** 2
            h[j] += m[s] / sigma[s] ** 2
        if s in prior:
            x0, s0 = prior[s]
            H[j] += 1.0 / s0 ** 2
            h[j] += x0 / s0 ** 2
            if reads:
                conflict += (m[s] - x0) ** 2 / (sigma[s] ** 2 + s0 ** 2)
                nconf += 1
        if H[j] > 0:
            sstar[s] = 1.0 / math.sqrt(H[j])
            mstar[s] = h[j] / H[j]
            if rel(num(rows[s]["combined"]), mstar[s]) > 1e-9 \
                    or rel(num(rows[s]["combinedSigma"]), sstar[s]) > 1e-9:
                fail(f"(b) {op}: {s} pseudo-measurement {rows[s]['combined']}"
                     f" +- {rows[s]['combinedSigma']} against {mstar[s]:.10g}"
                     f" +- {sstar[s]:.10g} (precision weighting)")
    if nconf:
        if rel(diag.get("priorConflict", math.nan), conflict) > 1e-9:
            fail(f"(b) {op}: priorConflict {diag.get('priorConflict')} against {conflict}")
    elif "priorConflict" in diag:
        fail(f"(b) {op}: publishes a prior conflict without a prior")

    # the stacked KKT solve over all flows (arm a)
    nb = len(A)
    K = [[0.0] * (n + nb) for _ in range(n + nb)]
    rhs = [0.0] * (n + nb)
    for j in range(n):
        K[j][j] = H[j]
        rhs[j] = h[j]
    for k in range(nb):
        for j in range(n):
            K[n + k][j] = A[k][j]
            K[j][n + k] = A[k][j]
    Kinv = inverse(K)
    x = [sum(Kinv[i][c] * rhs[c] for c in range(n + nb)) for i in range(n)]
    S = [[Kinv[i][j] for j in range(n)] for i in range(n)]
    big = max(abs(S[i][j]) for i in range(n) for j in range(n))
    for j, s in enumerate(streams):
        if rel(num(rows[s]["reconciled"]), x[j]) > 1e-9:
            fail(f"(a) {op}: reconciled {s} = {rows[s]['reconciled']} against the"
                 f" KKT route's {x[j]:.10g}")
        if rel(diag.get("reconciled_" + s, math.nan), x[j]) > 1e-9:
            fail(f"(a) {op}: diag reconciled_{s} disagrees with the CSV")
        if rel(num(rows[s]["sigmaReconciled"]), math.sqrt(S[j][j])) > 1e-9:
            fail(f"(a) {op}: sigmaReconciled {s} = {rows[s]['sigmaReconciled']}"
                 f" against {math.sqrt(S[j][j]):.10g}")
        for i, s2 in enumerate(streams):
            if abs(float(covr[s][s2]) - S[j][i]) > 1e-9 * big:
                fail(f"(a) {op}: covariance[{s},{s2}] = {covr[s][s2]} against"
                     f" {S[j][i]:.10g}")
                break
    if covh[1:] != streams:
        fail(f"(a) {op}: the covariance header {covh} is not the stream order")

    # the global test (arm c)
    measured = [s for s in streams if s in mstar]
    a = {s: x[streams.index(s)] - mstar[s] for s in measured}
    gamma = sum((a[s] / sstar[s]) ** 2 for s in measured)
    # dof: balances minus the rank of the unmeasured columns
    U = [j for j, s in enumerate(streams) if s not in mstar]
    rank_u = 0
    if U:
        Au = [[A[k][j] for j in U] for k in range(nb)]
        rank_u = rank_of(Au)
    dof = nb - rank_u
    alpha = diag.get("alpha", math.nan)
    if rel(diag.get("objective", math.nan), gamma) > 1e-9:
        fail(f"(c) {op}: objective {diag.get('objective')} against Sum (a/sigma*)^2 = {gamma}")
    if diag.get("dof") != dof:
        fail(f"(c) {op}: dof {diag.get('dof')} against {dof}")
    if rel(diag.get("pValue", math.nan), chi2_sf(dof, gamma)) > 1e-8:
        fail(f"(c) {op}: pValue {diag.get('pValue')} against the closed form {chi2_sf(dof, gamma)}")
    crit = diag.get("chi2Critical", math.nan)
    if abs(chi2_sf(dof, crit) - alpha) > 1e-9:
        fail(f"(c) {op}: chi2Critical {crit} has tail {chi2_sf(dof, crit)}, not alpha = {alpha}")
    table = {3: 7.8147, 4: 9.4877, 7: 14.0671}
    if alpha == 0.05 and dof in table and abs(crit - table[dof]) > 5e-5:
        fail(f"(c) {op}: chi2Critical {crit} is not the tabulated {table[dof]}")
    if diag.get("globalTestRejects") != (1 if gamma > crit else 0):
        fail(f"(c) {op}: globalTestRejects {diag.get('globalTestRejects')} for {gamma} vs {crit}")
    if nconf:
        cc = diag.get("priorConflictCritical", math.nan)
        if abs(chi2_sf(nconf, cc) - alpha) > 1e-9:
            fail(f"(b) {op}: priorConflictCritical {cc} is not the alpha quantile")

    # the measurement test (arm d)
    zs, flagged = {}, set()
    for s in measured:
        j = streams.index(s)
        v = sstar[s] ** 2 - S[j][j]
        if v > 1e-12 * sstar[s] ** 2:
            zs[s] = a[s] / math.sqrt(v)
    N = len(zs)
    beta = 1.0 - (1.0 - alpha) ** (1.0 / N)
    zc = diag.get("zCritical", math.nan)
    if rel(diag.get("measurementTestLevel", math.nan), beta) > 1e-9:
        fail(f"(d) {op}: measurementTestLevel {diag.get('measurementTestLevel')} against Sidak {beta}")
    if abs(math.erfc(zc / math.sqrt(2.0)) - beta) > 1e-9:
        fail(f"(d) {op}: zCritical {zc} has two-sided tail {math.erfc(zc / math.sqrt(2.0))}, not {beta}")
    for s, z in zs.items():
        if rel(num(rows[s]["measurementTest"]), z) > 1e-8:
            fail(f"(d) {op}: measurementTest {s} = {rows[s]['measurementTest']} against {z:.10g}")
        if abs(z) > zc:
            flagged.add(s)
    published = {s for s in streams if rows[s]["flagged"] == "1"}
    if published != flagged:
        fail(f"(d) {op}: flagged {sorted(published)} against {sorted(flagged)}")
    want = {"drifted": {"F3"}}.get(op, set())
    if flagged != want:
        fail(f"(d) {op}: the flagged set is {sorted(flagged)}, the witness"
             f" says it is {sorted(want)}")

    # multipliers and attribution (arm e)
    X = [streams.index(s) for s in measured]
    Brows, bnames = [], []
    for b in bal.values():
        coeff = [0.0] * n
        for sign, node in re.findall(r"([+-]?)(\w+)", b["balance"]):
            if node not in nodes:
                fail(f"(e) {op}: balance name {b['balance']!r} names no node")
                continue
            f = -1.0 if sign == "-" else 1.0
            k = names.index(node)
            coeff = [c + f * A[k][j] for j, c in enumerate(coeff)]
        if any(abs(coeff[j]) > 1e-12 for j in U):
            fail(f"(e) {op}: balance {b['balance']} still holds an unmeasured flow")
        Brows.append([coeff[j] for j in X])
        bnames.append(b["balance"])
    C = [[sstar[measured[i]] ** 2 if i == j else 0.0 for j in range(len(X))] for i in range(len(X))]
    W = matmul(matmul(Brows, C), T(Brows))
    r = [sum(Brows[k][i] * mstar[measured[i]] for i in range(len(X))) for k in range(len(Brows))]
    lam = [sum(row[c] * r[c] for c in range(len(r))) for row in inverse(W)]
    for k, b in enumerate(bnames):
        if rel(float(bal[b]["multiplier"]), lam[k]) > 1e-8:
            fail(f"(e) {op}: multiplier {b} = {bal[b]['multiplier']} against {lam[k]:.10g}")
        if rel(float(bal[b]["residual"]), r[k]) > 1e-9:
            fail(f"(e) {op}: residual {b} = {bal[b]['residual']} against {r[k]:.10g}")
        if rel(float(bal[b]["residualSigma"]), math.sqrt(W[k][k])) > 1e-9:
            fail(f"(e) {op}: residualSigma {b} against {math.sqrt(W[k][k]):.10g}")
    for i, s in enumerate(measured):
        xr = mstar[s] - sum(C[i][i] * Brows[k][i] * lam[k] for k in range(len(lam)))
        if rel(xr, x[streams.index(s)]) > 1e-9:
            fail(f"(e) {op}: x = m* - C B^T lambda does not reproduce {s}")
        parts = 0.0
        for k, b in enumerate(bnames):
            want_part = -lam[k] * Brows[k][i] * sstar[s]
            got = num(rows[s]["by_" + b])
            if got is None or abs(got - want_part) > 1e-8 * max(1.0, abs(want_part)):
                fail(f"(e) {op}: by_{b} of {s} = {rows[s].get('by_' + b)} against {want_part:.10g}")
            parts += got or 0.0
        if abs(parts - num(rows[s]["adjustmentSigma"])) > 1e-9:
            fail(f"(e) {op}: the attribution of {s} does not sum to its adjustment")

    # the excluded meter (arm f)
    for s in excluded:
        j = streams.index(s)
        off = m[s] - x[j]
        t = off / math.sqrt(sigma[s] ** 2 + S[j][j])
        if rel(num(rows[s]["offset"]), off) > 1e-9 or rel(num(rows[s]["offsetTest"]), t) > 1e-9:
            fail(f"(f) {op}: excluded {s} offset {rows[s]['offset']} / test"
                 f" {rows[s]['offsetTest']} against {off:.10g} / {t:.10g}")
    return zs


def rank_of(M):
    a = [list(r) for r in M]
    rank, R, Cn = 0, len(a), len(a[0]) if a else 0
    for c in range(Cn):
        p = next((i for i in range(rank, R) if abs(a[i][c]) > 1e-12), None)
        if p is None:
            continue
        a[rank], a[p] = a[p], a[rank]
        for i in range(R):
            if i != rank and abs(a[i][c]) > 1e-12:
                f = a[i][c] / a[rank][c]
                a[i] = [x - f * y for x, y in zip(a[i], a[rank])]
        rank += 1
    return rank


PROBES = [
    # tag, propsDict op body edits, network edit, needle in the refusal
    ("unobservable", "exclude ( F2 F3 F5 F7 );", None, "UNOBSERVABLE"),
    ("noRedundancy", "exclude ( F1 F2 F5 F6 );", None, "no balance is left"),
    ("repeatedBalance", "", ("splitter  {", "loopA { in ( F9 ); out ( F10 ); }\n"
                             "    loopB { in ( F10 ); out ( F9 ); }\n    splitter  {"),
     "not independent"),
    ("unmeteredReading", "", ("F7 { sigma 1.2 t/h; }", "F7 { }"), "a stream with no meter"),
    ("meterWithoutReading", "", ("    F8 { }\n", None), "has no reading"),
    ("driftUnknownMeter", "syntheticDrift { meter F9; size 1 t/h; }", None,
     "not a metered stream"),
    ("notMassFlow", "", ("unit    t/h;", "unit    bar;"), "not a mass-flow unit"),
    ("noAlpha", "#NOALPHA", None, "alpha"),
    ("boundBinds", "syntheticDrift { meter F6; size -30 t/h; }", None, "non-negativity binds"),
]


def probe(tmp, tag, op_extra, net_edit, needle):
    d = Path(tmp) / tag
    shutil.copytree(WITNESS, d, ignore=shutil.ignore_patterns("*.csv"))
    net = d / "constant/plant/network"
    t = net.read_text()
    if net_edit:
        old, new = net_edit
        if tag == "repeatedBalance":
            t = t.replace("    F7 { sigma 1.2 t/h; }   // recycle\n",
                          "    F7 { sigma 1.2 t/h; }   // recycle\n    F9 { }\n    F10 { }\n")
        if tag == "meterWithoutReading":
            t = t.replace("    F7 { sigma 1.2 t/h; }   // recycle\n",
                          "    F7 { sigma 1.2 t/h; }   // recycle\n    F8 { sigma 1.0 t/h; }\n")
            t = t.replace("splitter  { in ( F5 );    out ( F6 F7 ); }",
                          "splitter  { in ( F5 );    out ( F6 F7 F8 ); }")
        if tag != "meterWithoutReading":
            if old not in t:
                fail(f"(g) {tag}: the probe's edit no longer applies to the network")
                return
            t = t.replace(old, new)
        net.write_text(t)
    alpha = "" if op_extra == "#NOALPHA" else "alpha 0.05;"
    extra = "" if op_extra == "#NOALPHA" else op_extra
    (d / "system/propsDict").write_text(
        "operations\n(\n    {\n        name probe;\n        type dataReconciliation;\n"
        "        network constant/plant/network;\n        readings constant/plant/readings;\n"
        f"        {alpha}\n        {extra}\n    }}\n);\n")
    rc, out, err = run(d)
    if rc == 0 or needle not in out + err:
        fail(f"(g) {tag}: not refused by name (exit {rc}; wanted {needle!r})")


def main():
    if not BIN.exists():
        print("check_data_reconciliation: FAILED -- choupoProps is missing; build"
              " first (a check that cannot run must not pass)")
        return 1
    if not (WITNESS / "expected").exists():
        fail("the witness ships no golden")

    rc, out, err = run(WITNESS)
    if rc != 0:
        print(out[-3000:] + err[-2000:])
        print(f"check_data_reconciliation: FAILED -- the witness exits {rc}")
        return 1
    res = result_json(out)
    jres = {o["name"]: o.get("diagnostics", {}) for o in (res or {}).get("operationResults", [])}
    if set(jres) != set(OPS):
        fail(f"the witness publishes operations {sorted(jres)}, not {sorted(OPS)}")

    streams, sigma, nodes, truth = read_network()
    readings = flows_in(strip((WITNESS / "constant/plant/readings").read_text()))
    if len(streams) != 7 or len(nodes) != 4 or set(readings) != set(streams):
        fail(f"the witness network is not the 7-stream, 4-node loop this gate reads"
             f" ({len(streams)} streams, {len(nodes)} nodes, readings {sorted(readings)})")
        print(f"check_data_reconciliation: FAILED ({len(fails)} finding(s))")
        return 1

    zs = {}
    for op, (prefix, drift, excluded, prior) in OPS.items():
        zs[op] = check_op(op, prefix, drift, excluded, prior, out, streams, sigma,
                          nodes, readings, jres)

    # (f) the excluded meter's test IS its measurement test in service
    t_ex = jres.get("driftedWithout", {}).get("offsetTest_F3", math.nan)
    z_in = zs.get("drifted", {}).get("F3", math.nan)
    if abs(abs(t_ex) - abs(z_in)) > 1e-9:
        fail(f"(f) the excluded F3's offset test {t_ex} is not the measurement test"
             f" it scored in service ({z_in})")

    with tempfile.TemporaryDirectory() as tmp:
        for tag, op_extra, net_edit, needle in PROBES:
            probe(tmp, tag, op_extra, net_edit, needle)

        # (i) the EduTool's drift range, both ends, every meter
        gui = GUI_RUN.read_text()
        lo = re.search(r"export const DRIFT_MIN = (-?[0-9.]+);", gui)
        hi = re.search(r"export const DRIFT_MAX = (-?[0-9.]+);", gui)
        n_knob = 0
        if not lo or not hi:
            fail("(i) DRIFT_MIN / DRIFT_MAX are no longer declared in dataReconciliationRun.ts")
        else:
            for meter in streams:
                for size in (float(lo.group(1)), float(hi.group(1))):
                    d = Path(tmp) / f"knob_{meter}_{size:g}"
                    shutil.copytree(WITNESS, d, ignore=shutil.ignore_patterns("*.csv"))
                    body = ("        network constant/plant/network;\n"
                            "        readings constant/plant/readings;\n        alpha 0.05;\n"
                            f"        syntheticDrift {{ meter {meter}; size {size:g} t/h; }}\n")
                    (d / "system/propsDict").write_text(
                        "operations\n(\n    {\n        name kept;\n        type dataReconciliation;\n"
                        + body + "    }\n    {\n        name removed;\n        type dataReconciliation;\n"
                        + body + f"        exclude {meter};\n    }}\n);\n")
                    rc2, o2, e2 = run(d)
                    n_knob += 1
                    if rc2 != 0:
                        tail = [ln for ln in (o2 + e2).splitlines() if "fatal" in ln]
                        fail(f"(i) the page's knob at {meter} {size:g} t/h does not run: "
                             f"{tail[0][:200] if tail else 'exit ' + str(rc2)}")

    src = re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", SRC.read_text(), flags=re.S))
    if "analysis::reconcileWeightedLeastSquares(" not in src:
        fail("(h) the op no longer calls analysis::reconcileWeightedLeastSquares")
    for banned in ("activeSetQP", "QPProblem", "solver::SQP"):
        if banned in src:
            fail(f"(h) the op carries `{banned}` -- a second weighted least squares")

    if fails:
        print(f"check_data_reconciliation: FAILED ({len(fails)} finding(s))")
        return 1
    print("check_data_reconciliation: OK -- four operations recomputed by a stacked"
          " KKT solve over all seven flows (reconciled flows and the whole posterior"
          " covariance to 1e-9, unmeasured F3 included), the precision-weighted prior"
          " and its conflict, the chi-square global test against its closed form and"
          " the printed tables, the Sidak measurement test (flags exactly F3 on the"
          " drifted snapshot), the multipliers and the per-balance attribution, the"
          f" excluded meter's test equal to its in-service test ({abs(z_in):.4f}),"
          f" {len(PROBES)} refusals by name, source arm, the EduTool's drift range run"
          f" at both ends on every meter ({n_knob} runs).  NOT checked: a composition"
          " or energy balance (not built); a correlated prior (refused by"
          " construction); any real plant's data.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
