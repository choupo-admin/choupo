#!/usr/bin/env python3
"""Collect the probe runs into the review's .tsv tables.

Usage: collect.py <repo_root> <cases_dir> <review_dir>

Every number written here is READ from an engine output (a CSV the op wrote,
or the result JSON block the binary printed), except the columns explicitly
named *_ref (the independent standard-library implementation,
pitzer_davies_ref.py) and the measured tables (read from the repository's own
curation datasets, never typed).
"""
import csv
import glob
import json
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_cases as G                       # noqa: E402
import pitzer_davies_ref as REF            # noqa: E402

MW_W = 18.015e-3   # the speciation solver's a_w constant (SpeciationSolver.cpp)


def result_json(case):
    txt = open(os.path.join(case, "log"), encoding="utf-8", errors="replace").read()
    if "<<<Choupo:result-begin>>>" not in txt:
        return None
    body = txt.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0]
    return json.loads(body)


def ops_by_name(case):
    j = result_json(case)
    if j is None:
        return {}
    return {o["name"]: o.get("diagnostics", {}) for o in j["operationResults"]}


def kernel_csv(path):
    """first data row of a pitzerActivity / electrolyteActivity CSV."""
    with open(path) as f:
        r = list(csv.DictReader(f))[0]
    return float(r["gamma_pm"]), float(r["phi"])


def speciate_point(case, s, T, m):
    c, a, zc, za, _ = G.SALTS[s]
    name = G.tag(s, T, m).replace(".", "p")
    d = ops_by_name(case).get(name)
    if d is None:
        return None
    path = os.path.join(case, G.tag(s, T, m) + ".csv")
    sumM = 0.0
    with open(path) as f:
        for r in csv.DictReader(f):
            sumM += float(r["molality"])
    g = d[f"gamma_pm_{c}_{a}"]
    phi = -math.log(d["aw"]) / (MW_W * sumM)
    return g, phi, d["I"]


def model_values(cases):
    """{model: {(salt,T,m): (gamma, phi)}}"""
    out = {k: {} for k in ("pitzer_ss", "pitzer_pkg", "eNRTL_pkg", "pitzerHMW", "davies")}
    for (s, T, m) in G.points():
        t = G.tag(s, T, m) + ".csv"
        p = os.path.join(cases, "ss_pitzer", t)
        if os.path.exists(p):
            out["pitzer_ss"][(s, T, m)] = kernel_csv(p)
        for mod, key in (("Pitzer", "pitzer_pkg"), ("eNRTL", "eNRTL_pkg")):
            p = os.path.join(cases, f"pkg_{mod}_{s}", t)
            if os.path.exists(p):
                out[key][(s, T, m)] = kernel_csv(p)
        for mod, key in (("hmw", "pitzerHMW"), ("davies", "davies")):
            v = speciate_point(os.path.join(cases, mod), s, T, m)
            if v:
                out[key][(s, T, m)] = v[:2]
    return out


def rel(a, b):
    return abs(a - b) / abs(b)


def w(path, header, rows):
    with open(path, "w") as f:
        f.write("\t".join(header) + "\n")
        for r in rows:
            f.write("\t".join(x if isinstance(x, str) else f"{x:.6g}" for x in r) + "\n")


def band(m, I):
    return "m<0.1" if m < 0.1 - 1e-12 else ("0.1<=m<=1" if m <= 1.0 + 1e-12 else "1<m<=6")


