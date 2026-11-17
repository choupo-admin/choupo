#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the Dortmund UNIFAC records are the printed tables, and the model refuses what it must.

    bin/curate/check_unifac_dortmund.py            run the gate
    bin/curate/check_unifac_dortmund.py --selftest also prove it fails on five sabotages

DEV.md 4c C408 (c).  data/standards/parameters/UNIFACDortmund/{groups,interactions}.dat
hold ONLY what Gmehling, Li & Schiller, Ind. Eng. Chem. Res. 32 (1993) 178 prints:
Table III (R_k, Q_k, 85 subgroups, pp. 182-183) and Table IV (a, b, c of 530
main-group pairs, pp. 184-190).  The tables were read from page images with an
OCR layer as a first pass; the gate holds the records to a SECOND, independent
reading and to the engine.

WHAT THIS GATE CHECKS (each arm names what it does not).

  (a) SHAPE.  85 subgroups with unique names and numbers, 45 main groups, 530
      interaction rows with n < m, no duplicate pair, every subgroup's main
      group declared, every row's page in 184-190.
  (b) THE TABLES AGAINST THE PAGE, A SAMPLE.  SAMPLE_ROWS (about 110 rows of
      Table IV, typed from the page images, independent of the transcription
      that wrote the file: the whole of main group 1 and 2's early rows on p. 184
      and the rows the OCR layers disagreed on, p. 184-190) and SAMPLE_SUBGROUPS
      (33 rows of Table III) must equal the records, value by value.  NOT
      CHECKED: the other ~420 rows of Table IV and 52 of Table III.  A digit
      misread in a row outside the sample is not caught HERE; it is pinned by
      (c) from the day it was last read, and the Table XI arm (f) exercises the
      three pairs CH2/OH/H2O end to end.
  (c) THE PIN.  sha-256 of both files.  Any edit trips it; the remedy is to
      read the page, change the record AND the sample, and update the pin in
      the same commit -- a deliberate act, never a refresh.
  (d) NO LATER REVISION.  The licence rule (the later Dortmund matrices are
      distributed under licence): no record or header names a revision other
      than the two 1987/1993 papers as a source, and no file other than these
      two carries a Dortmund parameter.  The check is a source-name check, not a
      proof that no value came from elsewhere; (b) and (c) are what constrain
      the values.
  (e) THE REFUSALS, by running the engine.  A component with no `groups {
      unifacDortmund ( ... ) }` block is refused by name (and the original
      `unifac` block is NOT reused); a pair of main groups Table IV does not
      print is refused by name (the pair is found from the records, not
      hard-wired).
  (f) THE PAPER'S PRINTED EXAMPLE.  Table XI (p. 192): gamma-infinity of four
      butanols in water at 25/50/75/100 C, modified UNIFAC (Dortmund) and
      original UNIFAC, 32 values.  The engine, run on the tutorial case, must
      agree with every printed value within 0.06 (the last printed place is 0.1;
      the largest observed difference is 0.05).  NOT CHECKED: any measurement
      -- Table XI prints predictions.

--selftest SABOTAGES (the proof that the gate can fail): S1 one sampled a_nm
changed; S2 one row deleted; S3 one R_k changed; S4 the Dortmund header made to
name a later revision; S5 the sealed interaction table of the Table XI case
changed in the CH2/OH pair (arm f must disagree with the paper).  Every
sabotage runs on a COPY in a temporary directory; the tree is never written.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import sys as _sys_cr  # noqa: E402
from pathlib import Path as _Path_cr  # noqa: E402
_sys_cr.path.insert(0, str(_Path_cr(__file__).resolve().parent))
import case_records  # noqa: E402  (C420: the probe copy has one home)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/standards/parameters/UNIFACDortmund"
CASE = ROOT / "tutorials/props/compare/unifacDortmund02_butanol_water_gamma_infinity"

