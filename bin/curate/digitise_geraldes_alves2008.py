#!/usr/bin/env python3
"""Digitise Fig. 3 of Geraldes & Alves, "Computer program for simulation of
mass transport in nanofiltration membranes", J. Membr. Sci. 321 (2008)
172-182, doi:10.1016/j.memsci.2008.04.054 -- the observed rejections of
Na+ and Cl- that Bowen & Mohammad (AIChE J. 44 (1998) 1799) MEASURED on
the CA30 membrane with a trivalent dye, and NanoFiltran's predicted lines.

    bin/curate/digitise_geraldes_alves2008.py --pdf PAPER.pdf [--out CSV]
    bin/curate/digitise_geraldes_alves2008.py --image FIG3.jpg [--out CSV]
    bin/curate/digitise_geraldes_alves2008.py --pdf PAPER.pdf --overlay PNG

Needs numpy and Pillow (and poppler's `pdfimages` for --pdf).

WHAT THE FIGURE IS.  R_obs = 1 - c_p/c_b (the paper's Eq. 42) against the
feed chloride concentration c_Cl- (mol/m3), at two dye concentrations,
4 and 37 mol/m3.  SYMBOLS are Bowen & Mohammad's measurements (filled
circle Na+ and filled triangle Cl- at 4 mol/m3 of dye; open square Na+ and
open circle Cl- at 37); SOLID lines are NanoFiltran's prediction; DOTTED
lines Bowen & Mohammad's own model (not read here).

THE IMAGE.  The figure is the raster the publisher embedded in the PDF
(670 x 524 px, 200 ppi, greyscale JPEG), extracted UNCHANGED by
`pdfimages -j` from the paper's page 7 (journal page 178); its sha256 is
checked against IMAGE_SHA256 below, so a reading from any other copy is
refused rather than silently different.  The paper is the publisher's
copyright and is NOT in the tree; neither is the image.  The committed
home of the reading is the CSV this writes (the witness case's
`constant/experimental/`), whose header records this script's own sha256
so a stale CSV is detectable (bin/curate/check_nanofiltran_paper.py).

HOW A POINT IS READ, so the reading can be checked and not merely trusted:
  * The axes are calibrated from the PLOT FRAME and the TICK MARKS: the
    frame's left and right edges are x = 0 and 120 (the ticks at 20 ... 100
    are found and printed mapped back to data units), the outside tick
    marks of the left axis are y = 0.5 ... -2.0 and the frame's top edge is
    1.0 (each printed mapped back).  A calibration whose ticks do not land
    within 0.2 px of their labels is REFUSED.
  * A marker is found in a window around its approximate position (listed
    in APPROX, read by eye and written down -- the search, not the eye,
    decides the value): the dark pixels there are taken, the INTERIOR of an
    open marker is filled (pixels the window border cannot reach), and a
    morphological opening by a 5 x 5 square removes the lines (1-2 px wide)
    while the 6-11 px markers survive.  The marker's position is the centre
    of its bounding box (a plotting program centres every marker shape on
    its data point; a triangle's area centroid would sit low).
  * NanoFiltran's solid line of a series is TRACED column by column from a
    seed at a clean place (SEEDS), inside the plot frame, the tracker
    following the run nearest its own linear prediction within +-4 px on a
    mask of CONTINUOUS line pixels (a dark pixel with dark neighbours two
    columns either side -- the dotted line's 2 px dots every ~4 px fail it);
    the marker boxes and the y = 0 axis line are blanked first.  The trace
    is read at each marker's x (`line_reading`): `read` (a quadratic through
    the traced columns on both sides), `bridged` (where the line runs under
    the blanked y = 0 axis line: a straight line across the gap), `end`
    (the line ends under or just before the first or last marker: a straight
    line through its last traced columns), or empty.
READING ERROR.  dcCl and dRobs are +-(1.5 px) mapped to data units -- 0.32
mol/m3 and 0.011 in R_obs -- plus half the marker's bounding-box deficit
against the series' largest marker where a marker is partly hidden;
dRobs_line is 1.5 px where the line was `read` and 3 px where it was
`bridged` or extrapolated to its `end`.  They are READING errors only:
neither paper states a measurement uncertainty, and none is invented here.
CHECKED, not assumed: NanoFiltran rerun on Eqs. 43-45 at the read c_Cl
(bin/curate/nanofiltran/regenerate_paper.py) lands on these line readings
within their reading error (docs/design/a-stiff-pore-solved-at-once.md
section 13).
"""
import argparse
import csv
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_OUT = os.path.join(ROOT, "tutorials", "props", "membrane",
                           "nanofiltran03_bowen_mohammad_ca30", "constant",
                           "experimental", "geraldes_alves2008_fig3.csv")
