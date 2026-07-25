#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sigma_profile.py -- generate a COSMO-SAC 51-point sigma profile from a raw
                    COSMO output file (LVPP/NWChem or DMol3/GAMESS/Gaussian09).

    PRIVATE STAGING TOOL.  Lives under data/tmp/ (gitignored).  It writes NOTHING
    into data/standards/ and it is NOT part of the Choupo build.  Its only job is
    to answer, with numbers, whether an `LVPP` named COSMO set could ever be
    generated for Choupo's `cosmoSAC` (variant 2002) implementation.

--------------------------------------------------------------------------------
WHAT THIS IMPLEMENTS
--------------------------------------------------------------------------------
The Klamt sigma-averaging used by every COSMO-SAC variant, in the exact form of
the NIST benchmark implementation:

    sigma_m = SUM_n [ w_mn * sigma_n ] / SUM_n [ w_mn ]

    w_mn = (r_n^2 * r_av^2)/(r_n^2 + r_av^2)
           * exp( -f_decay * d_mn^2 / (r_n^2 + r_av^2) )

    r_n     = sqrt(a_n / pi)      effective circular radius of segment n  [A]
    d_mn    = |x_m - x_n|         segment-centre distance                 [A]
    sigma_n = q_n / a_n           RAW segment charge density              [e/A^2]

followed by AREA-CONSERVING linear binning of the averaged sigma_m onto the
51-point grid, each segment's area split between the two bracketing grid nodes
in proportion to its distance from them (NIST `weightbin_sigmas`).  The binned
quantity is p(sigma)*A, i.e. AREA PER BIN in A^2 -- it sums to the cavity area,
NOT to 1.  That is exactly what Choupo's CosmoSac.cpp expects (`pArea_`, and it
forms the probability itself as pArea_[i][k]/area_[i]).

