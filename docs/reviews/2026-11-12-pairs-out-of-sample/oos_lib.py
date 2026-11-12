"""oos_lib.py -- shared readers and the INDEPENDENT activity kernels of the
review 2026-11-12-pairs-out-of-sample.

The kernels below are written from the published equations, NOT from the
engine source:
  NRTL    Renon & Prausnitz, AIChE J. 14 (1968) 135:
          ln g_i = sum_j tau_ji G_ji x_j / sum_k G_ki x_k
                 + sum_j x_j G_ij / sum_k G_kj x_k (tau_ij - sum_m x_m tau_mj G_mj / sum_k G_kj x_k)
          G_ij = exp(-alpha tau_ij).
  Wilson  Wilson, JACS 86 (1964) 127:
          ln g_i = 1 - ln(sum_j x_j L_ij) - sum_k x_k L_ki / sum_j x_j L_kj,
          L_ij = (V_j/V_i) exp(-A_ij / RT).
  UNIQUAC Abrams & Prausnitz, AIChE J. 21 (1975) 116, z = 10:
          ln g_i^C = ln(phi_i/x_i) + z/2 q_i ln(theta_i/phi_i) + l_i - phi_i/x_i sum_j x_j l_j
          ln g_i^R = q_i (1 - ln sum_j theta_j tau_ji - sum_j theta_j tau_ij / sum_k theta_k tau_kj)
          tau_ij = exp(-(a_ij + b_ij T + c_ij T^2)/T).
What is taken FROM the records is only the mapping of the record's keys to the
symbols: which index the record's a_ij belongs to (the record says
`i <name>; j <name>;` and the README of each model's header says
tau_ij = a_ij + b_ij/T for NRTL, A_ij in J/mol for Wilson, a_ij in K for
UNIQUAC).  The REPORT cites the engine lines that read them.
"""
import math
import os
import re
from pathlib import Path

R = 8.314462618   # J/(mol K), CODATA 2018 (the engine's constant::R is checked against this in verify)


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def block(t, name):
    """Text of the first `name { ... }` block (balanced braces)."""
    m = re.search(r"(^|\s)" + re.escape(name) + r"\s*\{", t)
    if not m:
        return None
    i = m.end()
    depth = 1
    j = i
    while j < len(t) and depth:
        if t[j] == "{":
            depth += 1
        elif t[j] == "}":
            depth -= 1
        j += 1
    return t[i:j - 1]


def num(t, key):
    if t is None:
        return None
    m = re.search(r"(^|[\s{;])" + re.escape(key) + r"\s+([-+0-9.eE]+)\s*[A-Za-z/_]*\s*;", t)
    return float(m.group(2)) if m else None


def word(t, key):
    if t is None:
        return None
    m = re.search(r"(^|[\s{;])" + re.escape(key) + r"\s+([^;\s]+)\s*;", t)
    return m.group(2).strip('"') if m else None


def read_record(path):
    raw = Path(path).read_text()
    t = strip_comments(raw)
    model = word(t, "model")
    p = block(t, "parameters")
    rec = {"path": str(path), "model": model, "i": word(p, "i"), "j": word(p, "j")}
    if model == "NRTL":
        for k in ("a_ij", "b_ij", "a_ji", "b_ji", "alpha"):
            rec[k] = num(p, k) or 0.0
    elif model == "Wilson":
        for k in ("A_ij", "A_ji"):
            rec[k] = num(p, k) or 0.0
    elif model == "UNIQUAC":
        for k in ("a_ij", "b_ij", "c_ij", "a_ji", "b_ji", "c_ji"):
            rec[k] = num(p, k) or 0.0
    prov = block(t, "provenance") or ""
    rec["reviewStatus"] = word(prov, "reviewStatus")
    rec["fitGrade"] = word(prov, "fitGrade") or "none"
    cap = re.search(r"fitGradeCap\s*\(([^)]*)\)", prov)
    rec["caps"] = cap.group(1).split() if cap else []
    rec["fitGradeMax_K"] = num(prov, "fitGradeMaxTemperatureError_K")
    rec["fittedInCase"] = word(prov, "fittedInCase")
    rec["dois"] = sorted(set(re.findall(r'doi\s+"([^"]+)"', t)))
    v = block(prov, "validity") or block(t, "validity")
    tv = block(v, "temperature") if v else None
    rec["Tmin"] = num(tv, "min")
    rec["Tmax"] = num(tv, "max")
    cur = block(t, "curation")
    rec["inSampleGrade"] = word(cur, "grade") if cur else None
    rule = re.search(r'rule\s+"([^"]*)"', cur or "")
    rr = rule.group(1) if rule else ""
    rec["pipeline"] = ("bubbleP" if "C291" in rr else "bubbleT" if "C283" in rr
                       else "literature" if rec["reviewStatus"] not in ("autoPromoted", "interim") else "earlyCase")
    rec["citation"] = word(prov, "citation") or ""
    return rec


