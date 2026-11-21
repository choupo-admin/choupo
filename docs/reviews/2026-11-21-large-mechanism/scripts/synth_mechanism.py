#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""synth_mechanism -- write a SYNTHETIC CHEMKIN mechanism of N species (a numerical
fixture for timing the stiff integrator's linear algebra; it is NOT chemistry).

    synth_mechanism.py N OUTDIR [--seed S] [--per-species R]

writes OUTDIR/chem.inp (ELEMENTS, SPECIES, REACTIONS) and OUTDIR/therm.dat (NASA-7),
for bin/curate/chemkin_to_choupo.py.

WHAT IS REALISTIC ABOUT IT, and nothing else is claimed:
  * CONNECTIVITY.  Species are H/C/O "isomers" on a lattice of formulas CxHyOz
    (x 0..4, y 0..8, z 0..3).  Reactions conserve every element: 80 % bimolecular
    exchanges A + B = C + D (C, D of formulas summing to A's and B's), 5 %
    dissociations A (+M) = B + C as `+M` third-body reactions with every species a
    collider (efficiency 1 unless listed) -- drawn, as in a real mechanism, among the
    SMALL species (one isomer of each formula of at most three atoms, ~25 of them) --
    and 15 % isomerisations A = B.  About
    `per-species` reactions per species (default 5: each species then appears in
    ~15-20 reactions, the range of a detailed hydrocarbon mechanism).
  * STIFFNESS.  A T^b at 1200 K log-uniform in 1e8..1e13 cm3/mol/s (1e9..1e14 1/s for
    an isomerisation, 1e14..1e18 cm6/mol2/s for a third body), b in -0.5..1.5, Ea uniform
    in 0..30 kcal/mol (exchanges), 25..60 (isomerisations), 20..90 (dissociations), all
    reversible by detailed balance: time scales from ~1e-10 s to seconds at 1200 K.
  * THERMO.  NASA-7 with cp/R = a1 + a2 T, a1 from the atom count (3.5 + 1.5 per atom
    beyond two, a small T slope), H_f = sum of per-element values + a random
    +-40 kJ/mol, S_298 = 150 + 25 per atom +-30 J/mol/K: reaction enthalpies of tens
    of kJ/mol, so an adiabatic vessel stays near its starting temperature.