--------------------------------------------------------------------------------
CONSTANTS USED -- AND WHERE EACH ONE COMES FROM
--------------------------------------------------------------------------------
Every number below was read from a source that is on this machine or was fetched
verbatim; NONE is guessed.  Where a value could not be verified it is exposed as
a named parameter and the script says so at run time.

 1) BOHR_TO_ANGSTROM = 0.52917721067
    VERIFIED.  usnistgov/COSMOSAC, `profiles/to_sigma.py` line 18
    (`BOHR_TO_ANGSTROM = 0.52917721067`, annotated in-source with the CODATA
    reference https://physics.nist.gov/cgi-bin/cuu/Value?bohrrada0).
    Its square, 0.280028520..., is the bohr^2 -> A^2 factor that the Choupo
    COSMO evidence audit already verified independently against the LVPP
    `$segment_information` area column.

 2) Averaging scheme "Mullins"  ->  r_av = 0.8176300195 A , f_decay = 1.0
    VERIFIED.  usnistgov/COSMOSAC, `profiles/to_sigma.py`, method
    `Dmol3COSMOParser.average_sigmas`:
        if self.averaging == 'Mullins':
            self.r_av2 = 0.8176300195**2   # [A^2]
            self.f_decay = 1.0
    and repeated in the CLI help text of the same file:
        "'Mullins' to use f_decay = 1 and r_av = 0.8176300195 A".
    This is the convention of Mullins et al., Ind. Eng. Chem. Res. 45 (2006)
    4389 (the VT-2005 database) and of Lin & Sandler, IECR 41 (2002) 899 --
    i.e. the convention of the profiles Choupo currently ships as `VT2005`.
    NOTE the in-source comment: 0.8176300195 A "is also equal to
    ((7.5/pi)**0.5*0.52917721092)", i.e. the radius of a circle of area
    a_eff = 7.5 A^2, re-scaled by one bohr->A factor.  That identity is
    reproduced by this script as an arithmetic self-check.

 3) Averaging scheme "Hsieh"  ->  r_av = sqrt(7.25/pi) A , f_decay = 3.57
    VERIFIED.  Same function, `elif self.averaging == 'Hsieh'`.  This is the
    2010 re-parametrisation (Hsieh, Sandler & Lin, Fluid Phase Equilib. 297
    (2010) 90, doi:10.1016/j.fluid.2010.06.011 -- the same DOI the LVPP
    `pars/GMHB1808/README.md` cites for its f_decay = 3.57).  It is NOT the
    2002 convention; it is implemented here only because the one public
    input/output reference pair shipped by NIST
    (`profiles/DMol3_TEST/*.cosmo` + `*.sigma`) was produced with it, so it is
    the only way to validate this script against an external golden file.

 4) Sigma grid: 51 nodes, -0.025 .. +0.025 e/A^2, step 0.001
    VERIFIED twice.  usnistgov/COSMOSAC `to_sigma.py::get_outputs`
    (`sigmas = np.arange(-0.025, 0.025+0.0001, 0.001)`) AND Choupo's own
    src/thermo/activityCoefficient/CosmoSac.{H,cpp}
    (`NGRID = 51`, `SIGMA_MIN = -0.025`, `DSIGMA = 0.001`).

 5) Binning rule: linear (area-conserving) split between the two bracketing
    grid nodes.  VERIFIED, `to_sigma.py::weightbin_sigmas`.

 NOT USED HERE, listed because the verdict depends on them -- Choupo's runtime
 COSMO-SAC-2002 constants, read from src/thermo/activityCoefficient/CosmoSac.cpp
 (which cites usnistgov/COSMOSAC `COSMO1Constants`):
     a_eff = 7.5 A^2 ; alpha' = 16466.72 ; c_hb = 85580.0 ; sigma_hb = 0.0084 ;
     z = 10 ; r_0 = 66.69 A^3 ; q_0 = 79.53 A^2 ; R = 0.001987 kcal/(mol K).
 These are tied to the Mullins/VT-2005 averaging AND to the DMol3-COSMO cavity
 definition they were regressed against.

 EXPLICITLY *NOT* VERIFIED -- exposed as parameters, never silently assumed:
   * Whether the 2002 constants above remain valid for profiles built from a
     DIFFERENT QM protocol / cavity definition.  They were regressed together
     with VT-2005 profiles; nothing in the literature read here licenses
     transplanting them.  --averaging is therefore a REQUIRED argument: this
     script refuses to pick an averaging convention for you.
   * LVPP's own COSMO-SAC parametrisations use DIFFERENT averaging radii for
     their own profiles: `pars/GMHB1808/globals.csv` -> RAVG = 1.1 (GAMESS),
     `pars/CS25/globals.csv` -> RAVG = 0.8 (NWChem/def2-SVPD, the protocol of
     release_v25).  Neither equals 0.8176300195.  Both are read from the files
     in data/tmp/_sources/lvpp_sigma/pars/.

--------------------------------------------------------------------------------
INPUT FORMATS
--------------------------------------------------------------------------------
 * LVPP / NWChem  (`$cosmo_data`, `$coord_rad`, `$segment_information`):
   segment areas already in A^2, coordinates in bohr, cavity area/volume in
   bohr^2 / bohr^3 (a.u.) -- converted here.
 * DMol3 / GAMESS / Gaussian09 (`... DMol3/COSMO Results ...`, the
   "n atom position (X, Y, Z) [au] charge area charge/area potential" table):
   segment areas in A^2, coordinates in bohr, cavity area/volume in A^2/A^3
   read from the "Total surface area of cavity" / "Total volume of cavity"
   lines.  Supported only so that the NIST reference pair can be reprocessed.

--------------------------------------------------------------------------------
USAGE
--------------------------------------------------------------------------------
    python3 sigma_profile.py --inpath X.cosmo --averaging Mullins
    python3 sigma_profile.py --inpath X.cosmo --averaging Hsieh --json
    python3 sigma_profile.py --selftest        # validate vs the NIST golden pair

