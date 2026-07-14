#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -------------------------------------------------------------------------------
# License
#     This file is part of Choupo.
#
#     Choupo is free software: you can redistribute it and/or modify it
#     under the terms of the GNU General Public License as published
#     by the Free Software Foundation, either version 3 of the License, or
#     (at your option) any later version.
#
#     Choupo is distributed in the hope that it will be useful, but WITHOUT
#     ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
#     FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
#     License for more details (https://www.gnu.org/licenses/gpl-3.0.html).
#
#     SPDX-License-Identifier: GPL-3.0-or-later
#
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================

"""
import_nasa.py -- NASA-7 polynomial importer for Choupo .dat files

  Reads NASA-7 polynomial thermo data (the format used by CHEMKIN /
  Cantera / GRI-Mech / Burcat's database) and produces Choupo
  component .dat files.  For every species the script:

    1. Fits the NASA-7 Cp/R polynomial to the degree-3 form Choupo
       uses (`Cp = a0 + a1*T + a2*T^2 + a3*T^3`) over a chosen T
       range, via Gauss-Jordan on normal equations.  No numpy
       dependency --- Python stdlib only.
    2. Computes dHf_298 (J/mol) and s_298 (J/mol/K) directly from
       the NASA-7 integration constants a6_low and a7_low.
    3. Cross-references a small Reid-Prausnitz-Poling 4th ed.
       critical-properties table (embedded below) for Tc, Pc,
       omega, Tb, HvapTb, Vliq, Antoine.  Species not present in
       the table are tagged `nonvolatile true` (the case for
       atomic species and most radicals).
    4. Writes <name>.dat in the Choupo format.

  Usage
  -----
    bin/import_nasa.py                            # generate the shipped subset
    bin/import_nasa.py --outdir data/standards/components
    bin/import_nasa.py --species H O N CH3        # subset
    bin/import_nasa.py --thermo gri30.thermo      # import EXTRA species from a
                                                  # CHEMKIN thermo file you supply

  Embedded data
  -------------
  The dictionary `NASA7_INLINE` below carries thermo coefficients for
  ~10 commonly-needed atomic species and combustion radicals that the
  manually-curated catalogue under data/standards/components/ does
  not (yet) include.  Coefficients are JANAF / Burcat (TAE Report
  867), low-T range 200--1000 K, high-T range 1000--6000 K.  Each
  entry has 14 coefficients in NASA-7 order:

       [a1_h, a2_h, a3_h, a4_h, a5_h, a6_h, a7_h,
        a1_l, a2_l, a3_l, a4_l, a5_l, a6_l, a7_l]

  with Cp/R = a1 + a2*T + a3*T^2 + a4*T^3 + a5*T^4.

  Adding a species: drop its NASA-7 row into NASA7_INLINE (or feed
  it via --thermo) and, if it has a liquid phase, append a row in
  CRITICAL_INLINE.  Re-run --- the .dat appears in --outdir.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

R = 8.314462618  # J/(mol*K)

# =====================================================================
#   Embedded NASA-7 polynomials
# =====================================================================
#   Sourced from Burcat & Ruscic, Argonne ANL-05/20 (2005) and JANAF
#   4th ed.  Low-T validity 200-1000 K, high-T validity 1000-6000 K.
#   For monoatomic species Cp/R = 5/2 exact (a1 = 2.5, rest of the
#   polynomial = 0); a6 carries the enthalpy of formation, a7 the
#   third-law absolute entropy at 298.15 K.

NASA7_INLINE: dict[str, dict] = {
    "H": dict(
        comment="Atomic hydrogen radical (combustion chain carrier)",
        formula="H",
        cas="12385-13-6",
        mw=1.008,
        elements={"H": 1},
        low =[2.5, 0.0, 0.0, 0.0, 0.0, 25473.66, -0.4466828],
        high=[2.5, 0.0, 0.0, 0.0, 0.0, 25473.66, -0.4466828],
    ),
    "O": dict(
        comment="Atomic oxygen radical (combustion chain carrier; reaches ~5% in stoichiometric flames near 2400 K)",
        formula="O",
        cas="17778-80-2",
        mw=15.999,
        elements={"O": 1},
        # NASA-7 / Burcat 2005 (high-T fit is essentially Cp/R = 5/2; the
        # cubic term in the low-T fit captures the 1D term in OO).
        low =[3.1682671, -3.27931884e-3, 6.64306396e-6, -6.12806624e-9, 2.11265971e-12, 29122.2592, 2.05193346],
        high=[2.54363697, -2.73162486e-5, -4.19029520e-9, 4.95481845e-12, -4.79553694e-16, 29226.0120, 4.92229457],
    ),
    "N": dict(
        comment="Atomic nitrogen radical (Zeldovich chain carrier for thermal NOx)",
        formula="N",
        cas="17778-88-0",
        mw=14.007,
        elements={"N": 1},
        low =[2.5, 0.0, 0.0, 0.0, 0.0, 56104.638, 4.193905],
        high=[2.4159429, 1.7489065e-4, -1.1902369e-7, 3.0226245e-11, -2.0360982e-15, 56133.773, 4.6496096],
    ),
    "C": dict(
        comment="Atomic carbon (gas phase; relevant in very high-T sooting flames)",
        formula="C",
        cas="7440-44-0",
        mw=12.011,
        elements={"C": 1},
        low =[2.5542395, -3.21537724e-4, 7.33792536e-7, -7.32234740e-10, 2.66521446e-13, 85442.681, 4.5313085],
        high=[2.6055830, -1.95934118e-4, 1.06737620e-7, -1.64243522e-11, 8.18706995e-16, 85411.742, 4.1923868],
    ),
    "CH3": dict(
        comment="Methyl radical (dominant intermediate in CH4 / CH3OH oxidation)",
        formula="CH3",
        cas="2229-07-4",
        mw=15.0345,
        elements={"C": 1, "H": 3},
        low =[3.6571797, 2.1265979e-3, 5.4583883e-6, -6.6181003e-9, 2.4657074e-12, 16422.716, 1.6735354],
        high=[2.9781206, 5.7978520e-3, -1.9755800e-6, 3.0729790e-10, -1.7917416e-14, 16509.040, 4.7224799],
    ),
    "HO2": dict(
        comment="Hydroperoxyl radical (key chain carrier in low- and intermediate-T oxidation)",
        formula="HO2",
        cas="3170-83-0",
        mw=33.0067,
        elements={"H": 1, "O": 2},
        low =[4.30179807, -4.74912097e-3, 2.11582905e-5, -2.42763914e-8, 9.29225225e-12, 264.018485, 3.71666220],
        high=[4.17228741, 1.88117627e-3, -3.46277286e-7, 1.94657549e-11, 1.76256905e-16, 31.0206839, 2.95767672],
    ),
    "H2O2": dict(
        comment="Hydrogen peroxide (oxidant; thermal decomposition product H2O2 -> 2 OH governs LT ignition delay)",
        formula="H2O2",
        cas="7722-84-1",
        mw=34.0147,
        elements={"H": 2, "O": 2},
        low =[4.31515149, -8.47390622e-4, 1.76404323e-5, -2.26762944e-8, 9.08950158e-12, -17706.7437, 3.27373319],
        high=[4.57977305, 4.05326003e-3, -1.29844730e-6, 1.98211400e-10, -1.13968792e-14, -18007.1775, 0.664970694],
    ),
    "O3": dict(
        comment="Ozone (atmospheric oxidant; also used as a strong industrial oxidiser in cold-flame chemistry)",
        formula="O3",
        cas="10028-15-6",
        mw=47.9982,
        elements={"O": 3},
        low =[3.40738221, 2.05379063e-3, 1.38486052e-5, -2.23311542e-8, 9.76073226e-12, 15864.0791, 8.28247580],
        high=[12.3302914, -1.19324783e-2, 7.98741278e-6, -1.77194552e-9, 1.26075824e-13, 12762.3210, -40.8823374],
    ),
    "NH2": dict(
        comment="Amidogen radical (intermediate in fuel-NOx and SCR pathways)",
        formula="NH2",
        cas="13770-40-6",
        mw=16.0226,
        elements={"N": 1, "H": 2},
        low =[4.20400290, -2.10613840e-3, 7.10683480e-6, -5.61151970e-9, 1.64407170e-12, 21885.910, -0.141842480],
        high=[2.83474421, 3.20730082e-3, -9.33908305e-7, 1.37029305e-10, -7.92061600e-15, 22171.957, 6.52041630],
    ),
    "NH": dict(
        comment="Imidogen radical (chain carrier in NH3 oxidation; intermediate in thermal-NOx chemistry)",
        formula="NH",
        cas="13774-92-0",
        mw=15.0146,
        elements={"N": 1, "H": 1},
        low =[3.49290900, 3.11792100e-4, -1.48913000e-6, 2.48164400e-9, -1.03569700e-12, 41880.629, 1.84832780],
        high=[2.78369300, 1.32984300e-3, -4.24780000e-7, 7.83485000e-11, -5.50444100e-15, 42120.848, 5.74077990],
    ),
}

# =====================================================================
#   Embedded critical-properties + Antoine table (Reid 4th ed App. A
#   + NIST WebBook).  Only species that have a sensible liquid phase
#   in chem-eng process conditions appear here; species not listed are
#   emitted with `nonvolatile true` (covers atomic + most radicals).
# =====================================================================
CRITICAL_INLINE: dict[str, dict] = {
    # name           Tc      Pc    omega   Tb       HvapTb   Vliq     A_ant  B_ant   C_ant   Tmin Tmax
    "H2O2":  dict(tc=730.15, pc=220.00, omega=0.358, tb=423.35, hvap_tb=51600, vliq=4.0e-5,
                   a_ant=4.94120, b_ant=1763.300, c_ant=-39.140, t_min=270, t_max=425),
    "O3":    dict(tc=261.10, pc=55.73,  omega=0.227, tb=161.50, hvap_tb=12000, vliq=3.6e-5,
                   a_ant=3.71250, b_ant=466.620, c_ant=-9.4500,  t_min=80,  t_max=161),
}


# =====================================================================
#   NASA-7 thermodynamic functions
# =====================================================================

def cp_over_R(T: float, a: list[float]) -> float:
    """NASA-7 Cp/R = a1 + a2*T + a3*T^2 + a4*T^3 + a5*T^4."""
    return a[0] + a[1]*T + a[2]*T**2 + a[3]*T**3 + a[4]*T**4

def h_over_RT(T: float, a: list[float]) -> float:
    """NASA-7 H/(RT) = a1 + a2*T/2 + a3*T^2/3 + a4*T^3/4 + a5*T^4/5 + a6/T."""
    return a[0] + a[1]*T/2 + a[2]*T**2/3 + a[3]*T**3/4 + a[4]*T**4/5 + a[5]/T

def s_over_R(T: float, a: list[float]) -> float:
    """NASA-7 S/R = a1*ln(T) + a2*T + a3*T^2/2 + a4*T^3/3 + a5*T^4/4 + a7."""
    return a[0]*math.log(T) + a[1]*T + a[2]*T**2/2 + a[3]*T**3/3 + a[4]*T**4/4 + a[6]


# =====================================================================
#   Gauss-Jordan elimination + polynomial fit (no numpy)
# =====================================================================

def gauss_jordan(A: list[list[float]], b: list[float]) -> list[float]:
    """Solve A x = b for a square A, returns x."""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for i in range(n):
        # Partial pivot
        max_row = max(range(i, n), key=lambda k: abs(M[k][i]))
        if abs(M[max_row][i]) < 1e-14:
            raise RuntimeError("Singular matrix in Gauss-Jordan")
        M[i], M[max_row] = M[max_row], M[i]
        pivot = M[i][i]
        for j in range(n+1):
            M[i][j] /= pivot
        for k in range(n):
            if k != i:
                f = M[k][i]
                for j in range(n+1):
                    M[k][j] -= f * M[i][j]
    return [M[i][n] for i in range(n)]

def fit_cp_poly3(coefs_low: list[float], coefs_high: list[float],
                 T_mid: float = 1000.0,
                 T_min: float = 250.0, T_max: float = 1500.0,
                 n_samples: int = 80) -> list[float]:
    """Fit Cp = a0 + a1*T + a2*T^2 + a3*T^3 to NASA-7 over [T_min, T_max].

       Picks coefs_low for T <= T_mid, coefs_high above.  Returns the
       4 polynomial coefficients [a0, a1, a2, a3]."""
    T_vals: list[float] = []
    Cp_vals: list[float] = []
    for k in range(n_samples):
        T = T_min + (T_max - T_min) * k / (n_samples - 1)
        a = coefs_low if T <= T_mid else coefs_high
        Cp = cp_over_R(T, a) * R
        T_vals.append(T)
        Cp_vals.append(Cp)
    # Normal equations: X^T X = sum [1, T, T^2, T^3] outer products
    XtX = [[0.0]*4 for _ in range(4)]
    Xty = [0.0]*4
    for T, y in zip(T_vals, Cp_vals):
        Tk = [1.0, T, T*T, T*T*T]
        for i in range(4):
            for j in range(4):
                XtX[i][j] += Tk[i] * Tk[j]
            Xty[i] += Tk[i] * y
    return gauss_jordan(XtX, Xty)


# =====================================================================
#   .dat writer
# =====================================================================

DAT_TEMPLATE_VOL = """\
/*--------------------------------*- Choupo -*-----------------------*\\
  Component: {comment}
  Generated by bin/import_nasa.py from NASA-7 polynomial data
  ({source}).  Critical properties from Reid-Prausnitz-
  Poling 4th ed. Appendix A; dHf_298 and s_298 computed from the
  NASA-7 integration constants a6/a7 evaluated at T = 298.15 K.
\\*---------------------------------------------------------------------------*/