PIN = {
    "groups.dat": "89e03784d9b379ebffe872b7bdd31e71c6e8e5163027d2e4a674280a96fe614f",
    "interactions.dat": "0608d2cbd131440db284fc41e1132bde9448aa5233daa6fac0c806256d7a58a5",
}

# (n, m, a_nm, b_nm, c_nm, a_mn, b_mn, c_mn) -- Table IV as printed, read from the page images.
SAMPLE_ROWS = [
    (1, 2, 189.66, -0.2723, 0, -95.418, 0.06171, 0),
    (1, 3, 114.20, 0.0933, 0, 16.070, -0.2998, 0),
    (1, 4, 7.3390, -0.4538, 0, 47.200, 0.3575, 0),
    (1, 5, 2777.0, -4.6740, 0.001551, 1606.0, -4.7460, 0.0009181),
    (1, 6, 2409.4, -3.0099, 0, 82.593, -0.4857, 0),
    (1, 7, 1391.3, -3.6156, 0.001144, -17.253, 0.8389, 0.0009021),
    (1, 8, 1381.0, -0.9977, 0, 1987.0, -4.6150, 0),
    (1, 9, 433.60, 0.1473, 0, 199.00, -0.8709, 0),
    (1, 10, 875.85, 0, 0, 256.21, 0, 0),
    (1, 11, 98.656, 1.9294, -0.003133, 632.22, -3.3912, 0.003928),
    (1, 12, 508.40, -0.6215, 0, 238.50, -0.5358, 0),
    (1, 13, 233.10, -0.3155, 0, -9.6540, -0.03242, 0),
    (1, 14, -164.04, 4.9683, -0.01025, 326.04, -2.6348, 0.003358),
    (1, 15, 350.58, 0.06673, 0, 207.26, -1.0916, 0),
    (1, 16, -175.70, 1.8570, 0, 205.65, -1.4436, 0),
    (1, 17, 958.74, -0.1484, 0, 2257.3, -5.6676, 0),
    (1, 18, -9.2805, 1.9682, -0.001405, 258.57, -2.1156, 0.001574),
    (1, 19, 593.07, 0.7335, 0, 293.81, -1.3979, 0),
    (1, 20, 1182.2, -3.2647, 0.009198, 2017.7, -9.0933, 0.01024),
    (1, 21, 401.00, -0.7277, 0, -65.685, 0.07409, 0),
    (1, 22, -233.66, 1.2561, 0, 311.55, -1.1856, 0),
    (1, 23, -653.74, 4.5311, -0.008735, 1302.6, -8.4270, 0.01442),
    (1, 24, 267.51, -1.7109, 0.003388, -148.07, 1.0927, -0.002416),
    (1, 25, -1385.0, 15.890, -0.04831, 3264.0, -20.840, 0.03317),
    (1, 26, 2345.0, -13.200, 0.02156, -396.50, 3.0920, -0.006266),
    (1, 27, 2383.0, -2.693, 0, 1744.0, -4.0820, 0),
    (1, 28, 24.330, 1.5210, 0, 72.120, -1.1260, 0),
    (1, 29, 465.90, -0.8557, 0, -59.900, -0.008313, 0),
    (1, 30, 577.70, 0.9384, 0, 210.50, -1.0810, 0),
    (1, 31, 897.70, 0, 0, 28.170, 0, 0),
    (1, 32, 559.90, -0.3564, 0, 166.00, -0.7116, 0),
    (1, 33, 527.70, -0.4990, 0, -62.080, -0.3658, 0),
    (1, 34, 477.50, -0.6581, 0, -22.040, -0.1018, 0),
    (1, 35, -547.50, 3.4570, 0, 477.10, -2.1750, 0),
    (1, 36, 1662.0, 0, 0, -291.90, 0, 0),
    (1, 37, 334.50, 0.009102, 0, 3.2020, -0.6894, 0),
    (1, 38, 468.50, -1.0420, 0, -160.30, -0.01080, 0),
    (1, 39, 406.20, 0.6525, 0, 151.00, -0.9023, 0),
    (1, 40, 342.00, -1.6790, 0, -484.30, 2.4670, 0),
    (1, 41, 1312.0, -3.6430, 0, -314.60, 1.2870, 0),
    (1, 42, -680.95, 4.0194, -0.006878, 1020.8, -6.0746, 0.01015),
    (1, 43, 79.507, 0.7089, -0.002098, 186.71, -1.3546, 0.002402),
    (1, 44, 1935.7, 0, 0, -21.230, 0, 0),
    (1, 45, 164.25, -0.2683, 0, -44.069, 0.02778, 0),
    (2, 3, 174.10, -0.5886, 0, -157.20, 0.6166, 0),
    (2, 4, 117.30, -0.8552, 0, -113.10, 1.1720, 0),
    (2, 5, 2649.0, -6.5080, 0.004822, 1566.0, -5.8090, 0.005197),
    (2, 6, -628.07, 10.000, -0.01497, -96.297, 0.6304, -0.001800),
    (2, 7, 778.30, 0.1482, 0, -1301.0, 4.0720, 0),
    (2, 8, 1207.0, -1.9550, 0, 191.60, 0.4936, 0),
    (2, 9, 179.80, 0.6991, 0, 91.811, -0.7171, 0),
    (2, 10, 476.25, 0, 0, 202.49, 0, 0),
    (2, 11, 980.74, -2.4224, 0, -582.82, 1.6732, 0),
    (2, 12, 309.80, 0, 0, -28.630, 0, 0),
    (2, 13, 733.30, -2.5090, 0, -844.30, 2.9450, 0),
    (2, 14, 1857.0, -8.6530, 0.01088, 498.80, -5.1480, 0.01039),
    (2, 15, 224.80, 0, 0, -124.32, 0, 0),
    (2, 16, 165.30, 0, 0, -131.50, 0, 0),
    (2, 17, 2800.0, -10.720, 0.01339, 3982.0, -19.720, 0.02783),
    (2, 18, 13.502, 0, 0, -13.317, 0, 0),
    (2, 19, 634.85, 0, 0, -181.93, 0, 0),
    (2, 20, -2026.1, 8.1549, 0, -347.50, 1.2160, 0),
    (2, 21, 498.90, -1.4870, 0, -359.60, 1.2380, 0),
    (2, 22, -44.958, 0, 0, 55.881, 0, 0),
    (2, 23, -204.51, 0, 0, 255.41, 0, 0),
    (2, 24, 616.62, -2.1164, 0, -663.45, 2.3281, 0),
    (2, 25, -56.690, 9.8050, 0, 215.50, -1.5190, 0),
    (2, 26, 417.60, 0.08726, 0, 452.20, -1.9970, 0),
    (2, 28, 46.060, 1.5450, 0, 70.880, -1.0900, 0),
    (2, 30, 470.40, 0, 0, -146.10, 0, 0),
    (2, 33, -19.820, 0.5941, 0, 160.40, -0.5148, 0),
    (2, 34, -44.760, 0, 0, 180.60, 0, 0),
    (2, 35, -174.60, 1.9600, 0, 154.00, -1.3030, 0),
    (2, 36, 179.70, 0, 0, -113.80, 0, 0),
    (2, 37, 967.90, -0.03862, 0, -300.60, -0.09576, 0),
    (2, 38, 141.10, -0.3025, 0, -139.50, 0.9076, 0),
    (2, 39, 388.40, 0, 0, -152.20, 0, 0),
    # rows on pages 185-190 on which the two OCR layers disagreed or that needed a hand repair
    (3, 22, 133.66, -0.4614, 0, -142.20, 0.3966, 0),
    (3, 28, 3736.0, -25.000, 0.04593, 574.60, -3.7020, 0.003682),
    (3, 33, -248.20, 1.2140, 0, 187.50, -0.9020, 0),
    (3, 45, 380.02, -0.2333, 0, -201.52, -0.06877, 0),
    (4, 9, 1001.0, -1.8710, 0.000239, -146.60, 0.2419, 0.0001133),
    (4, 11, -242.50, 2.7200, -0.003449, 1624.0, -9.4090, 0.01338),
    (4, 43, -26.486, -0.2952, 0, 199.48, 0.03370, 0),
    (5, 7, -801.90, 3.8240, -0.007514, 1460.0, -8.6730, 0.01641),
    (5, 16, 104.60, -5.0140, 0.008854, 1876.0, 11.500, 0.09000),
    (5, 43, 401.89, -0.4363, -0.002004, -238.36, 5.0000, -0.008186),
    (6, 11, 299.23, -1.2702, 0, 294.76, 0.3745, 0),
    (6, 45, -242.60, 0.2956, -0.00009006, 4519.3, -19.456, 0.02598),
    (7, 11, -675.50, 3.6090, 0, 322.30, -1.3050, 0),
    (7, 13, -197.50, 0.1766, 0, 140.70, 0.05679, 0),
    (7, 14, 798.50, -5.8690, 0.01032, -980.60, 3.6710, -0.005908),
    (7, 20, -1795.2, 12.708, -0.01546, 624.97, -4.6878, 0.005237),
    (8, 17, 542.00, -6.7920, 0.01655, -131.10, -0.9399, 0.0004690),
    (9, 18, 513.30, -1.0360, 0, -258.00, 0.5070, 0),
    (11, 13, 195.30, -9.75, 0.04051, 824.20, -6.0090, 0.008271),
    (11, 15, 3168.0, -24.070, 0.04303, 3329.0, -13.780, 0.01193),
    (11, 17, -1355.0, 7.6830, -0.01012, 3499.0, -22.960, 0.03543),
    (13, 24, -425.40, 0.9514, 0, 641.20, -1.4860, 0),
    (13, 30, 513.70, 0, 0, -299.60, 0, 0),
    (14, 19, -412.38, -0.4909, 0.006255, 2412.2, -10.495, 0.009741),
    (16, 45, -420.24, 0.2632, 0, -1035.8, 3.0780, 0),
    (18, 42, 173.70, -1.7780, 0.001480, 32.270, 2.6840, -0.003948),
    (20, 37, -447.95, 1.5141, 0, 283.64, 1.5491, 0),
    (21, 23, 592.40, -4.2459, 0.006905, 603.29, -3.9770, 0.006248),
    (21, 45, 207.12, -0.4396, 0, -175.29, 0.3275, 0),
    (22, 24, 46.290, -0.2115, 0, 46.030, 0.05388, 0),
    (24, 26, 441.50, -0.5353, 0, -65.740, 0.09670, 0),
    (35, 39, -213.80, 0, 0, 203.40, 0, 0),
    (37, 43, 321.62, -4.9963, 0.01387, 713.90, -2.7759, 0.0009172),
    (42, 43, 242.49, -0.03832, 0, 20.834, -0.3472, 0),
    (42, 45, 183.79, -0.1518, 0, -61.922, -0.05944, 0),
]
# (name, number, main group, R, Q) -- Table III as printed.
SAMPLE_SUBGROUPS = [
    ("CH3", 1, 1, 0.6325, 1.0608), ("CH2", 2, 1, 0.6325, 0.7081), ("CH", 3, 1, 0.6325, 0.3554),
    ("C", 4, 1, 0.6325, 0.0), ("CH2=CH", 5, 2, 1.2832, 1.6016), ("C=C", 70, 2, 1.2832, 0.4582),
    ("ACH", 9, 3, 0.3763, 0.4321), ("ACCH3", 11, 4, 0.9100, 0.9490),
    ("OH_p", 14, 5, 1.2302, 0.8927), ("OH_s", 81, 5, 1.0630, 0.8663), ("OH_t", 82, 5, 0.6895, 0.8345),
    ("CH3OH", 15, 6, 0.8585, 0.9938), ("H2O", 16, 7, 1.7334, 2.4561), ("ACOH", 17, 8, 1.0800, 0.9750),
    ("CH3CO", 18, 9, 1.7048, 1.6700), ("CH3COO", 21, 11, 1.2700, 1.6286), ("CH3O", 24, 13, 1.1434, 1.6022),
    ("CH3NH2", 28, 14, 1.6607, 1.6904), ("C5H5N", 37, 18, 2.5000, 2.1477), ("COOH", 42, 20, 0.8000, 0.9215),
    ("CCl4", 52, 24, 2.6180, 3.1836), ("CH3NO2", 54, 26, 2.6440, 2.5000), ("CS2", 58, 28, 1.2400, 1.0680),
    ("furfural", 61, 30, 1.2990, 1.2890), ("DOH", 62, 31, 2.0880, 2.4000), ("I", 63, 32, 1.0760, 0.9169),
    ("Br", 64, 33, 1.2090, 1.4000), ("DMSO", 67, 35, 3.6000, 2.6920), ("DMF", 72, 39, 2.0000, 2.0930),
    ("HCON_CH2_2", 73, 39, 2.3810, 1.5220), ("CF3", 74, 40, 1.2840, 1.2660), ("CF", 76, 40, 0.8215, 0.5135),
    ("COO", 77, 41, 1.6000, 0.9000), ("c-CH2", 78, 42, 0.7136, 0.8635), ("c-CH", 79, 42, 0.3479, 0.1071),
    ("c-C", 80, 42, 0.3470, 0.0), ("c-CH2OCH2", 27, 43, 1.7023, 1.8784), ("HCOOH", 43, 44, 0.8000, 1.2742),
    ("CHCl3", 50, 45, 2.4500, 2.8912),
]

