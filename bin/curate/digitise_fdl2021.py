#!/usr/bin/env python3
"""Digitise the measured points and the fitted lines of Figures 1-4 of
Fernandez de Labastida & Yaroshchuk, "Nanofiltration of Multi-Ion Solutions:
Quantitative Control of Concentration Polarization and Interpretation by
Solution-Diffusion-Electro-Migration Model", Membranes 11 (2021) 272,
doi:10.3390/membranes11040272 -- CC BY 4.0.

    bin/curate/digitise_fdl2021.py [--figures DIR] [--download] [--out CSV]

WHAT THE FIGURES ARE.  Each (a) panel plots the dominant salt's reciprocal
intrinsic transmission f_s = 1/(1 - R_s) against the transmembrane flux J_v
(um/s); each (b) panel the trace ions' f_t.  SYMBOLS are the measured,
CP-corrected (intrinsic) rejections on a flat NF270 disc in the rotating-disk
cell; LINES are the authors' SDEM fits (their Eq. (1) for the salt, Eq. (3)
for a trace) with the permeances of their Table 1.  Fig 2b's y axis is
logarithmic; Fig 3b carries Cl and NO3 on a RIGHT axis whose labels stop at
8 although its ticks continue (the range is read from the tick marks, 0-18,
and printed so the reading can be checked).

HOW A POINT IS READ, so the reading can be checked and not merely trusted:
  * The axes are calibrated from the AXIS LINES (Excel draws each axis line
    exactly from its minimum to its maximum) and VERIFIED against the
    tick-label centroids, which this script prints mapped back to data
    units -- they land on 0, 10, 20 ... to a few hundredths.
  * A marker is separated from the lines by a morphological opening: a
    ~10 px line vanishes under a 14 px disc, a ~50 px marker survives.  A
    second pass with a 9 px disc recovers markers PARTLY HIDDEN under another
    series' marker; those are flagged `occluded` and carry a larger reading
    error (half the missing bounding-box width, in data units).
  * A marker's position is the centre of its bounding box (Excel centres
    every marker shape on the data point; a triangle's area centroid would
    sit 1/6 of its height too low).
  * The fitted line of a series is read at each marker's x as a linear fit
    through the line's pixels within +-90 columns, after every marker's
    neighbourhood is cut out; `f_line` is empty where the drawn line ends
    before the marker (Fig 1: the authors stopped their lines short of the
    last point).
  * Fig 3b's three ARROWS (annotations drawn in the series colours) are
    blanked by declared rectangles and listed as excluded; nothing else is
    dropped or edited.

READING ERROR.  `dJv` and `df` are +-(2 px + half the bounding-box deficit
of an occluded marker) mapped to data units: ~0.07 um/s in x and 0.3 % of
the axis span in y for a clean marker.  They are READING errors only; the
authors publish no measurement uncertainty and none is invented here.

THE IMAGES ARE NOT IN THE TREE.  They are the publisher's full-resolution
PNGs (2460 px wide), fetched from https://mdpi-res.com/... into
data/local/fdl2021/figures/ (the private tier, gitignored) with --download.
The committed home of the reading is the CSV this writes, under the
witness case's `constant/experimental/` (the tree's home for measured
data a case carries; every other tutorial CSV is a run output and ignored); this script is how that CSV is reproduced.
"""
import argparse
import csv
import os
import sys
import urllib.request

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_FIGDIR = os.path.join(ROOT, "data", "local", "fdl2021", "figures")
DEFAULT_OUT = os.path.join(ROOT, "tutorials", "steady", "membranes",
                           "membrane12_sdem_nf270_nacl_traces", "constant", "experimental", "fdl2021_figures.csv")
CDN = "https://mdpi-res.com/membranes/membranes-11-00272/article_deploy/html/images/membranes-11-00272-%s.png"

