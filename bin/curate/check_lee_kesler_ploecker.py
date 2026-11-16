#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the Lee-Kesler-Ploecker equation of state is the two papers, and nothing else.

    bin/curate/check_lee_kesler_ploecker.py            run the gate
    bin/curate/check_lee_kesler_ploecker.py --selftest also prove it fails on seven sabotages

DEV.md 4c C408 (d).  src/thermo/equationOfState/LeeKeslerPloecker.{H,cpp} implement

    Lee & Kesler, AIChE J. 21 (1975) 510-527            [LK]
    Ploecker, Knapp & Prausnitz, Ind. Eng. Chem. Process Des. Dev. 17 (1978) 324-332   [PKP]

and data/standards/parameters/LKP/ holds PKP Table I (p. 327), one record per pair.

WHAT THIS GATE CHECKS (each arm names what it does not).

  (a) THE CONSTANTS AGAINST THE PAGE, SHA-PINNED.  The 24 numbers of LK Table 1
      (p. 511; d1 and d2 printed "x 10^4"), omega_r = 0.3978 (LK p. 514), eta = 0.25
      (PKP p. 325) and the 0.2905 / 0.085 of LK Eq. 21 are READ OUT OF THE C++
      SOURCE and held equal to a typed copy of the page (PAGE_*), and the typed
      copy is pinned by sha-256.  PKP Table A-I prints the same table again and
      differs in ONE entry (the simple fluid's d1 x 10^4: 0.155428 against LK's
      0.155488, a transposition); both readings are held here and the source must
      carry LK's.  The reading was made from the page images by one reader; the
      second reading is the PDF's OCR text layer, used in (b), not here.
  (b) THE kappa RECORDS AGAINST TABLE I.  Every one of the 131 records equals its
      row of the typed Table I (142 rows; the 11 hydrogen rows are not shipped
      because the model refuses hydrogen), the directory holds exactly those
      files, and the whole is sha-256 pinned.  Where the PDF is on this machine
      the typed table is also held to the PDF's OCR text layer, value for value
      (the layer misses three values the page prints; they are named).
  (c) THE PRINTED TABLES (and Poling 5th ed., Example 4-1, p. 4.7, which prints
      Z(0) = 0.697 and Z(1) = -0.111 at T_r 0.95, P_r 0.60 and Z = 0.661 for omega = 0.326).  LK Tables 5, 7, 9 and 11 (the simple fluid: Z,
      (H*-H)/(R T_c), (S*-S)/R, log10(f/P)), at 17 reduced states chosen to
      include the dilute gas, the compressed liquid, the metastable-root
      region and the extremes of T_r, and Tables 6, 8, 10, 12 (the deviation
      function (q_r - q_0)/omega_r) at 6 states, are reproduced on the root the
      table prints; Z within 0.6e-4, the others within 0.6e-3 (half a unit of
      the printed place plus the rounding of the printed constants).  ONE state
      is the simple fluid's critical point, T_r = P_r = 1, where V_r responds to
      P_r as a cube root: half a unit of the last printed digit of any ONE of
      the 12 constants moves Z there between 0.284 and 0.300 (computed here), so
      the printed 0.2901 can only be asked to lie in that band.  The same seven
      states are run through the whole package (case lkp01) and must equal the
      correlation's own values to 1e-9.
  (d) AN INDEPENDENT PYTHON TRANSCRIPTION of Eqs. 3, 9, 11, 12 (written here from
      the page, sharing no code with the engine) reproduces the engine's Z,
      ln phi, H^R/RT and S^R/R at 12 states, both roots, to 1e-9.
  (e) G = H - T S CLOSES.  H^R/RT - S^R/R = ln phi to 1e-9 on a 400-state
      grid of the correlation (both roots, omega 0-0.5), and on the package
      (vapour root, the ternary at 112 K and a hot mixture, probe GRES against the
      mole-fraction sum of ln phi) to 1e-9.
  (f) THE COMPONENT FUGACITY IS THE DERIVATIVE.  ln phi_i of the mixture is
      compared with the central-difference mole-number derivative of
      n ln phi_M computed by the independent Python transcription with the
      pseudo-critical rules of PKP Eqs. 9-14 (so PKP A7-A13 are checked against
      the derivative they are the closed form of) to 1e-6, on three states.
  (g) THE PURE-FLUID LIMIT.  A pure component through the package equals the
      correlation at T/T_c, P/P_c, omega (PKP Eqs. 9-14 return T_c and P_c
      for one component) to 1e-12.
  (h) THE MEASURED COMPARISON.  Case lkp02 against Miller, Kidnay & Hiza (1973):
      the P_bubble AAD of N2 + CH4 (11 runs), N2 + Ar (7) and the ternary (10) must
      sit under ceilings set from the first run (observed 1.6 %, 0.75 %, 0.49 %);
      the ceilings are regression bounds, not claims of accuracy.
  (i) THE REFUSALS AND ANNOUNCEMENTS, by running the engine on a throwaway copy:
      hydrogen is refused naming Gunn et al.; kappa <= 0 is refused naming the
      multiplier; a record regressed for another EoS is refused; a pair naming
      an unknown component is refused; a `mixingRule` key (the model has one rule) is refused;
      a pair with no kappa is ANNOUNCED BY NAME
      and appears in the resolved view; an evaluation outside T_r 0.3-4 is
      announced once.