# Table XI, p. 192: gamma-infinity of butanols in water at 25/50/75/100 C.  (component -> 4 values)
TABLE_XI_DORTMUND = {
    "nButanol": [41.9, 43.0, 42.2, 40.0], "2Methyl1Propanol": [41.9, 43.0, 42.2, 40.0],
    "2Butanol": [36.2, 36.9, 36.0, 33.9], "2Methyl2Propanol": [27.2, 27.6, 26.7, 25.0],
}
TABLE_XI_UNIFAC = {
    "nButanol": [54.1, 47.9, 43.1, 39.4], "2Methyl1Propanol": [54.2, 48.0, 43.2, 39.4],
    "2Butanol": [54.2, 48.0, 43.2, 39.4], "2Methyl2Propanol": [51.0, 45.0, 40.3, 36.6],
}
TEMPS = [25, 50, 75, 100]
TOL_XI = 0.06


def parse_groups(text):
    subs = {}
    for m in re.finditer(r"\{ name (\S+); number (\d+); mainGroup (\d+); R ([-\d.eE+]+); Q ([-\d.eE+]+); \}", text):
        subs[m.group(1)] = (int(m.group(2)), int(m.group(3)), float(m.group(4)), float(m.group(5)))
    mains = {int(m.group(1)): m.group(2)
             for m in re.finditer(r'\{ number (\d+); name "([^"]+)"; \}', text)}
    return subs, mains


