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
"""mixing_fit.py -- DEV.md 4c C331: the liquid MIXING RULES held to measured
binary-mixture data from the ThermoML archive.

  fit       the Grunberg-Nissan G_ij(T, x) = A + B/T + (C + D/T)(x_i - x_j)
            of every viscosity witness pair, least squares on
            ln(mu_measured / mu_logMoleAverage) / (x_i x_j), the old rule's
            mu computed BY THE ENGINE (choupoProps), so no pure correlation
            is transcribed here; written with its window and sources to
            data/curation/batches/mixing_c331/constant/mixingDataset.json
  validate  every rule, old and new, against every measured point, by the
            engine; prints the max / mean |relative error| per system and
            rule and stores the table in the dataset
  verify    recompute the fit and the table and compare with the dataset
            (exit 1 on any drift beyond 1e-6 relative)

Points: binary liquid blocks of the archive (two components), composition as
mole or mass fraction (a mass fraction converted with the catalogue's MW),
temperature a variable or a constraint, P absent or <= 200 kPa.  The points
are NOT stored in the tree: they are regenerated from the local archive
cache (CHOUPO_THERMOML_HOME), whose licence bifurcates
(thirdParty/thermoml/README.md); what the tree keeps is Choupo's own
regression (four numbers per pair), the window and the DOIs it came from.
"""
import collections, hashlib, json, math, os, re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import c287_new_components as c287  # noqa: E402

TOOL = "bin/curate/mixing_fit.py"
CACHE = c287.CACHE
STD = ROOT / "data" / "standards" / "components"
BIN = ROOT / "build" / "linux64Gcc" / "choupoProps"
DATASET = ROOT / "data" / "curation" / "batches" / "mixing_c331" / "constant" / "mixingDataset.json"
P_MAX_KPA = 200.0

PROPS = {"surface tension liquid-gas, n/m": "sigma", "viscosity, pa*s": "visc",
         "thermal conductivity, w/m/k": "cond"}
DIAG = {"sigma": "surface_tension", "visc": "viscosity_liquid", "cond": "k_liquid"}
V2PROP = {"sigma": ("interface", "surfaceTension"), "visc": ("liquid", "viscosity"),
          "cond": ("liquid", "thermalConductivity")}

#  The witnesses: (property, i, j, pure model, activity model).  The activity
#  model is the catalogue NRTL pair where one exists, UNIFAC otherwise (it
#  matters to Butler only).
SYSTEMS = [
    ("sigma", "water", "acetone", "StoredCorrelation", "UNIFAC"),
    ("sigma", "water", "ethanol", "StoredCorrelation", "NRTL"),
    ("sigma", "water", "ethanol", "StoredCorrelation", "UNIFAC"),
    ("sigma", "nHeptane", "toluene", "StoredCorrelation", "NRTL"),
    ("sigma", "acetone", "cyclohexane", "StoredCorrelation", "UNIFAC"),
    ("visc", "water", "ethanol", "Vogel", None),
    ("visc", "water", "methanol", "Vogel", None),
    ("visc", "ethanol", "toluene", "Vogel", None),
    ("cond", "water", "ethanol", "chemsepEq16", None),
]
RULES = {"sigma": ["moleFractionAverage", "Butler"],
         "visc": ["logMoleAverage", "GrunbergNissan"],
         "cond": ["massFractionAverage", "Filippov", "Li"]}

R_ = lambda p: re.compile(p, re.S)
RE_CON = R_(r"<Constraint>(.*?)</Constraint>")
RE_CT = R_(r"<ConstraintType>\s*<\w+>([^<]+)</\w+>")
RE_CV = R_(r"<nConstraintValue>([^<]+)</nConstraintValue>")
RE_RORG = R_(r"<RegNum>\s*<nOrgNum>(\d+)</nOrgNum>")


def identity():
    idn = json.loads((CACHE / "identity.json").read_text())
    return {n: k for k, ns in idn["byInchiKey"].items() for n in ns}


def mw(name):
    m = re.search(r"^MW\s+([0-9.eE+-]+)\s*;", (STD / (name + ".dat")).read_text(errors="replace"), re.M)
    return float(m.group(1))