Dependencies: numpy only (no pandas, no scipy).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys

import numpy as np

# --- constant (1) -------------------------------------------------------------
BOHR_TO_ANGSTROM = 0.52917721067          # usnistgov/COSMOSAC to_sigma.py:18
BOHR2_TO_A2 = BOHR_TO_ANGSTROM ** 2       # 0.2800285...
BOHR3_TO_A3 = BOHR_TO_ANGSTROM ** 3

# --- constants (2) and (3) ----------------------------------------------------
AVERAGING = {
    # name      : (r_av [A],           f_decay, provenance)
    "Mullins": (0.8176300195, 1.0,
                "usnistgov/COSMOSAC profiles/to_sigma.py::average_sigmas "
                "-- the Lin&Sandler 2002 / Mullins 2006 (VT-2005) convention"),
    "Hsieh":   (math.sqrt(7.25 / math.pi), 3.57,
                "usnistgov/COSMOSAC profiles/to_sigma.py::average_sigmas "
                "-- Hsieh, Sandler & Lin, FPE 297 (2010) 90"),
}

# --- constant (4) -------------------------------------------------------------
SIGMA_MIN = -0.025
SIGMA_MAX = 0.025
DSIGMA = 0.001
NGRID = 51


def sigma_grid() -> np.ndarray:
    """The 51-point grid, -0.025..0.025 e/A^2 step 0.001."""
    g = SIGMA_MIN + DSIGMA * np.arange(NGRID)
    assert len(g) == NGRID and abs(g[-1] - SIGMA_MAX) < 1e-12
    return g


