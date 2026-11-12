#!/usr/bin/env python3
"""Independent single-electrolyte Pitzer and Davies, standard library only.

Written from the published equations, NOT from the engine source:
  * Pitzer, J. Phys. Chem. 77 (1973) 268; Pitzer & Mayorga, J. Phys. Chem. 77
    (1973) 2300; Pitzer (ed.), Activity Coefficients in Electrolyte Solutions,
    2nd ed. (1991) ch. 3 -- the single-electrolyte form:
      ln g+-  = |zc za| f^g + m (2 nc na / n) B^g + m^2 (2 (nc na)^1.5 / n) C^g
      f^g     = -A [ sqrt I/(1 + b sqrt I) + (2/b) ln(1 + b sqrt I) ]
      B^g     = 2 b0 + (2 b1/(a1^2 I)) [1 - (1 + a1 sqrt I - a1^2 I/2) exp(-a1 sqrt I)]
                      + (same with b2, a2)
      C^g     = 1.5 Cphi
      phi - 1 = -|zc za| A sqrt I/(1 + b sqrt I)
                + m (2 nc na / n)(b0 + b1 exp(-a1 sqrt I) + b2 exp(-a2 sqrt I))
                + m^2 (2 (nc na)^1.5 / n) Cphi
    with A = A_phi = 0.3915 at 25 C, b = 1.2.
  * Davies (Ion Association, 1962): log10 g_i = -A z_i^2 (sqrt I/(1+sqrt I) - 0.3 I),
    mean ionic from the per-ion values; A = 0.51 at 25 C.

The PARAMETERS are read from the catalogue records (the same files the engine
reads), never typed here.

Usage: pitzer_davies_ref.py <repo_root> <cation> <anion> <zc> <za_magnitude> m1 m2 ...
Prints TSV: m, lnGpm_pitzer, phi_pitzer, gpm_davies
"""
import math
import re
import sys


def read_pair(repo, cation, anion):
    path = f"{repo}/data/standards/parameters/Pitzer/pairs/{cation}-{anion}.dat"
    txt = open(path, encoding="utf-8").read()
    # strip /* */ and // comments
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    txt = re.sub(r"//[^\n]*", "", txt)
    m = re.search(r"parameters\s*\{(.*?)\}", txt, flags=re.S)
    body = m.group(1)
    out = {}
    for k, v in re.findall(r"([A-Za-z_0-9]+)\s+([-+0-9.eE]+)\s*;", body):
        out[k] = float(v)
    return out


def pitzer(m, zc, za, b0, b1, b2, cphi, a1, a2, A=0.3915, b=1.2):
    g = math.gcd(zc, za)
    nc, na = za // g, zc // g
    nu = nc + na
    I = 0.5 * (nc * zc * zc + na * za * za) * m
    s = math.sqrt(I)
    fg = -A * (s / (1 + b * s) + (2 / b) * math.log(1 + b * s))

    def h(a, beta):
        if beta == 0.0:
            return 0.0
        x = a * s
        return 2 * beta / (a * a * I) * (1 - (1 + x - x * x / 2) * math.exp(-x))

    Bg = 2 * b0 + h(a1, b1) + h(a2, b2)
    Cg = 1.5 * cphi
    lng = (zc * za * fg + m * (2 * nc * na / nu) * Bg
           + m * m * (2 * (nc * na) ** 1.5 / nu) * Cg)
    Bphi = b0 + b1 * math.exp(-a1 * s) + b2 * math.exp(-a2 * s)
    phi = (1 - zc * za * A * s / (1 + b * s) + m * (2 * nc * na / nu) * Bphi
           + m * m * (2 * (nc * na) ** 1.5 / nu) * cphi)
    return lng, phi


def davies_mean(m, zc, za, A=0.51):
    g = math.gcd(zc, za)
    nc, na = za // g, zc // g
    I = 0.5 * (nc * zc * zc + na * za * za) * m
    s = math.sqrt(I)
    f = s / (1 + s) - 0.3 * I
    lg_c = -A * zc * zc * f
    lg_a = -A * za * za * f
    return 10 ** ((nc * lg_c + na * lg_a) / (nc + na))


def main():
    repo, cat, an, zc, za = sys.argv[1:6]
    zc, za = int(zc), int(za)
    p = read_pair(repo, cat, an)
    print("m\tlnGpm_pitzer_ref\tphi_pitzer_ref\tgpm_davies_ref")
    for ms in sys.argv[6:]:
        m = float(ms)
        lng, phi = pitzer(m, zc, za, p["beta0"], p["beta1"], p.get("beta2", 0.0),
                          p["Cphi"], p.get("alpha1", 2.0), p.get("alpha2", 12.0))
        print(f"{m:.6g}\t{lng:.15e}\t{phi:.15e}\t{davies_mean(m, zc, za):.15e}")


if __name__ == "__main__":
    main()