def parse_inter(text):
    rows = {}
    pat = (r"\{ n (\d+); m (\d+); a_nm (\S+); b_nm (\S+); c_nm (\S+); a_mn (\S+); b_mn (\S+); c_mn (\S+); page (\d+); \}")
    dup = []
    for m in re.finditer(pat, text):
        k = (int(m.group(1)), int(m.group(2)))
        if k in rows:
            dup.append(k)
        rows[k] = tuple(float(m.group(i)) for i in range(3, 9)) + (int(m.group(9)),)
    return rows, dup


def check_files(gtext, itext, check_pin=True):
    """Arms (a)-(d); returns the list of problems."""
    bad = []
    subs, mains = parse_groups(gtext)
    rows, dup = parse_inter(itext)
    # (a) shape
    if len(subs) != 85:
        bad.append("(a) %d subgroups, the paper's Table III has 85" % len(subs))
    if len({v[0] for v in subs.values()}) != len(subs):
        bad.append("(a) duplicate subgroup numbers")
    if len(mains) != 45:
        bad.append("(a) %d main groups, expected 45" % len(mains))
    for n, (no, mg, R, Q) in subs.items():
        if mg not in mains:
            bad.append("(a) subgroup %s names undeclared main group %d" % (n, mg))
    if len(rows) != 530:
        bad.append("(a) %d interaction rows, the paper's Table IV has 530" % len(rows))
    if dup:
        bad.append("(a) duplicate pair row(s) %s" % dup[:5])
    for (n, m), v in rows.items():
        if not (1 <= n < m <= 45):
            bad.append("(a) row (%d,%d) is not 1 <= n < m <= 45" % (n, m))
        if not 184 <= v[6] <= 190:
            bad.append("(a) row (%d,%d) names page %d" % (n, m, v[6]))
    # (b) sample against the page
    for (n, m, *vals) in SAMPLE_ROWS:
        got = rows.get((n, m))
        if got is None:
            bad.append("(b) printed row (%d,%d) is missing" % (n, m)); continue
        for i, (want, have) in enumerate(zip(vals, got[:6])):
            if abs(want - have) > 1e-12 + 1e-9 * abs(want):
                bad.append("(b) Table IV row (%d,%d) column %d: printed %r, record %r"
                           % (n, m, i, want, have))
    for (name, no, mg, R, Q) in SAMPLE_SUBGROUPS:
        got = subs.get(name)
        if got is None:
            bad.append("(b) printed subgroup %s is missing" % name); continue
        if got != (no, mg, R, Q):
            bad.append("(b) Table III %s: printed %r, record %r" % (name, (no, mg, R, Q), got))
    # (c) pin
    if check_pin:
        for fn, text in (("groups.dat", gtext), ("interactions.dat", itext)):
            h = hashlib.sha256(text.encode()).hexdigest()
            if h != PIN[fn]:
                bad.append("(c) %s sha-256 %s differs from the pin" % (fn, h[:16]))
    # (d) sources
    for fn, text in (("groups.dat", gtext), ("interactions.dat", itext)):
        for s in re.findall(r'source\s+"([^"]*)"', text):
            if "Gmehling, Li & Schiller" not in s:
                bad.append("(d) %s names a source other than the 1993 paper: %s" % (fn, s))
        if re.search(r"(?i)\b(20[0-2]\d|2002|2006|2016|2022)\b.*(revision|matrix|DDBST|consortium)", text):
            bad.append("(d) %s mentions a later revision as a source" % fn)
    return bad


