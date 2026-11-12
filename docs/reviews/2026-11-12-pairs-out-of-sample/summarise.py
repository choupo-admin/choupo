#!/usr/bin/env python3
"""summarise.py ROOT WORKDIR OUTDIR

Reads the scratch per-point tables gamma_inf.py and ternary.py wrote under
WORKDIR and the catalogue records under ROOT, and writes OUTDIR/grade_table.tsv
(out-of-sample error grouped by the record's own in-sample grade, cap, model
and pipeline) and OUTDIR/headline.tsv (the review's summary numbers,
including the controls).  Statistics only; no measured point is written.
"""
import json
import math
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import oos_lib as L  # noqa: E402


def pctl(v, p):
    v = sorted(v)
    if not v:
        return float("nan")
    k = (len(v) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


GRADE_ORDER = {"none": 0, "clean": 1, "warning": 2, "severe": 3}


def main():
    root, work, outd = (Path(a) for a in sys.argv[1:4])
    recs = {}
    for m in ("NRTL", "UNIQUAC", "Wilson"):
        for r in L.read_records(root, m):
            recs[(m, Path(r["path"]).name)] = r
    gp = []
    with open(work / "gi" / "points.tsv") as fh:
        hdr = fh.readline().rstrip("\n").split("\t")
        for ln in fh:
            d = dict(zip(hdr, ln.rstrip("\n").split("\t")))
            d["inside"] = d["inside"] == "True"
            for k in ("T", "gamma_meas", "ln_engine", "ln_indep", "ln_swap"):
                d[k] = float(d[k])
            d["err"] = abs(d["ln_engine"] - math.log(d["gamma_meas"]))
            d["errSwap"] = abs(d["ln_swap"] - math.log(d["gamma_meas"]))
            d["rec"] = recs[(d["model"], d["record"])]
            gp.append(d)
    tp = [json.loads(ln) for ln in open(work / "tern" / "ternary_points.tsv")]
    rows = []

    def grp(label, pts, key="err"):
        if not pts:
            return
        e = [p[key] for p in pts]
        ein = [p[key] for p in pts if p["inside"]]
        nrec = len({(p["model"], p.get("record") or p.get("system")) for p in pts})
        rows.append((label, nrec, len(pts), len(ein), f"{st.median(e):.4f}", f"{pctl(e, .9):.4f}",
                     f"{st.median(ein):.4f}" if ein else "", f"{pctl(ein, .9):.4f}" if ein else ""))

    # (A) by grade and class
    g = defaultdict(list)
    for p in gp:
        r = p["rec"]
        g[("A gamma-inf |d ln gamma|", p["model"], "pipeline=" + r["pipeline"],
           "inSample=" + (r["inSampleGrade"] or "none"), "fitGrade=" + r["fitGrade"],
           "caps=" + ("+".join(r["caps"]) or "none"))].append(p)
    for k in sorted(g):
        grp(" | ".join(k), g[k])
    g = defaultdict(list)
    for p in gp:
        r = p["rec"]
        g[("A gamma-inf |d ln gamma| all models", "inSample=" + (r["inSampleGrade"] or "none (not a C283/C291 pipeline record)"))].append(p)
    for k in sorted(g):
        grp(" | ".join(k), g[k])
    # (B) by worst in-sample grade of the three records
    g = defaultdict(list)
    for p in tp:
        rs = [recs[(p["model"], f)] for f in p.get("records", [])] if p.get("records") else []
        p.setdefault("record", p["system"])
    # ternary points carry no record list; rebuild from the ternaries table
    tt = {}
    with open(outd / "ternaries.tsv") as fh:
        hdr = fh.readline().rstrip("\n").split("\t")
        for ln in fh:
            d = dict(zip(hdr, ln.rstrip("\n").split("\t")))
            tt[(d["model"], d["doi"], int(d["block"]))] = d
    for p in tp:
        d = tt[(p["model"], p["doi"], p["block"])]
        igr = d["inSampleGrades"].split(",")
        worst = max(igr, key=lambda x: GRADE_ORDER.get(x, 0))
        kind = "A bubble T [K]" if p["kind"] == "T" else "B bubble P [relative]"
        p["err"] = abs(p["err"])
        p["errSwap"] = abs(p["errSwap"])
        g[("B ternary " + kind, p["model"], "worstInSample=" + worst,
           "articleAlsoInBinaryEvidence=" + str(p["same"]))].append(p)
    for k in sorted(g):
        grp(" | ".join(k), g[k])
    g = defaultdict(list)
    for p in tp:
        d = tt[(p["model"], p["doi"], p["block"])]
        worst = max(d["inSampleGrades"].split(","), key=lambda x: GRADE_ORDER.get(x, 0))
        kind = "A bubble T [K]" if p["kind"] == "T" else "B bubble P [relative]"
        g[("B ternary " + kind + " all models", "worstInSample=" + worst)].append(p)
    for k in sorted(g):
        grp(" | ".join(k), g[k])
    with open(outd / "grade_table.tsv", "w") as fh:
        fh.write("group\tnRecordsOrSystems\tnPoints\tnPointsInSpan\tmedian_abs_err\tp90_abs_err\t"
                 "median_abs_err_inSpan\tp90_abs_err_inSpan\n")
        for r in rows:
            fh.write("\t".join(str(x) for x in r) + "\n")

    # headline + controls
    H = []
    ins = [p for p in gp if p["inside"]]
    out = [p for p in gp if not p["inside"]]
    H.append(("A unordered catalogue pairs tested (any model)",
              len({frozenset((p["solute"], p["solvent"])) for p in gp}), ""))
    H.append(("A (pair, model) records tested", len({(p["model"], p["record"]) for p in gp}), ""))
    H.append(("A points / articles", len(gp), len({p["doi"] for p in gp})))
    for lab, sub in (("inside span", ins), ("outside span", out), ("all", gp)):
        e = [p["err"] for p in sub]
        H.append((f"A {lab}: records / points", len({(p['model'], p['record']) for p in sub}), len(sub)))
        H.append((f"A {lab}: median |d ln gamma| (factor)", f"{st.median(e):.4f}", f"{math.exp(st.median(e)):.3f}"))
        H.append((f"A {lab}: p90 |d ln gamma| (factor)", f"{pctl(e, .9):.4f}", f"{math.exp(pctl(e, .9)):.3f}"))
        es = [p["errSwap"] for p in sub]
        H.append((f"A {lab}: NEGATIVE control (ij<->ji swapped) median / p90 |d ln gamma|",
                  f"{st.median(es):.4f}", f"{pctl(es, .9):.4f}"))
    pr = defaultdict(list)
    for p in gp:
        pr[(p["model"], p["record"])].append(p)
    worse = sum(1 for v in pr.values() if st.median([p["errSwap"] for p in v]) > st.median([p["err"] for p in v]))
    H.append(("A NEGATIVE control: records whose swapped median error is LARGER", worse, len(pr)))
    pc = [p for p in gp if p["record"] == "ethanol-water.dat" and p["model"] == "NRTL"]
    pci = [p for p in pc if p["inside"]]
    H.append(("A POSITIVE control NRTL ethanol-water (DECHEMA set; 3 articles): points / in span", len(pc), len(pci)))
    H.append(("A POSITIVE control median |d ln gamma| all / in span",
              f"{st.median([p['err'] for p in pc]):.4f}", f"{st.median([p['err'] for p in pci]):.4f}"))
    H.append(("A POSITIVE control p90 |d ln gamma| all / in span",
              f"{pctl([p['err'] for p in pc], .9):.4f}", f"{pctl([p['err'] for p in pci], .9):.4f}"))
    pl = [p for p in ins if p["rec"]["pipeline"] in ("bubbleT", "bubbleP")]
    if pl:
        H.append(("A inside span, C283/C291 pipeline records only: points / median |d ln gamma|",
                  len(pl), f"{st.median([p['err'] for p in pl]):.4f}"))
    pl = [p for p in gp if p["rec"]["pipeline"] in ("bubbleT", "bubbleP")]
    H.append(("A all points, C283/C291 pipeline records only: points / median |d ln gamma| / p90",
              len(pl), f"{st.median([p['err'] for p in pl]):.4f} / {pctl([p['err'] for p in pl], .9):.4f}"))
    for kind, lab in (("T", "isobaric bubble T [K]"), ("P", "isothermal bubble P [relative]")):
        for sub_lab, sub in (("all", [p for p in tp if p["kind"] == kind]),
                             ("all three pairs in span", [p for p in tp if p["kind"] == kind and p["inside"]]),
                             ("independent article", [p for p in tp if p["kind"] == kind and not p["same"]])):
            if not sub:
                continue
            e = [p["err"] for p in sub]
            es = [p["errSwap"] for p in sub]
            dy = [p["dy"] for p in sub if "dy" in p]
            H.append((f"B {lab} {sub_lab}: blocks / points",
                      len({(p['doi'], p['block']) for p in sub}), len(sub)))
            H.append((f"B {lab} {sub_lab}: (block, model) / systems",
                      len({(p['doi'], p['block'], p['model']) for p in sub}), len({p['system'] for p in sub})))
            H.append((f"B {lab} {sub_lab}: median / p90 |err|", f"{st.median(e):.4f}", f"{pctl(e, .9):.4f}"))
            H.append((f"B {lab} {sub_lab}: NEGATIVE control median / p90", f"{st.median(es):.4f}",
                      f"{pctl(es, .9):.4f}"))
            if dy:
                H.append((f"B {lab} {sub_lab}: points with y / median / p90 of max|y_pred - y|",
                          len(dy), f"{st.median(dy):.4f} / {pctl(dy, .9):.4f}"))
    bm = defaultdict(list)
    for p in tp:
        bm[(p["doi"], p["block"], p["model"])].append(p)
    worse = sum(1 for v in bm.values() if st.median([p["errSwap"] for p in v]) > st.median([p["err"] for p in v]))
    H.append(("B NEGATIVE control: (block, model) whose swapped median error is LARGER", worse, len(bm)))
    with open(outd / "headline.tsv", "w") as fh:
        fh.write("quantity\tvalue\tvalue2\n")
        for h in H:
            fh.write("\t".join(str(x) for x in h) + "\n")
    for h in H:
        print(*h, sep="\t")


if __name__ == "__main__":
    main()