name        {name};
formula     {formula};
CAS         {cas};

MW          {mw};       // kg/kmol
Tc          {tc};         // K
Pc          {pc};         // bar
omega       {omega};      // [-]
Tb          {tb};         // K
HvapTb      {hvap_tb};      // J/mol
Vliq        {vliq};       // m^3/mol

gibbsFormation
{{
    dHf_298   {dhf:.4f};            // J/mol  -- ideal-gas reference
    s_298     {s298:.4f};           // J/(mol·K)  -- third-law absolute
}}

vaporPressure
{{
    model         Antoine;
    coefficients  ({a_ant}   {b_ant}   {c_ant});
    Trange        ({t_min}  {t_max});
}}

idealGasHeatCapacity
{{
    model         polynomial;
    coefficients  ({cp0:.6e}   {cp1:.6e}   {cp2:.6e}   {cp3:.6e});
    Trange        (250  1500);
}}
"""

DAT_TEMPLATE_NONVOL = """\
/*--------------------------------*- Choupo -*-----------------------*\\
  Component: {comment}
  Generated by bin/import_nasa.py from NASA-7 polynomial data
  ({source}).  No liquid phase at process conditions ---
  the entry is tagged `nonvolatile true` so vapour-pressure routines
  never get called.  dHf_298 and s_298 from NASA-7 integration
  constants at T = 298.15 K.
\\*---------------------------------------------------------------------------*/