# ------------------------------------------------------------------------------
# Parsers
# ------------------------------------------------------------------------------
class CosmoFile:
    """Raw COSMO output: cavity area/volume + the per-segment table."""

    def __init__(self, path: str):
        self.path = path
        with open(path, "r", errors="replace") as fp:
            txt = fp.read()
        if "$segment_information" in txt:
            self.flavour = "LVPP/NWChem"
            self._parse_nwchem(txt)
        elif "(X, Y, Z)" in txt and (
            "DMol3/COSMO Results" in txt
            or "GAMESS/COSab RESULTS" in txt
            or "Gaussian COSMO output" in txt
        ):
            self.flavour = "DMol3-style"
            self._parse_dmol3(txt)
        else:
            raise ValueError("unrecognised COSMO file flavour: " + path)

        # Derived, common to all flavours
        self.rn = np.sqrt(self.seg_area / math.pi)          # [A]
        self.rn2 = self.rn ** 2
        # sigma recomputed from charge/area (the file's own charge/area column
        # is truncated; NIST recomputes it too -- to_sigma.py:__init__).
        self.sigma_raw = self.seg_charge / self.seg_area    # [e/A^2]
        self.xyz_A = self.seg_xyz_bohr * BOHR_TO_ANGSTROM   # [A]

    # -- LVPP / NWChem ---------------------------------------------------------
    def _parse_nwchem(self, txt: str):
        m = re.search(r"\$cosmo_data(.*?)(?=\$)", txt, re.DOTALL)
        if not m:
            raise ValueError("no $cosmo_data block")
        blk = m.group(1)
        self.nps = int(re.search(r"nps\s*=\s*(\d+)", blk).group(1))
        area_au = float(re.search(r"area\s*=\s*([-\d.eE+]+)", blk).group(1))
        vol_au = float(re.search(r"volume\s*=\s*([-\d.eE+]+)", blk).group(1))
        # $cosmo_data area/volume are in ATOMIC UNITS (bohr^2 / bohr^3).
        self.cavity_area_au = area_au
        self.cavity_volume_au = vol_au
        self.cavity_area = area_au * BOHR2_TO_A2            # [A^2]
        self.cavity_volume = vol_au * BOHR3_TO_A3           # [A^3]

        # atoms (for the element inventory only)
        mc = re.search(r"\$coord_rad(.*?)(?=^\$)", txt, re.DOTALL | re.MULTILINE)
        self.atoms = []
        if mc:
            for line in mc.group(1).splitlines():
                p = line.split()
                if len(p) >= 6 and not line.lstrip().startswith("#"):
                    try:
                        float(p[1])
                    except ValueError:
                        continue
                    # "<n> x y z <element> <radius/A>"  -> element is field 4
                    self.atoms.append(p[4])

        ms = re.search(r"\$segment_information(.*)", txt, re.DOTALL)
        rows = []
        for line in ms.group(1).splitlines():
            s = line.strip()
            if not s or s.startswith("#") or s.startswith("$"):
                continue
            p = s.split()
            if len(p) < 8:
                continue
            rows.append([float(p[2]), float(p[3]), float(p[4]),
                         float(p[5]), float(p[6])])
        a = np.array(rows, dtype=float)
        if len(a) != self.nps:
            raise ValueError("segment count %d != nps %d in %s"
                             % (len(a), self.nps, self.path))
        self.seg_xyz_bohr = a[:, 0:3]
        self.seg_charge = a[:, 3]          # [e]
        self.seg_area = a[:, 4]            # [A^2]  (labelled [A2] in the file)

    # -- DMol3 / GAMESS / Gaussian09 ------------------------------------------
    def _parse_dmol3(self, txt: str):
        ma = re.search(r"Total surface area of cavity \(A\*\*2\)\s*=\s*([-\d.eE+]+)", txt)
        mv = re.search(r"Total volume of cavity \(A\*\*3\)\s*=\s*([-\d.eE+]+)", txt)
        if ma and mv:
            self.cavity_area = float(ma.group(1))
            self.cavity_volume = float(mv.group(1))
        else:  # Gaussian09 prints bohr^2 / bohr^3
            self.cavity_area = float(re.search(r"area\s*=(.+)\n", txt).group(1)) * BOHR2_TO_A2
            self.cavity_volume = float(re.search(r"volume=(.+)\n", txt).group(1)) * BOHR3_TO_A3
        self.cavity_area_au = self.cavity_area / BOHR2_TO_A2
        self.cavity_volume_au = self.cavity_volume / BOHR3_TO_A3
        self.atoms = []

        tail = txt.split("(X, Y, Z)", 1)[1]
        tail = tail.split("\n", 1)[1]
        rows = []
        for line in tail.splitlines():
            p = line.split()
            if len(p) != 9:
                if rows:
                    break
                continue
            try:
                vals = [float(v) for v in p]
            except ValueError:
                if rows:
                    break
                continue
            rows.append(vals[2:7])          # x,y,z,charge,area
        a = np.array(rows, dtype=float)
        self.nps = len(a)
        self.seg_xyz_bohr = a[:, 0:3]
        self.seg_charge = a[:, 3]
        self.seg_area = a[:, 4]


# ------------------------------------------------------------------------------
# The averaging + binning
# ------------------------------------------------------------------------------
def average_sigmas(cf: CosmoFile, averaging: str) -> np.ndarray:
    """Klamt averaging of the raw segment charge densities.  [e/A^2]"""
    if averaging not in AVERAGING:
        raise ValueError("averaging must be one of " + str(sorted(AVERAGING)))
    r_av, f_decay, _ = AVERAGING[averaging]
    r_av2 = r_av ** 2

    x = cf.xyz_A
    # squared euclidean distance matrix, [A^2]
    d2 = (np.sum(x * x, axis=1)[:, None]
          + np.sum(x * x, axis=1)[None, :]
          - 2.0 * (x @ x.T))
    np.maximum(d2, 0.0, out=d2)

    rn2 = cf.rn2[None, :]                              # weights depend on n
    denom = rn2 + r_av2
    w = np.exp(-f_decay * d2 / denom) * rn2 * r_av2 / denom
    return (w @ cf.sigma_raw) / w.sum(axis=1)


