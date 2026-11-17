#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the liquid diffusivity a package returns is the one its property
dictionary declares, in the direction it names; a column block carries no
property; and every refusal of the slice speaks by name.

    bin/curate/check_liquid_diffusivity_declaration.py

WHAT IT HOLDS (DEV.md 4c C398 slice (d) and its rulings 1-5; Theory Guide
sec:liquid-diffusivity-declared and sec:measured-liquid-viscosity;
src/thermo/transport/LiquidTransportDeclarations.{H,cpp}).

  (1) THE WITNESS (tutorials/props/transport/liquidDiffusivity01_pelkonen_ternary)
      runs to exit 0; the measured entry of the variant `poling288` is
      returned exactly (1.26e-5 cm2/s read as 1.26e-9 m2/s, the unit column
      honoured); the opposite direction is NOT that value; the effective value
      of `binaryEffective` is the Vignes combination of the two
      infinite-dilution values the same operation prints (relative 1e-12);
      the same entry written inline gives the same value; a `use check`
      mixture viscosity is printed beside the computed one and never used;
      the view says 2-propanol's association factor is the default, and every
      record of debt_registry.ASSOCIATION_FACTOR_DEFAULTED still writes none.
  (2) REFUSALS OF THE GRAMMAR, each by its words, on a copy of the witness:
      an effective value of three components by a binary rule;
      VignesKooijmanTaylor without its reduction, a reduction beside a binary
      rule, a reduction not built; a file
      cited in the other direction; a file of two points; `kind fick`;
      `thermodynamicFactor { from ... }`; `returns effective` without the
      factor; an entry's datum used outside its box; a column without a unit.
  (3) THE COLUMN (a copy of ratebased01_schulz_0p10bar, its sweep removed):
      `liquidViscosity` typed back in `packing {}` is refused with the line to
      write; with no `diffusivity` block the column says what to declare; a
      measured viscosity box that misses the bed's temperatures is refused
      at its first use, never handed to another source.

  (5) C329 SLICE B2a (and its round-2 rows B2-01..07), THE MULTICOMPONENT LIQUID DIFFUSIVITY
      (tutorials/props/transport/liquidDiffusivity02_kooijmanTaylor_ternary,
      Theory Guide sec:liquid-diffusivity-multicomponent): the pair values are
      Kooijman & Taylor 1991 Eq. 23 by hand and the effective values Wilke's
      reduction (Taylor & Krishna 1993 Eq. 6.1.14) by hand, both to 1e-11; the
      average discrepancy of the Fick matrix against the paper's Table I is
      within 1e-4 of its Table IV "eq 23" row (overall, diagonal and
      off-diagonal) with the NRTL tau_21 = 0.76432 of Taylor & Krishna's Example 3.3.1
      (p. 61), 0.0782 with the paper's printed 0.74632; Gamma at 0.70/0.15/0.15 is an
      independent NRTL's to 1e-5 and the book's Example 4.2.6 (p. 92) to every printed digit;
      the books' limiting value (D0_ik D0_ki)^(1/2), each pair evaluated for i<j and
      copied (the form is asymmetric), scores 0.0974 (0.1002 with the paper's printed tau_21)
      on the same table against the paper's 0.0763, so the misprint note is a measurement; the binary
      edge equals the shipped Vignes rule to 1e-12 for each of the three edges and
      the ternary is its limit (x_k = 1e-9 within 1e-6); the result does not
      depend on the order of the components; Wilke compiled from the engine's own
      header gives 50.99 and 16.95 mm2/s on Example 6.1.1 (p. 127); seven refusals
      of the new grammar by their words.

WHAT IT DOES NOT CHECK: the numbers of the sixteen migrated column cases (their
goldens hold them, and the slice's byte-identity run compared every line);
that Wilke-Chang is the right correlation for a pair; that the measured
values transcribe their papers (read by the author).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import ASSOCIATION_FACTOR_DEFAULTED  # noqa: E402
import case_records  # noqa: E402  (C413: a pinned case carries no record copy)

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_liquid_diffusivity_declaration"
WITNESS = ROOT / "tutorials" / "props" / "transport" / "liquidDiffusivity01_pelkonen_ternary"
RATE = ROOT / "tutorials" / "steady" / "distillation" / "ratebased01_schulz_0p10bar"
TRAYS = ROOT / "tutorials" / "steady" / "distillation" / "trayEfficiency01_yanagi14"
SECTORS = ROOT / "tutorials" / "steady" / "flowsheets" / "table05_sector_table_pins"


def run(case: Path, binary: str, timeout=600):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    try:
        p = subprocess.run([str(ROOT / binary), "."], cwd=str(case), env=env,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"
    return p.returncode, p.stdout + p.stderr


def diagnostics(out):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return {}
    r = json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    return {op["name"]: op.get("diagnostics", {}) for op in r.get("operationResults", [])}


def copy(src: Path, tmp: str, name: str) -> Path:
    d = Path(tmp) / name
    case_records.copytree(src, d, ignore=shutil.ignore_patterns("*.csv", "log.*", "reports",
                                                          "postProcessing", "converged"))
    return d


def edit(path: Path, old: str, new: str):
    if path.parent.name == "components" and path.parent.parent.name == "constant":
        #  C413: the probe copy references the catalogue; an edit of a record puts it in the copy
        #  and the copy then runs unpinned (it is an unsealed case, reading its own record)
        case_records.ensure_local(path.parents[2], "components/" + path.name)   # no-op when materialised
        case_records.unpin(path.parents[2])
    s = path.read_text()
    if s.count(old) != 1:
        raise SystemExit(f"{NAME}: FAIL -- the arm's edit does not apply to {path.name}: {old[:60]!r}")
    path.write_text(s.replace(old, new, 1))


def record_number(comp, key):
    m = re.search(r"^\s*" + key + r"\s+([0-9.eE+-]+)\s*;", case_records.record_path(WITNESS, f"components/{comp}.dat").read_text(), re.M)
    return float(m.group(1))


def record_number_at(path, key):
    m = re.search(r"^\s*" + key + r"\s+([0-9.eE+-]+)\s*;", Path(path).read_text(), re.M)
    return float(m.group(1))


RACKETT_R = 8.314462618


def rackett(T, Tc, Pc_Pa, omega):
    """The package's Rackett (src/thermo/DerivedClosures.H, rackettVliq), by hand, m3/mol."""
    zra = 0.29056 - 0.08775 * omega
    return RACKETT_R * Tc / Pc_Pa * zra ** (1.0 + (1.0 - T / Tc) ** (2.0 / 7.0))


def volume_cm3(comp, at_tb=True):
    """V_A of Poling's Eq. 11-9.1, cm3/mol, by hand from the witness's own record: the
    record's 25 C Vliq anchored by Rackett to the record's Tb (the route the view prints for
    these records), or, for the SABOTAGE ARM, left at the 298.15 K datum."""
    v0 = record_number(comp, "Vliq")
    if not at_tb:
        return v0 * 1.0e6
    Tc, Pc, om, Tb = (record_number(comp, k) for k in ("Tc", "Pc", "omega", "Tb"))
    Pc_Pa = Pc * 1.0e5
    return v0 * rackett(Tb, Tc, Pc_Pa, om) / rackett(298.15, Tc, Pc_Pa, om) * 1.0e6


def wilke_chang(solute, solvent, T, mu_solvent, phi, at_tb=True):
    """Poling 5th ed. Eq. 11-9.1, by hand: 7.4e-8 (phi M_B)^0.5 T / (eta_B[cP] V_A^0.6) cm2/s,
    V_A AT THE NORMAL BOILING POINT (C398 slice d2; `at_tb=False` is the sabotage: V_A at 298 K)."""
    MB = record_number(solvent, "MW")
    VA = volume_cm3(solute, at_tb)
    return 7.4e-8 * (phi * MB) ** 0.5 * T / (mu_solvent * 1.0e3 * VA ** 0.6) * 1.0e-4


def profile_of(out, unit="column"):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    r = json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    return r.get("profiles", {}).get(unit)


KT = ROOT / "tutorials" / "props" / "transport" / "liquidDiffusivity02_kooijmanTaylor_ternary"
KT_NAMES = ("acetone", "benzene", "carbonTetrachloride")
#  Kooijman & Taylor (1991), Ind. Eng. Chem. Res. 30, 1217, Table I (p. 1218):
#  x1 x2 x3 and the measured Fick matrix D11 D12 D21 D22 (1e-9 m2/s, molar-average frame).
KT_TABLE_I = [
    ((0.2989, 0.3490, 0.3521), (1.8690, -0.2129, -0.0043, 2.2730)),
    ((0.1496, 0.1499, 0.7005), (1.5968, -0.0592, -0.0771, 1.8132)),
    ((0.1497, 0.6984, 0.1519), (1.9652, 0.0137, -0.1522, 1.9248)),
    ((0.6999, 0.1497, 0.1504), (2.3041, -0.4019, 0.1848, 2.9969)),
]
#  Same page: D0_ij, i infinitely dilute in j (1e-9 m2/s), by 0-based (i, j).
KT_D0 = {(0, 1): 2.75, (1, 0): 4.15, (0, 2): 1.70, (2, 0): 3.57, (1, 2): 1.42, (2, 1): 1.91}
#  Table IV (p. 1221), column "eq 23", acetone-benzene-carbon tetrachloride.
KT_TABLE_IV_EQ23 = {"overall": 0.0763, "diagonal": 0.0916, "offDiagonal": 0.0611}
#  Taylor & Krishna (1993), Example 4.2.6, p. 92: [Gamma] at 0.70 / 0.15 / 0.15.
TK93_GAMMA = ((0.788, -0.088), (0.075, 1.043))
#  The NRTL tau_21 of acetone (1) in benzene (2): Taylor & Krishna (1993) Example 3.3.1, p. 61,
#  prints 0.76432 (the parameters their Example 4.2.6 uses); Kooijman & Taylor Table I, p. 1218,
#  prints 0.74632.  With 0.76432 the paper's own Table IV "eq 23" row is reproduced to its four
#  digits and Gamma is the book's matrix to every printed digit (review row B2-05).
KT_TAU21_BOOK, KT_TAU21_PAPER = 0.76432, 0.74632


def kt_gamma_independent(x, tau21):
    """Gamma at x for the paper's NRTL (own implementation, not the engine's): ln gamma by
    the textbook NRTL sums, d/dx by a central difference with component 3 taking the change."""
    import math
    tau = [[0, -0.46504, -0.42790], [tau21, 0, -0.51821], [1.5931, 0.7338, 0]]
    G = [[math.exp(-0.2 * tau[j][i]) if i != j else 1.0 for i in range(3)] for j in range(3)]

    def lng(y):
        out = []
        for i in range(3):
            s1 = sum(y[j] * tau[j][i] * G[j][i] for j in range(3)) / sum(y[k] * G[k][i] for k in range(3))
            s2 = 0.0
            for j in range(3):
                den = sum(y[k] * G[k][j] for k in range(3))
                num = sum(y[m] * tau[m][j] * G[m][j] for m in range(3))
                s2 += y[j] * G[i][j] / den * (tau[i][j] - num / den)
            out.append(s1 + s2)
        return out
    h = 1e-6
    M = [[0.0, 0.0], [0.0, 0.0]]
    for j in range(2):
        xp, xm = list(x), list(x)
        xp[j] += h; xp[2] -= h; xm[j] -= h; xm[2] += h
        a, b = lng(xp), lng(xm)
        for i in range(2):
            M[i][j] = (1.0 if i == j else 0.0) + x[i] * (a[i] - b[i]) / (2 * h)
    return M
#  Taylor & Krishna (1993), Example 6.1.1, p. 127 (mm2/s).
TK93_EX611 = (50.99, 16.95)

WILKE_PROBE = r'''
#include "thermo/transport/WilkeReduction.H"
#include <cstdio>
int main()
{
    //  Taylor & Krishna 1993, Example 6.1.1, p. 127: H2 (1), N2 (2), CCl2F2 (3),
    //  x = 0.35 0.40 0.25;  D12 = 77.0, D13 = 33.1, D23 = 8.1 mm2/s.
    const std::vector<double> x = { 0.35, 0.40, 0.25 };
    const double D[3][3] = { { 0, 77.0, 33.1 }, { 77.0, 0, 8.1 }, { 33.1, 8.1, 0 } };
    for (std::size_t i = 0; i < 2; ++i)
    {
        const std::vector<double> row = { D[i][0], D[i][1], D[i][2] };
        std::printf("%.10g\n", Choupo::liquidTransport::wilkeEffective(x, row, i));
    }
    return 0;
}
'''


def kt_pair_by_hand(x, i, j):
    k = 3 - i - j
    return (KT_D0[(i, j)] ** x[j] * KT_D0[(j, i)] ** x[i]
            * (KT_D0[(i, k)] * KT_D0[(j, k)]) ** (x[k] / 2.0)) * 1e-9


def kt_ops(points, props):
    s = "operations\n(\n"
    for name, comp, ps in points:
        c = "  ".join(f"{n} {v!r};" for n, v in comp.items())
        s += (f"    {{\n        name {name};\n        type propertyPoint;\n"
              f"        state {{ T 298.15 K;  P 1 bar;  composition {{ {c} }} }}\n"
              f"        properties ( {' '.join(ps)} );\n    }}\n")
    return s + ");\n"


def kt_run(src: Path, tmp: str, name: str, ops=None, edits=()):
    d = copy(src, tmp, name)
    for f, old, new in edits:
        edit(d / f, old, new)
    if ops is not None:
        (d / "system" / "propsDict").write_text(ops)
    rc, out = run(d, "choupoProps")
    return rc, out, diagnostics(out)


def kt_section(tmp, fails, notes):
    """C329 slice B2a: the multicomponent liquid diffusivity on Kooijman & Taylor's Table I."""
    rc, out, dg = kt_run(KT, tmp, "kt")
    if rc != 0 or not dg:
        fails.append(f"(5) the Kooijman-Taylor witness did not run (exit {rc})")
        return
    # (5a) the pair values are Eq. 23 by hand, the effective values are Wilke by hand.
    pairs = {(0, 1): "acetone_benzene", (0, 2): "acetone_carbonTetrachloride",
             (1, 2): "benzene_carbonTetrachloride"}
    for pt in ("t1", "t2", "t3", "t4", "tk93"):
        d = dg.get(pt, {})
        x = {"t1": KT_TABLE_I[0][0], "t2": KT_TABLE_I[1][0], "t3": KT_TABLE_I[2][0],
             "t4": KT_TABLE_I[3][0], "tk93": (0.70, 0.15, 0.15)}[pt]
        ms = {}
        for (i, j), key in pairs.items():
            got = d.get("D_L_MS_" + key)
            ms[(i, j)] = ms[(j, i)] = kt_pair_by_hand(x, i, j)
            if got is None or abs(got / ms[(i, j)] - 1.0) > 1e-11:
                fails.append(f"(5a) {pt}: D_L_MS_{key} {got} is not Eq. 23 by hand {ms[(i, j)]}")
        for i, n in enumerate(KT_NAMES):
            others = [j for j in range(3) if j != i]
            hand = (sum(x[j] for j in others)) / sum(x[j] / ms[(i, j)] for j in others)
            got = d.get("D_L_effective_" + n)
            if got is None or abs(got / hand - 1.0) > 1e-11:
                fails.append(f"(5a) {pt}: D_L_effective_{n} {got} is not Wilke's reduction by hand {hand}")
    # (5b) the paper's own score (Table IV, "eq 23") and Taylor & Krishna's Gamma.
    diag, off = [], []
    for pt, (x, E) in zip(("t1", "t2", "t3", "t4"), KT_TABLE_I):
        d = dg.get(pt, {})
        F = (d.get("D_L_Fick_acetone_acetone"), d.get("D_L_Fick_acetone_benzene"),
             d.get("D_L_Fick_benzene_acetone"), d.get("D_L_Fick_benzene_benzene"))
        if None in F:
            fails.append(f"(5b) {pt}: the Fick matrix is missing")
            return
        for k, (f, e) in enumerate(zip(F, E)):
            row_diag = E[0] if k < 2 else E[3]
            err = abs(f * 1e9 - e) / row_diag
            (diag if k in (0, 3) else off).append(err)
    avg = {"overall": sum(diag + off) / 16, "diagonal": sum(diag) / len(diag),
           "offDiagonal": sum(off) / len(off)}
    for k, want in KT_TABLE_IV_EQ23.items():
        if abs(avg[k] - want) > 1e-4:
            fails.append(f"(5b) the {k} average discrepancy {avg[k]:.5f} is not within 1e-4 of the"
                         f" paper's Table IV eq 23 value {want} (with the book's tau_21 = 0.76432)")
    g = dg.get("tk93", {})
    G = ((g.get("Gamma_acetone_acetone"), g.get("Gamma_acetone_benzene")),
         (g.get("Gamma_benzene_acetone"), g.get("Gamma_benzene_benzene")))
    ind = kt_gamma_independent((0.70, 0.15, 0.15), KT_TAU21_BOOK)
    for i in range(2):
        for j in range(2):
            if G[i][j] is None or abs(G[i][j] - ind[i][j]) > 1e-5:
                fails.append(f"(5b) Gamma[{i}][{j}] {G[i][j]} is not an independent NRTL's {ind[i][j]} to 1e-5")
            if G[i][j] is None or abs(G[i][j] - TK93_GAMMA[i][j]) > 5.1e-4:
                fails.append(f"(5b) Gamma[{i}][{j}] {G[i][j]} does not round to Taylor & Krishna's printed"
                             f" Example 4.2.6 value {TK93_GAMMA[i][j]} (every digit, with their tau_21)")
    #  the paper's PRINTED tau_21 = 0.74632 gives the 0.002 residual: the discrepancy between the two sources
    #  is a measurement, not a sentence.
    _, _, dgp2 = kt_run(KT, tmp, "kt_printedtau",
                        edits=[("constant/thermoPhysPropDict", "a_ji 0.76432;", "a_ji 0.74632;")])
    try:
        dd, oo = [], []
        for pt, (x, E) in zip(("t1", "t2", "t3", "t4"), KT_TABLE_I):
            d2 = dgp2[pt]
            F = (d2["D_L_Fick_acetone_acetone"], d2["D_L_Fick_acetone_benzene"],
                 d2["D_L_Fick_benzene_acetone"], d2["D_L_Fick_benzene_benzene"])
            for k, (f, e) in enumerate(zip(F, E)):
                (dd if k in (0, 3) else oo).append(abs(f * 1e9 - e) / (E[0] if k < 2 else E[3]))
        pr = sum(dd + oo) / 16
        g2 = [dgp2["tk93"]["Gamma_" + k] for k in ("acetone_acetone", "acetone_benzene",
                                                    "benzene_acetone", "benzene_benzene")]
        gmax = max(abs(g - t) for g, t in zip(g2, (0.788, -0.088, 0.075, 1.043)))
        if abs(pr - 0.0782) > 1e-4 or not 0.0015 < gmax < 0.003:
            fails.append(f"(5b) with the paper's printed tau_21 = 0.74632 the average is {pr:.4f} (expected"
                         f" 0.0782) and the largest miss of Gamma against the book is {gmax:.4f}, not 0.002")
    except (KeyError, TypeError):
        fails.append("(5b) the printed-tau_21 variant did not run")
    # (5c) THE MISPRINT, measured: the books' limiting value scores worse than the paper's on
    #      the paper's own table (0.1002 against 0.0782, by hand with the engine's Gamma).
    def books_score(dg):
        #  each pair evaluated for i < j and copied to j, i (the engine's fill); the books' form is
        #  asymmetric, so another order scores differently (review row B2-06)
        e = []
        for pt, (x, E) in zip(("t1", "t2", "t3", "t4"), KT_TABLE_I):
            G = dg[pt]
            Gm = [[G["Gamma_acetone_acetone"], G["Gamma_acetone_benzene"]],
                  [G["Gamma_benzene_acetone"], G["Gamma_benzene_benzene"]]]
            P = {}
            for (i, j) in ((0, 1), (0, 2), (1, 2)):
                k = 3 - i - j
                P[(i, j)] = P[(j, i)] = (KT_D0[(i, j)] ** x[j] * KT_D0[(j, i)] ** x[i]
                                         * (KT_D0[(i, k)] * KT_D0[(k, i)]) ** (x[k] / 2.0))
            B = [[0.0, 0.0], [0.0, 0.0]]
            for i in range(2):
                B[i][i] = x[i] / P[(i, 2)] + sum(x[k] / P[(i, k)] for k in range(3) if k != i)
                for j in range(2):
                    if j != i:
                        B[i][j] = -x[i] * (1 / P[(i, j)] - 1 / P[(i, 2)])
            det = B[0][0] * B[1][1] - B[0][1] * B[1][0]
            Bi = [[B[1][1] / det, -B[0][1] / det], [-B[1][0] / det, B[0][0] / det]]
            F = [[sum(Bi[i][k] * Gm[k][j] for k in range(2)) for j in range(2)] for i in range(2)]
            Em = [[E[0], E[1]], [E[2], E[3]]]
            for i in range(2):
                for j in range(2):
                    e.append(abs(F[i][j] - Em[i][j]) / Em[i][i])
        return sum(e) / 16.0
    try:
        for label, dgx, want in (("tau_21 = 0.76432", dg, 0.0974), ("tau_21 = 0.74632", dgp2, 0.1002)):
            bs = books_score(dgx)
            if abs(bs - want) > 0.001 or not bs > avg["overall"] + 0.01:
                fails.append(f"(5c) the books' limiting value (D0_ik D0_ki)^(1/2), pairs evaluated i<j and"
                             f" copied, scores {bs:.4f} with {label}, expected {want} and worse than the"
                             f" paper's form {avg['overall']:.4f}: the misprint note is not what it says")
    except (KeyError, TypeError, NameError):
        fails.append("(5c) the misprint measurement could not read the Gamma rows")
    # (5d) the binary reduction is exact: each edge equals the shipped Vignes rule to 1e-12 and
    #      is the limit of the ternary (x_k = 1e-9 within 1e-6); the result does not depend
    #      on the order of the components.
    edges = [("e12", {"acetone": 0.3, "benzene": 0.7}, (0, 1)),
             ("e13", {"acetone": 0.3, "carbonTetrachloride": 0.7}, (0, 2)),
             ("e23", {"benzene": 0.3, "carbonTetrachloride": 0.7}, (1, 2))]
    pts = []
    for name, comp, (i, j) in edges:
        pts.append((name, comp, [f"D_L_effective_{KT_NAMES[i]}", f"D_L_effective_{KT_NAMES[j]}"]))
    for name, comp, (i, j) in edges:
        k = 3 - i - j
        near = dict(comp)
        first = list(comp)[0]
        near[first] = comp[first] - 1e-9
        near[KT_NAMES[k]] = 1e-9
        pts.append(("n" + name[1:], near, [f"D_L_effective_{KT_NAMES[i]}", f"D_L_effective_{KT_NAMES[j]}"]))
    rcv, _, dgv = kt_run(KT, tmp, "kt_edge", ops=kt_ops(pts, None))
    vig_pts = [(name, comp, ["D_L_effective"]) for name, comp, _ in edges]
    rcw, _, dgw = kt_run(KT, tmp, "kt_vignes", ops=kt_ops(vig_pts, None),
                         edits=[("constant/thermoPhysPropDict",
                                 "{ rule VignesKooijmanTaylor;  reduction Wilke; }", "{ rule Vignes; }")])
    if rcv != 0 or rcw != 0:
        fails.append(f"(5d) the edge runs failed (exit {rcv}, {rcw})")
    else:
        for name, comp, (i, j) in edges:
            vig = dgw[name]["D_L_effective"]
            for c in (i, j):
                got = dgv[name][f"D_L_effective_{KT_NAMES[c]}"]
                if abs(got / vig - 1.0) > 1e-12:
                    fails.append(f"(5d) edge {name}: D_L_effective_{KT_NAMES[c]} {got} is not the shipped"
                                 f" Vignes value {vig} to 1e-12")
                nr = dgv["n" + name[1:]][f"D_L_effective_{KT_NAMES[c]}"]
                if abs(nr / got - 1.0) > 1e-6:
                    fails.append(f"(5d) edge {name}: at x_k = 1e-9 D_L_effective_{KT_NAMES[c]} {nr} is not"
                                 f" within 1e-6 of the edge value {got}: the route is a switch, not a limit")
    ptx = [("p", {"acetone": 0.2989, "benzene": 0.3490, "carbonTetrachloride": 0.3521},
            ["D_L_effective_acetone", "D_L_effective_benzene", "D_L_effective_carbonTetrachloride",
             "D_L_MS_acetone_benzene", "D_L_MS_acetone_carbonTetrachloride", "D_L_MS_benzene_carbonTetrachloride"])]
    rcp, _, dgp = kt_run(KT, tmp, "kt_perm", ops=kt_ops(ptx, None),
                         edits=[("constant/thermoPhysPropDict",
                                 "components ( acetone benzene carbonTetrachloride );",
                                 "components ( carbonTetrachloride acetone benzene );")])
    if rcp != 0:
        fails.append(f"(5e) the reordered package did not run (exit {rcp})")
    else:
        for key, v in dgp["p"].items():
            if key.startswith(("D_L_effective_", "D_L_MS_")):
                ref = dg["t1"][key]
                if abs(v / ref - 1.0) > 1e-12:
                    fails.append(f"(5e) {key} depends on the order of the components: {v} against {ref}")
    # (5f) the reduction against the book's number, compiled from the header the engine uses.
    probe = Path(tmp) / "wilke_probe.cpp"
    probe.write_text(WILKE_PROBE)
    exe = Path(tmp) / "wilke_probe"
    cp = subprocess.run(["g++", "-std=c++17", "-O1", f"-I{ROOT / 'src'}", str(probe), "-o", str(exe)],
                        capture_output=True, text=True)
    if cp.returncode != 0:
        fails.append("(5f) the Wilke probe did not compile: " + cp.stderr[:200])
    else:
        vals = [float(v) for v in subprocess.run([str(exe)], capture_output=True, text=True).stdout.split()]
        for got, want in zip(vals, TK93_EX611):
            #  the book prints two decimals and 0.6/(0.35/77.0 + 0.25/8.1) = 16.944: its 16.95 is its
            #  own rounding of intermediate terms, so the line is the second decimal.
            if abs(got - want) > 0.01:
                fails.append(f"(5f) Wilke on Taylor & Krishna's Example 6.1.1: {got:.4f}, the book prints {want}")
    # (5g) refusals of the new grammar, each by its words.
    tp = "constant/thermoPhysPropDict"
    one = [("t", {"acetone": 0.3, "benzene": 0.3, "carbonTetrachloride": 0.4}, ["D_L_effective"])]
    arms = [
        ("a ternary without the reduction",
         (None, [(tp, "{ rule VignesKooijmanTaylor;  reduction Wilke; }", "{ rule VignesKooijmanTaylor; }")]),
         "needs the reduction that turns its pair values"),
        ("a reduction other than Wilke",
         (None, [(tp, "reduction Wilke;", "reduction BurghardtKrupiczka;")]), "Accepted"),
        ("a reduction beside a binary rule",
         (None, [(tp, "{ rule VignesKooijmanTaylor;  reduction Wilke; }", "{ rule Vignes; reduction Wilke; }")]),
         "only VignesKooijmanTaylor has a form for three or more"),
        ("an effective value of a ternary with no component named",
         (kt_ops(one, None), []), "has one effective diffusivity PER COMPONENT"),
        ("a pair value under another rule",
         (kt_ops([("t", {"acetone": 0.3, "benzene": 0.3, "carbonTetrachloride": 0.4}, ["D_L_MS_acetone_benzene"])], None),
          [(tp, "{ rule VignesKooijmanTaylor;  reduction Wilke; }", "{ rule Vignes; }")]),
         "Eq. 23"),
        ("a Fick matrix with a component absent",
         (kt_ops([("t", {"acetone": 0.5, "benzene": 0.5}, ["D_L_Fick_acetone_acetone"])], None), []),
         "every component must be present"),
        ("an unknown rule word", (None, [(tp, "rule VignesKooijmanTaylor;", "rule KooijmanTaylor;")]), "Accepted"),
    ]
    for n, (label, (ops, edits), words) in enumerate(arms):
        rc2, out2, _ = kt_run(KT, tmp, f"ktarm{n}", ops=ops, edits=edits)
        if rc2 == 0:
            fails.append(f"(5g) {label}: ran to exit 0")
        elif words not in out2:
            fails.append(f"(5g) {label}: refused, but not by its words ({words!r})")
    # (5h) B2-01: Gamma and the Fick matrix are refused without an activity model (phi-phi package).
    pp = ROOT / "tutorials" / "props" / "molecular" / "ppr78Kij01_ch4_co2_h2"
    for key in ("Gamma_CH4_CH4", "D_L_Fick_CH4_CH4"):
        rcq, outq, _ = kt_run(pp, tmp, "kt_phiphi_" + key[:5],
                              ops=kt_ops([("q", {"CH4": 0.3, "CO2": 0.4, "H2": 0.3}, [key])], None))
        if rcq == 0:
            fails.append(f"(5h) {key} on a phi-phi package ran to exit 0 (it printed the ideal placeholder)")
        elif "this package has none" not in outq:
            fails.append(f"(5h) {key} on a phi-phi package was refused, but not by its words")
    # (5i) B2-02: the gas reduction, by hand from the pair values; a pure gas is refused by name.
    GB = ROOT / "tutorials" / "props" / "transport" / "transport01_gas_bench"
    gops = [("b01", {"N2": 0.5, "O2": 0.5}, ["D_G_effective_N2", "D_G_effective_O2", "diffusivity"]),
            ("b02", {"N2": 0.5, "CO2": 0.5}, ["D_G_effective_N2"]),
            ("b12", {"O2": 0.5, "CO2": 0.5}, ["D_G_effective_O2"]),
            ("t", {"N2": 0.5, "O2": 0.3, "CO2": 0.2}, ["D_G_effective_N2", "D_G_effective_O2", "D_G_effective_CO2"])]
    rcg, outg, dgg = kt_run(GB, tmp, "kt_gas", ops=kt_ops(gops, None))
    if rcg != 0 or not dgg:
        fails.append(f"(5i) the gas bench copy did not run (exit {rcg})")
    else:
        D01, D02, D12 = dgg["b01"]["D_G_effective_N2"], dgg["b02"]["D_G_effective_N2"], dgg["b12"]["D_G_effective_O2"]
        if abs(D01 / dgg["b01"]["diffusivity"] - 1.0) > 1e-12:
            fails.append("(5i) a binary gas's D_G_effective is not the Fuller pair value the `diffusivity` key prints")
        xx = (0.5, 0.3, 0.2)
        pr = {(0, 1): D01, (0, 2): D02, (1, 2): D12}
        for i, n in enumerate(("N2", "O2", "CO2")):
            oth = [j for j in range(3) if j != i]
            hand = sum(xx[j] for j in oth) / sum(xx[j] / pr[tuple(sorted((i, j)))] for j in oth)
            got = dgg["t"].get("D_G_effective_" + n)
            if got is None or abs(got / hand - 1.0) > 1e-11:
                fails.append(f"(5i) D_G_effective_{n} {got} is not Wilke's reduction of the gas pair values {hand}")
    for key, comp, src, label in (("D_G_effective_N2", {"N2": 1.0}, GB, "a pure gas"),
                                  ("D_L_effective_acetone", {"acetone": 1.0}, KT, "a pure liquid")):
        rcz, outz, _ = kt_run(src, tmp, "kt_pure_" + label[-3:], ops=kt_ops([("z", comp, [key])], None))
        if rcz == 0:
            fails.append(f"(5i) {key} of {label} ran to exit 0")
        elif ("no effective mixture diffusivity" not in outz) and ("the liquid is pure" not in outz):
            fails.append(f"(5i) {key} of {label} was refused, but not by its words")
    # (5j) B2-04: the run says which component takes the change and the step.
    if "numbered last, takes every change of mole fraction" not in out or "step 1e-06" not in out \
            or "uses Gamma = 1" not in out:
        fails.append("(5j) the run does not say which component takes the change in Gamma, the step, and that"
                     " the film uses Gamma = 1")
    # (5k) B2-07: a refusal prints the number it reports.
    rck, outk, _ = kt_run(KT, tmp, "kt_x", ops=kt_ops(
        [("x", {"acetone": 0.5, "benzene": 0.4999999, "carbonTetrachloride": 1e-7}, ["Gamma_acetone_acetone"])], None))
    if rck == 0 or "has x = 1e-07" not in outk:
        fails.append(f"(5k) the refusal of x = 1e-7 does not print the number (exit {rck})")
    notes.append("kt")


def main():
    fails, notes = [], []
    with tempfile.TemporaryDirectory(prefix="ldd_") as tmp:
        # ---- (1) the witness ------------------------------------------------
        w = copy(WITNESS, tmp, "w")
        rc, out = run(w, "choupoProps")
        dg = diagnostics(out)
        if rc != 0 or not dg:
            fails.append(f"(1) the witness did not run (exit {rc})")
        else:
            p = dg.get("poling288", {})
            if p.get("D_L_inf_methanol_in_water") != 1.26e-09:
                fails.append(f"(1) poling288: methanol in water {p.get('D_L_inf_methanol_in_water')}"
                             " is not the declared 1.26e-5 cm2/s")
            if p.get("D_L_inf_water_in_methanol") in (None, 1.26e-09):
                fails.append("(1) poling288: water in methanol took the methanol-in-water datum")
            #  EACH RULE BY HAND (review rows DG-06, DG-07): on the methanol-water
            #  binary, where D0(water in methanol) / D0(methanol in water) ~ 2.5,
            #  from the two infinite-dilution values (in the PURE solvents'
            #  viscosities) and the viscosities the same run prints.
            x_m, x_w = 0.9459, 0.0541
            mu_m = dg.get("muMethanol", {}).get("viscosity_liquid")
            mu_w = dg.get("muWater", {}).get("viscosity_liquid")
            for op, rule in (("binaryEffective", "Vignes"), ("cbBinary", "CaldwellBabb"),
                             ("lcBinary", "LefflerCullinan"), ("abBinary", "AndersonBabb")):
                b = dg.get(op, {})
                dmw, dwm, eff, mu = (b.get(k) for k in ("D_L_inf_methanol_in_water",
                                     "D_L_inf_water_in_methanol", "D_L_effective", "viscosity_liquid"))
                if None in (dmw, dwm, eff, mu, mu_m, mu_w):
                    fails.append(f"(1) {op}: a value is missing")
                    continue
                hand = {"Vignes": dwm ** x_m * dmw ** x_w,
                        "CaldwellBabb": x_m * dwm + x_w * dmw,
                        "LefflerCullinan": (dwm * mu_m) ** x_m * (dmw * mu_w) ** x_w / mu,
                        "AndersonBabb": (x_m * dwm * mu_m + x_w * dmw * mu_w) / mu}[rule]
                if abs(eff / hand - 1.0) > 1e-11:
                    fails.append(f"(1) {op}: D_L_effective {eff} is not {rule}'s value by hand {hand}")
            if dg.get("cbBinary", {}).get("D_L_effective") == dg.get("abBinary", {}).get("D_L_effective"):
                fails.append("(1) CaldwellBabb and AndersonBabb give the same number: the witness cannot"
                             " tell the two rules apart")
            #  THE ASSOCIATION FACTOR TAKEN BY DEFAULT, by value AND by its words
            #  (review row DG-06 item 3): D0(methanol in 2-propanol) is Wilke-Chang
            #  with phi = 1.0 exactly, and the view says so.
            mu_i = dg.get("muIsopropanol", {}).get("viscosity_liquid")
            d_mi = dg.get("topDinf", {}).get("D_L_inf_methanol_in_isopropanol")
            if None in (mu_i, d_mi):
                fails.append("(1) the 2-propanol values are missing")
            else:
                hand = wilke_chang("methanol", "isopropanol", 328.62, mu_i, 1.0)
                if abs(d_mi / hand - 1.0) > 1e-10:
                    fails.append(f"(1) D0(methanol in 2-propanol) {d_mi} is not Wilke-Chang with phi 1.0"
                                 f" by hand ({hand}): the default association factor moved")
            #  V_A AT THE NORMAL BOILING POINT (slice d2, review row DF-03): all six
            #  D0 at the witness's top state are Poling's Eq. 11-9.1 by hand with V_A from
            #  the record's Tb, to the printed digits; and the SAME hand with V_A taken at
            #  298 K must DISAGREE with the engine by more than 1 % on every pair, so a
            #  check that could not tell the two volumes apart fails here.
            mus = {"methanol": dg.get("muMethanol", {}).get("viscosity_liquid"),
                   "water": dg.get("muWater", {}).get("viscosity_liquid"),
                   "isopropanol": mu_i}
            for sol in ("methanol", "isopropanol", "water"):
                for solv in ("methanol", "isopropanol", "water"):
                    if sol == solv or (sol == "water"):
                        continue          # water as the solute is an entry the case names
                    key = f"D_L_inf_{sol}_in_{solv}"
                    got = dg.get("topDinf", {}).get(key)
                    try:
                        phi = record_number(solv, "associationFactor")
                    except AttributeError:
                        phi = 1.0
                    if got is None or mus[solv] is None:
                        fails.append(f"(1) {key}: the value or the solvent viscosity is missing")
                        continue
                    hand = wilke_chang(sol, solv, 328.62, mus[solv], phi)
                    if abs(got / hand - 1.0) > 1e-5:
                        fails.append(f"(1) {key} {got} is not Wilke-Chang with V_A at Tb by hand ({hand})")
                    sab = wilke_chang(sol, solv, 328.62, mus[solv], phi, at_tb=False)
                    if abs(got / sab - 1.0) < 1e-2:
                        fails.append(f"(1) {key}: V_A at 298 K gives {sab}, within 1 % of the engine {got}:"
                                     " the check cannot tell the boiling-point volume from the 25 C one")
            for sol in ("methanol", "isopropanol", "water"):
                if f"{sol} as a solute: V_A" not in out or "at its normal boiling point" not in out:
                    fails.append(f"(1) the view does not print {sol}'s V_A at its normal boiling point")
            for rec in ASSOCIATION_FACTOR_DEFAULTED:
                text = (ROOT / "data" / "standards" / "components" / f"{rec}.dat").read_text()
                if re.search(r"^\s*associationFactor\s", text, re.M):
                    fails.append(f"(1) PAID: {rec}.dat now writes associationFactor -- remove it from"
                                 " debt_registry.ASSOCIATION_FACTOR_DEFAULTED in this commit")
                elif f"{rec} as a solvent: associationFactor default 1.0, not in the record" not in out \
                        and rec in ("isopropanol",):
                    fails.append(f"(1) the view does not say {rec}'s association factor is the default")
            #  WATER AS THE SOLUTE (review row DF-01): named for the pair, marked.
            if out.count("OUTSIDE THE METHOD'S STATED SCOPE") < 2:
                fails.append("(1) the view does not mark the two water-solute pairs outside the"
                             " method's stated scope")
            notes.append("witness")

        # ---- (1b) an inline entry, and a `use check` viscosity --------------
        d = copy(WITNESS, tmp, "inline")
        edit(d / "constant/thermoPhysPropDict", "experiments methanolInWater288; }",
             'value 1.26e-5 cm2/s;  T 288 K;  box { T (288 288); }  source "Poling 5th ed. Table 11-5"; }')
        rc, out = run(d, "choupoProps")
        v = diagnostics(out).get("poling288", {}).get("D_L_inf_methanol_in_water")
        if rc != 0 or v is None or abs(v / 1.26e-9 - 1.0) > 1e-14:
            fails.append(f"(1b) an inline constant entry: exit {rc}, value {v} (expected 1.26e-9 m2/s)")
        else:
            notes.append("inline entry")
        d = copy(WITNESS, tmp, "check")
        edit(d / "constant/thermoPhysPropDict", "viscosity   { }",
             'viscosity   { measured { muCheck { use check; reason "a probe"; } } }')
        (d / "constant/experiments/muCheck.dat").write_text(
            'provenance { citation "a probe of this gate"; basis "a probe value"; }\n'
            "property liquidViscosity;\nsystem ( methanol isopropanol water );\nsolvent water;\n"
            "columns ( { name mu; unit mPa.s; } );\ndata ( 0.5 );\n"
            "box { T ( 280 400 ); w[methanol] ( 0 1 ); w[isopropanol] ( 0 1 ); }\n")
        edit(d / "system/propsDict", "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol );",
             "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol  viscosity_liquid );")
        rc, out = run(d, "choupoProps")
        mu = diagnostics(out).get("topDinf", {}).get("viscosity_liquid")
        if rc != 0 or "[liquid viscosity] stated value muCheck (a probe value) 0.0005 Pa s beside the computed" \
                not in out or mu is None or abs(mu - 5e-4) < 1e-12:
            fails.append(f"(1b) a `use check` stated value: exit {rc}, the comparison line "
                         f"{'printed' if 'muCheck' in out else 'NOT printed'}, value {mu}"
                         " (a check is never used)")
        else:
            notes.append("use check")

        # ---- (2) refusals of the grammar -----------------------------------
        tp = "constant/thermoPhysPropDict"
        ex = "constant/experiments/methanolInWater288.dat"
        pd = "system/propsDict"
        STATED = ("provenance { citation \"a probe of this gate\"; basis \"a probe value\"; }\n"
                  "property liquidViscosity;\n")
        def stated_file(d, name, system, solvent, cols, data, box):
            (d / f"constant/experiments/{name}.dat").write_text(
                STATED + f"system ( {system} );\n" + (f"solvent {solvent};\n" if solvent else "")
                + f"columns ( {cols} );\ndata ( {data} );\nbox {{ {box} }}\n")
        arms = [
            ("an effective value of three components",
             [(pd, "composition { methanol 0.9459;  water 0.0541; } }\n        properties  ( D_L_inf_methanol_in_water  D_L_inf_water_in_methanol  D_L_effective  viscosity_liquid );\n    }\n    {\n        name        cbBinary;",
                   "composition { methanol 0.8;  isopropanol 0.1;  water 0.1; } }\n        properties  ( D_L_effective );\n    }\n    {\n        name        cbBinary;")],
             "a liquid of 3 components"),
            ("VignesKooijmanTaylor on a three-component package without its reduction",
             [(tp, "{ rule Vignes; }", "{ rule VignesKooijmanTaylor; }")],
             "needs the reduction that turns its pair values"),
            ("a reduction beside a binary rule (C329 B2a)",
             [(tp, "{ rule Vignes; }", "{ rule Vignes; reduction Wilke; }")],
             "only VignesKooijmanTaylor has a form for three or more"),
            ("a reduction that is not built (C329 B2a)",
             [(tp, "{ rule Vignes; }", "{ rule VignesKooijmanTaylor; reduction BurghardtKrupiczka; }")],
             "not built"),
            ("another rule on three components present (C329 B2a)",
             [(pd, "composition { methanol 0.9459;  water 0.0541; } }\n        properties  ( D_L_inf_methanol_in_water  D_L_inf_water_in_methanol  D_L_effective  viscosity_liquid );\n    }\n    {\n        name        cbBinary;",
                   "composition { methanol 0.8;  isopropanol 0.1;  water 0.1; } }\n        properties  ( D_L_effective_methanol );\n    }\n    {\n        name        cbBinary;")],
             "no multicomponent form of it has been read"),
            ("a file cited in the other direction",
             [(ex, "solute      methanol;\nsolvent     water;", "solute      water;\nsolvent     methanol;")],
             "The direction of an infinite-dilution value is part of the datum"),
            ("a file of two points", [(ex, "data        ( 288 1.26e-5 );", "data        ( 288 1.26e-5  298 1.6e-5 );")],
             "a law of type `table`"),
            ("kind fick", [(tp, "solvent water;  kind infiniteDilution;\n                              experiments",
                                "solvent water;  kind fick;\n                              experiments")],
             "no consumer reads a datum of that kind"),
            ("an entry with no kind", [(tp, "solvent water;  kind infiniteDilution;\n                              experiments",
                                            "solvent water;\n                              experiments")],
             "the entry names no `kind`"),
            ("a thermodynamic factor from the activity model",
             [(tp, "{ rule Vignes; }\n                    infiniteDilution", "{ rule Vignes; }\n                    infiniteDilution"),
              (tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                   "                    thermodynamicFactor { from equilibrium.liquid; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "the liquid film takes the thermodynamic factor as 1"),
            ("`take 2`", [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                               "                    thermodynamicFactor { take 2; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "write `take 1;`"),
            ("`take 0`", [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                               "                    thermodynamicFactor { take 0; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "write `take 1;`"),
            ("`take x`", [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                               "                    thermodynamicFactor { take x; }\n                }\n            }\n        }\n    }\n    cbBinary")],
             "take"),
            ("returns effective without the factor",
             [(tp, "                    thermodynamicFactor { take 1; }\n                }\n            }\n        }\n    }\n    cbBinary",
                   "                }\n            }\n        }\n    }\n    cbBinary")],
             "needs the thermodynamic factor"),
            ("an entry used outside its box",
             [(pd, "{ T 288 K;  P 1 bar;", "{ T 290 K;  P 1 bar;")],
             "is outside the box"),
            ("a column without a unit", [(ex, "{ name D; unit cm2/s; }", "{ name D; }")],
             "declares no unit"),
            ("the default Wilke-Chang with water as the solute (DF-01)",
             [(tp, "                    { solute water;  solvent methanol;  kind infiniteDilution;  model WilkeChang;\n"
                   "                      reason \"taken outside its stated scope, measured against: Lee & Li (1991), as Poling 5th ed. p. 11.38 reports it, give 2.67e-5 cm2/s at 313.13 K, and Wilke-Chang is +156 % there (variant leeLi313 prints both)\"; }\n", "")],
             "The method should not be used when water is the solute"),
            ("a solute with no normal boiling point (slice d2): no silent 25 C volume",
             #  C413: a case-local record is read OVER the catalogue's (its keys replace, a deleted key is
             #  backfilled), so "no boiling point" is `Tb 0;` -- the value the loader reads for an absent one
             [("constant/components/methanol.dat", "Tb          337.85;\n", "Tb          0;\n")],
             "has no normal boiling point"),
            ("a solute whose Tb lies above its Tc has no liquid density there (slice d2, VB-06)",
             [("constant/components/isopropanol.dat", "Tb          355.39;", "Tb          600.0;")],
             "has no liquid density at its normal boiling point"),
            ("an unlisted pair names the slice's grammar (DG-05)",
             [(tp, "                default { model WilkeChang; }\n                entries\n                (\n                    { solute water;",
                   "                entries\n                (\n                    { solute water;")],
             "infiniteDilution { default { model WilkeChang; } entries ("),
        ]
        #  The stated mixture viscosity's refusals (DG-02, DG-03, DG-04).
        stated_arms = [
            ("a stated value applied to a liquid holding another component (DG-02)",
             "muS { use method; reason \"a probe\"; }",
             lambda d: stated_file(d, "muS", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.5",
                                   "T ( 280 400 ); w[methanol] ( 0 1 );"),
             "also holds isopropanol"),
            ("a one-component stated value (DG-03)",
             "muS { use method; reason \"a probe\"; }",
             lambda d: stated_file(d, "muS", "methanol", None, "{ name mu; unit mPa.s; }", "0.5", "T ( 280 400 );"),
             "names ONE component"),
            ("`use check` beside `use method` on one set (DG-04)",
             "muS { use method; reason \"a probe\"; } muC { use check; reason \"a probe\"; }",
             lambda d: (stated_file(d, "muS", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.5",
                                    "T ( 280 400 ); w[methanol] ( 0 1 );"),
                        stated_file(d, "muC", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.6",
                                    "T ( 280 400 ); w[methanol] ( 0 1 );")),
             "on the same set"),
            ("a stated value with no basis (DF-04)",
             "muS { use method; reason \"a probe\"; }",
             lambda d: (d / "constant/experiments/muS.dat").write_text(
                 "provenance { citation \"a probe\"; }\nproperty liquidViscosity;\nsystem ( methanol water );\n"
                 "solvent water;\ncolumns ( { name mu; unit mPa.s; } );\ndata ( 0.5 );\n"
                 "box { T ( 280 400 ); w[methanol] ( 0 1 ); }\n"),
             "states no `basis"),
        ]
        k = 0
        for label, edits, words in arms:
            k += 1
            d = copy(WITNESS, tmp, f"a{k}")
            for f, old, new in edits:
                if old != new:
                    edit(d / f, old, new)
            rc, out = run(d, "choupoProps")
            if rc == 0:
                fails.append(f"(2) {label}: ran to exit 0")
            elif words not in out:
                fails.append(f"(2) {label}: refused, but not by its words ({words!r})")
            else:
                notes.append(label)
        for label, decl, files, words in stated_arms:
            k += 1
            d = copy(WITNESS, tmp, f"s{k}")
            edit(d / tp, "viscosity   { }", "viscosity   { measured { " + decl + " } }")
            files(d)
            #  The ternary state topDinf holds isopropanol beside the stated set.
            edit(d / pd, "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol );",
                 "D_L_inf_isopropanol_in_water     D_L_inf_water_in_isopropanol  viscosity_liquid );")
            rc, out = run(d, "choupoProps")
            if rc == 0:
                fails.append(f"(2) {label}: ran to exit 0")
            elif words not in out:
                fails.append(f"(2) {label}: refused, but not by its words ({words!r})")
            else:
                notes.append(label)

        # ---- (3) the column --------------------------------------------------
        col = [
            ("liquidViscosity typed back in packing {}",
             [("system/flowsheetDict", "                segments          100;",
               "                liquidViscosity   3.91e-4;\n                segments          100;")],
             "transport { liquid { viscosity { measured"),
            ("sigma typed two blocks deep (DG-01)",
             [("system/flowsheetDict", "                segments          100;",
               "                segments          100;\n                probe { inner { sigma 0.02; } }")],
             "`sigma` typed in `operation.packing.probe.inner`"),
            ("no liquid diffusivity declared",
             [(tp, "            returns             effective;", "            returns             infiniteDilution;"),
              (tp, "            composition         { rule AndersonBabb; }\n", ""),
              (tp, "            thermodynamicFactor { take 1; }\n", "")],
             "the liquid film needs the effective liquid diffusivity"),
            ("a stated viscosity box that misses the bed",
             [("constant/experiments/schulz2018_0p10bar_liquidViscosity.dat",
               "T           ( 320 370 );", "T           ( 345 347.5 );")],
             "is outside the box the case declared for its stated value"),
        ]
        for label, edits, words in col:
            d = copy(RATE, tmp, "c" + re.sub(r"\W", "", label)[:24])
            (d / "system" / "outerDict").unlink(missing_ok=True)
            for f, old, new in edits:
                edit(d / f, old, new)
            rc, out = run(d, "choupoSolve")
            if rc == 0:
                fails.append(f"(3) {label}: ran to exit 0")
            elif words not in out:
                fails.append(f"(3) {label}: refused, but not by its words ({words!r}); last: "
                             + (out.strip().splitlines() or [""])[-1][:200])
            else:
                notes.append(label)

        # ---- (3a) the old form is refused by name, with the line to write
        #      (DEV.md 4c C402: no legacy reader once no shipped case uses it)
        d = copy(WITNESS, tmp, "oldform")
        t = (d / tp).read_text()
        i = t.index("        diffusivity\n        {")
        j, depth = t.index("{", i) + 1, 1
        while depth:
            depth += {"{": 1, "}": -1}.get(t[j], 0)
            j += 1
        (d / tp).write_text(t[:i] + "        diffusivity { model WilkeChang; }" + t[j:])
        rc, out = run(d, "choupoProps")
        line = "returns infiniteDilution; infiniteDilution { default { model WilkeChang; } } }"
        if rc == 0 or "is no longer read" not in out or line not in out:
            fails.append(f"(3a) the old `diffusivity {{ model WilkeChang; }}` form: exit {rc},"
                         f" {'refused' if rc else 'NOT refused'}"
                         f"{'' if line in out else ', without the line to write'}")
        else:
            notes.append("the old form refused by name")

        # ---- (3e) a sector's file is read from the sector's constant/, never
        #      the root's (slice (c)'s TG-02, held for this slice's entries) ---
        d = copy(SECTORS, tmp, "sector")
        for mf in (d / "constant/propertyManifest", d / "sectors/A/constant/propertyManifest",
                   d / "sectors/B/constant/propertyManifest"):   # the temporary copy's three seals
            mf.write_text(mf.read_text().replace("sealed             true;", "sealed             false;"))
        edit(d / tp, "components ( water );", "components ( water methanol );")
        edit(d / "sectors/A" / tp, "    liquid\n    {\n",
             "    liquid\n    {\n        diffusivity\n        {\n            returns infiniteDilution;\n"
             "            infiniteDilution\n            {\n                default { model WilkeChang; }\n"
             "                entries ( { solute methanol; solvent water; kind infiniteDilution;"
             " experiments methanolInWater288; } );\n            }\n        }\n")
        datum = WITNESS / "constant/experiments/methanolInWater288.dat"
        shutil.copy(datum, d / "sectors/A/constant/experiments" / datum.name)
        rc1, out1 = run(d, "choupoSolve")
        (d / "sectors/A/constant/experiments" / datum.name).rename(d / "constant/experiments" / datum.name)
        rc2, out2 = run(d, "choupoSolve")
        if rc1 != 0 or "methanol in water (kind infiniteDilution): 1.26e-09" not in out1:
            fails.append(f"(3e) a sector's diffusivity entry with its file in the sector: exit {rc1}, not read")
        elif rc2 == 0 or "no file sectors/A/constant/experiments/methanolInWater288.dat" not in out2:
            fails.append(f"(3e) the sector's file moved to the root: exit {rc2}, "
                         f"{'read from the root' if rc2 == 0 else 'refused, but not naming the sector path'}")
        else:
            notes.append("a sector's file from the sector, never the root")
        d = copy(WITNESS, tmp, "writtenDir")
        edit(d / tp, "experiments methanolInWater288;", "experiments methanolInWater288;  experimentsDir \"x\";")
        rc, out = run(d, "choupoProps")
        if rc == 0 or "is not a word a dictionary writes" not in out:
            fails.append(f"(3e) a hand-written experimentsDir: exit {rc}, not refused by name")
        else:
            notes.append("a hand-written experimentsDir refused")

        # ---- (3b) a stated mixture value and its constituents (DG-11) -----
        def stated_probe(name, box_w, ops_edit=None):
            d = copy(WITNESS, tmp, name)
            edit(d / tp, "viscosity   { }",
                 'viscosity   { measured { muS { use method; reason "a probe"; } } }')
            stated_file(d, "muS", "methanol water", "water", "{ name mu; unit mPa.s; }", "0.5",
                        f"T ( 280 400 ); w[methanol] ( {box_w} );")
            if ops_edit:
                ops_edit(d)
            return d
        d = stated_probe("dg11pure", "0 1")
        rc, out = run(d, "choupoProps")
        mu_pure = diagnostics(out).get("muMethanol", {}).get("viscosity_liquid")
        mu_law = dg.get("muMethanol", {}).get("viscosity_liquid") if dg else None
        if rc != 0 or mu_pure is None or mu_pure != mu_law \
                or "does not describe pure methanol; its record law is used" not in out:
            fails.append(f"(3b) a pure constituent of a stated binary: exit {rc}, viscosity {mu_pure}"
                         f" (its record law gives {mu_law}), the announcement "
                         f"{'printed' if 'does not describe pure methanol' in out else 'NOT printed'}")
        else:
            notes.append("pure constituent by its law")
        d = stated_probe("dg11box", "0.98 1")
        rc, out = run(d, "choupoProps")
        if rc == 0 or "is outside the box the case declared for its stated value" not in out:
            fails.append(f"(3b) a binary of the stated set outside its box: exit {rc}, not refused by its words")
        else:
            notes.append("binary outside the box")
        #  (the superset -- a liquid holding another component -- is arm (2)'s DG-02)

        # ---- (3c) Leffler-Cullinan where it is NOT Vignes (DG-12) ----------
        d = copy(WITNESS, tmp, "dg12lc")
        edit(d / tp, "viscosity   { }",
             'viscosity   { interaction ( { i methanol; j water; A 1.0; Tmin 300; Tmax 350;'
             ' source "a probe of this gate, not a datum"; } ); }')
        rc, out = run(d, "choupoProps")
        g = diagnostics(out)
        b, v = g.get("lcBinary", {}), g.get("binaryEffective", {})
        mu_m2 = g.get("muMethanol", {}).get("viscosity_liquid")
        mu_w2 = g.get("muWater", {}).get("viscosity_liquid")
        try:
            dmw, dwm, eff, mu = (b[k] for k in ("D_L_inf_methanol_in_water", "D_L_inf_water_in_methanol",
                                               "D_L_effective", "viscosity_liquid"))
            hand = (dwm * mu_m2) ** 0.9459 * (dmw * mu_w2) ** 0.0541 / mu
            vig = v["D_L_effective"]
            if rc != 0 or abs(eff / hand - 1.0) > 1e-11 or abs(eff / vig - 1.0) < 1e-3:
                fails.append(f"(3c) Leffler-Cullinan {eff} against its hand value {hand} (and Vignes {vig},"
                             " which it must NOT equal here)")
            else:
                notes.append(f"Leffler-Cullinan off Vignes by {100 * (eff / vig - 1):+.2f} %")
        except (KeyError, TypeError):
            fails.append(f"(3c) the Leffler-Cullinan probe did not run (exit {rc})")

        # ---- (3d) the column's surface tension: one per tray, and the
        #      supercritical left-out rule (DG-13) -----------------------------
        d = copy(TRAYS, tmp, "dg13")
        (d / "system" / "outerDict").unlink(missing_ok=True)
        #  cyclohexane's Tc moved to 360 K in this temporary copy only, so the
        #  trays (321.9-330 K) sit between 0.9 Tc and Tc: nothing is above Tc.
        rec = case_records.ensure_local(d, "components/cyclohexane.dat")
        case_records.unpin(d)
        rec.write_text(re.sub(r"(?m)^Tc\s+[0-9.eE+-]+;", "Tc          360.0;", rec.read_text()))
        Tc = {"cyclohexane": 360.0,
              "nHeptane": record_number_at(case_records.record_path(d, "components/nHeptane.dat"), "Tc")}
        rc, out = run(d, "choupoSolve")
        prof = profile_of(out) if rc == 0 else None
        cols = (prof or {}).get("columns", prof or {})
        if not cols or "sigma" not in cols or "sigma_efficiency" not in cols:
            fails.append(f"(3d) the tray probe (exit {rc}) publishes no per-tray surface tension")
        else:
            bad = []
            for k, T in enumerate(cols["T"]):
                s_h, s_e = cols["sigma"][k], cols["sigma_efficiency"][k]
                if s_h > 0.0 and s_e > 0.0 and abs(s_e / s_h - 1.0) > 1e-9:
                    bad.append(f"tray {k + 1}: efficiency {s_e} vs hydraulics {s_h}")
                if s_h > 0.0:
                    hand = sum(cols[f"x_{c}"][k] for c in Tc if T >= Tc[c])
                    if abs(cols["sigma_unpricedFraction"][k] - hand) > 1e-12:
                        bad.append(f"tray {k + 1} at {T:.2f} K: left out {cols['sigma_unpricedFraction'][k]},"
                                   f" by the rule (T >= Tc) {hand}")
            if bad:
                fails.append("(3d) " + "; ".join(bad[:3]))
            else:
                notes.append("one surface tension per tray; left out only above Tc")

        # ---- (5) C329 slice B2a: the multicomponent liquid diffusivity ----------
        kt_section(tmp, fails, notes)

        # ---- (4) RULING 7: the column and a property operation, one state ---
        d = copy(RATE, tmp, "r7col")
        (d / "system" / "outerDict").unlink(missing_ok=True)
        rc, out = run(d, "choupoSolve")
        prof = profile_of(out) if rc == 0 else None
        if not prof or "D_L" not in prof.get("columns", prof):
            fails.append(f"(4) ratebased01 (exit {rc}) publishes no D_L / mu_L in its profile")
        else:
            cols = prof.get("columns", prof)
            k50 = len(cols["D_L"]) // 2
            T, P = cols["liquidFilm_T"][k50], cols["liquidFilm_P"][k50]
            x = cols["liquidFilm_x_pXylene"][k50]
            p = copy(RATE, tmp, "r7props")
            (p / "system" / "flowsheetDict").unlink()
            (p / "system" / "outerDict").unlink(missing_ok=True)
            cd = (p / "system" / "controlDict").read_text()
            (p / "system" / "controlDict").write_text(re.sub(r"application\s+\w+;", "application   choupoProps;", cd))
            (p / "system" / "propsDict").write_text(
                "operations\n(\n    {\n        name        film;\n        type        propertyPoint;\n"
                f"        state       {{ T {T!r} K;  P {P!r} Pa;  composition {{ pXylene {x!r};  oXylene {1.0 - x!r}; }} }}\n"
                "        properties  ( D_L_effective  viscosity_liquid );\n    }\n);\n")
            rc2, out2 = run(p, "choupoProps")
            fd = diagnostics(out2).get("film", {})
            for key, col in (("D_L_effective", "D_L"), ("viscosity_liquid", "mu_L")):
                got, want = fd.get(key), cols[col][k50]
                if rc2 != 0 or got is None or abs(got / want - 1.0) > 1e-10:
                    fails.append(f"(4) ruling 7: the column's {col} at segment {k50} ({want}) and a"
                                 f" property operation at its state ({got}, exit {rc2}) differ")
            notes.append("ruling 7")

    if fails:
        print(f"{NAME}: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print(f"{NAME}: OK -- the witness returns its declared entry exactly (from a file and inline);"
          f" each of the four rules equals its value by hand to 1e-11 on a binary whose two"
          f" infinite-dilution values differ 2.5-fold; the default association factor holds by value"
          f" and by its words; the column's liquid film and a property operation at its state agree to"
          f" 1e-10 (ruling 7); a `use check` stated viscosity is printed and not used;"
          f" a stated mixture value leaves a pure constituent to its law; Leffler-Cullinan by hand where it"
          f" differs from Vignes; one surface tension per tray, left out only at or above Tc; a sector's file read from the sector's constant/, never the root's;"
          f" {len(notes) - 10} refusals each by name, the old `diffusivity {{ model <word>; }}` form among them.  NOT CHECKED: the migrated cases' numbers (their"
          f" goldens and the byte-identity run), Wilke-Chang's fitness for a pair, Brock-Bird's"
          f" fitness for a polar liquid (announced, not judged).  C329 B2a: Kooijman & Taylor's Eq. 23 and"
          f" Wilke's reduction by hand to 1e-11, the Fick matrix within 1e-4 of the paper's Table IV"
          f" eq 23 row and Gamma the book's Example 4.2.6 to every digit (tau_21 of the book's p. 61; the paper's"
          f" printed value pinned 0.002 away), the books' misprint"
          f" measured (0.0974, pairs evaluated i<j; 0.1002 with the printed tau_21), the binary edge equal to Vignes to 1e-12 and the ternary its"
          f" limit, order-independence, Example 6.1.1's 50.99 and 16.95 mm2/s, seven refusals by name, Gamma and the Fick matrix refused on a phi-phi package, the gas reduction by hand"
          f" and a pure gas or liquid refused, and the run saying which component takes the change.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