def read_records(root, model):
    d = Path(root) / "data" / "standards" / "parameters" / model
    return [read_record(f) for f in sorted(d.glob("*.dat"))]


_COMP = {}


def comp(root, name):
    """Vliq [m3/mol], UNIQUAC r and q, Tc [K] of a catalogue component."""
    if name in _COMP:
        return _COMP[name]
    f = Path(root) / "data" / "standards" / "components" / (name + ".dat")
    t = strip_comments(f.read_text()) if f.exists() else ""
    u = block(t, "uniquac")
    c = {"Vliq": num(t, "Vliq"), "r": num(u, "r") if u else None,
         "q": num(u, "q") if u else None, "Tc": num(t, "Tc"), "exists": f.exists()}
    _COMP[name] = c
    return c


# ------------------------------------------------------------ kernels
def nrtl(x, T, tau_fn, alpha):
    n = len(x)
    tau = [[0.0 if i == j else tau_fn(i, j, T) for j in range(n)] for i in range(n)]
    G = [[1.0 if i == j else math.exp(-alpha[i][j] * tau[i][j]) for j in range(n)] for i in range(n)]
    S = [sum(G[k][j] * x[k] for k in range(n)) for j in range(n)]
    C = [sum(x[k] * tau[k][j] * G[k][j] for k in range(n)) for j in range(n)]
    out = []
    for i in range(n):
        a = C[i] / S[i]
        b = sum(x[j] * G[i][j] / S[j] * (tau[i][j] - C[j] / S[j]) for j in range(n))
        out.append(a + b)
    return out   # ln gamma


def wilson(x, T, A, V):
    n = len(x)
    L = [[1.0 if i == j else V[j] / V[i] * math.exp(-A[i][j] / (R * T)) for j in range(n)] for i in range(n)]
    S = [sum(x[j] * L[i][j] for j in range(n)) for i in range(n)]
    return [1.0 - math.log(S[i]) - sum(x[k] * L[k][i] / S[k] for k in range(n)) for i in range(n)]


def uniquac(x, T, a, b, c, r, q, z=10.0):
    n = len(x)
    tau = [[1.0 if i == j else math.exp(-(a[i][j] + b[i][j] * T + c[i][j] * T * T) / T)
            for j in range(n)] for i in range(n)]
    sr = sum(r[k] * x[k] for k in range(n))
    sq = sum(q[k] * x[k] for k in range(n))
    th = [q[k] * x[k] / sq for k in range(n)]
    l = [z / 2 * (r[k] - q[k]) - (r[k] - 1) for k in range(n)]
    sxl = sum(x[k] * l[k] for k in range(n))
    out = []
    for i in range(n):
        pox = r[i] / sr                         # phi_i / x_i, finite at x_i = 0
        top = (q[i] / sq) / (r[i] / sr)         # theta_i / phi_i
        lc = math.log(pox) + z / 2 * q[i] * math.log(top) + l[i] - pox * sxl
        s1 = sum(th[j] * tau[j][i] for j in range(n))
        s2 = sum(th[j] * tau[i][j] / sum(th[k] * tau[k][j] for k in range(n)) for j in range(n))
        out.append(lc + q[i] * (1 - math.log(s1) - s2))
    return out


def model_for(recs, names, root, swap=False):
    """A callable lngamma(x, T) for the mixture `names` built from the
    records `recs` ({frozenset(pair): record}).  swap=True exchanges each
    record's ij and ji parameters (the NEGATIVE control)."""
    n = len(names)
    idx = {nm: k for k, nm in enumerate(names)}
    model = next(iter(recs.values()))["model"]
    P = {}
    for rec in recs.values():
        i, j = idx[rec["i"]], idx[rec["j"]]
        if model == "NRTL":
            ij = (rec["a_ij"], rec["b_ij"]); ji = (rec["a_ji"], rec["b_ji"])
            if swap:
                ij, ji = ji, ij
            P[(i, j)] = ij + (rec["alpha"],); P[(j, i)] = ji + (rec["alpha"],)
        elif model == "Wilson":
            ij, ji = rec["A_ij"], rec["A_ji"]
            if swap:
                ij, ji = ji, ij
            P[(i, j)] = ij; P[(j, i)] = ji
        else:
            ij = (rec["a_ij"], rec["b_ij"], rec["c_ij"]); ji = (rec["a_ji"], rec["b_ji"], rec["c_ji"])
            if swap:
                ij, ji = ji, ij
            P[(i, j)] = ij; P[(j, i)] = ji
    if model == "NRTL":
        alpha = [[P[(i, j)][2] if (i, j) in P else 0.3 for j in range(n)] for i in range(n)]
        tf = lambda i, j, T: P[(i, j)][0] + P[(i, j)][1] / T if (i, j) in P else 0.0
        return lambda x, T: nrtl(x, T, tf, alpha)
    if model == "Wilson":
        V = [comp(root, nm)["Vliq"] for nm in names]
        A = [[P.get((i, j), 0.0) for j in range(n)] for i in range(n)]
        return lambda x, T: wilson(x, T, A, V)
    r = [comp(root, nm)["r"] for nm in names]
    q = [comp(root, nm)["q"] for nm in names]
    a = [[P.get((i, j), (0, 0, 0))[0] for j in range(n)] for i in range(n)]
    b = [[P.get((i, j), (0, 0, 0))[1] for j in range(n)] for i in range(n)]
    c = [[P.get((i, j), (0, 0, 0))[2] for j in range(n)] for i in range(n)]
    return lambda x, T: uniquac(x, T, a, b, c, r, q)