name           {name};
formula        {formula};
CAS            {cas};

MW             {mw};       // kg/kmol
nonvolatile    true;

gibbsFormation
{{
    dHf_298    {dhf:.4f};            // J/mol  -- ideal-gas reference
    s_298      {s298:.4f};           // J/(mol·K)  -- third-law absolute
}}

idealGasHeatCapacity
{{
    model         polynomial;
    coefficients  ({cp0:.6e}   {cp1:.6e}   {cp2:.6e}   {cp3:.6e});
    Trange        (250  3000);
}}
"""


def make_dat(name: str, entry: dict, outdir: Path) -> Path:
    """Render the .dat file for a single species and write it."""
    low = entry["low"]
    high = entry["high"]
    # Thermo at 298.15 K using the low-T polynomial (NASA convention).
    T298 = 298.15
    dhf  = h_over_RT(T298, low) * R * T298     # J/mol
    s298 = s_over_R (T298, low) * R            # J/(mol*K)
    cp_coefs = fit_cp_poly3(low, high)

    crit = CRITICAL_INLINE.get(name)
    payload = dict(
        name=name,
        comment=entry["comment"],
        source=entry.get("source", EMBEDDED_SOURCE),
        formula=entry["formula"],
        cas=entry["cas"],
        mw=entry["mw"],
        dhf=dhf,
        s298=s298,
        cp0=cp_coefs[0], cp1=cp_coefs[1], cp2=cp_coefs[2], cp3=cp_coefs[3],
    )
    if crit:
        payload.update(crit)
        text = DAT_TEMPLATE_VOL.format(**payload)
    else:
        text = DAT_TEMPLATE_NONVOL.format(**payload)

    path = outdir / f"{name}.dat"
    path.write_text(text)
    return path


# =====================================================================
#   CHEMKIN parser (optional --thermo path)
# =====================================================================

ATOMIC_MASS = {
    "H": 1.008, "C": 12.011, "N": 14.007, "O": 15.999, "S": 32.06,
    "Ar": 39.948, "He": 4.0026, "Cl": 35.45, "F": 18.998, "Br": 79.904,
    "I": 126.904, "P": 30.974, "Si": 28.085, "B": 10.81, "Na": 22.990,
    "K": 39.098, "Li": 6.94, "Rb": 85.468, "Cs": 132.905, "Be": 9.0122,
    "Mg": 24.305, "Ca": 40.078, "Sr": 87.62, "Ba": 137.327, "Al": 26.982,
    "Ga": 69.723, "Ge": 72.630, "Sn": 118.710, "Pb": 207.2, "As": 74.922,
    "Sb": 121.760, "Bi": 208.980, "Se": 78.971, "Te": 127.60, "Ti": 47.867,
    "Zr": 91.224, "V": 50.942, "Cr": 51.996, "Mo": 95.95, "W": 183.84,
    "Mn": 54.938, "Fe": 55.845, "Co": 58.933, "Ni": 58.693, "Cu": 63.546,
    "Zn": 65.38, "Cd": 112.414, "Hg": 200.592, "U": 238.029, "Ne": 20.180,
    "Kr": 83.798, "Xe": 131.293,
}

EMBEDDED_SOURCE = "Burcat 2005 / JANAF"

def parse_chemkin_thermo(path: Path) -> dict[str, dict]:
    """Parse a CHEMKIN-format NASA-7 thermo file.

    Returns a dict shaped like NASA7_INLINE.  Best-effort; relies on
    column positions per the CHEMKIN spec (cols 1-18 name, 25-44
    elements, 46-55 Tmin, 56-65 Tmax, 66-73 Tmid, 80 line type).
    """
    raw = path.read_text().splitlines()
    # source line for provenance: the file's own banner comment if present
    src = f"{path.name}"
    for ln in raw[:6]:
        if ln.lstrip().startswith("!") and len(ln.strip()) > 4:
            src = ln.lstrip("! ").strip()
            break
    out: dict[str, dict] = {}
    i = 0
    # Skip header lines until THERMO
    while i < len(raw) and not raw[i].strip().upper().startswith("THERMO"):
        i += 1
    i += 1
    # Optional T range line
    if i < len(raw) and len(raw[i]) < 30:
        i += 1

    while i + 3 < len(raw):
        head = raw[i]
        if head.strip().upper() == "END":
            break
        if not head.strip() or len(head) < 80 or head[79] != "1":
            i += 1
            continue
        # guard against comment lines that happen to carry a '1' in col 80
        # (Burcat prose lines do): a REAL card is followed by lines typed
        # '2','3','4' in col 80.
        ok234 = all(len(raw[i+k]) >= 80 and raw[i+k][79] == str(k+1) for k in (1, 2, 3))
        if not ok234:
            i += 1
            continue
        name = head[:18].split()[0]
        # Elements: FOUR pairs of (2-char symbol, 3-char count) at cols 25-44;
        # col 45 is the PHASE letter (G/L/S/C) -- reading a 5th pair swallows
        # it as a bogus element (the Burcat 'G' bug).
        elems = {}
        for j in range(4):
            sym = head[24 + 5*j : 24 + 5*j + 2].strip()
            cnt = head[24 + 5*j + 2 : 24 + 5*j + 5].strip()
            if sym and cnt:
                try:
                    elems[sym] = int(float(cnt))
                except ValueError:
                    pass
        l2, l3, l4 = raw[i+1], raw[i+2], raw[i+3]
        coefs = []
        for ln in (l2, l3, l4):
            for j in range(5):
                s = ln[15*j : 15*(j+1)]
                if s.strip():
                    try:
                        coefs.append(float(s))
                    except ValueError:
                        pass
        if len(coefs) >= 14:
            out[name] = dict(
                comment=f"Imported from {path.name}",
                source=src,
                formula=name,
                cas="n/a",         # the audit sentinel: never invent a CAS (the twin guard)
                # PARTIAL sums are silent lies: any unknown element -> MW 0
                mw=(round(sum(ATOMIC_MASS[sy.capitalize()] * n
                              for sy, n in elems.items()), 4)
                    if all(sy.capitalize() in ATOMIC_MASS for sy in elems)
                    else 0.0),
                elements=elems,
                low=coefs[7:14],
                high=coefs[0:7],
            )
            if out[name]["mw"] == 0.0:
                print(f"  WARNING: {name}: unknown element(s) {list(elems)} -> MW=0; fix by hand")
        i += 4
    return out


# =====================================================================
#   CLI
# =====================================================================

def main() -> int:
    here = Path(__file__).resolve().parent
    default_outdir = here.parent / "data" / "standards" / "components"

    p = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent("""
        Generate Choupo .dat component files from NASA-7 polynomial data.
        Without arguments, generates the embedded subset of atomic + radical
        species (H, O, N, C, CH3, HO2, H2O2, O3, NH2, NH).
        """).strip(),
    )
    p.add_argument("--outdir", default=str(default_outdir),
                   help="Where to write .dat files (default: %(default)s)")
    p.add_argument("--species", nargs="+",
                   help="Subset of species names to write (default: all in NASA7_INLINE)")
    p.add_argument("--thermo",
                   help="Additional CHEMKIN-format NASA-7 thermo file to import")
    args = p.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    db = dict(NASA7_INLINE)
    if args.thermo:
        extra = parse_chemkin_thermo(Path(args.thermo))
        print(f"Parsed {len(extra)} species from {args.thermo}")
        for n, e in extra.items():
            if n not in db:
                db[n] = e

    targets = args.species if args.species else list(NASA7_INLINE.keys())
    for name in targets:
        if name not in db:
            print(f"  ?? '{name}' not in catalogue or --thermo file; skipping", file=sys.stderr)
            continue
        path = make_dat(name, db[name], outdir)
        # quick consistency report
        low = db[name]["low"]
        dhf  = h_over_RT(298.15, low) * R * 298.15
        s298 = s_over_R (298.15, low) * R
        print(f"  -> {path.name:<12}  dHf_298 = {dhf:+10.1f} J/mol   s_298 = {s298:7.3f} J/(mol*K)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