def run_props(case_dir):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(ROOT / "choupoProps"), "."], cwd=case_dir, env=env,
                       capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def write_case(d, components, tag):
    (d / "system").mkdir(parents=True)
    (d / "constant").mkdir(parents=True)
    (d / "x.cho").write_text("")
    (d / "system/controlDict").write_text('application choupoProps;\ndescription "%s";\nverbosity 1;\n' % tag)
    (d / "constant/thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 1;\ncomponents ( %s );\n"
        "equilibrium { formulation gammaPhi; liquid { activityModel { model UNIFACDortmund; }"
        " standardState pureLiquid; } vapour { fugacityModel idealGas; } }\n" % " ".join(components))
    comp = " ".join("%s %s;" % (c, 1.0 / len(components)) for c in components)
    (d / "system/propsDict").write_text(
        "operations ( { name p; type propertyPoint; state { T 330 K; P 1 atm; composition { %s } }"
        " properties ( T ); } );\n" % comp)


def assigned_components():
    out = {}
    for f in sorted((ROOT / "data/standards/components").glob("*.dat")):
        t = f.read_text()
        m = re.search(r"unifacDortmund \((.*?)\);", t, re.S)
        if m:
            out[f.stem] = [(g, int(c)) for g, c in re.findall(r"group (\S+?); count (\d+);", m.group(1))]
    return out


