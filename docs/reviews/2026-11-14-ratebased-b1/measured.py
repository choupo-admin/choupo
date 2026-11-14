#!/usr/bin/env python3
"""measured.py <repo> <scratch>: mean signed error of HETP against Schulz Fig 2b, as
digitised in docs/design/c329-ratebased-first-delivery.md sections 11-12 (the tables are
parsed from that file, not typed), for the rate model and the transfer-unit bed, both swept
over the reboiler F-factor 0.30..3.70 step 0.05 and interpolated linearly in the bed-mean
F-factor, taken as (F_top + F_bottom)/2 (my choice; the tree does not hold the script that
made the published table)."""
import csv, math, re, sys
from pathlib import Path
repo, S = Path(sys.argv[1]), Path(sys.argv[2])
doc = (repo / "docs/design/c329-ratebased-first-delivery.md").read_text().splitlines()

def tables():
    out = []; cur = None
    for ln in doc:
        m = re.match(r"#### (0\.\d+) bar: HETP", ln)
        if m: cur = []; out.append((m.group(1), cur)); continue
        if cur is not None and ln.startswith("| ") and not ln.startswith("| F_G") and not ln.startswith("|---"):
            f = [x.strip() for x in ln.strip("|").split("|")]
            try: cur.append((float(f[0]), float(f[1])))
            except ValueError: pass
    return out
T = tables()   # order in the file: RBF 0.10, RBF 0.02, Delft 0.10, Delft 0.02
meas = {"ratebased01": T[0][1], "ratebased02": T[1][1], "ratebased03": T[2][1], "ratebased04": T[3][1]}
tu = {"ratebased01": "packing01", "ratebased02": "packing02", "ratebased03": "packing03", "ratebased04": "packing04"}

def curve(tag, bedmean="avg"):
    pts = []
    for r in csv.DictReader(open(S / "runs" / f"F_{tag}" / "sweep_fFactor.csv")):
        h = float(r["column.HETP"])
        if math.isnan(h): continue
        ft, fb = float(r["column.fFactor_bedTop"]), float(r["column.fFactor_bedBottom"])
        pts.append(((ft + fb) / 2 if bedmean == "avg" else fb, h))
    return sorted(pts)

def interp(c, F):
    if F < c[0][0] or F > c[-1][0]: return None
    for (a, ha), (b, hb) in zip(c, c[1:]):
        if a <= F <= b: return ha + (hb - ha) * (F - a) / (b - a)

for rb, pts in meas.items():
    cr, ct = curve(rb), curve(tu[rb])
    er, et, dd = [], [], []
    for F, hm in pts:
        hr, ht = interp(cr, F), interp(ct, F)
        if hr is None or ht is None: continue
        er.append((hr - hm) / hm); et.append((ht - hm) / hm); dd.append(hr / ht - 1)
    print(f"{rb}: points {len(er)}  TU mean {100*sum(et)/len(et):+.1f} % (max |{100*max(map(abs,et)):.1f}|)  "
          f"rate mean {100*sum(er)/len(er):+.1f} % (max |{100*max(map(abs,er)):.1f}|)  rate/TU-1 {100*min(dd):+.3f}..{100*max(dd):+.3f} %  "
          f"model range F {cr[0][0]:.2f}..{cr[-1][0]:.2f}")
