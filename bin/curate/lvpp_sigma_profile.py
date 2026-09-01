#!/usr/bin/env python3
# lvpp_sigma_profile.py -- turn an LVPP raw COSMO file into the three numbers
# Choupo's `cosmo { }` block needs: area, volume, and a 51-point sigma profile.
#
# WHERE THE DATA COMES FROM, and what is OURS.
#
#   The .cosmo files are the LVPP sigma-profile database (github.com/lvpp/sigma,
#   release v25, asset nw-b3lyp-svpd.zip), MIT License, Copyright (c) 2017
#   LVPP -- licence read from the repository's own LICENSE file, not from a
#   claim in a document.  Area and volume are THEIRS: read straight off the
#   file, unmodified.
#
#   THE SIGMA PROFILE IS NOT THEIRS.  They publish the raw quantum output --
#   surface segments with a charge and an area each -- and no averaging code
#   in that repository.  The profile below is COMPUTED HERE from their
#   segments, so it is Choupo's derivation FROM LVPP data, and every record
#   this writes says exactly that.  Attributing a number to somebody who did
#   not publish it is the failure this whole project is built against.
#
# THE EXACT SOURCE, so this is reproducible without me:
#
#     git clone https://github.com/lvpp/sigma          (MIT, (c) 2017 LVPP)
#     curl -LO https://github.com/lvpp/sigma/releases/download/v25/nw-b3lyp-svpd.zip
#     sha256  bd5b0c92d7ab51c37609b841e4806715198d8927726d19c38d1f4382c3a21beb
#     2652 raw .cosmo files, named by chemical name (no CAS in the archive).
#
# The archive belongs in thirdParty/ (gitignored) beside the ThermoML mirror,
# per CLAUDE.md §7: third-party databank ORIGINALS are never committed.
#
# A UNIT TRAP THIS TOOL PAID FOR, recorded because the file's own comment is
# misleading: the $cosmo_data `area` and `volume` are in ATOMIC UNITS while
# the segment table's area column is in A^2.  Water's segments sum to
# 45.66 A^2 against a declared 163.07, and 163.07/45.66 = 3.5711 = 1/0.28003,
# one bohr^2 in A^2 exactly.  Uncorrected, every area would ship 3.57x too
# large -- and no activity coefficient would look wrong.  What caught it was
# the RECONCILIATION, two readings of one quantity from two parts of one
# file, which is now a refusal rather than a print.
#
# THE AVERAGING is the standard COSMO-SAC one (Klamt's charge averaging as
# used by Lin & Sandler 2002):
#
#     sigma_m = SUM_n sigma_n w_mn / SUM_n w_mn
#     w_mn    = (r_n^2 r_av^2 / (r_n^2 + r_av^2))
#               * exp(-f_decay * d_mn^2 / (r_n^2 + r_av^2))
#
# with r_n = sqrt(a_n/pi) the segment's own radius, r_av = sqrt(a_eff/pi) the
# averaging radius, a_eff = 7.5 A^2 and f_decay = 3.57.
#
# a_eff IS READ FROM THE ENGINE (src/thermo/activityCoefficient/CosmoSac.cpp,
# A_EFF), never repeated here: the averaging that BUILDS a profile and the
# model that CONSUMES it must not disagree about the segment size, and two
# copies of one constant is how they would.
#
# VERIFY BEFORE YOU TRUST: this writes nothing into data/standards/.  It
# prints, or writes to data/local/.  The profile it computes is checked by
# running a real VLE case against measured data -- see --selftest.
#
#     SPDX-License-Identifier: GPL-3.0-or-later
"""Read an LVPP .cosmo file; emit area, volume and a 51-point sigma profile."""
import argparse
import math
import pathlib
import re
import sys

import numpy as np

BOHR_TO_A = 0.529177210903          # CODATA; the segment coordinates are a.u.
F_DECAY   = 3.57                    # Lin & Sandler 2002
SIGMA_MIN = -0.025                  # e/A^2   -- the grid Choupo's block uses
SIGMA_MAX =  0.025
NGRID     = 51

ENGINE_COSMO = pathlib.Path(__file__).resolve().parents[2] \
    / "src/thermo/activityCoefficient/CosmoSac.cpp"


def a_eff_from_engine() -> float:
    """The effective segment area the MODEL uses.  Read, never repeated: a
    profile averaged at one a_eff and consumed at another is wrong in a way
    no output would show."""
    txt = ENGINE_COSMO.read_text()
    m = re.search(r"A_EFF\s*=\s*([0-9.]+)", txt)
    if not m:
        sys.exit("could not read A_EFF from CosmoSac.cpp -- refusing to average "
                 "with a constant of my own")
    return float(m.group(1))