def weightbin(sigmas: np.ndarray, areas: np.ndarray,
              grid: np.ndarray) -> np.ndarray:
    """Area-conserving linear binning onto `grid`.  Returns p(sigma)*A [A^2]."""
    bw = grid[1] - grid[0]
    out = np.zeros_like(grid)
    for s, a in zip(sigmas, areas):
        if s < grid[0] - 1e-12 or s > grid[-1] + 1e-12:
            raise ValueError("averaged sigma %g outside the grid [%g, %g] -- "
                             "the profile cannot be represented on the "
                             "51-point grid" % (s, grid[0], grid[-1]))
        s = min(max(s, grid[0]), grid[-1] - 1e-15)
        left = int((s - grid[0]) / bw)
        left = min(max(left, 0), len(grid) - 2)
        w_left = (grid[left + 1] - s) / bw
        out[left] += a * w_left
        out[left + 1] += a * (1.0 - w_left)
    return out


def profile(path: str, averaging: str) -> dict:
    cf = CosmoFile(path)
    sig = average_sigmas(cf, averaging)
    grid = sigma_grid()
    psigmaA = weightbin(sig, cf.seg_area, grid)
    r_av, f_decay, prov = AVERAGING[averaging]
    return {
        "path": path,
        "flavour": cf.flavour,
        "nSegments": int(cf.nps),
        "cavityArea_A2": float(cf.cavity_area),
        "cavityVolume_A3": float(cf.cavity_volume),
        "segmentAreaSum_A2": float(cf.seg_area.sum()),
        "totalCharge_e": float(cf.seg_charge.sum()),
        "averaging": averaging,
        "r_av_A": r_av,
        "f_decay": f_decay,
        "provenance": prov,
        "sigma_grid": grid.tolist(),
        "psigmaA_A2": psigmaA.tolist(),
        "profileSum_A2": float(psigmaA.sum()),
        "sigmaRawMin": float(cf.sigma_raw.min()),
        "sigmaRawMax": float(cf.sigma_raw.max()),
        "sigmaAvgMin": float(sig.min()),
        "sigmaAvgMax": float(sig.max()),
        "atoms": cf.atoms,
    }


# ------------------------------------------------------------------------------
# Moments  (defined on the AREA profile, so M0 == cavity area)
# ------------------------------------------------------------------------------
def moments(grid: np.ndarray, psigmaA: np.ndarray) -> dict:
    m0 = float(psigmaA.sum())                       # [A^2]  == cavity area
    p = psigmaA / m0                                # probability
    m1 = float((p * grid).sum())                    # [e/A^2]
    m2 = float((p * grid ** 2).sum())               # [e^2/A^4]
    # area-weighted absolute polarity (the "sigma-1 moment" often quoted)
    m1abs = float((p * np.abs(grid)).sum())
    return {"M0_area_A2": m0, "M1_mean_sigma": m1,
            "M2_meansq_sigma": m2, "M1abs_mean_absSigma": m1abs}