def check_refusals(subs, rows):
    bad = []
    asg = assigned_components()
    if len(asg) < 20:
        return ["(e) only %d components carry a unifacDortmund block" % len(asg)]
    # (e1) a component with no Dortmund block, though it HAS the original unifac block
    orig_only = None
    for f in sorted((ROOT / "data/standards/components").glob("*.dat")):
        t = f.read_text()
        if re.search(r"\bunifac \(", t) and "unifacDortmund" not in t:
            orig_only = f.stem
            break
    if orig_only is None:
        bad.append("(e) no component with an original-only unifac block was found to test the refusal")
    else:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "c"
            write_case(d, ["water", orig_only], "refusal-no-block")
            rc, out = run_props(d)
            if rc == 0 or orig_only not in out or "unifacDortmund" not in out:
                bad.append("(e) a component without a unifacDortmund block (%s) was not refused by name (exit %d)"
                           % (orig_only, rc))
    # (e2) a pair of main groups Table IV does not print
    main_of = {n: v[1] for n, v in subs.items()}
    have = set()
    for (n, m) in rows:
        have.add((n, m)); have.add((m, n))
    pair = None
    names = sorted(asg)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            ma = {main_of[g] for g, _ in asg[a]}
            mb = {main_of[g] for g, _ in asg[b]}
            miss = [(x, y) for x in ma | mb for y in ma | mb if x != y and (x, y) not in have]
            if miss:
                pair = (a, b, miss[0]); break
        if pair:
            break
    if pair is None:
        bad.append("(e) every pair of assigned components is connected by Table IV: the gap refusal was not exercised")
    else:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "c"
            write_case(d, [pair[0], pair[1]], "refusal-pair-gap")
            rc, out = run_props(d)
            if rc == 0 or "prints no interaction parameters" not in out:
                bad.append("(e) the unprinted main-group pair %s (%s + %s) was not refused by name (exit %d)"
                           % (pair[2], pair[0], pair[1], rc))
    return bad