PAL = {  # Excel 2013 palette as measured on the figures (RGB)
    'blue': (91, 155, 213), 'red': (255, 0, 0), 'green': (146, 208, 80),
    'cyan': (0, 176, 240), 'gold': (255, 192, 0), 'orange': (237, 125, 49),
    'grey': (165, 165, 165),
}
# per panel: dominant salt, y range (linear or log), series -> (marker colour, line colour)
FIGS = {
    'g001a': dict(salt='NaCl', y=(0, 9), log=False, series={'NaCl': ('blue', 'red')}),
    'g001b': dict(salt='NaCl', y=(0, 8), log=False,
                  series={'NH4': ('green', 'green'), 'NO3': ('cyan', 'cyan')}),
    'g002a': dict(salt='MgCl2', y=(0, 7), log=False, series={'MgCl2': ('blue', 'red')}),
    'g002b': dict(salt='MgCl2', y=(0.1, 10), log=True,
                  series={'NO3': ('cyan', 'cyan'), 'Na': ('blue', 'blue'), 'NH4': ('green', 'green')}),
    'g003a': dict(salt='Na2SO4', y=(0, 350), log=False, series={'Na2SO4': ('blue', 'red')}),
    'g003b': dict(salt='Na2SO4', y=(0, 100), log=False, right=True,
                  series={'NH4': ('green', 'green'), 'Cl': ('gold', 'gold'), 'NO3': ('cyan', 'cyan')},
                  right_series=('Cl', 'NO3')),
    'g004a': dict(salt='MgSO4', y=(0, 300), log=False, series={'MgSO4': ('blue', 'orange')}),
    'g004b': dict(salt='MgSO4', y=(0, 9), log=False,
                  series={'NH4': ('green', 'grey'), 'Na': ('blue', 'blue'), 'Cl': ('gold', 'gold'),
                          'NO3': ('cyan', 'cyan')}),
}
XRANGE = (0.0, 60.0)
#  Annotations drawn in a series colour that are NOT data: Fig 3b's three
#  arrows pointing each trace to its axis.  Rectangles (x0, y0, x1, y1) in
#  the original image are painted white before any mask is taken.
BLANK = {'g003b': [(440, 270, 940, 345, 'green arrow'), (1230, 865, 1735, 930, 'gold arrow'),
                   (1265, 1093, 1775, 1152, 'cyan arrow')]}
CIRCLE_MIN_BBOX = 44          # a circle marker is ~47 px; an arrowhead ~33
TRIANGLE_SERIES = {'NH4'}     # the paper's only triangle marker (bbox ~33-38)


def cmask(a, rgb, tol=60):
    return np.sqrt(((a - np.array(rgb)) ** 2).sum(-1)) < tol


def longest_run(v):
    best = (0, -1); s = None
    for i, x in enumerate(v):
        if x and s is None: s = i
        if (not x or i == len(v) - 1) and s is not None:
            e = i if x else i - 1
            if e - s > best[1] - best[0]: best = (s, e)
            s = None
    return best


