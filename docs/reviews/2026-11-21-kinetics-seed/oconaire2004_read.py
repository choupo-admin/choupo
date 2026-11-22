#!/usr/bin/env python3
"""O Conaire et al. 2004 Table I, read from the journal PDF page image (journal p. 607).
Writes oconaire2004_table.tsv and prints the comparison used in the README.
Run from the repository root:  python3 docs/reviews/2026-11-21-kinetics-seed/oconaire2004_read.py
Values are typed exactly as printed (A as printed mantissa x 10^exp; n; Ea kcal/mol)."""
import math, re, os
D = os.path.dirname(os.path.abspath(__file__))
CASE = os.path.join(D, "../../../tutorials/batch/combustion/ignition01_h2o2/constant/reactions")
R = 1.98720

# (row, paper_no, line, equation, A, n, Ea, ref, efficiencies, notes)
T = [
 ("1","1","1","H + O2 = O + OH","1.91e14","0.00","16.44","[39]","",""),
 ("2","2","1","O + H2 = H + OH","5.08e4","2.67","6.292","[40]","",""),
 ("3","3","1","OH + H2 = H + H2O","2.16e8","1.51","3.43","[41]","",""),
 ("4","4","1","O + H2O = OH + OH","2.97e6","2.02","13.4","[42]","",""),
 ("5","5","1","H2 + M = H + H + M","4.57e19","-1.40","105.1","[43]","H2O 12.0; H2 2.5 (fn a)",""),
 ("6","6","1","O + O + M = O2 + M","6.17e15","-0.50","0.00","[43]","H2O 12; H2 2.5; Ar 0.83; He 0.83 (fn b)",""),
 ("7","7","1","O + H + M = OH + M","4.72e18","-1.00","0.00","[43]","H2O 12; H2 2.5; Ar 0.75; He 0.75 (fn c)",""),
 ("8","8","1","H + OH + M = H2O + M","4.50e22","-2.00","0.00","[43] x2.0","H2O 12; H2 0.73; Ar 0.38; He 0.38 (fn e)","fn d: original A multiplied by 2 here"),
 ("9L","9","1","H + O2 + M = HO2 + M (low-pressure limit k0)","3.48e16","-0.41","-1.12","[44]","H2 1.3; H2O 14; Ar 0.67; He 0.67 (fn g)","Troe (fn f): a=0.5, T***=1.0e-30 (printed '1.0 x -30'), T*=1.0e+30, T**=1.0e+100"),
 ("9H","9","2","H + O2 = HO2 (high-pressure limit kinf)","1.48e12","0.60","0.00","[45]","",""),
 ("10","10","1","HO2 + H = H2 + O2","1.66e13","0.00","0.82","[6]","",""),
 ("11","11","1","HO2 + H = OH + OH","7.08e13","0.00","0.30","[6]","",""),
 ("12","12","1","HO2 + O = OH + O2","3.25e13","0.00","0.00","[46]","",""),
 ("13","13","1","HO2 + OH = H2O + O2","2.89e13","0.00","-0.50","[46]","",""),
 ("14a","14","1","HO2 + HO2 = H2O2 + O2 (term 1 of sum, fn h)","4.2e14","0.00","11.98","[47]","",""),
 ("14b","14","2","HO2 + HO2 = H2O2 + O2 (term 2 of sum, fn h)","1.3e11","0.00","-1.629","[47]","",""),
 ("15L","15","1","H2O2 + M = OH + OH + M (low-pressure limit k0)","1.27e17","0.00","45.5","[48]","H2O 12; H2 2.5; Ar 0.45; He 0.45 (fn i)","Troe (fn f): a=0.5, T***=1.0e-30 (printed '1.0x-30'), T*=1.0e+30; no T** printed"),
 ("15H","15","2","H2O2 = OH + OH (high-pressure limit kinf)","2.95e14","0.00","48.4","[49]","",""),
 ("16","16","1","H2O2 + H = H2O + OH","2.41e13","0.00","3.97","[43]","",""),
 ("17","17","1","H2O2 + H = H2 + HO2","6.03e13","0.00","7.95","[43] x1.25","",""),
 ("18","18","1","H2O2 + O = OH + HO2","9.55e6","2.00","3.97","[43]","",""),
 ("19a","19","1","H2O2 + OH = H2O + HO2 (term 1 of sum, fn h)","1.0e12","0.00","0.00","[50]","",""),
 ("19b","19","2","H2O2 + OH = H2O + HO2 (term 2 of sum, fn h)","5.8e14","0.00","9.56","[50]","",""),
]