IMAGE_SHA256 = "c73ba0b2517c22daec568d504e7eb98ff5ee29cf50b452623b8bb297709b4f65"
PAGE = 7                       # the PDF page that carries Fig. 3

#  Frame and ticks (pixels of the 670 x 524 image), found by calibrate().
X_LABELS = (0, 20, 40, 60, 80, 100, 120)
Y_LABELS = (1.0, 0.5, 0.0, -0.5, -1.0, -1.5, -2.0)

#  series -> (ion, dye mol/m3, marker shape)
SERIES = {
    "Na_dye4":  ("Na", 4.0, "filled circle"),
    "Cl_dye4":  ("Cl", 4.0, "filled triangle"),
    "Na_dye37": ("Na", 37.0, "open square"),
    "Cl_dye37": ("Cl", 37.0, "open circle"),
}
#  Approximate marker positions in DATA units, read by eye to place the
#  search window (+-12 px); the search decides the value.
APPROX = {
    "Na_dye4":  [(5, 0.64), (10.5, 0.50), (26, 0.34), (52.5, 0.26), (103, 0.19)],
    "Cl_dye4":  [(5, -0.18), (10.5, -0.03), (26, 0.06), (52.5, 0.10), (103, 0.12)],
    "Na_dye37": [(4.5, 0.87), (9, 0.82), (22, 0.70), (43, 0.58), (87, 0.46)],
    "Cl_dye37": [(4.5, -2.09), (9, -1.34), (22, -0.77), (43, -0.48), (87, -0.24)],
}
#  A clean place on each solid line (data units) to start the trace from.
SEEDS = {
    "Na_dye4":  [(70.0, 0.215)],
    "Cl_dye4":  [(70.0, 0.072), (8.0, -0.19)],
    "Na_dye37": [(70.0, 0.505), (15.0, 0.765)],
    "Cl_dye37": [(70.0, -0.355)],
}
PX_ERR = 1.5


def load(args):
    if args.image:
        path = args.image
        tmp = None
    else:
        if shutil.which("pdfimages") is None:
            sys.exit("digitise_geraldes_alves2008: REFUSED -- --pdf needs poppler's"
                     " pdfimages; give --image FIG3.jpg instead")
        tmp = tempfile.mkdtemp(prefix="ga2008_")
        subprocess.run(["pdfimages", "-f", str(PAGE), "-l", str(PAGE), "-j",
                        args.pdf, os.path.join(tmp, "fig")], check=True)
        imgs = sorted(f for f in os.listdir(tmp) if f.endswith(".jpg"))
        if len(imgs) != 1:
            sys.exit("digitise_geraldes_alves2008: REFUSED -- page %d of %s holds %d"
                     " JPEG images, not the one Fig. 3" % (PAGE, args.pdf, len(imgs)))
        path = os.path.join(tmp, imgs[0])
    raw = open(path, "rb").read()
    sha = hashlib.sha256(raw).hexdigest()
    if IMAGE_SHA256 != "TO_BE_FILLED" and sha != IMAGE_SHA256:
        sys.exit("digitise_geraldes_alves2008: REFUSED -- the image's sha256 is %s,"
                 " not the recorded %s: a different copy of the figure, whose"
                 " reading would differ silently" % (sha, IMAGE_SHA256))
    a = np.asarray(Image.open(path).convert("L")).astype(int)
    if tmp:
        shutil.rmtree(tmp, ignore_errors=True)
    return a, sha