def harvest(a, b, prop):
    """Every binary liquid point of `prop` for (a, b): dicts doi, T, x (of a), val."""
    inv = identity()
    ka, kb = inv[a], inv[b]
    ix = json.loads((CACHE / "index.json").read_text())
    R = c287
    out, meta = [], {}
    for e in ix["entries"]:
        keys = {c.get("inchikey") for c in e.get("compounds", [])}
        if not (ka in keys and kb in keys):
            continue
        if not any(p in " ".join(e.get("propertiesDeclared", [])).lower() for p in PROPS):
            continue
        path = CACHE / (e["doi"] + ".xml")
        if not path.exists():
            continue
        t = path.read_text(encoding="utf-8", errors="replace")
        org = {}
        for c in R.RE_CMP.findall(t):
            o, k = R.RE_ORG.search(c), R.RE_KEY.search(c)
            if o and k:
                org[o.group(1)] = k.group(1).strip()

        def tomole(kind, wa):
            if kind == "Mole fraction":
                return wa
            na, nb = wa / mw(a), (1.0 - wa) / mw(b)
            return na / (na + nb)

        for blk in R.RE_BLK.findall(t):
            cs = R.RE_COMP.findall(blk)
            if len(cs) != 2:
                continue
            if {org.get(R.RE_ORG.search(c).group(1)) for c in cs} != {ka, kb}:
                continue
            pnum = set()
            for p in R.RE_PROP.findall(blk):
                n, m = R.RE_PN.search(p), R.RE_PNUM.search(p)
                if not (n and m):
                    continue
                nm, ph = n.group(1).lower(), R.RE_PPH.findall(p)
                for k, v in PROPS.items():
                    if nm.startswith(k) and v == prop and (v == "sigma" or any("Liquid" in x for x in ph)):
                        pnum.add(m.group(1))
            if not pnum:
                continue
            vars_ = {}
            for v in R.RE_VAR.findall(blk):
                m, vt, o = R.RE_VNUM.search(v), R.RE_VT.search(v), RE_RORG.search(v)
                if m and vt:
                    vars_[m.group(1)] = (vt.group(1), org.get(o.group(1)) if o else None)
            cons, ccomp = {}, None
            for c in RE_CON.findall(blk):
                ct, cv, o = RE_CT.search(c), RE_CV.search(c), RE_RORG.search(c)
                if not (ct and cv):
                    continue
                try:
                    f = float(cv.group(1))
                except ValueError:
                    continue
                if ct.group(1) in ("Mole fraction", "Mass fraction"):
                    ccomp = (ct.group(1), org.get(o.group(1)) if o else None, f)
                else:
                    cons[ct.group(1)] = f
            for nv in R.RE_NV.findall(blk):
                vv, xa = dict(cons), None
                if ccomp:
                    xa = tomole(ccomp[0], ccomp[2] if ccomp[1] == ka else 1.0 - ccomp[2])
                for x in R.RE_VV.findall(nv):
                    m, val = R.RE_VNUM.search(x), R.RE_VVAL.search(x)
                    if not (m and val and m.group(1) in vars_):
                        continue
                    vt, ko = vars_[m.group(1)]
                    try:
                        f = float(val.group(1))
                    except ValueError:
                        continue
                    if vt in ("Mole fraction", "Mass fraction"):
                        xa = tomole(vt, f if ko == ka else 1.0 - f)
                    else:
                        vv[vt] = f
                if xa is None or "Temperature, K" not in vv:
                    continue
                if set(vv) - {"Temperature, K", "Pressure, kPa"}:
                    continue
                if vv.get("Pressure, kPa") is not None and vv["Pressure, kPa"] > P_MAX_KPA:
                    continue
                for pv in R.RE_PV.findall(nv):
                    m, val = R.RE_PNUM.search(pv), R.RE_PVAL.search(pv)
                    if m and val and m.group(1) in pnum:
                        out.append({"doi": e["doi"], "T": vv["Temperature, K"], "x": xa,
                                    "val": float(val.group(1))})
                        meta[e["doi"]] = {
                            "authors": e.get("authors", []), "year": e.get("year"),
                            "title": e.get("title"), "journal": e.get("journal"),
                            "doi": e["doi"],
                            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    #  Strictly inside (0, 1): the pure ends test the pure correlation, not
    #  the mixing rule.
    out = [p for p in out if 1e-9 < p["x"] < 1 - 1e-9 and p["val"] > 0]
    out.sort(key=lambda p: (p["doi"], p["T"], p["x"]))
    return out, meta


def thermo_text(i, j, act):
    act = act or "ideal"
    return ("recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
            f"components ( {i} {j} );\n"
            "equilibrium { formulation gammaPhi;"
            f" liquid {{ activityModel {{ model {act}; }} }}"
            " vapour { fugacityModel idealGas; } }\n")


def transport_block(prop, model, rule, pair=None):
    ph, pr = V2PROP[prop]
    inter = ""
    if pair:
        inter = (" interaction ( {{ i {i}; j {j}; A {A!r}; B {B!r}; C {C!r}; D {D!r};"
                 " Tmin {Tmin!r}; Tmax {Tmax!r}; source \"{src}\"; }} );").format(**pair)
    return (f"transport {{ {ph} {{ {pr} {{ model {model}; mixingRule {rule};{inter} }} }} }}")


def run_points(prop, i, j, model, act, rule, pts, pair=None):
    """The engine's value at every point, one choupoProps run."""
    with tempfile.TemporaryDirectory() as td:
        case = Path(td)
        (case / "constant").mkdir()
        (case / "system").mkdir()
        (case / "constant" / "thermoPhysPropDict").write_text(thermo_text(i, j, act))
        (case / "system" / "controlDict").write_text(
            "application choupoProps;\ndescription \"C331 mixing-rule validation\";\nverbosity 1;\n")
        ops = []
        for k, p in enumerate(pts):
            ops.append("{ name p%d; type propertyPoint; state { T %r K; P 1 bar; composition { %s %r; %s %r; } }"
                       " thermo { %s } properties ( %s ); }"
                       % (k, p["T"], i, p["x"], j, 1.0 - p["x"], transport_block(prop, model, rule, pair),
                          DIAG[prop]))
        (case / "system" / "propsDict").write_text("operations\n(\n" + "\n".join(ops) + "\n);\n")
        r = subprocess.run([str(BIN), str(case)], capture_output=True, text=True, timeout=1800, cwd=str(ROOT),
                           env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
        m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>", r.stdout, re.S)
        if r.returncode != 0 or not m:
            raise SystemExit(f"{TOOL}: choupoProps failed on {prop} {i}-{j} {rule} (exit {r.returncode})\n"
                             + (r.stdout + r.stderr)[-1500:])
        js = json.loads(m.group(1))
        d = {o["name"]: o.get("diagnostics", {}) for o in js.get("operationResults", [])}
        return [d["p%d" % k][DIAG[prop]] for k in range(len(pts))]


def lsq(rows):
    n = len(rows[0][0])
    M = [[sum(r[0][a] * r[0][b] for r in rows) for b in range(n)]
         + [sum(r[0][a] * r[1] for r in rows)] for a in range(n)]
    for a in range(n):
        piv = max(range(a, n), key=lambda q: abs(M[q][a]))
        M[a], M[piv] = M[piv], M[a]
        for b in range(a + 1, n + 1)[::-1]:
            M[a][b] /= M[a][a]
        M[a][a] = 1.0
        for q in range(n):
            if q != a and M[q][a] != 0.0:
                f = M[q][a]
                for b in range(a, n + 1):
                    M[q][b] -= f * M[a][b]
    return [M[a][n] for a in range(n)]


def sources_text(meta):
    out = []
    for doi in sorted(meta):
        m = meta[doi]
        out.append({"doi": doi, "authors": m["authors"], "year": m["year"], "title": m["title"],
                    "journal": m["journal"], "archiveFileSha256": m["sha256"]})
    return out


def stats(pred, pts):
    e = [abs(v / p["val"] - 1.0) * 100.0 for v, p in zip(pred, pts)]
    return {"maxPct": round(max(e), 4), "meanPct": round(sum(e) / len(e), 4)}


def compute():
    data = {"tool": TOOL, "commission": "DEV.md 4c C331",
            "note": ("Choupo's own regressions and validation statistics; the measured points are"
                     " regenerated from the ThermoML archive cache by this tool and are not stored."),
            "pairs": [], "validation": []}
    fitted = {}
    for prop, i, j, model, act, in [s[:5] for s in SYSTEMS]:
        if prop != "visc" or (i, j) in fitted:
            continue
        pts, meta = harvest(i, j, prop)
        old = run_points(prop, i, j, model, act, "logMoleAverage", pts)
        rows = []
        for p, mu0 in zip(pts, old):
            xi, xj = p["x"], 1.0 - p["x"]
            f = xi * xj
            rows.append(([f, f / p["T"], f * (xi - xj), f * (xi - xj) / p["T"]],
                         math.log(p["val"] / mu0)))
        A, B, C, D = lsq(rows)
        pair = {"i": i, "j": j, "A": float("%.6g" % A), "B": float("%.6g" % B),
                "C": float("%.6g" % C), "D": float("%.6g" % D),
                "Tmin": min(p["T"] for p in pts), "Tmax": max(p["T"] for p in pts),
                "nPoints": len(pts), "nLaboratories": len(meta),
                "src": "C331 fit to %d points, %d laboratories (ThermoML archive; DOIs in"
                       " data/curation/batches/mixing_c331/constant/mixingDataset.json)" % (len(pts), len(meta)),
                "method": "least squares on ln(mu_meas/mu_logMoleAverage) = x_i x_j G_ij(T, x); in-sample",
                "sources": sources_text(meta)}
        fitted[(i, j)] = pair
        data["pairs"].append(pair)
    for prop, i, j, model, act in SYSTEMS:
        pts, meta = harvest(i, j, prop)
        row = {"property": prop, "i": i, "j": j, "pureModel": model, "activityModel": act,
               "nPoints": len(pts), "nLaboratories": len(meta),
               "Tmin": min(p["T"] for p in pts), "Tmax": max(p["T"] for p in pts),
               "rules": {}, "sources": sources_text(meta)}
        for rule in RULES[prop]:
            pair = fitted.get((i, j)) if rule == "GrunbergNissan" else None
            pred = run_points(prop, i, j, model, act, rule, pts, pair)
            row["rules"][rule] = stats(pred, pts)
        data["validation"].append(row)
    return data


def table(data):
    lines = ["%-6s %-22s %-7s %4s %3s  %s" % ("prop", "system", "gamma", "n", "lab", "rule: max% / mean%")]
    for r in data["validation"]:
        rs = "  ".join("%s %.1f/%.1f" % (k, v["maxPct"], v["meanPct"]) for k, v in r["rules"].items())
        lines.append("%-6s %-22s %-7s %4d %3d  %s" % (r["property"], r["i"] + "-" + r["j"],
                                                      r["activityModel"] or "-", r["nPoints"],
                                                      r["nLaboratories"], rs))
    return "\n".join(lines)


def same(a, b, tol=1e-6):
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k], tol) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y, tol) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) <= tol * max(1.0, abs(a), abs(b))
    return a == b


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "validate"
    if not BIN.exists():
        print(f"{TOOL}: no choupoProps binary at {BIN} -- run `make all`")
        return 1
    if not (CACHE / "index.json").exists():
        print(f"{TOOL}: no ThermoML archive cache at {CACHE} (CHOUPO_THERMOML_HOME)")
        return 1
    data = compute()
    print(table(data))
    for p in data["pairs"]:
        print("G(%s,%s) = %g + %g/T + (%g + %g/T)(x_i - x_j), %g-%g K, %d points, %d labs"
              % (p["i"], p["j"], p["A"], p["B"], p["C"], p["D"], p["Tmin"], p["Tmax"],
                 p["nPoints"], p["nLaboratories"]))
    if cmd in ("fit", "validate"):
        DATASET.parent.mkdir(parents=True, exist_ok=True)
        DATASET.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
        print(f"written {DATASET.relative_to(ROOT)}")
        return 0
    if cmd == "verify":
        old = json.loads(DATASET.read_text())
        if not same(old, data):
            print(f"{TOOL} verify: FAILED -- the dataset no longer reproduces from the archive")
            return 1
        print(f"{TOOL} verify: PASS")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