def k(A, n, Ea, Tk):
    return float(A) * Tk ** float(n) * math.exp(-float(Ea) * 1000 / (R * Tk))


with open(os.path.join(D, "oconaire2004_table.tsv"), "w") as f:
    f.write("# O Conaire, Curran, Simmie, Pitz & Westbrook, Int. J. Chem. Kinet. 36 (2004) 603-622, doi 10.1002/kin.20036; journal PDF, Table I 'Revised H2/O2 Reaction Mechanism', journal page 607 (PDF page 5 of 20), read from the page image.\n")
    f.write("# Units as printed in the Table I caption: cm3, mol, s, kcal, K.  k = A T^n exp(-Ea/(R T)); bimolecular A in cm3 mol-1 s-1, termolecular A in cm6 mol-2 s-1, unimolecular A in s-1; Ea in kcal/mol.  Rows 9L/9H and 15L/15H: low- and high-pressure limit lines of a Troe fall-off; 14a/14b and 19a/19b: summed pairs (footnote h).\n")
    f.write("row\tpaper_reaction_no\tline_in_entry\tequation_as_printed\tA_as_printed\tn_as_printed\tEa_kcal_mol_as_printed\tref_as_printed\tthird_body_efficiencies\tfootnote_notes\ttable\tpage\n")
    for r in T:
        f.write("\t".join(r) + "\tTable I\tp. 607\n")

txt = open(CASE).read()
blocks = re.findall(r'^(R\d+[ab]?)_\w+\s*\n\{(.*?)\n\}(?:\n|$)', txt, re.S | re.M)
case = {}
for name, b in blocks:
    kin = b[b.index("kinetics"):]
    m = re.search(r'low\s*\{\s*A\s*([\d.eE+-]+);\s*b\s*([\d.eE+-]+);\s*Ea\s*([\d.eE+-]+)', kin)
    top = re.search(r'\n\s*A\s*([\d.eE+-]+);\s*b\s*([\d.eE+-]+);\s*Ea\s*([\d.eE+-]+)', kin)
    tb = re.search(r'thirdBody\s*\{([^}]*)\}', kin)
    troe = re.search(r'troe\s*\(([^)]*)\)', kin)
    e = {"type": re.search(r'type\s+(\w+)', kin).group(1), "top": top.groups(),
         "tb": tb.group(1).strip() if tb else "", "troe": troe.group(1).strip() if troe else ""}
    if m:
        e["low"] = m.groups()
    case[name[1:]] = e

print("## case vs paper: k_case/k_paper")
print("row | case (A,b,Ea) | paper (A,n,Ea) | 1000 K | 2000 K | flag")
for r in T:
    i, _, _, eq, A, n, Ea = r[:7]
    c = case[i[:-1] if i[-1] in "LH" else i]
    pa = c["low"] if i in ("9L", "15L") else c["top"]
    res = [k(*pa, Tk) / k(A, n, Ea, Tk) for Tk in (1000., 2000.)]
    flag = "" if all(abs(x - 1) <= 1e-3 for x in res) else "OUT"
    print(f"{i} | {pa} | {A} {n} {Ea} | {res[0]:.6f} | {res[1]:.6f} | {flag}")
print("## efficiencies / troe in case")
for key, c in case.items():
    print(key, c["type"], c["tb"], c["troe"])

print("## baulch OC_ columns")
rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(D, "baulch2005_HO.tsv")) if not l.startswith("#")]
h = rows[0]
for l in rows[1:]:
    d = dict(zip(h, l))
    if not d["OC_rxn"]:
        continue
    print(d["id"], d["reaction_as_in_Baulch"][:34], "| OC", d["OC_rxn"], d["OC_A_cm3_mol_s"], d["OC_n"], d["OC_Ea_kcal_mol"], "| mode", d["OC_comparison_mode"], "| B/OC 1000,2000:", d["ratio_B_over_OC_1000K"], d["ratio_B_over_OC_2000K"], "| in range", d["Baulch_in_range_1000K"], d["Baulch_in_range_2000K"])