# ------------------------------------------------------------------------------
# Self-test against the NIST golden pair
# ------------------------------------------------------------------------------
def selftest(refdir: str) -> int:
    """
    Reprocess usnistgov/COSMOSAC profiles/DMol3_TEST/*.cosmo and compare against
    the shipped *.sigma.  That reference file is a THREE-profile (NHB/OH/OT)
    Hsieh-averaged output; the SUM of its three columns is algebraically identical
    to the single-profile output (the P_hb re-weighting moves area between the
    three columns and conserves their sum), so summing the reference columns is a
    legitimate golden value for the single profile this script produces.
    """
    cosmo = os.path.join(refdir, "LFQSCWFLJHTTHZ-UHFFFAOYSA-N.cosmo")
    sigma = os.path.join(refdir, "LFQSCWFLJHTTHZ-UHFFFAOYSA-N.sigma")
    if not (os.path.exists(cosmo) and os.path.exists(sigma)):
        print("SELFTEST SKIPPED: reference pair not found in " + refdir)
        return 2

    meta = json.loads(open(sigma).readline().split("# meta:", 1)[1])
    ref_rows = []
    for line in open(sigma):
        if line.startswith("#") or not line.strip():
            continue
        ref_rows.append([float(v) for v in line.split()])
    ref = np.array(ref_rows)
    n = NGRID
    ref_total = ref[0:n, 1] + ref[n:2 * n, 1] + ref[2 * n:3 * n, 1]

    got = profile(cosmo, meta["averaging"])
    mine = np.array(got["psigmaA_A2"])

    dmax = float(np.max(np.abs(mine - ref_total)))
    rel = dmax / ref_total.sum()
    print("SELFTEST  usnistgov/COSMOSAC DMol3_TEST reference")
    print("  averaging in reference meta : %s (r_av=%.10f A, f_decay=%.2f)"
          % (meta["averaging"], meta["r_av [A]"], meta["f_decay"]))
    print("  this script's r_av          : %.10f A, f_decay=%.2f"
          % (got["r_av_A"], got["f_decay"]))
    print("  cavity area  ref / mine     : %.5f / %.5f A^2"
          % (meta["area [A^2]"], got["cavityArea_A2"]))
    print("  profile sum  ref / mine     : %.6f / %.6f A^2"
          % (ref_total.sum(), mine.sum()))
    print("  max |bin difference|        : %.3e A^2  (%.3e of total area)"
          % (dmax, rel))
    ok = dmax < 1e-6
    # the arithmetic identity quoted in the NIST source for the Mullins radius
    ident = (7.5 / math.pi) ** 0.5 * 0.52917721092
    print("  Mullins r_av identity check : ((7.5/pi)^0.5)*0.52917721092 = %.10f"
          "  vs constant 0.8176300195  -> |d| = %.2e" % (ident, abs(ident - 0.8176300195)))
    print("  RESULT: " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


# ------------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[2])
    ap.add_argument("--inpath", help="path to a .cosmo file")
    ap.add_argument("--averaging", choices=sorted(AVERAGING),
                    help="REQUIRED with --inpath.  This script never picks an "
                         "averaging convention for you.")
    ap.add_argument("--json", action="store_true", help="dump the full record as JSON")
    ap.add_argument("--selftest", action="store_true",
                    help="validate against the NIST golden .cosmo/.sigma pair")
    ap.add_argument("--refdir",
                    default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         "..", "nist_cosmosac_ref"))
    a = ap.parse_args(argv)

    if a.selftest:
        return selftest(os.path.normpath(a.refdir))
    if not a.inpath:
        ap.error("--inpath is required (or --selftest)")
    if not a.averaging:
        ap.error("--averaging is required: 'Mullins' (VT-2005 / COSMO-SAC 2002) "
                 "or 'Hsieh' (2010).  Refusing to guess.")

    rec = profile(a.inpath, a.averaging)
    if a.json:
        print(json.dumps(rec, indent=2))
        return 0
    g = np.array(rec["sigma_grid"])
    p = np.array(rec["psigmaA_A2"])
    mom = moments(g, p)
    print("# %s  [%s]" % (rec["path"], rec["flavour"]))
    print("# segments %d   cavity area %.5f A^2   volume %.5f A^3"
          % (rec["nSegments"], rec["cavityArea_A2"], rec["cavityVolume_A3"]))
    print("# segment-area sum %.5f A^2   profile sum %.5f A^2   (closure %.2e)"
          % (rec["segmentAreaSum_A2"], rec["profileSum_A2"],
             rec["profileSum_A2"] - rec["cavityArea_A2"]))
    print("# averaging %s  r_av %.10f A  f_decay %.2f" %
          (rec["averaging"], rec["r_av_A"], rec["f_decay"]))
    print("# moments: " + json.dumps(mom))
    for s, v in zip(g, p):
        print("%+.3f %.15e" % (s, v))
    return 0


if __name__ == "__main__":
    sys.exit(main())