# ------------------------------------------------------------ the engine route
import json as _json
import shutil as _shutil
import subprocess as _sp


def op_gamma(name, T, names, comp):
    cs = " ".join(f"{n} {comp.get(n, 0.0)!r};" for n in names)
    return f"    {{ name {name}; type activityCoefficients; temperature {T!r}; composition {{ {cs} }} }}"


def op_grid(name, T0, T1, n, P, names, comp, props):
    cs = " ".join(f"{nm} {comp.get(nm, 0.0)!r};" for nm in names)
    return (f"    {{ name {name}; type propertyScan1D; vary {{ variable T; from {T0!r} K; to {T1!r} K; n {n}; }} "
            f"state {{ P {P!r} Pa; composition {{ {cs} }} }} properties ( {' '.join(props)} ); "
            f"output {{ file {name}.csv; }} }}")


def op_scan(name, T, P, names, comp, props):
    """One state through propertyScan1D (n 2 on T, the first row is the
    state; the scan evaluates only the keys asked, so a component with no
    formation datum does not stop it as propertyPoint does)."""
    cs = " ".join(f"{n} {comp.get(n, 0.0)!r};" for n in names)
    return (f"    {{ name {name}; type propertyScan1D; vary {{ variable T; from {T!r} K; to {T + 1.0!r} K; n 2; }} "
            f"state {{ P {P!r} Pa; composition {{ {cs} }} }} properties ( {' '.join(props)} ); "
            f"output {{ file {name}.csv; }} }}")


def run_engine(root, workdir, tag, model, names, ops):
    """Run choupoProps on a scratch case: components `names`, activity model
    `model` read from the catalogue, the operations `ops` (op_gamma /
    op_scan texts).  Returns (diagnostics by op name, first CSV row by op
    name, parsed result JSON or None, console text, exit code)."""
    case = Path(workdir) / tag
    if case.exists():
        _shutil.rmtree(case)
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / (tag + ".cho")).write_text("")
    (case / "system" / "controlDict").write_text(
        'application choupoProps;\ndescription "review 2026-11-12-pairs-out-of-sample probe";\nverbosity 1;\n')
    (case / "constant" / "thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        f"components ( {' '.join(names)} );\n"
        "equilibrium\n{\n    formulation gammaPhi;\n"
        f"    liquid {{ activityModel {{ model {model}; }} }}\n"
        "    vapour { fugacityModel idealGas; }\n}\n")
    (case / "system" / "propsDict").write_text("operations\n(\n" + "\n".join(ops) + "\n);\n")
    env = dict(os.environ, CHOUPO_HOME=str(root))
    r = _sp.run([str(Path(root) / "choupoProps"), str(case)], capture_output=True, text=True, env=env)
    out = r.stdout
    res = None
    if "<<<Choupo:result-begin>>>" in out:
        js = out.split("<<<Choupo:result-begin>>>", 1)[1].split("<<<Choupo:result-end>>>", 1)[0]
        try:
            res = _json.loads(js)
        except ValueError:
            res = None
    diags = {}
    if res:
        for o in res.get("operationResults", []):
            diags[o["name"]] = o.get("diagnostics") or {}
    rows = {}
    for f in case.glob("*.csv"):
        lines = f.read_text().splitlines()
        if len(lines) >= 2:
            hdr = lines[0].split(",")
            allr = []
            for ln in lines[1:]:
                row = {}
                for h, v in zip(hdr, ln.split(",")):
                    try:
                        row[h] = float(v)
                    except ValueError:
                        row[h] = float("nan")
                allr.append(row)
            rows[f.stem] = allr   # every row; op_scan's state is rows[name][0]
    return diags, rows, res, out + r.stderr, r.returncode
