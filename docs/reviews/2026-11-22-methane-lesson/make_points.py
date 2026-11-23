#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Join the Petersen scans into ONE table, and write the JSON the lesson page draws.

Inputs (all in this directory unless stated):
  scan_c1.tsv, scan_assembled.tsv, scan_miller_bowman_full.tsv -- the output of scan_petersen.py on
      methane05_c1_chain, methane06_assembled and nox03_millerbowman_large (the 235-reaction Appendix A,
      holdup replaced), mixtures 2 and 4, columns: mixture, P5 [atm], T5 [K], measured [us], model [us];
  ../2026-11-21-aramcomech-validation/REPORT.md section 4 -- AramcoMech 1.3 run in Choupo on the same 117
      points (its last column, `Choupo max dT/dt [us]`, the same definition of tau as the engine's line);
  ../2026-11-21-aramcomech-validation/petersen1999_table2.tsv -- the measured points (Table 2, p. 86).
Outputs: points.tsv (the joined table), gui/src/case/methaneAssemblyPoints.json and
 gui/src/case/methaneAssemblyChain.json (each stage's reactions, from the library records).

usage: make_points.py
"""
import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
REV = os.path.join(os.path.dirname(HERE), "2026-11-21-aramcomech-validation")


def scan(name):
    out = {}
    with open(os.path.join(HERE, name)) as f:
        for line in f:
            m, p, t, meas, tau = line.rstrip("\n").split("\t")
            out[(m, float(p), float(t))] = (float(meas), None if tau == "none" else float(tau))
    return out


def aramco():
    out = {}
    text = open(os.path.join(REV, "REPORT.md")).read()
    for line in text.splitlines():
        c = [x.strip() for x in line.strip("|").split("|")]
        if len(c) == 9 and c[0] in "123456" and re.fullmatch(r"[\d.]+", c[1]):
            out[(c[0], float(c[1]), float(c[2]))] = float(c[8])
    return out


STAGES = [  # (id, label, sets)
    ("core", "the H2/O2 core", ["OConaire2004"]),
    ("attack", "CH4 is attacked", ["MB1989_attack"]),
    ("methyl", "CH3 is consumed", ["MB1989_methyl"]),
    ("formyl", "CH2O, HCO and CH2 go to CO", ["MB1989_formyl"]),
    ("carbonMonoxide", "CO goes to CO2", ["MB1989_carbonMonoxide"]),
    ("ethane", "two CH3 make ethane", ["MB1989_ethane"]),
]


def chain():
    """label, printed equation and page of every record of each stage, from the library and the two tables."""
    mb = {r["rxn"]: r for r in csv.DictReader(open(os.path.join(os.path.dirname(HERE), "2026-11-22-miller-bowman",
                                                                  "mb1989_table.tsv")), delimiter="\t") if r["table"] == "A"}
    oc = {}
    for l in open(os.path.join(os.path.dirname(HERE), "2026-11-21-kinetics-seed", "oconaire2004_table.tsv")):
        if l.startswith("#") or l.startswith("row\t"):
            continue
        c = l.rstrip("\n").split("\t")
        oc[c[0]] = c
    kin = os.path.join(REPO, "data", "standards", "kinetics")
    out = []
    for sid, label, sets in STAGES:
        items = []
        for fn in sorted(os.listdir(kin)):
            if not fn.endswith(".dat"):
                continue
            t = open(os.path.join(kin, fn)).read()
            m = re.search(r"^sets\s*\{([^}]*)\}", t, re.M)
            if not m:
                continue
            for sname, lab in re.findall(r"(\w+)\s+(\w+);", m.group(1)):
                if sname in sets:
                    page = re.search(r"^\s*page\s+(\d+);", t, re.M).group(1)
                    rx = re.search(r"^\s*reaction\s+\"?(\w+)\"?;", t, re.M).group(1)
                    if sname == "OConaire2004":
                        eq = [r for r in oc.values() if r[1] == rx][0][3]
                    else:
                        eq = mb[rx]["equation"].replace("=", " = ").replace("+", " + ").replace("( + M)", "(+M)")
                    items.append(dict(label=lab, equation=eq, page=int(page), record=fn[:-4], reaction=rx))
        items.sort(key=lambda d: (int(re.sub(r"\D", "", d["reaction"]) or 0), d["reaction"]))
        out.append(dict(id=sid, label=label, sets=sets, reactions=items))
    return out


def main():
    c1, asm, full = scan("scan_c1.tsv"), scan("scan_assembled.tsv"), scan("scan_miller_bowman_full.tsv")
    ar = aramco()
    rows = []
    for k in sorted(asm, key=lambda k: (k[0], -k[1], k[2])):
        meas = asm[k][0]
        rows.append(dict(mixture=k[0], P_atm=k[1], T_K=k[2], measured_us=meas, aramco_us=ar[k],
                         millerBowmanFull_us=full[k][1], c1Chain_us=c1[k][1], assembled_us=asm[k][1]))
    with open(os.path.join(HERE, "points.tsv"), "w") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(list(rows[0].keys()))
        for r in rows:
            w.writerow(list(r.values()))
    with open(os.path.join(REPO, "gui", "src", "case", "methaneAssemblyPoints.json"), "w") as f:
        json.dump({"source": "docs/reviews/2026-11-22-methane-lesson/points.tsv (make_points.py)", "points": rows}, f, indent=1)
        f.write("\n")
    with open(os.path.join(REPO, "gui", "src", "case", "methaneAssemblyChain.json"), "w") as f:
        json.dump({"source": "data/standards/kinetics/ (make_points.py)", "stages": chain()}, f, indent=1)
        f.write("\n")
    print(len(rows), "points")


if __name__ == "__main__":
    main()