def runs(v):
    """(start, end) of every run of True in a 1-D boolean array."""
    out, s = [], None
    for i, x in enumerate(v):
        if x and s is None:
            s = i
        if (not x or i == len(v) - 1) and s is not None:
            out.append((s, i if x else i - 1))
            s = None
    return out


def calibrate(a):
    dark = a < 128
    H, W = a.shape
    fcols = [i for i in range(W) if dark[:, i].sum() > 0.4 * H]
    frows = [i for i in range(H) if dark[i, :].sum() > 0.4 * W]
    #  frame: the left/right column groups, top/bottom row groups; the
    #  zero line is the row group between them.
    groups = lambda idx: [list(g) for g in np.split(np.array(idx), np.where(np.diff(idx) > 2)[0] + 1)]
    cg, rg = groups(fcols), groups(frows)
    xl, xr = np.mean(cg[0]), np.mean(cg[-1])
    ytop, ybot = np.mean(rg[0]), np.mean(rg[-1])
    zero = [np.mean(g) for g in rg[1:-1]]
    #  outside ticks: the left axis (5 px left of the frame), the bottom axis
    xin = int(round(xl))
    yticks = [np.mean(r) for r in runs(np.array([dark[y, xin - 7:xin - 2].all() for y in range(H)]))]
    yb = int(round(ybot))
    xticks = [np.mean(r) for r in runs(np.array([dark[yb + 2:yb + 7, x].all() for x in range(W)]))]
    sx = (xr - xl) / (X_LABELS[-1] - X_LABELS[0])
    X = lambda px: X_LABELS[0] + (px - xl) / sx
    #  y: least squares through the frame top (1.0) and every tick
    ypx = list(yticks)
    yval = list(Y_LABELS[:len(yticks)])
    A = np.vstack([ypx, np.ones(len(ypx))]).T
    m, c = np.linalg.lstsq(A, np.array(yval), rcond=None)[0]
    Y = lambda py: m * py + c
    report = {"frame": (xl, xr, ytop, ybot), "zero": zero, "xticks": xticks,
              "yticks": yticks, "sx": sx, "sy": 1.0 / m}
    bad = []
    for px, lab in zip(xticks, X_LABELS):
        if abs((X(px) - lab) * sx) > 0.6:
            bad.append("x tick %g at px %.1f reads %.3f" % (lab, px, X(px)))
    for py, lab in zip(ypx, yval):
        if abs((Y(py) - lab) / m) > 0.6:
            bad.append("y tick %g at px %.1f reads %.4f" % (lab, py, Y(py)))
    if len(xticks) != len(X_LABELS) or len(yticks) != len(Y_LABELS):
        bad.append("found %d x ticks and %d y ticks" % (len(xticks), len(yticks)))
    if len(zero) != 1 or abs(Y(zero[0])) > 0.6 * abs(m):
        bad.append("the y = 0 line was not found at y = 0: %s" % zero)
    return X, Y, (lambda x: xl + (x - X_LABELS[0]) * sx), (lambda y: (y - c) / m), report, bad


def erode(m, k):
    r = k // 2
    p = np.pad(m, r, constant_values=False)
    out = np.ones_like(m)
    for dy in range(k):
        for dx in range(k):
            out &= p[dy:dy + m.shape[0], dx:dx + m.shape[1]]
    return out


def dilate(m, k):
    r = k // 2
    p = np.pad(m, r, constant_values=False)
    out = np.zeros_like(m)
    for dy in range(k):
        for dx in range(k):
            out |= p[dy:dy + m.shape[0], dx:dx + m.shape[1]]
    return out


