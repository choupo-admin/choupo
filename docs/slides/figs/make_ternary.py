#!/usr/bin/env python3
"""Generate the NaCl-NH4Cl-H2O ternary phase diagram from the Choupo engine.
Runs the speciation grid point-by-point (robust to high-I divergence), extracts
the water activity a_w and the saturation indices, and draws the ternary with an
a_w colour map, the SI=0 saturation isolines, and Prof. Farelo's measured points.
Run from the repo root:  python3 docs/slides/figs/make_ternary.py
"""
import subprocess, os, re, math, tempfile, shutil
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.tri import Triangulation

ROOT = os.getcwd()
CASE = os.path.join(ROOT, "cases", "_tern")
os.makedirs(os.path.join(CASE, "system"), exist_ok=True)
os.makedirs(os.path.join(CASE, "constant", "electrolyte"), exist_ok=True)
for f in ["ions", "pairs", "mixing", "minerals", "speciation"]:
    shutil.copy(f"data/standards/electrolyte/{f}.dat", f"{CASE}/constant/electrolyte/{f}.dat")
open(f"{CASE}/system/controlDict", "w").write(
    "application choupoProps;\ndescription tern;\nverbosity 2;\n")
open(f"{CASE}/constant/thermoPackage", "w").write(
    "components ( water );\nphase { type vle; }\nactivityModel { model ideal; }\nequationOfState { model idealGas; }\n")
open(f"{CASE}/_tern.cho", "w").write("")

logKh, logKs = 1.57, 1.2364
import json
CACHE = "/tmp/tern_pts.json"
pts = []  # (mNa, mNH4, aw, SI_halite, SI_salam)
grid = [(round(na, 2), round(nh, 2))
        for na in np.arange(0.0, 6.01, 0.4)
        for nh in np.arange(0.0, 7.01, 0.4)
        if 0.15 < na + nh <= 7.2]
if os.path.exists(CACHE):
    pts = json.load(open(CACHE))
    print(f"loaded {len(pts)} cached points")
    grid = []   # skip the engine sweep