def main():
    repo, cases, rev = sys.argv[1:4]
    G.REPO = repo
    V = model_values(cases)

    # ---- item 1: single-salt Pitzer vs pitzerHMW vs package Pitzer ----------
    rows, summ = [], {}
    for k in sorted(V["pitzer_ss"]):
        s, T, m = k
        gs, ps = V["pitzer_ss"][k]
        gh, ph = V["pitzerHMW"].get(k, (float("nan"),) * 2)
        gp, pp = V["pitzer_pkg"].get(k, (float("nan"),) * 2)
        dlg = abs(math.log(gh) - math.log(gs))
        dph = abs(ph - ps)
        dpk = max(abs(gp - gs), abs(pp - ps))
        rows.append((s, f"{T:g}", m, gs, gh, dlg, ps, ph, dph, dpk))
        a = summ.setdefault((s, T), [0, 0, 0])
        a[0] = max(a[0], dlg); a[1] = max(a[1], dph); a[2] = max(a[2], dpk)
    w(f"{rev}/item1_pitzer_single_vs_hmw.tsv",
      ["salt", "T_K", "m", "gpm_single", "gpm_HMW", "abs_dln_gpm", "phi_single",
       "phi_HMW", "abs_dphi", "max_abs_d_package_vs_single"], rows)
    w(f"{rev}/item1_summary.tsv",
      ["salt", "T_K", "max_abs_dln_gpm_HMW_vs_single", "max_abs_dphi_HMW_vs_single",
       "max_abs_d_package_vs_single"],
      [(s, f"{T:g}", *v) for (s, T), v in sorted(summ.items())])

    # ---- item 2: eNRTL single vs multi -------------------------------------
    # (a) engine op (1-1 only): pure endpoints vs the package eNRTL route
    rows = []
    msd = ops_by_name(os.path.join(cases, "ms_enrtl"))
    for m in G.grid(4.5):
        d = msd.get(f"ms_m{str(m).replace('.', 'p')}")
        if not d:
            continue
        for salt, key in (("NaCl", "gamma1_pure"), ("KCl", "gamma2_pure")):
            gp = V["eNRTL_pkg"].get((salt, 298.15, m))
            if gp:
                rows.append((salt, m, d[key], gp[0], abs(math.log(d[key]) - math.log(gp[0])),
                             d["reduction_pin_dev"]))
    w(f"{rev}/item2a_enrtl_multisalt_op_vs_package.tsv",
      ["salt", "m", "gpm_multisalt_op", "gpm_package_eNRTL", "abs_dln_gpm",
       "op_reduction_pin_dev"], rows)
    # (b) kernel probe: every charge type (the op refuses non 1-1)
    probe = os.path.join(cases, "enrtl_probe")
    rows = []
    for s in ("NaCl", "KCl", "CaCl2", "Na2SO4"):
        c, a, zc, za, mmax = G.SALTS[s]
        rec = open(f"{repo}/data/standards/parameters/eNRTL/{c}-{a}.dat").read()
        import re
        t1 = re.search(r"tau_m_ca\s+([-0-9.eE]+)", rec).group(1)
        t2 = re.search(r"tau_ca_m\s+([-0-9.eE]+)", rec).group(1)
        al = re.search(r"alpha\s+([-0-9.eE]+)", rec)
        al = al.group(1) if al else "0.2"
        out = subprocess.run([probe, "salt", str(zc), str(za), t1, t2, al]
                             + [str(m) for m in G.grid(mmax)],
                             capture_output=True, text=True, check=True).stdout
        for line in out.strip().splitlines()[1:]:
            m, l1, l2, l3, p1, p2 = map(float, line.split("\t"))
            rows.append((s, m, l1, abs(l2 - l1), abs(l3 - l1), p1, abs(p2 - p1)))
    w(f"{rev}/item2b_enrtl_single_vs_multi_kernel.tsv",
      ["salt", "m", "lnGpm_single", "abs_d_multi_published", "abs_d_multi_consistent",
       "phi_single", "abs_d_phi_multi"], rows)

    # ---- item 3: every family against the measured tables ------------------
    rows, raw = [], []
    meas = {}
    for s in G.DATASETS:
        for (m, g, p) in G.read_table(repo, s):
            meas[(s, 298.15, m)] = (g, p)
    for T, tab in G.read_archer(repo).items():
        for (m, g, p) in tab:
            meas[("NaCl", T, m)] = (g, p)
    acc = {}
    for mod in ("pitzer_ss", "pitzerHMW", "eNRTL_pkg", "davies"):
        for k, (gm, pm) in sorted(meas.items()):
            v = V[mod].get(k)
            if not v:
                continue
            s, T, m = k
            eg = 100 * (v[0] - gm) / gm
            ep = 100 * (v[1] - pm) / pm
            raw.append((mod, s, f"{T:g}", m, gm, v[0], eg, pm, v[1], ep))
            src = "Archer1992" if T != 298.15 else "curationTable"
            b = band(m, None)
            a = acc.setdefault((mod, s, f"{T:g}", src, b), [0, 0.0, 0.0, 0.0, 0.0])
            a[0] += 1; a[1] += abs(eg); a[2] += abs(ep)
            a[3] = max(a[3], abs(eg)); a[4] = max(a[4], abs(ep))
    w(f"{rev}/item3_vs_measured_points.tsv",
      ["model", "salt", "T_K", "m", "gamma_meas", "gamma_model", "err_gamma_pct",
       "phi_meas", "phi_model", "err_phi_pct"], raw)
    for (mod, s, T, src, b), a in sorted(acc.items()):
        rows.append((mod, s, T, src, b, str(a[0]), a[1] / a[0], a[3], a[2] / a[0], a[4]))
    w(f"{rev}/item3_vs_measured_bands.tsv",
      ["model", "salt", "T_K", "dataset", "band", "n", "AAD_gamma_pct", "max_gamma_pct",
       "AAD_phi_pct", "max_phi_pct"], rows)

    # ---- item 3b: Davies with the full ion-association network --------------
    rows = []
    dfull = os.path.join(cases, "davies_full")
    dd = ops_by_name(dfull)
    for k, (gm, pm) in sorted(meas.items()):
        s, T, m = k
        name = G.tag(s, T, m).replace(".", "p")
        if T != 298.15 or name not in dd:
            continue
        c, a, zc, za, _ = G.SALTS[s]
        nc, na = G.nu(zc, za)
        r = {x["species"]: x for x in csv.DictReader(open(os.path.join(dfull, G.tag(s, T, m) + ".csv")))}
        ac, aa = float(r[c]["activity"]), float(r[a]["activity"])
        g = (ac ** nc * aa ** na / ((nc * m) ** nc * (na * m) ** na)) ** (1.0 / (nc + na))
        phi = -math.log(dd[name]["aw"]) / (MW_W * (nc + na) * m)
        gr = V["davies"].get(k, (float("nan"),))[0]
        rows.append((s, m, dd[name]["I"], gm, g, 100 * (g - gm) / gm, 100 * (gr - gm) / gm,
                     pm, phi, 100 * (phi - pm) / pm))
    w(f"{rev}/item3b_davies_with_ion_pairs.tsv",
      ["salt", "m", "I_solved", "gamma_meas", "gpm_stoich_davies_fullNetwork",
       "err_gamma_pct_fullNetwork", "err_gamma_pct_restrictedNetwork", "phi_meas",
       "phi_stoich_davies_fullNetwork", "err_phi_pct_fullNetwork"], rows)

    # ---- item 4: independent Python vs the engine --------------------------
    rows = []
    for s in ("NaCl", "CaCl2", "Na2SO4", "MgSO4"):
        c, a, zc, za, mmax = G.SALTS[s]
        p = REF.read_pair(repo, c, a)
        for m in G.grid(mmax):
            k = (s, 298.15, m)
            lng, phi = REF.pitzer(m, zc, za, p["beta0"], p["beta1"], p.get("beta2", 0.0),
                                  p["Cphi"], p.get("alpha1", 2.0), p.get("alpha2", 12.0))
            gd = REF.davies_mean(m, zc, za)
            es = V["pitzer_ss"].get(k); eh = V["pitzerHMW"].get(k); ed = V["davies"].get(k)
            # Davies again, at the ionic strength the ENGINE solved (which
            # includes the trace H+/OH- of the given pH): separates the model
            # from the speciation state.
            Ie = speciate_point(os.path.join(cases, "davies"), s, 298.15, m)[2]
            sI = math.sqrt(Ie); f = sI / (1 + sI) - 0.3 * Ie
            nc, na = G.nu(zc, za)
            gdI = 10 ** ((nc * -0.51 * zc * zc * f + na * -0.51 * za * za * f) / (nc + na))
            rows.append((s, m, math.exp(lng), abs(math.log(es[0]) - lng), abs(es[1] - phi),
                         abs(math.log(eh[0]) - lng), abs(eh[1] - phi),
                         gd, abs(math.log(ed[0]) - math.log(gd)),
                         abs(math.log(ed[0]) - math.log(gdI))))
    w(f"{rev}/item4_independent_reference.tsv",
      ["salt", "m", "gpm_pitzer_ref", "abs_dln_engine_single", "abs_dphi_engine_single",
       "abs_dln_engine_HMW", "abs_dphi_engine_HMW", "gpm_davies_ref",
       "abs_dln_engine_davies", "abs_dln_engine_davies_at_engine_I"], rows)

    # ---- model-vs-model at 25 C for MgSO4 (no measured table in the tree) ---
    rows = []
    for k in sorted(V["pitzer_ss"]):
        s, T, m = k
        if T != 298.15:
            continue
        r = [s, m, V["pitzer_ss"][k][0]]
        for mod in ("pitzerHMW", "eNRTL_pkg", "davies"):
            v = V[mod].get(k)
            r += [v[0] if v else float("nan")]
        r += [V["pitzer_ss"][k][1]]
        for mod in ("pitzerHMW", "eNRTL_pkg", "davies"):
            v = V[mod].get(k)
            r += [v[1] if v else float("nan")]
        rows.append(tuple(r))
    hot = []
    for k in sorted(V["pitzer_ss"]):
        s, T, m = k
        if T != 373.15:
            continue
        r = [s, f"{T:g}", m]
        for mod in ("pitzer_ss", "pitzerHMW", "eNRTL_pkg"):
            v = V[mod].get(k)
            r += [v[0] if v else float("nan"), v[1] if v else float("nan")]
        hot.append(tuple(r))
    w(f"{rev}/item3_model_vs_model_373K.tsv",
      ["salt", "T_K", "m", "gpm_pitzer", "phi_pitzer", "gpm_HMW", "phi_HMW",
       "gpm_eNRTL", "phi_eNRTL"], hot)
    w(f"{rev}/item3_model_vs_model_25C.tsv",
      ["salt", "m", "gpm_pitzer", "gpm_HMW", "gpm_eNRTL", "gpm_davies",
       "phi_pitzer", "phi_HMW", "phi_eNRTL", "phi_davies"], rows)


if __name__ == "__main__":
    main()
