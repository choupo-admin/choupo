#!/usr/bin/env python3
"""gamma_inf.py ROOT ARCHIVE_DIR SCAN_JSON WORKDIR OUTDIR

Part (A) of the review 2026-11-12-pairs-out-of-sample: the catalogue's
binary pairs (NRTL, UNIQUAC, Wilson) predicting the infinite-dilution
activity coefficients of the ThermoML archive that were NOT among the
record's own evidence.  Nothing is fitted.

SCAN_JSON is scan_archive.py's output (scratch: it holds measured points).
Writes OUTDIR/pairs.tsv (statistics per pair and model, no measured point),
OUTDIR/articles.tsv (statistics per pair, model and article),
OUTDIR/gamma_census.tsv (every exclusion rule and the blocks it removed),
OUTDIR/noise_floor.tsv (inter-laboratory disagreement, statistics only) and
prints the summary numbers.  The per-point table, which carries the measured
values, is written to WORKDIR/points.tsv only (scratch, never committed).
"""
import json
import math
import statistics as st
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import oos_lib as L  # noqa: E402

MODELS = ("NRTL", "UNIQUAC", "Wilson")
RAOULT = {"Pure compound", "Pure liquid solute", ""}
ASSOC_WORDS = ("water", "ol", "acid", "amine", "aniline", "phenol", "glycol", "formamide",
               "acetamide", "Pyrrolidone")


def assoc(name):
    n = name.lower()
    return any(w.lower() in n for w in ASSOC_WORDS) or n.endswith("ol")


def pctl(v, p):
    v = sorted(v)
    if not v:
        return float("nan")
    k = (len(v) - 1) * p
    lo = math.floor(k)
    hi = math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def census(root, scan, ident):
    """Every gamma block -> accepted points or the rule that removed it."""
    rules = Counter()
    pts = []
    for art in scan["articles"]:
        doi = art["cite"]["doi"] or art["file"][:-4]
        authors = tuple(sorted(a.split(",")[0].strip().lower() for a in art["cite"]["authors"]))
        for b in art["blocks"]:
            if b["kind"] != "gamma":
                continue
            rules["blocks: two compounds, an activity-coefficient property"] += 1
            names = []
            amb = False
            for m in b["members"]:
                v = ident.get(m.get("inchiKey", ""), [])
                if len(v) > 1:
                    amb = True
                names.append(v[0] if len(v) == 1 else None)
            if amb:
                rules["R1b a compound's InChIKey names two catalogue records (stereoisomers)"] += 1
                continue
            if None in names:
                rules["R1 a compound not in the catalogue (no InChIKey join)"] += 1
                continue
            byorg = {m["org"]: n for m, n in zip(b["members"], names)}
            if len(b["props"]) != 1:
                rules["R2 more than one property in the block"] += 1
                continue
            p = b["props"][0]
            if p["phase"] != "Liquid":
                rules["R3 the activity coefficient is of a GAS phase"] += 1
                continue
            solute = byorg.get(p["org"])
            if solute is None:
                rules["R4 the property names no solute of the block"] += 1
                continue
            solvent = [n for o, n in byorg.items() if o != p["org"]][0]
            zero = [c for c in b["constraints"] if c["name"] == "Mole fraction"
                    and c["org"] == p["org"] and c["value"] not in ("",) and float(c["value"]) == 0.0]
            one = [c for c in b["constraints"] if c["name"] == "Mole fraction"
                   and c["org"] != p["org"] and c["value"] not in ("",) and float(c["value"]) == 1.0]
            if not (zero or one):
                rules["R5 not at infinite dilution (x is a variable or not stated): a finite-"
                      "concentration activity coefficient"] += 1
                continue
            if p["presentation"] != "Direct value, X":
                rules["R6 presentation other than a direct value"] += 1
                continue
            ss = p["standardState"]
            relabel = ss == "Infinite dilution solute"
            if ss not in RAOULT and not relabel:
                rules[f"R7 standard state '{ss}'"] += 1
                continue
            tv = [v["num"] for v in b["variables"] if v["name"].startswith("Temperature")]
            tc = [c["value"] for c in b["constraints"] if c["name"].startswith("Temperature")]
            if any(v["name"] == "Mole fraction" for v in b["variables"]):
                rules["R5 not at infinite dilution (x is a variable or not stated): a finite-"
                      "concentration activity coefficient"] += 1
                continue
            vals = []
            for r in b["rows"]:
                T = r["var"].get(tv[0]) if tv else (tc[0] if tc else None)
                g = r["prop"].get(p["num"])
                if T in (None, "") or g in (None, ""):
                    continue
                vals.append((float(T), float(g), r["U"].get(p["num"], "")))
            if not vals:
                rules["R8 no (T, gamma) row"] += 1
                continue
            if relabel and all(abs(g - 1.0) < 1e-9 for _, g, _ in vals):
                rules["R7b 'Infinite dilution solute' standard state with gamma = 1 (the definition)"] += 1
                continue
            rules["accepted blocks" + (" (standard state labelled 'Infinite dilution solute', "
                                       "values != 1: read as Raoult)" if relabel else "")] += 1
            for T, g, U in vals:
                pts.append({"doi": doi, "authors": authors, "block": b["block"], "solute": solute,
                            "solvent": solvent, "T": T, "g": g, "U": U, "relabel": relabel,
                            "method": p["method"]})
    # point rules: supercritical, non-positive
    kept = []
    prc = Counter()
    for q in pts:
        cs = L.comp(root, q["solute"])
        cv = L.comp(root, q["solvent"])
        if q["g"] <= 0:
            prc["P1 gamma <= 0"] += 1
            continue
        if cs["Tc"] and q["T"] >= cs["Tc"]:
            prc["P2 T at or above the SOLUTE's Tc (supercritical / gaseous solute)"] += 1
            continue
        if cv["Tc"] and q["T"] >= cv["Tc"]:
            prc["P3 T at or above the SOLVENT's Tc"] += 1
            continue
        kept.append(q)
    return rules, prc, pts, kept


