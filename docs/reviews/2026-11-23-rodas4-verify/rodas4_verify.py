#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Verify Choupo's Rodas4 constants (src/solver/ODE/Rosenbrock23.cpp).

    python3 rodas4_verify.py [path/to/rodas.f]

1. parses Rodas4Coeffs from Rosenbrock23.cpp; if rodas.f is given, compares
   every digit with the three ROCOE sets (METH=1 is the book's RODAS4);
2. converts the u-form (a_ij, c_ij, d_i, gamma) to the classical Rosenbrock
   form  alpha = A*Gamma, Gamma = (I/gamma - C)^-1, b = m^T Gamma  and
   evaluates the order conditions of Hairer & Wanner II (Table IV.7.1) up to
   order 4 for the main weights and up to order 3 for the embedded ones,
   the non-autonomous conditions (d_i = row sums of Gamma), stiff accuracy
   and R(z) -> 0 (L-stability).
"""
import re
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve()
SRC = HERE.parents[3] / "src/solver/ODE/Rosenbrock23.cpp"


def choupo():
    txt = SRC.read_text()
    blk = txt[txt.index("struct Rodas4Coeffs"):txt.index("template <class SolveW>")]
    out = {}
    for m in re.finditer(r"(\b[acd]\d+)\s*=\s*(-?[0-9.]+(?:e-?\d+)?)", blk):
        out[m.group(1)] = float(m.group(2))
    return out


def rodas_f(path, meth=1):
    txt = Path(path).read_text().split("SUBROUTINE ROCOE")[1]
    parts = re.split(r"\n\s*\d?\s*C2=|\n\s*3\s+GAMMA", txt)
    # sets are delimited by labels 1,2,3; take by position of "C2=" / "GAMMA ="
    idx = [m.start() for m in re.finditer(r"\n +[123] +(C2=|GAMMA)", txt)]
    idx.append(len(txt))
    blk = txt[idx[meth - 1]:idx[meth]]
    out = {}
    for m in re.finditer(r"\b([ACD]\d+)\s*=\s*([-+0-9.]+)D([-+0-9]+)", blk):
        out[m.group(1).lower()] = float(m.group(2) + "e" + m.group(3))
    return out


def build(k):
    g = 0.25
    A = np.zeros((6, 6)); C = np.zeros((6, 6))
    A[1, 0] = k["a21"]; A[2, :2] = [k["a31"], k["a32"]]
    A[3, :3] = [k["a41"], k["a42"], k["a43"]]
    A[4, :4] = [k["a51"], k["a52"], k["a53"], k["a54"]]
    A[5, :5] = [k["a51"], k["a52"], k["a53"], k["a54"], 1.0]   # stage-6 point
    C[1, 0] = k["c21"]; C[2, :2] = [k["c31"], k["c32"]]
    C[3, :3] = [k["c41"], k["c42"], k["c43"]]
    C[4, :4] = [k["c51"], k["c52"], k["c53"], k["c54"]]
    C[5, :5] = [k["c61"], k["c62"], k["c63"], k["c64"], k["c65"]]
    m = np.array([k["a51"], k["a52"], k["a53"], k["a54"], 1.0, 1.0])  # y1 weights
    Gam = np.linalg.inv(np.eye(6) / g - C)
    alpha = A @ Gam
    b = m @ Gam
    mh = m.copy(); mh[5] = 0.0                                          # embedded
    bh = mh @ Gam
    return g, alpha, Gam, b, bh


def conds(g, alpha, Gam, b, order):
    n = 6
    al = np.tril(alpha, -1)
    be = al + np.tril(Gam, -1)          # beta_ij, j<i
    a_i = al.sum(1); b_i = be.sum(1)
    r = {}
    r["1: sum b = 1"] = b.sum() - 1
    if order >= 2:
        r["2: sum b b_i = 1/2-g"] = b @ b_i - (0.5 - g)
    if order >= 3:
        r["3a: sum b a_i^2 = 1/3"] = b @ a_i**2 - 1 / 3
        r["3b: sum b beta_ij b_j = 1/6-g+g^2"] = b @ be @ b_i - (1 / 6 - g + g * g)
    if order >= 4:
        r["4a: sum b a_i^3 = 1/4"] = b @ a_i**3 - 0.25
        r["4b: sum b a_i alpha_ik b_k = 1/8-g/3"] = b @ (a_i * (al @ b_i)) - (1 / 8 - g / 3)
        r["4c: sum b beta_ij a_j^2 = 1/12-g/3"] = b @ be @ a_i**2 - (1 / 12 - g / 3)
        r["4d: sum b beta_ij beta_jk b_k = 1/24-g/2+3g^2/2-g^3"] = \
            b @ be @ be @ b_i - (1 / 24 - g / 2 + 1.5 * g**2 - g**3)
    return r


def main():
    k = choupo()
    print(f"parsed {len(k)} constants from {SRC.name}")
    if len(sys.argv) > 1:
        ref = rodas_f(sys.argv[1], 1)
        refd = {x: ref[x] for x in k if x in ref}
        worst = 0.0; bad = []
        for key in k:
            if key not in ref:
                bad.append(f"{key}: not in rodas.f set 1"); continue
            rel = abs(k[key] - ref[key]) / max(abs(ref[key]), 1e-300)
            worst = max(worst, rel)
            if rel > 1e-15 and abs(k[key]-ref[key]) > 1e-16: bad.append(f"{key}: {k[key]!r} vs {ref[key]!r}")
        print(f"digit compare vs rodas.f METH=1 ({len(k)} constants): "
              f"worst relative difference {worst:.2e}; mismatches: {bad or 'none'}")
        # which set does it match
        for mth in (1, 2, 3):
            r = rodas_f(sys.argv[1], mth)
            d = max(abs(k[x] - r[x]) for x in k if x in r)
            print(f"  max |diff| to set {mth}: {d:.3e}")
    g, alpha, Gam, b, bh = build(k)
    print("\nmain weights b (order 4):")
    for name, v in conds(g, alpha, Gam, b, 4).items():
        print(f"  {name:58s} residual {v: .2e}")
    print("embedded weights b^ (order 3):")
    for name, v in conds(g, alpha, Gam, bh, 3).items():
        print(f"  {name:58s} residual {v: .2e}")
    # embedded must NOT satisfy order 4
    r4 = conds(g, alpha, Gam, bh, 4)
    print(f"embedded order-4 condition 4a residual {list(r4.values())[-4]: .2e}  (nonzero expected: it is order 3)")
    # nonautonomous: d_i = row sums of Gamma
    dsum = Gam.sum(1)
    dc = np.array([k["d1"], k["d2"], k["d3"], k["d4"]])
    print("\nd_i vs row sums of Gamma (i=1..4):", np.abs(dsum[:4] - dc))
    # c_i = row sums of alpha
    ci = alpha.sum(1)
    print("c_i (row sums of alpha):", np.round(ci, 12), " declared c2..c4:", k["c2"], k["c3"], k["c4"])
    # stiff accuracy: last stage point equals y1 => alpha_6j + Gam_6j = b_j
    print("stiff accuracy |(alpha+Gamma)_6j - b_j|, j<6:",
          np.abs((alpha + Gam)[5, :5] - b[:5]).max(), " and b_6 = gamma:", b[5] - g)
    # L-stability: R(z) = 1 + z b^T (I - z(alpha_lower... ) ) ; for Rosenbrock R(z)=1+z b^T (I - z B)^-1 1, B=alpha+Gamma(incl diag)
    B = np.tril(alpha, -1) + Gam
    for z in (-1e3, -1e6, -1e9):
        R = 1 + z * b @ np.linalg.solve(np.eye(6) - z * B, np.ones(6))
        print(f"R({z:g}) = {R: .3e}")
    # order of stability function: R(z) - exp(z) ~ z^5
    for z in (-0.1, -0.05):
        R = 1 + z * b @ np.linalg.solve(np.eye(6) - z * B, np.ones(6))
        print(f"R({z}) - exp = {R - np.exp(z): .3e}  ratio to z^5 = {(R - np.exp(z)) / z**5: .4f}")


if __name__ == "__main__":
    main()