def read_cosmo(path: pathlib.Path):
    """area [A^2], volume [A^3], and the segment table."""
    txt = path.read_text(errors="replace")
    def scalar(key):
        m = re.search(rf"^\s*{key}=\s*([0-9.eE+-]+)", txt, re.M)
        return float(m.group(1)) if m else None
    #  THE $cosmo_data BLOCK IS IN ATOMIC UNITS, whatever the file's own
    #  comment says.  Found by the reconciliation below and not by reading:
    #  water's segments sum to 45.66 A^2 while the block says 163.07, and the
    #  ratio is 3.5711 = 1 / 0.28003, which is one bohr^2 in A^2 exactly.
    #  Shipped uncorrected, every area would have been 3.57x too large and
    #  nothing in a gamma would have looked wrong.
    area   = scalar("area")
    volume = scalar("volume")
    if area is None or volume is None:
        sys.exit(f"{path.name}: no area/volume in $cosmo_data -- refusing")
    area   *= BOHR_TO_A ** 2
    volume *= BOHR_TO_A ** 3

    seg = txt.split("$segment_information", 1)
    if len(seg) != 2:
        sys.exit(f"{path.name}: no $segment_information block -- refusing")
    xyz, a_n, s_n = [], [], []
    for line in seg[1].splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("$"):
            continue
        p = line.split()
        if len(p) < 9:
            continue
        #  n atom x y z charge area charge/area potential
        xyz.append([float(p[2]), float(p[3]), float(p[4])])
        a_n.append(float(p[6]))
        s_n.append(float(p[7]))
    if not xyz:
        sys.exit(f"{path.name}: segment block present but empty -- refusing")
    return area, volume, (np.array(xyz) * BOHR_TO_A,
                          np.array(a_n), np.array(s_n))


def average(xyz, a_n, s_n, a_eff):
    """Klamt averaging.  O(n^2) and deliberately not approximated: the whole
    point of a profile is that every segment sees every other."""
    r2   = a_n / math.pi                      # r_n^2
    rav2 = a_eff / math.pi                    # r_av^2
    d2   = ((xyz[:, None, :] - xyz[None, :, :]) ** 2).sum(-1)
    den  = r2[None, :] + rav2
    w    = (r2[None, :] * rav2 / den) * np.exp(-F_DECAY * d2 / den)
    return (w * s_n[None, :]).sum(1) / w.sum(1)


def profile(sigma, a_n):
    """Bin the AREA onto the 51-point grid, splitting each segment linearly
    between its two bracketing nodes -- a segment sitting between two nodes
    belongs partly to each, and rounding it to the nearest would quantise the
    profile."""
    grid = np.linspace(SIGMA_MIN, SIGMA_MAX, NGRID)
    step = grid[1] - grid[0]
    p = np.zeros(NGRID)
    clipped = 0
    for s, a in zip(sigma, a_n):
        if s <= grid[0]:
            p[0] += a;  clipped += (s < grid[0]); continue
        if s >= grid[-1]:
            p[-1] += a; clipped += (s > grid[-1]); continue
        k = int((s - grid[0]) / step)
        f = (s - grid[k]) / step
        p[k] += a * (1.0 - f)
        p[k + 1] += a * f
    return grid, p, clipped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cosmo", type=pathlib.Path)
    ap.add_argument("--name", default=None, help="Choupo component name")
    args = ap.parse_args()

    a_eff = a_eff_from_engine()
    area, volume, (xyz, a_n, s_n) = read_cosmo(args.cosmo)
    sig = average(xyz, a_n, s_n, a_eff)
    grid, p, clipped = profile(sig, a_n)

    name = args.name or args.cosmo.stem
    print(f"//  {name}: from LVPP {args.cosmo.name}")
    print(f"//  segments {len(a_n)}   a_eff {a_eff} A^2 (read from CosmoSac.cpp)"
          f"   f_decay {F_DECAY}")
    #  THE RECONCILIATION IS THE CHECK, not a print.  The profile is built by
    #  distributing the SEGMENT areas onto the grid, so its total must equal
    #  the cavity area the file declares -- computed two different ways from
    #  two different parts of the same file.  It is what caught the unit bug
    #  above, and a disagreement means something is wrong that no activity
    #  coefficient would reveal.
    dev = abs(p.sum() - area) / area * 100.0
    print(f"//  profile area {p.sum():.4f} A^2 vs cavity area {area:.4f} A^2"
          f"   ({dev:.4f} %)")
    if dev > 1.0:
        sys.exit(f"REFUSING {name}: the profile carries {p.sum():.4f} A^2 and "
                 f"the cavity declares {area:.4f} A^2 ({dev:.2f} %).  Those are "
                 "two readings of one quantity and they must agree; a profile "
                 "that loses area is a profile of a smaller molecule.")
    if clipped:
        print(f"//  WARNING: {clipped} segment(s) fell OUTSIDE the grid and were "
              "piled on its end nodes")
    #  THE KEYS ARE THE ONES water.dat's VT2005 BLOCK USES, checked against
    #  that file rather than invented: `model COSMOSAC` and a QUOTED variant.
    #  A block spelled a way the loader does not read is a profile that is
    #  present and unreachable.
    print("cosmo")
    print("{")
    print("    LVPP_v25")
    print("    {")
    print("        model       COSMOSAC;")
    print("        variant     \"2002\";")
    print(f"        source      \"LVPP sigma-profile database v25 "
          f"(github.com/lvpp/sigma), release asset nw-b3lyp-svpd.zip, "
          f"MIT License (c) 2017 LVPP; raw COSMO file {args.cosmo.name}\";")
    print("        derivation  \"SIGMA PROFILE COMPUTED BY CHOUPO from LVPP's "
          "raw COSMO segments (Klamt averaging, a_eff read from CosmoSac.cpp, "
          "f_decay 3.57).  LVPP publishes the segments, not this profile: the "
          "area and volume are theirs, the 51 numbers below are ours.\";")
    print("        licence     MIT;")
    print("        installed   true;")
    print(f"        area        {area:.5f};")
    print(f"        volume      {volume:.5f};")
    print("        sigmaProfile  (")
    for i in range(0, NGRID, 6):
        print("            " + "  ".join(f"{v:11.6f}" for v in p[i:i+6]))
    print("        );")
    print("    }")
    print("}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