def axes_of(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    grey = (abs(r - g) < 12) & (abs(g - b) < 12) & (r > 150) & (r < 230)
    H, W = grey.shape
    cols = np.where(grey.sum(0) / H > 0.35)[0]; rows = np.where(grey.sum(1) / W > 0.35)[0]

    def clusters(idx):
        out = []
        for i in idx:
            if out and i - out[-1][-1] <= 2: out[-1].append(i)
            else: out.append([i])
        return out
    cc = clusters(cols); rc = clusters(rows)
    x0 = int(np.mean(cc[0])); y0 = int(np.mean(rc[-1]))
    ytop, ybot = longest_run(grey[:, x0])
    _, xright = longest_run(grey[y0, :])
    right = None
    if len(cc) > 1:
        xr = int(np.mean(cc[-1])); s3, e3 = longest_run(grey[:, xr])
        right = dict(x=xr, ytop=s3, ybot=e3)
        xright = xr          # the axis run continues past the plot where a tick crosses it
    return dict(x0=x0, y0=y0, ytop=ytop, ybot=ybot, xleft=x0, xright=xright, right=right, grey=grey)


def tick_labels(a, ax):
    """centroids of dark-grey text blobs left of the y axis and below the x axis"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dark = (abs(r - g) < 15) & (abs(g - b) < 15) & (r < 140)
    lab, _ = ndimage.label(dark)
    ys = []; xs = []
    for o in ndimage.find_objects(lab):
        sy, sx = o; h = sy.stop - sy.start
        if h < 25 or h > 90: continue
        cy = (sy.start + sy.stop) / 2; cx = (sx.start + sx.stop) / 2
        if sx.stop < ax['x0'] - 5 and ax['ytop'] - 40 < cy < ax['ybot'] + 40: ys.append(cy)
        if ax['y0'] + 5 < sy.start < ax['y0'] + 140 and ax['xleft'] - 60 < cx < ax['xright'] + 60: xs.append(cx)
    return sorted(set(np.round(ys, 0))), sorted(set(np.round(xs, 0)))


def disc(r):
    d = np.zeros((2 * r + 1, 2 * r + 1), bool); yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
    d[yy * yy + xx * xx <= r * r] = True
    return d


def digitise(name, figdir, log=print):
    cfg = FIGS[name]
    a = np.asarray(Image.open(os.path.join(figdir, f'{name}.png')).convert('RGB')).astype(int)
    ax = axes_of(a)
    for (bx0, by0, bx1, by1, _w) in BLANK.get(name, []):
        a[by0:by1, bx0:bx1] = 255
    y_lo, y_hi = cfg['y']

    def px2x(px):
        return XRANGE[0] + (px - ax['xleft']) / (ax['xright'] - ax['xleft']) * (XRANGE[1] - XRANGE[0])

    def px2y(py, lo=y_lo, hi=y_hi, top=ax['ytop'], bot=ax['ybot'], islog=cfg['log']):
        t = (bot - py) / (bot - top)
        return 10 ** (np.log10(lo) + t * (np.log10(hi) - np.log10(lo))) if islog else lo + t * (hi - lo)

    ys, xs = tick_labels(a, ax)
    log(f'[{name}] {cfg["salt"]}: y labels map to {[round(float(px2y(y)), 3) for y in ys]}')
    log(f'[{name}] x labels map to {[round(float(px2x(x)), 2) for x in xs]}  (a two-digit label is two blobs)')
    px2yr = None
    if cfg.get('right'):
        R = ax['right']; xr = R['x']
        seg = ax['grey'][:, xr + 6:xr + 26].mean(1) > 0.5
        idx = np.where(seg)[0]
        ticks = sorted(int(np.mean(k)) for k in np.split(idx, np.where(np.diff(idx) > 3)[0] + 1) if len(k))
        n = len(ticks) - 1; r_hi = 2.0 * n
        log(f'[{name}] right axis: {n} tick intervals of {sorted(set(np.diff(ticks)))} px, value 2 per tick'
            f' (labels 0..8) -> range 0..{r_hi:g}; top tick {ticks[0]} vs axis top {R["ytop"]}')

        def px2yr(py):
            return px2y(py, 0.0, r_hi, R['ytop'], R['ybot'], False)

    inplot = np.zeros(a.shape[:2], bool)
    inplot[ax['ytop'] - 30:ax['ybot'] + 30, ax['xleft'] + 3:ax['xright'] - 3] = True
    allmarks = np.zeros(a.shape[:2], bool)
    for _s, (mc2, _lc2) in cfg['series'].items():
        allmarks |= ndimage.binary_opening(cmask(a, PAL[mc2]) & inplot, structure=disc(9))
    rows = []
    for sname, (mc, lc) in cfg['series'].items():
        mm = cmask(a, PAL[mc]) & inplot
        use_right = bool(cfg.get('right')) and sname in cfg['right_series']
        pts = []
        for r, tag in ((14, 'clean'), (9, 'occluded')):
            lab, _ = ndimage.label(ndimage.binary_opening(mm, structure=disc(r)))
            for o in ndimage.find_objects(lab):
                sy, sx = o; h = sy.stop - sy.start; w = sx.stop - sx.start
                if h < 20 or w < 20: continue
                cy = (sy.start + sy.stop - 1) / 2; cx = (sx.start + sx.stop - 1) / 2
                if tag == 'clean' and sname not in TRIANGLE_SERIES and mc != 'blue' and max(w, h) < CIRCLE_MIN_BBOX:
                    continue
                if any(abs(p['cx'] - cx) < 30 and abs(p['cy'] - cy) < 30 for p in pts): continue
                full = 36 if sname in TRIANGLE_SERIES else (39 if (mc == 'blue' and name == 'g004b') else 47)
                deficit = max(0, full - max(w, h)); epx = 2 + deficit / 2
                fy = px2yr(cy) if use_right else px2y(cy)
                dx_ = epx * (XRANGE[1] - XRANGE[0]) / (ax['xright'] - ax['xleft'])
                dy_ = abs(float((px2yr(cy - epx) if use_right else px2y(cy - epx)) - fy))
                pts.append(dict(cx=cx, cy=cy, w=w, h=h, x=float(px2x(cx)), f=float(fy), dx=dx_, df=dy_,
                                quality='occluded' if deficit >= 6 else 'clean',
                                axis='right' if use_right else 'left'))
        pts.sort(key=lambda p: p['x'])
        lm = cmask(a, PAL[lc], tol=45) & inplot & ~ndimage.binary_dilation(allmarks, iterations=10)
        for p in pts:
            cx, cy = p['cx'], p['cy']; xs_ = []; ys_ = []
            for col in range(int(cx) - 90, int(cx) + 91):
                if col < ax['xleft'] or col >= ax['xright']: continue
                lo = max(0, int(cy) - 150); rr = np.where(lm[lo:int(cy) + 150, col])[0]
                if len(rr) >= 3: xs_.append(col); ys_.append(float(np.median(rr)) + lo)
            if len(xs_) >= 10:
                py = float(np.polyval(np.polyfit(xs_, ys_, 1), cx))
                p['f_line'] = float(px2yr(py) if p['axis'] == 'right' else px2y(py))
            else:
                p['f_line'] = None
            rows.append(dict(figure=name, salt=cfg['salt'], series=sname, axis=p['axis'],
                             Jv_umps=round(p['x'], 3), dJv_umps=round(p['dx'], 2),
                             f_exp=round(p['f'], 4), df=round(p['df'], 4),
                             f_line='' if p['f_line'] is None else round(p['f_line'], 4),
                             quality=p['quality'], px_x=round(cx, 1), px_y=round(cy, 1), bbox=f'{p["w"]}x{p["h"]}'))
        log(f'[{name}]   {sname}: {len(pts)} marker(s), '
            f'{sum(1 for p in pts if p["quality"] == "occluded")} occluded, '
            f'{sum(1 for p in pts if p["f_line"] is None)} without a line under it')
    return rows


HEADER = """# NF270 ion rejections vs transmembrane flux -- the paper's FIGURES 1-4, DIGITISED
#
# SOURCE PAPER:
#   M. Fernandez de Labastida, A. Yaroshchuk, "Nanofiltration of Multi-Ion Solutions:
#   Quantitative Control of Concentration Polarization and Interpretation by
#   Solution-Diffusion-Electro-Migration Model", Membranes 11 (2021) 272.
#   DOI: 10.3390/membranes11040272   Licence: CC BY 4.0.
#   Feeds: dominant salt 0.01 mol/L (NaCl, MgCl2, Na2SO4, MgSO4) + trace salts 2e-4 mol/L
#   (NaNO3, NH4Cl); 20 C; 2-14 bar; rotating-disk cell, rejections CP-corrected (intrinsic).
#
# HOW: read off the publisher's 2460 px panels by bin/curate/digitise_fdl2021.py -- that
# script's header states the method, the calibration check and what the reading error means.
# Regenerate with `bin/curate/digitise_fdl2021.py --download`.
# f = 1/(1-R) (reciprocal intrinsic transmission); R = 1 - 1/f.  f_exp is the SYMBOL (the
# measurement, CP-corrected by the authors); f_line the authors' SDEM fit read under the
# same marker (empty where their line stops short of it).  dJv/df are READING errors only.
# figure,salt,series,axis,Jv_umps,dJv_umps,f_exp,df,f_line,quality,px_x,px_y,bbox
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--figures', default=DEFAULT_FIGDIR, help='directory holding g001a.png .. g004b.png')
    ap.add_argument('--download', action='store_true', help='fetch the eight PNGs from the publisher CDN into --figures')
    ap.add_argument('--out', default=DEFAULT_OUT)
    args = ap.parse_args()
    if args.download:
        os.makedirs(args.figures, exist_ok=True)
        for name in FIGS:
            dst = os.path.join(args.figures, f'{name}.png')
            if os.path.exists(dst): continue
            req = urllib.request.Request(CDN % name, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=120) as r, open(dst, 'wb') as f:
                f.write(r.read())
            print(f'fetched {dst}')
    missing = [n for n in FIGS if not os.path.exists(os.path.join(args.figures, f'{n}.png'))]
    if missing:
        sys.exit(f'REFUSED: figure image(s) {missing} not in {args.figures}; run with --download '
                 f'(the images are the publisher\'s, CC BY 4.0, and are not kept in the tree)')
    rows = []
    for name in FIGS:
        rows += digitise(name, args.figures)
    with open(args.out, 'w', newline='') as f:
        f.write(HEADER)
        w = csv.DictWriter(f, fieldnames=['figure', 'salt', 'series', 'axis', 'Jv_umps', 'dJv_umps', 'f_exp', 'df',
                                          'f_line', 'quality', 'px_x', 'px_y', 'bbox'])
        for r in rows: w.writerow(r)
    print(f'wrote {len(rows)} point(s) to {args.out}')


if __name__ == '__main__':
    main()