print(f"grid: {len(grid)} points")
for na, nh in grid:
    cl = round(na + nh, 2)
    tot = (f"Na {na} mol/kg; " if na > 0 else "") + (f"NH4 {nh} mol/kg; " if nh > 0 else "") + f"Cl {cl} mol/kg;"
    open(f"{CASE}/system/propsDict", "w").write(
        f"operations (\n  {{ name p; type speciate; activityModel pitzer; totals {{ {tot} }} pH solve; "
        f"diagSpecies ( Na NH4 Cl ); output {{ file p.csv; }} }}\n);\n")
    try:
        r = subprocess.run(["./choupoProps", CASE], capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        continue
    if r.returncode != 0:
        continue
    m = re.search(r'a_w = ([\d.]+)', r.stdout)
    if not m:
        continue
    aw = float(m.group(1))
    act = {}
    csv = f"{CASE}/p.csv"
    if not os.path.exists(csv):
        continue
    for line in open(csv).read().splitlines()[1:]:
        c = line.split(",")
        if len(c) >= 3:
            act[c[0]] = float(c[2])
    if "Cl" not in act:
        continue
    SIh = math.log10(act["Na"] * act["Cl"]) - logKh if "Na" in act and na > 0 else None
    SIs = math.log10(act["NH4"] * act["Cl"]) - logKs if "NH4" in act and nh > 0 else None
    pts.append((na, nh, aw, SIh, SIs))
print(f"converged: {len(pts)} / {len(grid) if grid else len(pts)}")
if grid:
    json.dump(pts, open(CACHE, "w"))
shutil.rmtree(CASE, ignore_errors=True)

# ---- convert (mNa, mNH4) -> mass fractions -> ternary cartesian ----
MWna, MWnh, MWw = 58.44, 53.49, 18.015
def tern_xy(mna, mnh):
    a = mna * MWna; b = mnh * MWnh; w = 1000.0
    t = a + b + w
    wNaCl, wNH4Cl, wH2O = a / t, b / t, w / t
    # H2O at (0,0), NaCl at (1,0), NH4Cl at (0.5, sqrt3/2)
    x = wNaCl * 1.0 + wNH4Cl * 0.5
    y = wNH4Cl * (math.sqrt(3) / 2)
    return x, y

xs = np.array([tern_xy(p[0], p[1])[0] for p in pts])
ys = np.array([tern_xy(p[0], p[1])[1] for p in pts])
aw = np.array([p[2] for p in pts])
SIh = np.array([p[3] if p[3] is not None else np.nan for p in pts])
SIs = np.array([p[4] if p[4] is not None else np.nan for p in pts])

fig, ax = plt.subplots(figsize=(8.2, 6.4))
tri = Triangulation(xs, ys)
# a_w colour map
tcf = ax.tricontourf(tri, aw, levels=np.linspace(aw.min(), 1.0, 20), cmap="YlGnBu_r")
cb = fig.colorbar(tcf, ax=ax, shrink=0.8); cb.set_label("water activity  $a_w$  (osmotic coefficient $\\times$ molality)")

def safe_contour(x, y, z, levels, **kw):
    """tricontour that won't crash on out-of-range levels or degenerate triangles."""
    z = np.asarray(z)
    lv = [l for l in levels if z.min() < l < z.max()]
    if not lv or len(x) < 4:
        return
    try:
        cs = ax.tricontour(Triangulation(x, y), z, levels=lv, **kw)
        return cs
    except Exception as e:
        print("  (contour skipped:", e, ")")

# a_w isolines (labelled)
csa = safe_contour(xs, ys, aw, [0.95, 0.90, 0.85, 0.80, 0.75], colors="gray", linewidths=0.7, alpha=0.8)
if csa:
    ax.clabel(csa, fontsize=7, fmt="%.2f")
# saturation isolines (SI = 0)
m1 = ~np.isnan(SIh)
safe_contour(xs[m1], ys[m1], SIh[m1], [0.0], colors="navy", linewidths=2.5)
m2 = ~np.isnan(SIs)
safe_contour(xs[m2], ys[m2], SIs[m2], [0.0], colors="darkorange", linewidths=2.5, linestyles="--")

# ---- Farelo measured saturation curves (the experimental data) ----
# NaCl branch (NH4Cl, NaCl) and NH4Cl branch, in molality -> ternary
nacl_branch = [(0, 6.15), (0.93, 5.5), (1.87, 5.0), (2.80, 4.95), (4.35, 4.3)]
nh4_branch = [(7.35, 0), (6.0, 2.0), (5.0, 3.2), (4.35, 4.3)]
fx = [tern_xy(na, nh)[0] for nh, na in nacl_branch]
fy = [tern_xy(na, nh)[1] for nh, na in nacl_branch]
ax.plot(fx, fy, '*-', color='red', ms=14, mec='black', lw=1.5, label="Farelo: NaCl saturation", zorder=6)
gx = [tern_xy(na, nh)[0] for nh, na in nh4_branch]
gy = [tern_xy(na, nh)[1] for nh, na in nh4_branch]
ax.plot(gx, gy, '^--', color='deepskyblue', ms=11, mec='black', lw=1.5, label="Farelo: NH$_4$Cl saturation", zorder=6)
ex, ey = tern_xy(4.3, 4.35)
ax.plot([ex], [ey], 'D', color='gold', ms=14, mec='black', label="eutonic (Farelo)", zorder=7)

# ---- ternary frame, ZOOMED on the water-rich (solubility) corner ----
h = math.sqrt(3) / 2
ax.plot([0, 1, 0.5, 0], [0, 0, h, 0], 'k-', lw=1.4)            # full triangle edges
ax.text(-0.012, -0.018, "H$_2$O", fontsize=14, ha='right', va='top', weight='bold')
# edge-direction labels (the NaCl / NH4Cl corners are off the zoomed frame)
ax.annotate("", xy=(0.31, 0), xytext=(0.24, 0), arrowprops=dict(arrowstyle="->", color='black'))
ax.text(0.315, -0.006, "$\\rightarrow$ NaCl", fontsize=12, ha='left', va='center', weight='bold')
ax.annotate("", xy=(0.155, 0.268), xytext=(0.12, 0.208), arrowprops=dict(arrowstyle="->", color='black'))
ax.text(0.16, 0.272, "$\\rightarrow$ NH$_4$Cl", fontsize=12, ha='left', weight='bold')
# crystallisation-field labels (which solid is in equilibrium)
ax.text(0.205, 0.045, "NaCl(s)\ncrystallises", fontsize=9, color='darkred', ha='center')
ax.text(0.075, 0.165, "NH$_4$Cl(s)\ncrystallises", fontsize=9, color='steelblue', ha='center')
ax.text(0.085, 0.07, "unsaturated\nsolution", fontsize=9, color='dimgray', style='italic', ha='center')
# salt mass-fraction gridlines for reading the axes
for wsalt in [0.1, 0.2]:
    ax.plot([wsalt, wsalt * 0.5], [0, wsalt * h], color='lightgray', lw=0.6, zorder=0)
    ax.text(wsalt, -0.012, f"{int(wsalt*100)}%", fontsize=7, ha='center', color='gray')
ax.set_title("NaCl + NH$_4$Cl + H$_2$O, 298 K: model water-activity field + Farelo's saturation data",
             fontsize=11)
ax.legend(fontsize=9, loc='upper right'); ax.set_aspect('equal'); ax.axis('off')
ax.set_xlim(-0.02, 0.33); ax.set_ylim(-0.03, 0.30)            # ZOOM into the salt corner
fig.tight_layout()
fig.savefig("docs/slides/figs/ternary_nacl_nh4cl.pdf")
print("  saved docs/slides/figs/ternary_nacl_nh4cl.pdf")