def main():
    root, arch, scanp, work, outd = (Path(a) for a in sys.argv[1:6])
    work.mkdir(parents=True, exist_ok=True)
    outd.mkdir(parents=True, exist_ok=True)
    scan = json.loads(scanp.read_text())
    ident = json.loads((arch / "identity.json").read_text())["byInchiKey"]
    rules, prc, allpts, kept = census(root, scan, ident)
    recs = {m: {frozenset((r["i"], r["j"])): r for r in L.read_records(root, m)} for m in MODELS}

    # ---- noise floor: different articles, same (solute, solvent), |dT| <= 1 K
    by = defaultdict(list)
    for q in kept:
        by[(q["solute"], q["solvent"])].append(q)
    noise = []
    noise_disj = []
    nsys = set()
    for key, v in by.items():
        for a in range(len(v)):
            for b in range(a + 1, len(v)):
                qa, qb = v[a], v[b]
                if qa["doi"] == qb["doi"] or abs(qa["T"] - qb["T"]) > 1.0:
                    continue
                d = abs(math.log(qa["g"]) - math.log(qb["g"]))
                noise.append(d)
                nsys.add(key)
                if not set(qa["authors"]) & set(qb["authors"]):
                    noise_disj.append(d)

    # ---- predictions
    pairs_rows = []
    art_rows = []
    allpoints = []
    span_check = Counter()
    for model in MODELS:
        for key, rec in sorted(recs[model].items(), key=lambda kv: kv[1]["path"]):
            a, b = rec["i"], rec["j"]
            sel = [q for q in kept if {q["solute"], q["solvent"]} == {a, b}]
            if not sel:
                continue
            indep = [q for q in sel if q["doi"] not in rec["dois"]]
            if not indep:
                pairs_rows.append({"model": model, "rec": rec, "status": "allDataInEvidence", "pts": []})
                continue
            names = [a, b]
            uniq = sorted({(q["T"], q["solute"]) for q in indep})
            ops = [L.op_gamma(f"p{k}", T, names, {s: 0.0, [n for n in names if n != s][0]: 1.0})
                   for k, (T, s) in enumerate(uniq)]
            diags, _, res, log, rc = L.run_engine(root, work / "eng", f"g_{model}_{a}_{b}"[:120],
                                                  model, names, ops)
            eng = {}
            for k, (T, s) in enumerate(uniq):
                dg = diags.get(f"p{k}") or {}
                eng[(T, s)] = dg.get(f"gamma_{s}")
            f = L.model_for({key: rec}, names, root)
            fs = L.model_for({key: rec}, names, root, swap=True)
            anyout = False
            for q in indep:
                s = q["solute"]
                xi = [0.0 if n == s else 1.0 for n in names]
                k = names.index(s)
                lnp = f(xi, q["T"])[k]
                lns = fs(xi, q["T"])[k]
                ge = eng.get((q["T"], s))
                inside = (rec["Tmin"] is not None and rec["Tmin"] - 1e-9 <= q["T"] <= rec["Tmax"] + 1e-9)
                anyout |= not inside
                allpoints.append({**q, "model": model, "record": Path(rec["path"]).name,
                                  "lnEngine": math.log(ge) if ge else float("nan"),
                                  "lnIndep": lnp, "lnSwap": lns, "lnMeas": math.log(q["g"]),
                                  "inside": inside})
            # did the engine announce use outside the span?  (once per pair per run)
            announced = "pair-span" in log
            if anyout:
                span_check["pairs with a point outside the span: announced" if announced
                           else "pairs with a point outside the span: NOT announced"] += 1
            else:
                span_check["pairs with every point inside: announced (false alarm)" if announced
                           else "pairs with every point inside: silent"] += 1
            pairs_rows.append({"model": model, "rec": rec, "status": "tested",
                               "pts": [p for p in allpoints if p["model"] == model
                                       and p["record"] == Path(rec["path"]).name],
                               "nInEvidence": len(sel) - len(indep), "announced": announced})

    # ---- write per-point scratch table
    with open(work / "points.tsv", "w") as fh:
        fh.write("model\trecord\tdoi\tsolute\tsolvent\tT\tgamma_meas\tln_engine\tln_indep\tln_swap\tinside\n")
        for p in allpoints:
            fh.write(f"{p['model']}\t{p['record']}\t{p['doi']}\t{p['solute']}\t{p['solvent']}\t{p['T']}\t"
                     f"{p['g']}\t{p['lnEngine']:.12g}\t{p['lnIndep']:.12g}\t{p['lnSwap']:.12g}\t{p['inside']}\n")

    # ---- per pair statistics
    def stats(pp, key="lnEngine"):
        d = [abs(p[key] - p["lnMeas"]) for p in pp if p[key] == p[key]]
        return d

    with open(outd / "pairs.tsv", "w") as fh:
        fh.write("pair\tmodel\trecord\tstatus\tnArticles\tnPoints\tTmin_K\tTmax_K\tinSpanFraction\t"
                 "median_abs_dlngamma\tmax_abs_dlngamma\tmedian_abs_dlngamma_inSpan\tmedian_factor\t"
                 "bias_dlngamma\tmedian_abs_dlngamma_swapped\tfitGrade\tinSampleGrade\tcaps\t"
                 "pipeline\tevidenceDOIs\tspan_K\taqueous\tassociating\tspanAnnounced\n")
        for r in pairs_rows:
            rec = r["rec"]
            pp = r["pts"]
            nm = Path(rec["path"]).name
            pair = f"{rec['i']}+{rec['j']}"
            common = (f"{rec['fitGrade']}\t{rec['inSampleGrade'] or ''}\t{','.join(rec['caps'])}\t"
                      f"{rec['pipeline']}\t{len(rec['dois'])}\t"
                      f"{rec['Tmin'] if rec['Tmin'] else ''}-{rec['Tmax'] if rec['Tmax'] else ''}\t"
                      f"{'water' in (rec['i'], rec['j'])}\t{assoc(rec['i']) or assoc(rec['j'])}")
            if r["status"] != "tested":
                fh.write(f"{pair}\t{r['model']}\t{nm}\t{r['status']}\t0\t0\t\t\t\t\t\t\t\t\t\t{common}\t\n")
                continue
            d = stats(pp)
            din = [abs(p["lnEngine"] - p["lnMeas"]) for p in pp if p["inside"]]
            ds = stats(pp, "lnSwap")
            bias = st.mean([p["lnEngine"] - p["lnMeas"] for p in pp])
            fh.write(f"{pair}\t{r['model']}\t{nm}\ttested\t{len({p['doi'] for p in pp})}\t{len(pp)}\t"
                     f"{min(p['T'] for p in pp):.2f}\t{max(p['T'] for p in pp):.2f}\t"
                     f"{sum(p['inside'] for p in pp) / len(pp):.3f}\t{st.median(d):.4f}\t{max(d):.4f}\t"
                     f"{(st.median(din) if din else float('nan')):.4f}\t{math.exp(st.median(d)):.3f}\t"
                     f"{bias:+.4f}\t{st.median(ds):.4f}\t{common}\t{r['announced']}\n")
        # per article
    with open(outd / "articles.tsv", "w") as fh:
        fh.write("pair\tmodel\tdoi\tnPoints\tTmin_K\tTmax_K\tinSpanFraction\tmedian_abs_dlngamma\t"
                 "max_abs_dlngamma\tbias_dlngamma\n")
        g = defaultdict(list)
        for p in allpoints:
            g[(p["record"], p["model"], p["doi"])].append(p)
        for (nm, m, doi), pp in sorted(g.items()):
            d = [abs(p["lnEngine"] - p["lnMeas"]) for p in pp]
            fh.write(f"{nm[:-4].replace('-', '+')}\t{m}\t{doi}\t{len(pp)}\t{min(p['T'] for p in pp):.2f}\t"
                     f"{max(p['T'] for p in pp):.2f}\t{sum(p['inside'] for p in pp) / len(pp):.3f}\t"
                     f"{st.median(d):.4f}\t{max(d):.4f}\t"
                     f"{st.mean([p['lnEngine'] - p['lnMeas'] for p in pp]):+.4f}\n")
    with open(outd / "gamma_census.tsv", "w") as fh:
        fh.write("rule\tcount\tunit\n")
        for k, v in rules.items():
            fh.write(f"{k}\t{v}\tblocks\n")
        fh.write(f"points in accepted blocks\t{len(allpts)}\tpoints\n")
        for k, v in prc.items():
            fh.write(f"{k}\t{v}\tpoints\n")
        fh.write(f"points kept\t{len(kept)}\tpoints\n")
        fh.write(f"(solute, solvent) systems kept\t{len({(q['solute'], q['solvent']) for q in kept})}\tsystems\n")
        fh.write(f"unordered catalogue pairs kept\t{len({frozenset((q['solute'], q['solvent'])) for q in kept})}\tpairs\n")
        for k, v in span_check.items():
            fh.write(f"{k}\t{v}\tpair-model runs\n")
    with open(outd / "noise_floor.tsv", "w") as fh:
        fh.write("set\tnComparisons\tnSystems\tmedian_abs_dlngamma\tp90_abs_dlngamma\tmedian_factor\tp90_factor\n")
        for lab, v in (("different articles, |dT| <= 1 K", noise),
                       ("different articles sharing no author surname, |dT| <= 1 K", noise_disj)):
            fh.write(f"{lab}\t{len(v)}\t{len(nsys)}\t{st.median(v):.4f}\t{pctl(v, 0.9):.4f}\t"
                     f"{math.exp(st.median(v)):.3f}\t{math.exp(pctl(v, 0.9)):.3f}\n")
    # ---- summary
    print("census:", dict(rules), dict(prc), "kept", len(kept))
    print("span:", dict(span_check))
    print(f"noise floor: n={len(noise)} median {st.median(noise):.4f} p90 {pctl(noise, 0.9):.4f}; "
          f"author-disjoint n={len(noise_disj)} median {st.median(noise_disj):.4f} p90 {pctl(noise_disj, 0.9):.4f}")
    agree = max((abs(p["lnEngine"] - p["lnIndep"]) for p in allpoints if p["lnEngine"] == p["lnEngine"]),
                default=0)
    print(f"engine vs independent kernel on every predicted point: max |d ln gamma| = {agree:.2e}; "
          f"points with no engine value: {sum(1 for p in allpoints if p['lnEngine'] != p['lnEngine'])}")
    for model in MODELS:
        pp = [p for p in allpoints if p["model"] == model]
        if not pp:
            continue
        for lab, sub in (("inside span", [p for p in pp if p["inside"]]),
                         ("outside span", [p for p in pp if not p["inside"]])):
            if not sub:
                continue
            d = [abs(p["lnEngine"] - p["lnMeas"]) for p in sub]
            ds = [abs(p["lnSwap"] - p["lnMeas"]) for p in sub]
            print(f"{model} {lab}: pairs {len({p['record'] for p in sub})}, points {len(sub)}, "
                  f"median |dln| {st.median(d):.3f} (factor {math.exp(st.median(d)):.2f}), "
                  f"p90 {pctl(d, .9):.3f} (factor {math.exp(pctl(d, .9)):.2f}); swapped median "
                  f"{st.median(ds):.3f} p90 {pctl(ds, .9):.3f}")


if __name__ == "__main__":
    main()