def table_xi_problems(case_dir):
    rc, out = run_props(case_dir)
    if rc != 0:
        return ["(f) the Table XI case failed to run (exit %d): %s" % (rc, out[-300:])]
    m = re.search(r"<<<Choupo:result-begin>>>(.*)<<<Choupo:result-end>>>", out, re.S)
    if not m:
        return ["(f) no result block in the Table XI run"]
    res = json.loads(m.group(1))
    byname = {o["name"]: o["diagnostics"] for o in res["operationResults"]}
    bad = []
    n = 0
    for tag, table in (("dortmund", TABLE_XI_DORTMUND), ("unifac", TABLE_XI_UNIFAC)):
        for comp, vals in table.items():
            for T, want in zip(TEMPS, vals):
                got = byname["%s_%dC" % (tag, T)]["gamma_" + comp]
                n += 1
                if abs(got - want) > TOL_XI:
                    bad.append("(f) Table XI %s %s at %d C: printed %.1f, engine %.4f" % (tag, comp, T, want, got))
    if n != 32:
        bad.append("(f) %d values compared, expected 32" % n)
    return bad


def copy_case(dst):
    case_records.copytree(CASE, dst, ignore=shutil.ignore_patterns("*.csv", "result*", "log*"))


def run_gate():
    gtext = (DATA / "groups.dat").read_text()
    itext = (DATA / "interactions.dat").read_text()
    bad = check_files(gtext, itext)
    subs, _ = parse_groups(gtext)
    rows, _ = parse_inter(itext)
    if not (ROOT / "choupoProps").exists():
        bad.append("(e)/(f) no choupoProps binary in this tree")
    else:
        bad += check_refusals(subs, rows)
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "case"
            copy_case(d)
            bad += table_xi_problems(d)
    return bad