def fill_holes(m):
    """Pixels of the background the window border cannot reach become True."""
    H, W = m.shape
    reach = np.zeros_like(m)
    stack = [(y, x) for y in range(H) for x in (0, W - 1)] + \
            [(y, x) for x in range(W) for y in (0, H - 1)]
    while stack:
        y, x = stack.pop()
        if reach[y, x] or m[y, x]:
            continue
        reach[y, x] = True
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < H and 0 <= xx < W and not reach[yy, xx] and not m[yy, xx]:
                stack.append((yy, xx))
    return ~reach


def component(m, y0, x0):
    """The connected component of m nearest (y0, x0); its bounding box."""
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return None
    k = np.argmin((ys - y0) ** 2 + (xs - x0) ** 2)
    seen = np.zeros_like(m)
    stack = [(ys[k], xs[k])]
    pts = []
    while stack:
        y, x = stack.pop()
        if seen[y, x] or not m[y, x]:
            continue
        seen[y, x] = True
        pts.append((y, x))
        for yy in (y - 1, y, y + 1):
            for xx in (x - 1, x, x + 1):
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not seen[yy, xx]:
                    stack.append((yy, xx))
    py = [p[0] for p in pts]
    px = [p[1] for p in pts]
    return min(py), max(py), min(px), max(px)


def find_marker(a, cx, cy, filled, win=12):
    x0, y0 = int(round(cx)), int(round(cy))
    sub = a[y0 - win:y0 + win + 1, x0 - win:x0 + win + 1] < 140
    if not filled:
        sub = sub | fill_holes(sub)
    op = dilate(erode(sub, 5), 5)
    bb = component(op, win, win)
    if bb is None:
        return None
    t, b, l, r = bb
    return (x0 - win + (l + r) / 2.0, y0 - win + (t + b) / 2.0,
            (r - l + 1), (b - t + 1), (x0 - win + l, y0 - win + t, x0 - win + r, y0 - win + b))


def solid_mask(a, blank):
    """Dark pixels that belong to a CONTINUOUS line: dark, with a dark pixel
    within +-4 rows in each of the two columns on either side.  The dotted
    line (2 px dots every ~4 px) fails the test; the solid line passes it."""
    dark = a < 150
    for (l, t, r, b) in blank:
        dark[t:b + 1, l:r + 1] = False
    H, W = dark.shape
    near = np.zeros_like(dark)
    for dy in range(-4, 5):
        near |= np.roll(dark, dy, axis=0)
    keep = dark.copy()
    for dx in (-2, -1, 1, 2):
        keep &= np.roll(near, dx, axis=1)
    return keep


def trace(mask, seed_px, box, step_max=4, gap_max=25):
    """Follow a solid line left and right of a seed, inside the plot frame
    `box` (x0, x1, y0, y1, px); a gap longer than gap_max columns (the line
    has ended) stops it.  Returns {column: y}."""
    x0, x1, y0, y1 = box
    out = {}
    for direction in (-1, +1):
        x = int(round(seed_px[0]))
        hist = [(x, seed_px[1])]
        gap = 0
        while x0 + 3 < x < x1 - 3:
            x += direction
            real = [h for h in hist if h[2:] != ("x",)][-8:]
            if len(real) >= 2:
                (xa, ya), (xb, yb) = real[0][:2], real[-1][:2]
                slope = (yb - ya) / (xb - xa) if xb != xa else 0.0
                pred = yb + slope * (x - xb)
            else:
                pred = hist[-1][1]
            lo, hi = int(pred - step_max - 1), int(pred + step_max + 1)
            lo0 = max(lo, int(y0) + 3)
            hi = min(hi, int(y1) - 3)
            cand = [(s + lo0, e + lo0) for s, e in runs(mask[lo0:hi + 1, x])]
            cand = [(s, e) for s, e in cand if e - s <= 8]
            if cand:
                s, e = min(cand, key=lambda r: abs((r[0] + r[1]) / 2 - pred))
                y = (s + e) / 2.0
                hist.append((x, y))
                out[x] = y
                gap = 0
            else:
                gap += 1
                hist.append((x, pred, "x"))
                if gap > gap_max:
                    break
    return out


