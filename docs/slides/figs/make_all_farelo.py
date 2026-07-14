#!/usr/bin/env python3
"""Plot ALL of Farelo's solubility data (553 points, six ternary systems) from the
transcribed table file figs/farelo_data.json. One panel per system: the saturated
molality of salt 2 vs salt 1, every point coloured by temperature (continuous), with
the invariant points marked. A shared temperature colour bar.
Run from the repo root:  python3 docs/slides/figs/make_all_farelo.py
"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "farelo_data.json")))
pts = [p for p in data if isinstance(p, dict) and p.get("system") not in (None, "_meta") and "m1" in p]

order = ["NaCl+NH4Cl", "KCl+NH4Cl", "NaCl+LiCl", "KCl+LiCl", "NaCl+AlCl3", "KCl+AlCl3"]
systems = [s for s in order if any(p["system"] == s for p in pts)]

allT = [float(p["T"]) for p in pts if p.get("T") is not None]
norm = Normalize(vmin=min(allT), vmax=max(allT))
cmap = plt.get_cmap("turbo")

fig, axes = plt.subplots(2, 3, figsize=(12, 8.0),
                         gridspec_kw={"hspace": 0.42, "wspace": 0.34})
for k, sys in enumerate(systems):
    ax = axes[k // 3][k % 3]
    sp = [p for p in pts if p["system"] == sys]
    s1 = sp[0]["salt1"]; s2 = next((p["salt2"] for p in sp if p.get("salt2")), "salt2")
    reg = [p for p in sp if not str(p.get("solid", "")).lower().startswith("invar")]
    inv = [p for p in sp if str(p.get("solid", "")).lower().startswith("invar")]
    if reg:
        ax.scatter([p["m1"] for p in reg], [p["m2"] for p in reg],
                   c=[float(p["T"]) for p in reg], cmap=cmap, norm=norm, s=22,
                   edgecolors="none", alpha=0.9)
    if inv:
        ax.scatter([p["m1"] for p in inv], [p["m2"] for p in inv],
                   c=[float(p["T"]) for p in inv], cmap=cmap, norm=norm, s=80,
                   marker="D", edgecolors="black", linewidths=1.0, zorder=5,
                   label="invariant (eutonic)")
    ax.set_xlabel(f"$m$({s1})  (mol kg$^{{-1}}$)", fontsize=9)
    ax.set_ylabel(f"$m$({s2})  (mol kg$^{{-1}}$)", fontsize=9)
    ax.set_title(f"{sys}   ({len(sp)} pts)", fontsize=11, weight="bold")
    ax.grid(alpha=0.3)
    if inv:
        ax.legend(fontsize=7, loc="best")

sm = ScalarMappable(norm=norm, cmap=cmap); sm.set_array([])
cb = fig.colorbar(sm, ax=axes, shrink=0.85, pad=0.02)
cb.set_label("temperature  $T$  (K)")
fig.suptitle("All of Farelo's saturation data (J. Chem. Eng. Data 50, 2005, 1470): "
             "six ternary chloride systems, 553 measured points",
             fontsize=13, weight="bold")
out = os.path.join(HERE, "farelo_all.pdf")
fig.savefig(out, bbox_inches="tight")
print(f"  saved {out}  ({len(pts)} points, {len(systems)} systems)")