NOT CHECKED: the correlation's physics beyond the printed tables and the two
measured systems (non-polar fluids at the simplest end); any strongly polar
fluid (PKP exclude them); the Table I rows beyond the page reading and the OCR
second reading; hydrogen and helium (refused); the liquid-root enthalpy and
entropy of a MIXTURE through the package (the family contract is the vapour
root; (c) and (e) hold the correlation's own liquid-root values); the GUI.

--selftest SABOTAGES (the proof the gate can fail; each on a COPY, the tree is
never written): S1 a kappa record changed; S2 a Table 1 constant changed in a copy
of the source; S3 a typed Table I row removed; S4 the sign of the d1 term of Eq. 12
flipped in the engine (compiled into the probe); S5 Eq. 9 and Eq. 11 desynchronised
(E dropped from H) so G = H - TS no longer closes; S6 the pressure term of the
component fugacity (A7) flipped; S7 the exponent eta set to 0.5 in a copy of the
source.  S4-S7 compile the sabotaged source into the probe, whose own symbols win
over libchoupo.so's.
"""
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
SRC = ROOT / "src/thermo/equationOfState/LeeKeslerPloecker.cpp"
RECS = ROOT / "data/standards/parameters/LKP"
BUILD = ROOT / "build" / "linux64Gcc"
PROPS = BUILD / "choupoProps"
LIB = BUILD / "libchoupo.so"
PROBE_SRC = ROOT / "bin/curate/_lkpProbe.cpp"
CASE1 = ROOT / "tutorials/props/molecular/lkp01_lee_kesler_tables"
CASE2 = ROOT / "tutorials/props/compare/lkp02_n2_ch4_ar_112K"
LIT = Path.home() / "Choupo-Literature/Articles/Thermodynamics-PhaseEquilibria"
R = 8.314462618
ATM = 101325.0

PDF_SHA = {   # the sources (the Poling book, ~/Choupo-Literature/Books/, has sha-256
    # 5b8f0309b68b3240724c34533f4ce5d000a5e1d9ee747110db36917993e14d39: the cross-check of arm (c)), so a reader with the PDFs can verify the pages read
    "lee1975-generalized-correlation-three-parameter-corresponding-states.pdf":
        "d958e943b3f842d7630d4c70bae27e1f31e90e96cf1e8d9d3d6725ee7e9315d7",
    "ploecker1978-lee-kesler-mixtures-vle-high-pressure.pdf":
        "3b71d04bc7e45efe1c6ffc17d8310df131d585c738c4ac703319ef24304d8996",
}

# ---------------------------------------------------------------------------
#  (a) the page: LK Table 1 (p. 511) as printed (d1, d2 in the table's x 10^4),
#      and PKP Table A-I (p. 331), which differs in ONE entry.
# ---------------------------------------------------------------------------
KEYS = ["b1", "b2", "b3", "b4", "c1", "c2", "c3", "c4", "d1x4", "d2x4", "beta", "gamma"]
PAGE_LK_SIMPLE = [0.1181193, 0.265728, 0.154790, 0.030323, 0.0236744, 0.0186984,
                  0.0, 0.042724, 0.155488, 0.623689, 0.65392, 0.060167]
PAGE_LK_REFERENCE = [0.2026579, 0.331511, 0.027655, 0.203488, 0.0313385, 0.0503618,
                     0.016901, 0.041577, 0.48736, 0.0740336, 1.226, 0.03754]
PAGE_PKP_SIMPLE = list(PAGE_LK_SIMPLE)
PAGE_PKP_SIMPLE[8] = 0.155428          # PKP Table A-I: the one entry that differs
PAGE_PKP_REFERENCE = list(PAGE_LK_REFERENCE)
PAGE_OTHER = {"omegaRef": 0.3978, "eta": 0.25, "Zc0": 0.2905, "Zc1": 0.085}
CONST_PIN = "1df19493aa00dc610dbe4ceef7c940a5f5b6a6139982f37f86e5246c22a10454"

# ---------------------------------------------------------------------------
#  (b) PKP Table I (p. 327), in the paper's words, as read from the page image.
# ---------------------------------------------------------------------------
TABLE_I = [
    ("methane", "ethane", 1.052), ("methane", "ethylene", 1.014), ("methane", "propane", 1.113),
    ("methane", "propylene", 1.089), ("methane", "n-butane", 1.171), ("methane", "isobutane", 1.155),
    ("methane", "n-pentane", 1.240), ("methane", "isopentane", 1.228), ("methane", "n-hexane", 1.304),
    ("methane", "cyclohexane", 1.269), ("methane", "benzene", 1.234), ("methane", "n-heptane", 1.367),
    ("methane", "n-octane", 1.423), ("methane", "n-nonane", 1.484), ("methane", "n-decane", 1.533),
    ("ethane", "ethylene", 0.991), ("ethane", "propane", 1.010), ("ethane", "propylene", 1.002),
    ("ethane", "n-butane", 1.029), ("ethane", "isobutane", 1.036), ("ethane", "n-pentane", 1.064),
    ("ethane", "isopentane", 1.070), ("ethane", "n-hexane", 1.106), ("ethane", "cyclohexane", 1.081),
    ("ethane", "benzene", 1.066), ("ethane", "n-heptane", 1.143), ("ethane", "n-octane", 1.165),
    ("ethane", "n-nonane", 1.214), ("ethane", "n-decane", 1.237),
    ("ethylene", "n-butane", 0.998), ("ethylene", "benzene", 1.094), ("ethylene", "n-heptane", 1.163),
    ("acetylene", "ethylene", 0.948),
    ("propane", "propylene", 0.992), ("propane", "n-butane", 1.003), ("propane", "isobutane", 1.003),
    ("propane", "n-pentane", 1.006), ("propane", "isopentane", 1.009), ("propane", "n-hexane", 1.047),
    ("propane", "cyclohexane", 1.037), ("propane", "benzene", 1.011), ("propane", "n-heptane", 1.067),
    ("propane", "n-octane", 1.090), ("propane", "n-nonane", 1.115), ("propane", "n-decane", 1.139),
    ("propylene", "n-butane", 1.010), ("propylene", "isobutane", 1.009), ("propylene", "isobutene", 1.006),
    ("n-butane", "isobutane", 1.001), ("n-butane", "n-pentane", 0.994), ("n-butane", "isopentane", 0.998),
    ("n-butane", "n-hexane", 1.018), ("n-butane", "cyclohexane", 1.008), ("n-butane", "benzene", 0.999),
    ("n-butane", "n-heptane", 1.027), ("n-butane", "n-octane", 1.046), ("n-butane", "n-nonane", 1.064),
    ("n-butane", "n-decane", 1.078),
    ("n-pentane", "isopentane", 0.987), ("n-pentane", "n-hexane", 0.996), ("n-pentane", "cyclohexane", 0.996),
    ("n-pentane", "benzene", 0.977), ("n-pentane", "n-heptane", 1.004), ("n-pentane", "n-octane", 1.020),
    ("n-pentane", "n-nonane", 1.033), ("n-pentane", "n-decane", 1.045),
    ("n-hexane", "cyclohexane", 0.998), ("n-hexane", "benzene", 0.978), ("n-hexane", "n-heptane", 1.008),
    ("n-hexane", "n-octane", 1.005), ("n-hexane", "n-nonane", 1.015), ("n-hexane", "n-decane", 1.025),
    ("benzene", "cyclohexane", 0.979), ("benzene", "n-heptane", 0.985), ("benzene", "n-octane", 0.987),
    ("benzene", "isooctane", 0.982), ("benzene", "n-nonane", 1.034), ("benzene", "n-decane", 1.047),
    ("cyclohexane", "n-heptane", 0.999), ("cyclohexane", "n-octane", 1.010), ("cyclohexane", "n-nonane", 1.021),
    ("cyclohexane", "n-decane", 1.032),
    ("n-heptane", "n-octane", 0.993), ("n-heptane", "isooctane", 1.002), ("n-heptane", "n-nonane", 1.002),
    ("n-heptane", "n-decane", 1.010),
    ("n-octane", "n-nonane", 0.993), ("n-octane", "n-decane", 0.999), ("n-nonane", "n-decane", 0.991),
    ("nitrogen", "methane", 0.977), ("nitrogen", "ethylene", 1.032), ("nitrogen", "ethane", 1.082),
    ("nitrogen", "propane", 1.177), ("nitrogen", "propylene", 1.151), ("nitrogen", "n-butane", 1.276),
    ("nitrogen", "n-pentane", 1.372), ("nitrogen", "n-hexane", 1.442), ("nitrogen", "oxygen", 0.997),
    ("nitrogen", "carbon monoxide", 0.987), ("nitrogen", "argon", 0.988), ("nitrogen", "hydrogen sulfide", 0.983),
    ("nitrogen", "carbon dioxide", 1.110), ("nitrogen", "nitrous oxide", 1.073), ("nitrogen", "ammonia", 1.033),
    ("carbon dioxide", "methane", 0.975), ("carbon dioxide", "ethane", 0.938), ("carbon dioxide", "propane", 0.925),
    ("carbon dioxide", "n-butane", 0.955), ("carbon dioxide", "isobutane", 0.946), ("carbon dioxide", "n-pentane", 1.002),
    ("carbon dioxide", "n-hexane", 1.018), ("carbon dioxide", "cyclohexane", 1.054), ("carbon dioxide", "benzene", 1.018),
    ("carbon dioxide", "n-heptane", 1.058), ("carbon dioxide", "n-octane", 1.090), ("carbon dioxide", "n-nonane", 1.126),
    ("carbon dioxide", "n-decane", 1.160), ("carbon dioxide", "hydrogen sulfide", 0.922), ("carbon dioxide", "R-12", 0.969),
    ("carbon dioxide", "methanol", 1.069),
    ("hydrogen", "methane", 1.216), ("hydrogen", "ethane", 1.604), ("hydrogen", "ethylene", 1.498),
    ("hydrogen", "propane", 1.826), ("hydrogen", "n-butane", 2.093), ("hydrogen", "n-pentane", 2.335),
    ("hydrogen", "n-hexane", 2.456), ("hydrogen", "n-heptane", 2.634), ("hydrogen", "nitrogen", 1.080),
    ("hydrogen", "carbon monoxide", 1.085), ("hydrogen", "carbon dioxide", 1.624),
    ("argon", "oxygen", 0.985), ("argon", "ammonia", 1.010), ("argon", "methane", 0.984),
    ("oxygen", "nitrous oxide", 1.057), ("carbon monoxide", "methane", 0.974), ("krypton", "oxygen", 0.989),
    ("hydrogen sulfide", "isobutane", 0.947), ("nitrous oxide", "methane", 1.017),
    ("water", "carbon dioxide", 0.920), ("water", "ammonia", 1.152), ("water", "methanol", 0.979),
]
NAME = {   # the paper's word -> the catalogue's component name
    "methane": "CH4", "ethane": "ethane", "ethylene": "ethylene", "propane": "propane",
    "propylene": "propylene", "n-butane": "nButane", "isobutane": "isoButane",
    "isobutene": "isoButene", "n-pentane": "nPentane", "isopentane": "isopentane",
    "n-hexane": "nHexane", "cyclohexane": "cyclohexane", "benzene": "benzene",
    "n-heptane": "nHeptane", "n-octane": "nOctane", "isooctane": "224Trimethylpentane",
    "n-nonane": "nNonane", "n-decane": "nDecane", "nitrogen": "N2", "oxygen": "O2",
    "carbon monoxide": "CO", "argon": "Ar", "hydrogen sulfide": "H2S",
    "carbon dioxide": "CO2", "nitrous oxide": "N2O", "ammonia": "NH3", "R-12": "R12",
    "methanol": "methanol", "acetylene": "acetylene", "krypton": "krypton", "water": "water",
}
RECORDS_PIN = "c365243f7226e9b82b0cc0ad53906f46874a7b1d3533e3dbd9b83416b91c38b4"
OCR_MISSES = {1.171, 1.152, 0.979}     # printed on the page, absent from the OCR layer (or one of two)

# ---------------------------------------------------------------------------
#  (c) the printed tables.  (T_r, P_r, root) -> (Z0, H0, S0, logf0) of Tables 5, 7, 9, 11
#  with H0 = (H*-H)/(R T_c)  and S0 = (S*-S)/R as the tables define them.
# ---------------------------------------------------------------------------
T0 = [
    (0.70, 0.2, "L", 0.0344, 4.848, 6.140, -0.341),
    (0.80, 0.2, "V", 0.8539, 0.345, 0.294, -0.059),
    (0.80, 0.4, "L", 0.0661, 4.507, 5.026, -0.264),
    (0.90, 0.2, "V", 0.9015, 0.264, 0.199, -0.041),
    (0.90, 0.4, "V", 0.7800, 0.596, 0.463, -0.086),
    (0.90, 0.6, "L", 0.1006, 4.074, 4.145, -0.166),
    (0.95, 0.6, "V", 0.6967, 0.885, 0.671, -0.113),
    (0.95, 0.8, "L", 0.1410, 3.763, 3.556, -0.176),
    (0.97, 0.8, "V", 0.5580, 1.356, 1.056, -0.148),
    (0.97, 1.0, "L", 0.1779, 3.658, 3.259, -0.223),
    (0.50, 0.1, "L", 0.0207, 5.459, 7.841, -1.336),
    (0.30, 0.01, "L", 0.0029, 6.045, 11.614, -3.708),
    (0.30, 10.0, "L", 2.8507, 5.446, 5.578, -5.461),
    (1.20, 1.0, "V", 0.7858, 0.857, 0.512, -0.088),
    (1.50, 5.0, "V", 0.8200, 2.175, 1.088, -0.157),
    (2.00, 3.0, "V", 0.9550, 0.782, 0.325, -0.029),
    (3.00, 7.0, "V", 1.1075, 0.495, 0.236, 0.031),
]
#  the critical point of the simple fluid -- see (c) in the header
CRIT = (1.00, 1.0, "V", 0.2901, 2.584, 2.178, -0.176)
CRIT_BAND = (0.284, 0.300)
#  Tables 6, 8, 10, 12: the deviation function (q_r - q_0)/omega_r at the lkp01 states
#  state -> (Tr, Pr, Z1, H1, S1, logf1)
T1 = {
    "A": (1.20, 1.0, 0.0719, 0.349, 0.343, 0.023),
    "B": (1.50, 5.0, 0.2309, 0.142, 0.479, 0.167),
    "C": (2.00, 3.0, 0.2069, -0.295, 0.077, 0.097),
    "E": (0.90, 0.2, -0.0442, 0.308, 0.301, -0.018),
    "F": (0.50, 1.0, -0.0893, 8.888, 11.153, -2.877),
    "G": (3.00, 7.0, 0.2817, -0.763, 0.093, 0.151),
}
T1_CRIT = ("D", 1.00, 1.0, -0.0879, 2.471, 2.399, -0.031)
LKP01_STATES = {"A": (1.20, 1.0), "B": (1.50, 5.0), "C": (2.00, 3.0), "D": (1.00, 1.0),
                "E": (0.90, 0.2), "F": (0.50, 1.0), "G": (3.00, 7.0)}
TOL_Z, TOL_OTHER = 0.6e-4, 0.6e-3
POLING_Z = 0.661        # Poling, Prausnitz & OConnell 5th ed., Example 4-1, p. 4.7

# ---------------------------------------------------------------------------
#  (h) Miller, Kidnay & Hiza (1973), Table 3 rows evaluated (P atm, xAr, xN2, xCH4, yAr, yN2, yCH4)
# ---------------------------------------------------------------------------
T3 = [
    (5.021, 0.4841, 0.0422, 0.4738, 0.7232, 0.1531, 0.1236),
    (6.968, 0.4181, 0.1876, 0.3943, 0.4548, 0.4609, 0.0843),
    (8.981, 0.3382, 0.3595, 0.3024, 0.2950, 0.6455, 0.0594),
    (10.955, 0.2530, 0.5380, 0.2090, 0.1900, 0.7691, 0.0408),
    (12.997, 0.1585, 0.7234, 0.1181, 0.1077, 0.8672, 0.0251),
    (7.362, 0.8462, 0.0574, 0.0962, 0.8522, 0.1248, 0.0229),
    (11.002, 0.5094, 0.4341, 0.0566, 0.3797, 0.6084, 0.0119),
    (8.971, 0.4959, 0.3003, 0.2038, 0.4260, 0.5313, 0.0427),
    (8.976, 0.1880, 0.4156, 0.3964, 0.1644, 0.7592, 0.0764),
    (12.968, 0.0878, 0.7595, 0.1527, 0.0384, 0.9408, 0.0208),
]
MILLER_N2CH4 = [(0.0338, 1.814), (0.0545, 2.152), (0.1336, 3.961), (0.1505, 4.229), (0.2170, 5.413),
                (0.3082, 6.894), (0.4701, 9.001), (0.5172, 9.366), (0.6103, 10.705),
                (0.7068, 11.804), (0.7811, 12.788)]
MILLER_N2AR = [(0.1107, 8.399), (0.2452, 9.645), (0.3385, 10.452), (0.5124, 11.963),
               (0.6243, 12.904), (0.7355, 13.876), (0.8529, 14.903)]
CEILING = {"n2ch4": 2.5, "n2ar": 1.5, "ternary": 1.0}      # percent, P_bubble AAD

# ===========================================================================
#  helpers
# ===========================================================================


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def norm(x):
    return repr(float(x))


def const_fingerprint():
    parts = ["LK", ",".join(norm(v) for v in PAGE_LK_SIMPLE), ",".join(norm(v) for v in PAGE_LK_REFERENCE),
             "PKP", ",".join(norm(v) for v in PAGE_PKP_SIMPLE), ",".join(norm(v) for v in PAGE_PKP_REFERENCE),
             ",".join("%s=%s" % (k, norm(v)) for k, v in sorted(PAGE_OTHER.items()))]
    return sha("|".join(parts))


def table_fingerprint():
    return sha("|".join("%s,%s,%s" % (a, b, norm(k)) for a, b, k in TABLE_I))


def parse_block(text, ident):
    m = re.search(r"LeeKeslerPloecker::Fluid LeeKeslerPloecker::%s\s*=\s*\{(.*?)\};" % ident, text, re.S)
    if not m:
        return None
    body = re.sub(r"//[^\n]*", "", m.group(1))
    nums = re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", body)
    return [float(v) for v in nums]


def source_constants(text):
    """the 12 + 12 numbers and the mixing constants, as the C++ source carries them"""
    out = {}
    for ident in ("simpleFluid", "referenceFluid"):
        v = parse_block(text, ident)
        out[ident] = v
    m = re.search(r"scalar\s+omegaRef\s*=\s*([0-9.]+)", PROBE_HDR)
    out["omegaRef"] = float(m.group(1)) if m else None
    m = re.search(r"scalar\s+eta\s*=\s*([0-9.]+)", PROBE_HDR)
    out["eta"] = float(m.group(1)) if m else None
    m = re.search(r"\(\s*([0-9.]+)\s*-\s*([0-9.]+)\s*\*\s*om\s*\)\s*\*\s*constant::R", text)
    out["Zc"] = (float(m.group(1)), float(m.group(2))) if m else None
    return out


def source_problems(text):
    bad = []
    c = source_constants(text)
    for ident, page, tag in (("simpleFluid", PAGE_LK_SIMPLE, "simple"), ("referenceFluid", PAGE_LK_REFERENCE, "reference")):
        v = c[ident]
        if v is None or len(v) != 12:
            bad.append("(a) the %s initialiser could not be read from the source" % ident)
            continue
        # the source stores d1, d2 multiplied out (x 1e-4)
        want = list(page)
        want[8] *= 1e-4
        want[9] *= 1e-4
        for k, a, b in zip(KEYS, v, want):
            if a != b and abs(a - b) > 1e-15 * max(1.0, abs(b)):
                bad.append("(a) %s %s: source %r, LK Table 1 prints %r" % (tag, k, a, b))
    if c["omegaRef"] != PAGE_OTHER["omegaRef"]:
        bad.append("(a) omegaRef %r != %r (LK p. 514)" % (c["omegaRef"], PAGE_OTHER["omegaRef"]))
    if c["eta"] != PAGE_OTHER["eta"]:
        bad.append("(a) eta %r != %r (PKP p. 325)" % (c["eta"], PAGE_OTHER["eta"]))
    if c["Zc"] != (PAGE_OTHER["Zc0"], PAGE_OTHER["Zc1"]):
        bad.append("(a) Zc rule %r != (0.2905, 0.085) (LK Eq. 21)" % (c["Zc"],))
    return bad


def pin_problems():
    bad = []
    if const_fingerprint() != CONST_PIN:
        bad.append("(a) the typed page constants moved: fingerprint %s, pinned %s (read the page, change the "
                   "source and PAGE_*, update the pin together)" % (const_fingerprint(), CONST_PIN))
    # the one disagreement between the two printings is the one we know
    diffs = [k for k, a, b in zip(KEYS, PAGE_LK_SIMPLE, PAGE_PKP_SIMPLE) if a != b]
    diffs += [k for k, a, b in zip(KEYS, PAGE_LK_REFERENCE, PAGE_PKP_REFERENCE) if a != b]
    if diffs != ["d1x4"]:
        bad.append("(a) LK Table 1 and PKP Table A-I should differ in the simple fluid's d1 only, differ in %s" % diffs)
    return bad


def record_files(d):
    return {p.name: p for p in sorted(Path(d).glob("*.dat"))}


def parse_record(path):
    t = Path(path).read_text()
    r = {}
    for k in ("recordType", "i", "j", "kij", "eos"):
        m = re.search(r"^%s\s+(\S+?)\s*;" % k, t, re.M)
        r[k] = m.group(1) if m else None
    r["text"] = t
    return r


def expected_records():
    exp = {}
    for a, b, k in TABLE_I:
        if "hydrogen" in (a, b):
            continue
        ca, cb = NAME[a], NAME[b]
        i, j = (ca, cb) if ca.encode() <= cb.encode() else (cb, ca)
        exp["%s-%s.dat" % (i, j)] = (i, j, k)
    return exp


def record_problems(d=RECS, check_pin=True):
    bad = []
    exp = expected_records()
    have = record_files(d)
    for f in sorted(set(exp) - set(have)):
        bad.append("(b) record %s missing" % f)
    for f in sorted(set(have) - set(exp)):
        bad.append("(b) record %s is not a Table I row" % f)
    cat = []
    for f, (i, j, k) in sorted(exp.items()):
        if f not in have:
            continue
        r = parse_record(have[f])
        if r["recordType"] != "eosBinaryInteraction" or r["eos"] != "LeeKeslerPloecker":
            bad.append("(b) %s: recordType/eos wrong (%s, %s)" % (f, r["recordType"], r["eos"]))
        if {r["i"], r["j"]} != {i, j}:
            bad.append("(b) %s: names %s, %s, expected %s, %s" % (f, r["i"], r["j"], i, j))
        try:
            if float(r["kij"]) != k:
                bad.append("(b) %s: kappa %s, PKP Table I prints %.3f" % (f, r["kij"], k))
        except (TypeError, ValueError):
            bad.append("(b) %s: no kappa" % f)
        if "Ploecker" not in r["text"] or "Table I" not in r["text"]:
            bad.append("(b) %s: the header does not cite PKP Table I" % f)
        cat.append(f + "\n" + r["text"])
    if len(TABLE_I) != 142:
        bad.append("(b) the typed Table I has %d rows, the page prints 142" % len(TABLE_I))
    if check_pin and not bad:
        h = sha("\n--\n".join(cat))
        if h != RECORDS_PIN:
            bad.append("(b) the records moved: sha-256 %s, pinned %s (a kappa edit is a curation act: read "
                       "the page, change the record AND TABLE_I, update the pin together)" % (h, RECORDS_PIN))
    if check_pin and table_fingerprint() != TABLE_PIN:
        bad.append("(b) the typed Table I moved: %s, pinned %s" % (table_fingerprint(), TABLE_PIN))
    return bad


TABLE_PIN = "2edd1333b245a28bb86999b6ed7b64520d30afa876c60eb6d7ee93c26eef3e72"


def ocr_problems(table=None):
    """second reading: the PDF's own text layer"""
    table = TABLE_I if table is None else table
    pdf = LIT / "ploecker1978-lee-kesler-mixtures-vle-high-pressure.pdf"
    if not pdf.exists() or shutil.which("pdftotext") is None:
        return [], "NOTE: the PKP PDF is not on this machine -- the OCR second reading of Table I was not made"
    got = hashlib.sha256(pdf.read_bytes()).hexdigest()
    if got != PDF_SHA[pdf.name]:
        return ["(b) %s has sha-256 %s, the gate was written against %s" % (pdf.name, got, PDF_SHA[pdf.name])], ""
    txt = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout.splitlines()
    try:
        st = [i for i, l in enumerate(txt) if l.startswith("Table I. Binary")][0]
        en = [i for i, l in enumerate(txt) if "See comment under Results" in l][0]
    except IndexError:
        return ["(b) the OCR layer has no Table I block"], ""
    from collections import Counter
    layer = Counter()
    for l in txt[st + 2:en]:
        for m in re.finditer(r"\b\d\.\d{3}\b", l):
            layer[m.group()] += 1
    mine = Counter("%.3f" % k for *_, k in table)
    missing = mine - layer
    extra = layer - mine
    bad = []
    for k, n in extra.items():
        bad.append("(b) the OCR layer reads %s (x%d) which the typed table does not carry" % (k, n))
    for k, n in missing.items():
        if float(k) not in OCR_MISSES:
            bad.append("(b) the typed table carries %s (x%d) which the OCR layer does not read" % (k, n))
    return bad, "OCR second reading made"


# ---------------------------------------------------------------------------
#  the probe (compiled against libchoupo.so; optionally with a sabotaged source)
# ---------------------------------------------------------------------------
PROBE_HDR = (ROOT / "src/thermo/equationOfState/LeeKeslerPloecker.H").read_text()


def build_probe(workdir, src_override=None, name="lkpProbe"):
    if not LIB.exists():
        return None, "libchoupo.so is not built -- a check that cannot run must not pass"
    out = Path(workdir) / name
    cmd = ["g++", "-std=c++17", "-O2", "-I" + str(ROOT / "src"), "-I" + str(ROOT),
           "-I" + str(ROOT / "src/thermo/equationOfState"), str(PROBE_SRC)]
    if src_override:
        cmd.append(str(src_override))
    cmd += [str(LIB), "-Wl,-rpath," + str(BUILD), "-o", str(out)]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        return None, "the probe did not compile:\n" + p.stderr[-1500:]
    return out, None


def ask(probe, lines, workdir):
    req = Path(workdir) / ("req_%d.txt" % abs(hash(tuple(lines))))
    req.write_text("\n".join(lines) + "\n")
    p = subprocess.run([str(probe), str(req)], capture_output=True, text=True, timeout=600)
    if "<<<PROBE" not in p.stdout:
        raise RuntimeError("probe failed: " + (p.stderr or p.stdout)[-600:])
    body = p.stdout.split("<<<PROBE")[1].split("PROBE>>>")[0].strip().splitlines()
    out = []
    for l in body:
        if not l.startswith("OK"):
            raise RuntimeError("probe: " + l)
        out.append([float(t) for t in l.split()[1:]])
    return out


# ---------------------------------------------------------------------------
#  independent Python transcription of LK Eqs. 3, 9, 11, 12 and PKP Eqs. 9-14
# ---------------------------------------------------------------------------
def pyfluid(vals):
    d = dict(zip(KEYS, vals))
    d["d1"] = d.pop("d1x4") * 1e-4
    d["d2"] = d.pop("d2x4") * 1e-4
    return d


PY_SIMPLE = pyfluid(PAGE_LK_SIMPLE)
PY_REF = pyfluid(PAGE_LK_REFERENCE)


def zeos(f, Tr, Vr):
    B = f["b1"] - f["b2"] / Tr - f["b3"] / Tr**2 - f["b4"] / Tr**3
    C = f["c1"] - f["c2"] / Tr + f["c3"] / Tr**3
    D = f["d1"] + f["d2"] / Tr
    return (1 + B / Vr + C / Vr**2 + D / Vr**5
            + f["c4"] / (Tr**3 * Vr**2) * (f["beta"] + f["gamma"] / Vr**2) * math.exp(-f["gamma"] / Vr**2))


def py_roots(f, Tr, Pr):
    g = lambda V: zeos(f, Tr, V) - Pr * V / Tr
    out = []
    V = 1e-3
    while V < 1e10:
        V2 = V * 1.01
        if g(V) > 0 >= g(V2):
            lo, hi = V, V2
            for _ in range(120):
                m = 0.5 * (lo + hi)
                if g(m) > 0: lo = m
                else: hi = m
            out.append(0.5 * (lo + hi))
        V = V2
    return out


def py_props(f, Tr, Pr, root):
    r = py_roots(f, Tr, Pr)
    Vr = r[0] if root == "L" else r[-1]
    Z = Pr * Vr / Tr
    T2, T3, V2 = Tr**2, Tr**3, Vr**2
    V5 = V2 * V2 * Vr
    B = f["b1"] - f["b2"] / Tr - f["b3"] / T2 - f["b4"] / T3
    C = f["c1"] - f["c2"] / Tr + f["c3"] / T3
    D = f["d1"] + f["d2"] / Tr
    E = f["c4"] / (2 * T3 * f["gamma"]) * (f["beta"] + 1 - (f["beta"] + 1 + f["gamma"] / V2) * math.exp(-f["gamma"] / V2))
    ln = Z - 1 - math.log(Z) + B / Vr + C / (2 * V2) + D / (5 * V5) + E
    h = (Z - 1 - (f["b2"] + 2 * f["b3"] / Tr + 3 * f["b4"] / T2) / (Tr * Vr)
         - (f["c2"] - 3 * f["c3"] / T2) / (2 * Tr * V2) + f["d2"] / (5 * Tr * V5) + 3 * E)
    s = (math.log(Z) - (f["b1"] + f["b3"] / T2 + 2 * f["b4"] / T3) / Vr
         - (f["c1"] - 2 * f["c3"] / T3) / (2 * V2) - f["d1"] / (5 * V5) + 2 * E)
    return Z, ln, h, s


OMR = 0.3978


def py_blend(Tr, Pr, om, root):
    a = py_props(PY_SIMPLE, Tr, Pr, root)
    b = py_props(PY_REF, Tr, Pr, root)
    w = om / OMR
    return [x + w * (y - x) for x, y in zip(a, b)]


def py_mixture_lnphiM(comps, kappa, T, P, z, root):
    """PKP Eqs. 9-14 and the blend; comps = [(Tc K, Pc Pa, omega)]"""
    n = len(comps)
    Vc = [(0.2905 - 0.085 * w) * R * Tc / Pc for Tc, Pc, w in comps]
    vcm = 0.0
    s = 0.0
    for j in range(n):
        for k in range(n):
            vjk = 0.125 * (Vc[j]**(1 / 3) + Vc[k]**(1 / 3))**3
            tjk = math.sqrt(comps[j][0] * comps[k][0]) * kappa[j][k]
            vcm += z[j] * z[k] * vjk
            s += z[j] * z[k] * vjk**0.25 * tjk
    Tcm = s / vcm**0.25
    om = sum(z[j] * comps[j][2] for j in range(n))
    Pcm = (0.2905 - 0.085 * om) * R * Tcm / vcm
    Z, ln, h, sr = py_blend(T / Tcm, P / Pcm, om, root)
    return ln


def py_lnphi_i(comps, kappa, T, P, z, root, h=1e-5):
    """ln phi_i = d(n ln phi_M)/d n_i at T, P, by a central difference"""
    n = len(comps)
    out = []
    for i in range(n):
        def G(dn):
            nn = list(z)
            nn[i] += dn
            tot = sum(nn)
            zz = [x / tot for x in nn]
            return tot * py_mixture_lnphiM(comps, kappa, T, P, zz, root)
        out.append((G(h) - G(-h)) / (2 * h))
    return out


def read_component(name):
    t = (ROOT / "data/standards/components" / (name + ".dat")).read_text()
    g = lambda k: float(re.search(r"^%s\s+([0-9.eE+-]+)\s*;" % k, t, re.M).group(1))
    return g("Tc"), g("Pc") * 1e5, g("omega")


def read_kappa(a, b):
    f = RECS / ("%s-%s.dat" % (a, b))
    if not f.exists():
        f = RECS / ("%s-%s.dat" % (b, a))
    return float(parse_record(f)["kij"])


# ---------------------------------------------------------------------------
#  the arms that need the engine
# ---------------------------------------------------------------------------
def table_problems(probe, wd):
    bad = []
    tabs = []
    reqs = []
    for (Tr, Pr, root, *_) in T0:
        reqs.append("BLEND %s %r %r 0" % (root, Tr, Pr))
    res = ask(probe, reqs, wd)
    worst = 0.0
    for (Tr, Pr, root, z0, h0, s0, lf0), r in zip(T0, res):
        Z, lnphi, h, s = r[0], r[1], r[2], r[3]
        got = (Z, -h * Tr, -s, lnphi / math.log(10))
        for nm, g, w, tol in zip(("Z", "H*-H", "S*-S", "log f/P"), got, (z0, h0, s0, lf0),
                                 (TOL_Z, TOL_OTHER, TOL_OTHER, TOL_OTHER)):
            worst = max(worst, abs(g - w) / tol)
            if abs(g - w) > tol:
                bad.append("(c) Table (0) %s at T_r %.2f, P_r %g, %s root: engine %.5f, page %.4f"
                           % (nm, Tr, Pr, root, g, w))
    # Poling, Prausnitz & OConnell, 5th ed., Example 4-1 (p. 4.7): R-134a at T_r 0.95, P_r 0.60,
    # omega 0.326 from the 4th edition's Lee-Kesler tables Z(0) = 0.697, Z(1) = -0.111, so
    # Z = 0.697 + 0.326 (-0.111) = 0.661.  An independent printing of the same correlation.
    z = ask(probe, ["BLEND V 0.95 0.6 0.326"], wd)[0][0]
    if abs(z - POLING_Z) > 6e-4:
        bad.append("(c) Poling 5th ed. Example 4-1: engine Z %.5f, the book prints %.3f" % (z, POLING_Z))
    # the critical point of the simple fluid: a band, with the reason in the header
    r = ask(probe, ["BLEND V 1.0 1.0 0"], wd)[0]
    if not (CRIT_BAND[0] <= r[0] <= CRIT_BAND[1]):
        bad.append("(c) the simple fluid's critical-point Z is %.4f, outside the band %s that the rounding of "
                   "the printed constants allows around the printed 0.2901" % (r[0], CRIT_BAND))
    return bad, worst


def deviation_problems(probe, wd):
    bad = []
    names = list(T1)
    reqs = []
    for k in names:
        Tr, Pr = T1[k][0], T1[k][1]
        reqs.append("BLEND V %r %r %r" % (Tr, Pr, OMR))
        reqs.append("BLEND V %r %r 0" % (Tr, Pr))
    res = ask(probe, reqs, wd)
    for n_, k in enumerate(names):
        Tr, Pr, z1, h1, s1, lf1 = T1[k]
        rr, r0 = res[2 * n_], res[2 * n_ + 1]
        got = ((rr[0] - r0[0]) / OMR,
               -(rr[2] - r0[2]) * Tr / OMR,
               -(rr[3] - r0[3]) / OMR,
               (rr[1] - r0[1]) / math.log(10) / OMR)
        for nm, g, w, tol in zip(("Z1", "H1", "S1", "logf1"), got, (z1, h1, s1, lf1),
                                 (TOL_Z, TOL_OTHER, TOL_OTHER, TOL_OTHER)):
            # the (1) tables are (q_r - q_0)/omega_r with omega_r printed to four places (relative
            # rounding 1.3e-4) and carry the rounding of both fluids' constants, amplified where the
            # quantity is large (the liquid at T_r 0.5: 3 to 11): 3e-4 of the value, never below 6e-4
            tol = max(tol, 0.0006, 3.0e-4 * abs(w))
            if abs(g - w) > tol:
                bad.append("(c) Table (1) %s at state %s (T_r %.2f, P_r %g): engine %.5f, page %.4f"
                           % (nm, k, Tr, Pr, g, w))
    return bad


def package_route_problems(probe, wd):
    """lkp01 through the whole package equals the correlation's own values"""
    bad = []
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    case = Path(wd) / "lkp01"
    shutil.copytree(CASE1, case, ignore=shutil.ignore_patterns("*.csv", "result*", "log*"))
    p = subprocess.run([str(PROPS), "."], cwd=case, env=env, capture_output=True, text=True, timeout=900)
    if p.returncode != 0:
        return ["(c) the lkp01 case did not run: exit %d\n%s" % (p.returncode, (p.stdout + p.stderr)[-600:])]
    ops = {}
    for l in p.stdout.splitlines():
        m = re.match(r'\s*\{ "name": "((?:simple|reference)_[A-G])"', l)
        if m:
            ops[m.group(1)] = json.loads(l.strip().rstrip(","))["diagnostics"]
    if len(ops) != 14:
        return ["(c) lkp01 returned %d of 14 operations" % len(ops)]
    Tc = 100.0
    reqs = []
    order = []
    for fl, om in (("simple", 0.0), ("reference", OMR)):
        for k, (Tr, Pr) in LKP01_STATES.items():
            reqs.append("BLEND V %r %r %r" % (Tr, Pr, om))
            order.append((fl, k))
    res = ask(probe, reqs, wd)
    for (fl, k), r in zip(order, res):
        d = ops["%s_%s" % (fl, k)]
        Tr = LKP01_STATES[k][0]
        for nm, g, w in (("Z", d["Z"], r[0]),
                         ("H_R", d["H_R"] / (R * Tc * Tr), r[2]),    # H^R/(RT)
                         ("S_R", d["S_R"] / R, r[3])):
            if abs(g - w) > 1e-9 * max(1.0, abs(w)):
                bad.append("(c) package route %s_%s %s: %.12g, correlation %.12g" % (fl, k, nm, g, w))
    # and the printed value, through the package, at the six well-conditioned states
    for k, (Tr, Pr, z1, h1, s1, lf1) in T1.items():
        d0, dr = ops["simple_%s" % k], ops["reference_%s" % k]
        Z1 = (dr["Z"] - d0["Z"]) / OMR
        if abs(Z1 - z1) > 0.0006:
            bad.append("(c) package route Z^(1) at state %s: %.5f, page %.4f" % (k, Z1, z1))
    zs = {"A": 0.7858, "B": 0.8200, "C": 0.9550, "E": 0.9015, "F": 0.2056, "G": 1.1075}
    for k, z0 in zs.items():
        if abs(ops["simple_%s" % k]["Z"] - z0) > TOL_Z:
            bad.append("(c) package route Z^(0) at state %s: %.5f, page %.4f" % (k, ops["simple_%s" % k]["Z"], z0))
    hs = {"A": (0.857, 0.512), "B": (2.175, 1.088), "C": (0.782, 0.325), "E": (0.264, 0.199),
          "F": (5.401, 5.608), "G": (0.495, 0.236)}
    for k, (hh, ss) in hs.items():
        d0 = ops["simple_%s" % k]
        h = -d0["H_R"] / (R * Tc)
        s = -d0["S_R"] / R
        if abs(h - hh) > TOL_OTHER or abs(s - ss) > TOL_OTHER:
            bad.append("(c) package route (H*-H)/RTc, (S*-S)/R at state %s: %.4f, %.4f; page %.3f, %.3f"
                       % (k, h, s, hh, ss))
    zD = ops["simple_D"]["Z"]
    if not (CRIT_BAND[0] <= zD <= CRIT_BAND[1]):
        bad.append("(c) package route critical-point Z %.4f outside %s" % (zD, CRIT_BAND))
    return bad


def python_transcription_problems(probe, wd):
    bad = []
    states = [(1.2, 1.0, 0.0, "V"), (0.9, 0.4, 0.0, "V"), (0.9, 0.4, 0.0, "L"), (0.7, 0.2, 0.3, "L"),
              (0.8, 0.4, 0.2, "L"), (0.8, 0.2, 0.2, "V"), (2.0, 3.0, 0.1, "V"), (0.5, 1.0, 0.4, "V"),
              (1.5, 5.0, 0.2, "V"), (3.0, 7.0, 0.35, "V"), (0.95, 0.6, 0.3978, "V"), (0.3, 10.0, 0.05, "L")]
    res = ask(probe, ["BLEND %s %r %r %r" % (rt, Tr, Pr, om) for Tr, Pr, om, rt in states], wd)
    for (Tr, Pr, om, rt), r in zip(states, res):
        py = py_blend(Tr, Pr, om, rt)       # Z, lnphi, h, s
        for nm, a, b in zip(("Z", "lnphi", "H^R/RT", "S^R/R"), r[:4], py):
            if abs(a - b) > 1e-9 * max(1.0, abs(b)):
                bad.append("(d) %s at T_r %g P_r %g omega %g %s: engine %.12g, independent %.12g"
                           % (nm, Tr, Pr, om, rt, a, b))
    return bad


def closure_problems(probe, wd):
    bad = []
    reqs = []
    for Tr in (0.35, 0.5, 0.7, 0.85, 0.95, 1.05, 1.3, 2.0, 3.5):
        for Pr in (0.02, 0.1, 0.4, 0.9, 1.5, 4.0, 9.0):
            for om in (0.0, 0.25, 0.5):
                for rt in ("L", "V"):
                    reqs.append("BLEND %s %r %r %r" % (rt, Tr, Pr, om))
    res = ask(probe, reqs, wd)
    worst = 0.0
    for q, r in zip(reqs, res):
        e = abs(r[2] - r[3] - r[1])
        worst = max(worst, e)
        if e > 1e-9:
            bad.append("(e) G^R/RT = H^R/RT - S^R/R does not close: |dev| %.3g at %s" % (e, q))
    return bad, len(reqs), worst


def package_probe(case, lines, wd):
    import gibbs_audit_probe as gap
    msg = gap.build()
    if msg:
        raise RuntimeError(msg)
    return gap.ask(case, lines, wd)


def package_problems(wd, probe_ok=True):
    bad = []
    case = CASE2
    names = package_probe(case, ["NAMES"], wd)[0]
    if names != ["N2", "Ar", "CH4"]:
        return ["(e) the lkp02 package order is %s, the gate assumes N2 Ar CH4" % names]
    comps = [read_component(n) for n in names]
    k = [[1.0] * 3 for _ in range(3)]
    for a in range(3):
        for b in range(a + 1, 3):
            k[a][b] = k[b][a] = read_kappa(names[a], names[b])
    states = [("V", 112.0, 5 * ATM, [0.45, 0.05, 0.50]),
              ("L", 112.0, 10 * ATM, [0.30, 0.30, 0.40]),
              ("V", 250.0, 50e5, [0.40, 0.25, 0.35]),
              ("L", 112.0, 9 * ATM, [0.10, 0.50, 0.40])]
    for rt, T, P, y in states:
        ys = " ".join(repr(v) for v in y)
        lnphi = package_probe(case, ["LNPHI %s %r %r %s" % (rt, T, P, ys)], wd)[0]
        # (f) against the independent derivative
        ind = py_lnphi_i(comps, k, T, P, y, rt)
        for nm, a, b in zip(names, lnphi, ind):
            if abs(a - b) > 1e-6:
                bad.append("(f) ln phi_%s at %s root, T %g, P %.3g: engine %.9f, d(n ln phi_M)/dn_i %.9f"
                           % (nm, rt, T, P, a, b))
        # (e) closure on the package, vapour root
        if rt == "V":
            g = package_probe(case, ["GRES %r %r %s" % (T, P, ys)], wd)[0][0]
            s = sum(yy * lp for yy, lp in zip(y, lnphi))
            if abs(g - s) > 1e-9:
                bad.append("(e) package G^R/RT: H^R/RT - S^R/R = %.12g but sum y ln phi = %.12g (T %g)" % (g, s, T))
    return bad


def pure_limit_problems(probe, wd):
    bad = []
    case = CASE2
    names = ["N2", "Ar", "CH4"]
    comps = [read_component(n) for n in names]
    for idx, (T, P) in enumerate(((120.0, 5e5), (300.0, 30e5), (150.0, 2e5))):
        for j, nm in enumerate(names):
            y = [0.0] * 3
            y[j] = 1.0
            Tc, Pc, om = comps[j]
            res = ask(probe, ["BLEND V %r %r %r" % (T / Tc, P / Pc, om)], wd)[0]
            z = package_probe(case, ["ZROOT V %r %r %s" % (T, P, " ".join(map(repr, y)))], wd)[0][0]
            if abs(z - res[0]) > 1e-12:
                bad.append("(g) pure %s at T %g, P %g: package Z %.15g, correlation at T/Tc, P/Pc, omega %.15g"
                           % (nm, T, P, z, res[0]))
    return bad


def measured_problems(wd):
    bad = []
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    case = Path(wd) / "lkp02"
    shutil.copytree(CASE2, case, ignore=shutil.ignore_patterns("*.csv", "result*", "log*"))
    p = subprocess.run([str(PROPS), "."], cwd=case, env=env, capture_output=True, text=True, timeout=1200)
    if p.returncode != 0:
        return ["(h) the lkp02 case did not run: exit %d\n%s" % (p.returncode, (p.stdout + p.stderr)[-600:])], {}
    import csv

    def curve(name):
        with open(case / name) as f:
            r = list(csv.DictReader(f))
        return {round(float(a["x[N2]"]), 4): float(a["P_bubble"]) for a in r}
    out = {}
    for tag, fn, data in (("n2ch4", "pxy_n2_ch4.csv", MILLER_N2CH4), ("n2ar", "pxy_n2_ar.csv", MILLER_N2AR)):
        c = curve(fn)
        devs = [abs(c[x] / ATM - P) / P * 100 for x, P in data]
        out[tag] = sum(devs) / len(devs)
    ops = {}
    for l in p.stdout.splitlines():
        m = re.match(r'\s*\{ "name": "(ternary_\d+)"', l)
        if m:
            ops[m.group(1)] = json.loads(l.strip().rstrip(","))["diagnostics"]
    if len(ops) != len(T3):
        bad.append("(h) %d of %d ternary operations returned" % (len(ops), len(T3)))
    else:
        devs = [abs(ops["ternary_%02d" % (k + 1)]["P_bubble"] / ATM - row[0]) / row[0] * 100
                for k, row in enumerate(T3)]
        out["ternary"] = sum(devs) / len(devs)
    for tag, ceil in CEILING.items():
        if tag in out and out[tag] > ceil:
            bad.append("(h) %s P_bubble AAD %.2f %% exceeds the ceiling %.2f %%" % (tag, out[tag], ceil))
    return bad, out


def strip_block(text, key):
    """remove `key { ... }` (nested braces) from a dict text"""
    a = text.index(key)
    b = text.index("{", a)
    depth = 0
    for k in range(b, len(text)):
        depth += (text[k] == "{") - (text[k] == "}")
        if depth == 0:
            return text[:a] + text[k + 1:]
    raise ValueError("unbalanced block " + key)


def run_case_text(case, extra_env=None):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=case, env=env, capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def refusal_problems(wd):
    bad = []

    def fresh(tag, props=None):
        d = Path(wd) / tag
        shutil.copytree(CASE2, d, ignore=shutil.ignore_patterns("*.csv", "result*", "log*"))
        (d / "constant/propertyManifest").unlink()       # read the catalogue, not the sealed copies
        if props is not None:
            (d / "system/propsDict").write_text("operations\n(\n" + props + "\n);\n")
        return d

    point = ("    { name p; type propertyPoint; state { T 112 K; P 5 atm; composition { N2 1.0; } }"
             " properties ( Z ); }")
    # R1 hydrogen
    d = fresh("r1", point)
    tp = (d / "constant/thermoPhysPropDict").read_text()
    tp = tp.replace("components    ( N2  Ar  CH4 );", "components    ( N2  H2 );")
    tp = strip_block(tp, "binaryInteractions")
    (d / "constant/thermoPhysPropDict").write_text(tp)
    rc, out = run_case_text(d)
    if rc == 0 or "H2" not in out or "Gunn" not in out:
        bad.append("(i) hydrogen was not refused naming Gunn et al. (exit %d)" % rc)
    # R2 kappa <= 0
    d = fresh("r2", point)
    pdir = d / "constant/parameters/LKP"
    pdir.mkdir(parents=True, exist_ok=True)
    t = (RECS / "CH4-N2.dat").read_text().replace("kij  0.977;", "kij  -0.977;")
    (pdir / "CH4-N2.dat").write_text(t)
    rc, out = run_case_text(d)
    if rc == 0 or "MULTIPLIER" not in out:
        bad.append("(i) a non-positive kappa was not refused naming the multiplier (exit %d)" % rc)
    # R3 a record regressed for another EoS
    d = fresh("r3", point)
    pdir = d / "constant/parameters/LKP"
    pdir.mkdir(parents=True, exist_ok=True)
    t = (RECS / "CH4-N2.dat").read_text().replace("eos  LeeKeslerPloecker;", "eos  SRK;")
    (pdir / "CH4-N2.dat").write_text(t)
    rc, out = run_case_text(d)
    if rc == 0 or "regressed for eos SRK" not in out:
        bad.append("(i) a pair record regressed for SRK was not refused (exit %d)" % rc)
    # R4 a pair naming an unknown component
    d = fresh("r4", point)
    pdir = d / "constant/parameters/LKP"
    pdir.mkdir(parents=True, exist_ok=True)
    t = (RECS / "CH4-N2.dat").read_text().replace("i    CH4;", "i    FOO;")
    (pdir / "CH4-N2.dat").write_text(t)
    rc, out = run_case_text(d)
    if rc == 0 or "unknown component 'FOO'" not in out:
        bad.append("(i) a pair naming an unknown component was not refused (exit %d)" % rc)
    # R5 an undeclared pair is announced BY NAME and shown in the resolved view
    d = fresh("r5", point)
    tp = (d / "constant/thermoPhysPropDict").read_text()
    tp = tp.replace('            Ar-CH4 { source "data/standards/parameters/LKP/Ar-CH4.dat"; }\n', "")
    (d / "constant/thermoPhysPropDict").write_text(tp)
    rc, out = run_case_text(d)
    if rc != 0:
        bad.append("(i) the case with one undeclared pair did not run (exit %d)" % rc)
    elif ("no kappa declared for 1 pair(s) (Ar-CH4)" not in out
          or "kappa = 1 (UNDECLARED default, announced): Ar-CH4" not in out):
        bad.append("(i) the undeclared pair Ar-CH4 was not announced by name, in the log and in the resolved view")
    # R7 a mixing-rule key the model does not have
    d = fresh("r7", point)
    tp = (d / "constant/thermoPhysPropDict").read_text()
    tp = tp.replace("model LeeKeslerPloecker;", "model LeeKeslerPloecker;\n        mixingRule vanDerWaalsOneFluid;")
    (d / "constant/thermoPhysPropDict").write_text(tp)
    rc, out = run_case_text(d)
    if rc == 0 or "ONE mixing rule" not in out:
        bad.append("(i) a `mixingRule` key under LeeKeslerPloecker was not refused (exit %d)" % rc)
    # R6 outside the window
    d = fresh("r6", "    { name p; type propertyPoint; state { T 600 K; P 5 atm; composition { N2 1.0; } }"
                    " properties ( Z ); }")
    rc, out = run_case_text(d)
    if rc != 0 or "outside the window" not in out:
        bad.append("(i) an evaluation at T_r 4.75 was not announced as outside the window (exit %d)" % rc)
    return bad


def run_gate(src_text=None, rec_dir=RECS, table=None, probe_src=None, tmp=None, arms="all"):
    """arms: 'all' or a set of arm letters; returns (problems, facts)"""
    problems, facts = [], {}
    text = SRC.read_text() if src_text is None else src_text
    want = (lambda a: True) if arms == "all" else (lambda a: a in arms)
    if want("a"):
        problems += source_problems(text)
        if arms == "all":
            problems += pin_problems()
    if want("b"):
        problems += record_problems(rec_dir, check_pin=(arms == "all"))
        extra, note = ocr_problems(table)
        problems += extra
        facts["ocr"] = note
    if want("c") or want("d") or want("e") or want("f") or want("g") or want("h") or want("i"):
        if not PROPS.exists() or not LIB.exists():
            return problems + ["no built engine in this tree (build/linux64Gcc/choupoProps, libchoupo.so): a check "
                               "that cannot run must not pass"], facts
    with tempfile.TemporaryDirectory() as wd:
        probe = None
        if any(want(a) for a in "cdeg"):
            probe, err = build_probe(wd, probe_src)
            if err:
                return problems + [err], facts
        if want("c"):
            b, worst = table_problems(probe, wd)
            problems += b
            facts["worst_table_dev_in_tolerances"] = worst
            problems += deviation_problems(probe, wd)
            if arms == "all":
                problems += package_route_problems(probe, wd)
        if want("d"):
            problems += python_transcription_problems(probe, wd)
        if want("e"):
            b, n, worst = closure_problems(probe, wd)
            problems += b
            facts["closure_states"] = n
            facts["closure_worst"] = worst
        if arms == "all":
            problems += package_problems(wd)
            problems += pure_limit_problems(probe, wd)
            b, aad = measured_problems(wd)
            problems += b
            facts["aad"] = aad
            problems += refusal_problems(wd)
    return problems, facts


# ---------------------------------------------------------------------------
def selftest():
    fails = 0
    base = SRC.read_text()

    def expect(name, problems):
        nonlocal fails
        if problems:
            print("  selftest %s: caught (%d problem(s); first: %s)" % (name, len(problems), problems[0][:100]))
        else:
            print("  selftest %s: NOT CAUGHT -- the gate cannot fail here" % name)
            fails += 1

    # S1: a kappa record changed
    with tempfile.TemporaryDirectory() as td:
        d = Path(td) / "LKP"
        shutil.copytree(RECS, d)
        f = d / "CH4-N2.dat"
        t = f.read_text()
        f.write_text(t.replace("kij  0.977;", "kij  0.987;"))
        expect("S1 changed kappa(N2,CH4)", record_problems(d, check_pin=False))
    # S2: a Table 1 constant changed in a copy of the source
    s2 = base.replace("0.1181193,  0.265728,", "0.1181193,  0.265729,")
    assert s2 != base
    expect("S2 changed b2 of the simple fluid", source_problems(s2))
    # S3: a typed Table I row removed
    t3 = [r for r in TABLE_I if r != ("nitrogen", "argon", 0.988)]
    assert len(t3) == len(TABLE_I) - 1
    # the records still carry it, so (b) must report an extra record; and the OCR reading must too
    tmp_table = TABLE_I
    try:
        globals()["TABLE_I"] = t3
        probs = record_problems(RECS, check_pin=False) + ocr_problems(t3)[0]
    finally:
        globals()["TABLE_I"] = tmp_table
    expect("S3 removed a typed Table I row", probs)
    # S4-S7: sabotaged engine source compiled into the probe
    def engine(name, old, new, arms):
        s = base.replace(old, new, 1)
        assert s != base, name
        with tempfile.TemporaryDirectory() as td:
            sab = Path(td) / "LeeKeslerPloecker.cpp"
            sab.write_text(s)
            probs, _ = run_gate(src_text=s, probe_src=sab, arms=arms)
            expect(name, probs)

    engine("S4 sign of the d1 term of Eq. 12", "- f.d1/(5.0*V5) + 2.0*E;", "+ f.d1/(5.0*V5) + 2.0*E;", "cde")
    engine("S5 E dropped from Eq. 11", "+ f.d2/(5.0*Tr*V5) + 3.0*E;", "+ f.d2/(5.0*Tr*V5);", "cde")
    # S7 on the header the constants are read from
    hdr = PROBE_HDR.replace("eta      = 0.25;", "eta      = 0.5; ")
    assert hdr != PROBE_HDR
    globals()["PROBE_HDR"] = hdr
    try:
        expect("S7 eta set to 0.5", source_problems(base))
    finally:
        globals()["PROBE_HDR"] = (ROOT / "src/thermo/equationOfState/LeeKeslerPloecker.H").read_text()
    # S6: the pressure term of the component fugacity (A7) flipped, through the PACKAGE probe
    s6 = base.replace("hT * pi.dTc[j] - zm1 * pi.dPc[j]", "hT * pi.dTc[j] + zm1 * pi.dPc[j]")
    assert s6 != base
    with tempfile.TemporaryDirectory() as td:
        sab = Path(td) / "LeeKeslerPloecker.cpp"
        sab.write_text(s6)
        import gibbs_audit_probe as gap
        msg = gap.build()
        if msg:
            print("  selftest S6: cannot run (%s)" % msg)
            return fails + 1
        out = Path(td) / "gibbsAuditProbeSab"
        cmd = ["g++", "-std=c++17", "-O2", "-I" + str(ROOT / "src"), "-I" + str(ROOT),
               "-I" + str(ROOT / "src/thermo/equationOfState"), str(gap.SRC), str(sab),
               str(LIB), "-Wl,-rpath," + str(BUILD), "-o", str(out)]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0:
            print("  selftest S6: the sabotaged probe did not compile: " + p.stderr[-300:])
            return fails + 1
        keep = gap.PROBE
        gap.PROBE = out
        try:
            with tempfile.TemporaryDirectory() as wd:
                expect("S6 pressure term of A7 flipped", package_problems(wd))
        finally:
            gap.PROBE = keep
    return fails


def main():
    if "--selftest" in sys.argv:
        f = selftest()
        if f:
            print("check_lee_kesler_ploecker: SELFTEST FAILED -- %d sabotage(s) not caught" % f)
            sys.exit(1)
        print("check_lee_kesler_ploecker: SELFTEST OK -- every sabotage was caught")
        return
    problems, facts = run_gate()
    if problems:
        print("check_lee_kesler_ploecker: FAIL")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    aad = facts.get("aad", {})
    print("check_lee_kesler_ploecker: OK -- the 24 constants of Lee & Kesler Table 1 and the mixing constants equal "
          "the page and are sha-pinned (PKP Table A-I's one differing entry, d1 of the simple fluid, is held "
          "and not used); the 131 kappa records equal Ploecker et al. Table I (hydrogen rows refused, not "
          "shipped) and the typed table agrees with the PDF's OCR layer; %d entries of LK Tables 5, 7, 9, 11 and "
          "Tables 6, 8, 10, 12 at 6 states are reproduced to the printed digits on the printed root, the "
          "simple fluid's critical point to the band the printed constants' rounding allows, and the same states "
          "through the whole package to 1e-9; an independent Python transcription matches to 1e-9; "
          "G = H - TS closes to 1e-9 on %d states and on the package; ln phi_i equals the mole-number "
          "derivative of n ln phi_M to 1e-6; the pure limit is exact to 1e-12; against Miller, Kidnay & Hiza "
          "(1973) at 112 K the P_bubble AAD is %.2f %% (N2+CH4), %.2f %% (N2+Ar), %.2f %% (ternary); "
          "hydrogen, kappa <= 0, a pair record for another EoS, a mixingRule key and an unknown component are refused by name, "
          "an undeclared pair is announced by name, an evaluation outside T_r 0.3-4 is announced.  "
          "NOT CHECKED: strongly polar fluids, hydrogen and helium, the liquid-root enthalpy of a mixture "
          "through the package (the family contract is the vapour root), the physics beyond two measured "
          "systems, the GUI."
          % (len(T0) * 4 + 6 * 4, facts.get("closure_states", 0), aad.get("n2ch4", float("nan")),
             aad.get("n2ar", float("nan")), aad.get("ternary", float("nan"))))
    if facts.get("ocr"):
        print("  " + facts["ocr"])


if __name__ == "__main__":
    main()