def line_at(tr, px, span=18, bridge=100, reach=10):
    """The traced line at column px, and how it was read:
      read     a quadratic through the traced columns within +-span on BOTH
               sides of px (a marker's blanked box is always bridged so);
      bridged  the nearest traced columns on the two sides are farther than
               span (the line ran under the y = 0 axis line, which is
               blanked): a straight line between the nearest 6 columns of
               each side, at most `bridge` columns apart;
      end      the trace stops on one side within `reach` columns (the line
               ends at, or just before, the first or last measured c_Cl):
               a straight line through the last 8 traced columns;
    and (None, "") where none of these holds."""
    cs = sorted(tr)
    left = [c for c in cs if c <= px]
    right = [c for c in cs if c >= px]
    if left and right and px - left[-1] <= span and right[0] - px <= span:
        use = [c for c in cs if abs(c - px) <= span]
        ys = [tr[c] for c in use]
        return float(np.polyval(np.polyfit(use, ys, 2 if len(use) >= 6 else 1), px)), "read"
    if left and right and right[0] - left[-1] <= bridge:
        use = left[-6:] + right[:6]
        return float(np.polyval(np.polyfit(use, [tr[c] for c in use], 1), px)), "bridged"
    side = left if left and px - left[-1] <= reach else (right if right and right[0] - px <= reach else None)
    if side:
        use = side[-8:] if side is left else side[:8]
        return float(np.polyval(np.polyfit(use, [tr[c] for c in use], 1), px)), "end"
    return None, ""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--pdf")
    g.add_argument("--image")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--overlay", help="also write the image with the reading drawn on it")
    args = ap.parse_args()
    a, sha = load(args)
    X, Y, PX, PY, rep, bad = calibrate(a)
    print("frame px: x %.1f..%.1f  y %.1f..%.1f;  %.4f px per mol/m3, %.3f px per unit R"
          % (*rep["frame"], rep["sx"], rep["sy"]))
    print("x ticks read back:", " ".join("%.3f" % X(p) for p in rep["xticks"]))
    print("y ticks read back:", " ".join("%.4f" % Y(p) for p in rep["yticks"]),
          " zero line:", " ".join("%.4f" % Y(z) for z in rep["zero"]))
    if bad:
        sys.exit("digitise_geraldes_alves2008: REFUSED -- the calibration does not"
                 " land on the tick labels:\n  " + "\n  ".join(bad))
    sx, sy = rep["sx"], rep["sy"]
    markers = {}
    for s, pts in APPROX.items():
        filled = SERIES[s][2].startswith("filled")
        markers[s] = [find_marker(a, PX(x), PY(y), filled) for x, y in pts]
    blank = []
    for s in markers:
        for mk in markers[s]:
            if mk:
                l, t, r, b = mk[4]
                blank.append((l - 2, t - 2, r + 2, b + 2))
    zr = rep["zero"][0]
    blank.append((0, int(zr) - 1, a.shape[1] - 1, int(zr) + 2))
    mask = solid_mask(a, blank)
    traces = {}
    for s, seeds in SEEDS.items():
        tr = {}
        for sx_, sy_ in seeds:
            for c, y in trace(mask, (PX(sx_), PY(sy_)), rep["frame"]).items():
                if c in tr and abs(tr[c] - y) > 2.0:
                    sys.exit("digitise_geraldes_alves2008: REFUSED -- two seeds of %s"
                             " trace different lines at column %d (%.1f vs %.1f px)"
                             % (s, c, tr[c], y))
                tr[c] = y
        traces[s] = tr
    rows = []
    for s, mks in markers.items():
        ion, dye, shape = SERIES[s]
        wmax = max(m[2] for m in mks if m)
        hmax = max(m[3] for m in mks if m)
        for i, mk in enumerate(mks):
            if mk is None:
                sys.exit("digitise_geraldes_alves2008: REFUSED -- no marker found near"
                         " %s point %d %s" % (s, i + 1, APPROX[s][i]))
            mx, my, w, h, box = mk
            dxp = PX_ERR + 0.5 * (wmax - w)
            dyp = PX_ERR + 0.5 * (hmax - h)
            ly, lq = line_at(traces[s], mx)
            line = "" if ly is None else "%.4f" % Y(ly)
            dline = "" if ly is None else "%.4f" % ((PX_ERR if lq == "read" else 2 * PX_ERR) / abs(sy))
            rows.append(dict(series=s, ion=ion, dye_molm3="%g" % dye, marker=shape,
                             cCl_molm3="%.3f" % X(mx), dcCl_molm3="%.3f" % (dxp / sx),
                             Robs_exp="%.4f" % Y(my), dRobs="%.4f" % (dyp / abs(sy)),
                             Robs_NanoFiltran_line=line, dRobs_line=dline, line_reading=lq, px_x="%.1f" % mx, px_y="%.1f" % my,
                             bbox="%dx%d" % (w, h)))
    me = hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", newline="") as f:
        f.write(HEADER % dict(image=sha, script=me, sx=sx, sy=abs(sy),
                              xl=rep["frame"][0], zero=rep["zero"][0]))
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print("wrote %s (%d points)" % (os.path.relpath(args.out, ROOT), len(rows)))
    for r in rows:
        print("  %-9s c_Cl %7.3f +- %.3f   R_obs %8.4f +- %.4f   line %16s   bbox %s"
              % (r["series"], float(r["cCl_molm3"]), float(r["dcCl_molm3"]),
                 float(r["Robs_exp"]), float(r["dRobs"]),
                 r["Robs_NanoFiltran_line"] + " " + r["line_reading"], r["bbox"]))
    if args.overlay:
        rgb = np.stack([a, a, a], -1).astype(np.uint8)
        for s, tr in traces.items():
            for c, y in tr.items():
                rgb[int(round(y)), c] = (255, 0, 0)
        for s, mks in markers.items():
            for mk in mks:
                l, t, r, b = mk[4]
                rgb[t, l:r + 1] = rgb[b, l:r + 1] = (0, 160, 255)
                rgb[t:b + 1, l] = rgb[t:b + 1, r] = (0, 160, 255)
        Image.fromarray(rgb).resize((a.shape[1] * 2, a.shape[0] * 2), Image.NEAREST).save(args.overlay)
        print("overlay:", args.overlay)