Everything is drawn from one seeded generator: the fixture is reproducible.
"""
import argparse
import math
import random
from pathlib import Path

R_CAL = 1.98720425864083   # cal/mol/K
R_J = 8.314462618


def formulas():
    out = []
    for x in range(0, 5):
        for y in range(0, 9):
            for z in range(0, 4):
                if x + y + z == 0 or x + y + z > 10:
                    continue
                out.append((x, y, z))
    return out


def nasa7(name, f, hf_kj, s298, comp):
    """Two identical NASA-7 ranges (200-1000-6000 K), cp/R = a1 + a2 T."""
    atoms = sum(f)
    a1 = 3.5 + 1.5 * max(atoms - 2, 0)
    a2 = 2.0e-4 * atoms
    T0 = 298.15
    # H/R = a1 T + a2 T^2/2 + a6 ;  S/R = a1 ln T + a2 T + a7
    a6 = hf_kj * 1000.0 / R_J - (a1 * T0 + a2 * T0 * T0 / 2.0)
    a7 = s298 / R_J - (a1 * math.log(T0) + a2 * T0)
    coef = [a1, a2, 0.0, 0.0, 0.0, a6, a7]
    elems = "".join(f"{e:<2}{n:>3}" for e, n in comp if n > 0)
    elems = (elems + " " * 20)[:20]
    head = f"{name:<18}{'':6}{elems}G{200.0:10.3f}{6000.0:10.3f}{1000.0:8.2f}      1\n"
    seq = coef + coef        # high range, then low range
    lines = [head]
    vals = [f"{v:15.8E}" for v in seq]
    lines.append("".join(vals[0:5]) + "    2\n")
    lines.append("".join(vals[5:10]) + "    3\n")
    lines.append("".join(vals[10:14]) + " " * 15 + "    4\n")
    return "".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("N", type=int)
    ap.add_argument("outdir")
    ap.add_argument("--seed", type=int, default=20261121)
    ap.add_argument("--per-species", type=float, default=5.0)
    ap.add_argument("--exo", type=float, default=0.0,
                    help="kJ/mol taken off H_f in proportion to the species index (S_k: exo*k/N), so a"
                         " charge of the first species relaxes exothermically and 'ignites' (the"
                         " sensitivity timing needs a delay)")
    a = ap.parse_args()
    rng = random.Random(a.seed)
    F = formulas()
    # N species over the formula lattice, round-robin so small N still spans it
    species = []
    count = {}
    order = F[:]
    rng.shuffle(order)
    for k in range(a.N):
        f = order[k % len(order)]
        count[f] = count.get(f, 0) + 1
        species.append((f"S{k}_C{f[0]}H{f[1]}O{f[2]}", f))
    byf = {}
    for name, f in species:
        byf.setdefault(f, []).append(name)
    fset = set(byf)
    hel = {"C": -15.0, "H": 25.0, "O": -60.0}
    thermo = []
    for k, (name, f) in enumerate(species):
        hf = hel["C"] * f[0] + hel["H"] * f[1] + hel["O"] * f[2] + rng.uniform(-40, 40) \
            - a.exo * k / a.N
        s = 150.0 + 25.0 * sum(f) + rng.uniform(-30, 30)
        thermo.append(nasa7(name, f, hf, s, [("C", f[0]), ("H", f[1]), ("O", f[2])]))

    def pick(f):
        return rng.choice(byf[f])

    def add(f1, f2):
        return tuple(p + q for p, q in zip(f1, f2))

    def sub(f1, f2):
        return tuple(p - q for p, q in zip(f1, f2))

    nR = int(round(a.per_species * a.N))
    rx, seen = [], set()
    tries = 0
    names = [s for s, _ in species]
    fof = dict(species)
    poolf = {f: byf[f][0] for f in byf if sum(f) <= 3}
    pool = sorted(poolf.values())
    while len(rx) < nR and tries < 200 * nR:
        tries += 1
        u = rng.random()
        if u < 0.80:       # A + B = C + D
            A, B = rng.choice(names), rng.choice(names)
            tot = add(fof[A], fof[B])
            splits = [fc for fc in fset if sub(tot, fc) in fset]
            if not splits:
                continue
            fc = rng.choice(splits)
            C, D = pick(fc), pick(sub(tot, fc))
            if {C, D} == {A, B} or len({A, B} & {C, D}):
                continue
            lhs, rhs, kind = sorted([A, B]), sorted([C, D]), "bi"
        elif u < 0.85:     # A + M = B + C   (third body, every species a collider)
            #  as in a real mechanism, the dissociations are among the SMALL
            #  species (one isomer of each formula of at most three atoms)
            A = rng.choice(pool)
            splits = [fc for fc in poolf if sub(fof[A], fc) in poolf]
            if not splits:
                continue
            fc = rng.choice(splits)
            B, C = poolf[fc], poolf[sub(fof[A], fc)]
            if A in (B, C):
                continue
            lhs, rhs, kind = [A], sorted([B, C]), "tb"
        else:              # A = B
            A = rng.choice(names)
            if len(byf[fof[A]]) < 2:
                continue
            B = pick(fof[A])
            if A == B:
                continue
            lhs, rhs, kind = [A], [B], "iso"
        key = (tuple(lhs), tuple(rhs))
        if key in seen or (tuple(rhs), tuple(lhs)) in seen:
            continue
        seen.add(key)
        #  A T^b at 1200 K is drawn (never above a collision rate), then A from it
        b = rng.uniform(-0.5, 1.5)
        k1200 = rng.uniform(8, 13) if kind == "bi" else rng.uniform(9, 14)
        if kind == "tb":
            k1200 = rng.uniform(14, 18)          # cm6/mol2/s
        Aexp = k1200 - b * math.log10(1200.0)
        Ea = {"bi": rng.uniform(0, 30000.0), "iso": rng.uniform(25000.0, 60000.0),
              "tb": rng.uniform(20000.0, 90000.0)}[kind]
        if kind == "tb":
            eq = f"{lhs[0]}+M<=>{rhs[0]}+{rhs[1]}+M"
            eff = " ".join(f"{s}/{rng.choice((0.5, 1.0, 2.0, 5.0)):.1f}/"
                           for s in rng.sample(names, min(6, len(names))))
            rx.append(f"{eq:<60}{10**Aexp:12.4E}{b:8.3f}{Ea:12.2f}\n{eff}\n")
        else:
            eq = "+".join(lhs) + "<=>" + "+".join(rhs)
            rx.append(f"{eq:<60}{10**Aexp:12.4E}{b:8.3f}{Ea:12.2f}\n")
    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "chem.inp", "w") as f:
        f.write("! SYNTHETIC numerical fixture (NOT chemistry): synth_mechanism.py "
                f"N={a.N} seed={a.seed}\nELEMENTS C H O END\nSPECIES\n")
        for k in range(0, a.N, 6):
            f.write(" ".join(names[k:k + 6]) + "\n")
        f.write("END\nREACTIONS CAL/MOLE MOLES\n")
        f.writelines(rx)
        f.write("END\n")
    with open(out / "therm.dat", "w") as f:
        f.write("THERMO ALL\n   200.000  1000.000  6000.000\n")
        f.writelines(thermo)
        f.write("END\n")
    nspec = sum(len(r.split("<=>")[0].split("+")) + len(r.split("<=>")[1].split()[0].split("+"))
                for r in rx)
    print(f"N={a.N} reactions={len(rx)} (target {nR}); species-in-reaction mean "
          f"{nspec / a.N:.1f}; formulas used {len(byf)}")


if __name__ == "__main__":
    main()