def selftest():
    gtext = (DATA / "groups.dat").read_text()
    itext = (DATA / "interactions.dat").read_text()
    fails = 0

    def expect(name, problems):
        nonlocal fails
        if problems:
            print("  selftest %s: caught (%d problem(s); first: %s)" % (name, len(problems), problems[0][:90]))
        else:
            print("  selftest %s: NOT CAUGHT -- the gate cannot fail here" % name)
            fails += 1

    # S1: one sampled a_nm changed (hash pin off, to prove the SAMPLE arm alone catches it)
    s1 = itext.replace("{ n 1; m 5; a_nm 2777;", "{ n 1; m 5; a_nm 2771;")
    assert s1 != itext
    expect("S1 changed a sampled a_nm", [p for p in check_files(gtext, s1, check_pin=False)])
    # S2: one row deleted
    s2 = re.sub(r"    \{ n 3; m 7; [^\n]*\n", "", itext)
    assert s2 != itext
    expect("S2 deleted a row", check_files(gtext, s2, check_pin=False))
    # S3: one R_k changed
    s3 = gtext.replace("name H2O; number 16; mainGroup 7; R 1.7334;", "name H2O; number 16; mainGroup 7; R 1.7335;")
    assert s3 != gtext
    expect("S3 changed an R_k", check_files(s3, itext, check_pin=False))
    # S4: the header names a later revision
    s4 = gtext.replace('source  "Gmehling, Li & Schiller, Ind. Eng. Chem. Res. 32 (1993) 178, Table III, pp. 182-183";',
                       'source  "Dortmund matrix, 2022 revision, DDBST consortium";')
    assert s4 != gtext
    expect("S4 names a later revision", check_files(s4, itext, check_pin=False))
    # S5: the sealed interaction table of the Table XI case, CH2/OH pair, changed
    with tempfile.TemporaryDirectory() as td:
        d = Path(td) / "case"
        copy_case(d)
        f = d / "constant/parameters/UNIFACDortmund/interactions.dat"
        t = f.read_text()
        t2 = t.replace("{ n 1; m 5; a_nm 2777;", "{ n 1; m 5; a_nm 2377;")
        assert t2 != t
        f.write_text(t2)
        # a sealed case verifies its copies by sha-256 and would REFUSE the edit, which is a catch of
        # another kind; drop the manifest so the case reads the edited file and the arm must fail on
        # the NUMBERS (the resolver reads constant/parameters/ first, then the catalogue)
        (d / "constant/propertyManifest").unlink()
        expect("S5 changed the CH2/OH pair in the Table XI case", table_xi_problems(d))
    return fails


def main():
    if "--selftest" in sys.argv:
        f = selftest()
        if f:
            print("check_unifac_dortmund: SELFTEST FAILED -- %d sabotage(s) not caught" % f)
            sys.exit(1)
        print("check_unifac_dortmund: SELFTEST OK -- all five sabotages were caught")
        return
    bad = run_gate()
    if bad:
        print("check_unifac_dortmund: FAIL")
        for b in bad:
            print("  " + b)
        sys.exit(1)
    print("check_unifac_dortmund: OK -- the Dortmund UNIFAC records equal the printed tables where read "
          "(%d of 530 Table IV rows and %d of 85 Table III rows held to the page, both files sha-256 pinned), "
          "no later revision is named as a source, a component without its own unifacDortmund block and a "
          "main-group pair Table IV does not print are each refused by name, and all 32 values of the paper's "
          "Table XI are reproduced within 0.06.  NOT CHECKED: the other Table IV rows beyond the pin, any "
          "measurement (Table XI prints predictions), the equations beyond that reproduction."
          % (len(SAMPLE_ROWS), len(SAMPLE_SUBGROUPS)))


if __name__ == "__main__":
    main()