HEADER = """# Bowen & Mohammad's measured R_obs of Na+ and Cl- on CA30, and NanoFiltran's line -- Fig. 3 of
#   V. Geraldes, A.M. Brites Alves, "Computer program for simulation of mass transport in
#   nanofiltration membranes", J. Membr. Sci. 321 (2008) 172-182, doi:10.1016/j.memsci.2008.04.054
#   (the measurements: W.R. Bowen, A.W. Mohammad, AIChE J. 44 (1998) 1799).
# LICENCE: these are FACTS read from a figure (numbers, not the figure), cited above; the figure
#   and the paper are the publisher's copyright and are not in the tree.
# HOW: bin/curate/digitise_geraldes_alves2008.py, whose header states the method and what the
#   reading error means.  R_obs = 1 - c_p/c_b (the paper's Eq. 42); c_Cl in mol/m3.
#   Robs_exp is the SYMBOL (the measurement); Robs_NanoFiltran_line the paper's solid line read
#   under the same marker (empty where the line does not reach it).  dcCl/dRobs are READING
#   errors only: no measurement uncertainty is stated by either paper.
# image_sha256 %(image)s
# digitiser_sha256 %(script)s
# calibration: x = (px - %(xl).2f)/%(sx).6f ; y = (%(zero).2f - py)/%(sy).6f  (px from the image top-left)
"""


if __name__ == "__main__":
    main()
