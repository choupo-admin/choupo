# Baulch 2005 H/O staging table (kinetics seed)

A STAGING table, not catalogue records.  It lists every reaction among H, H2, O, O2,
OH, HO2, H2O, H2O2 that Baulch et al., "Evaluated kinetic data for combustion modeling:
Supplement II", J. Phys. Chem. Ref. Data 34, 757-1397 (2005), doi 10.1063/1.1748524,
evaluates, with the "Preferred Values" of each data sheet, and the matching reaction of
O Conaire et al., Int. J. Chem. Kinet. 36, 603 (2004), doi 10.1002/kin.20036, Table 1.
Values are cited value by value; no prose or figure is copied.

Files: `baulch2005_HO.tsv` (generated), `baulch_oconaire_convert.py` (the single source
of the typed values and the conversion: `python3 baulch_oconaire_convert.py > baulch2005_HO.tsv`).

## How it was read

* Baulch: the NIST free reprint (641 pp.).  Page numbers in the TSV are the JOURNAL pages
  (PDF page + 756).  Summary Table 4.1 (pp. 777, 780, 783, 785), Table 4.2 (p. 797, 798)
  and the falloff data sheets (pp. 900, 905, 909, 913, 918, 1035-1037) were read from
  rendered page images.  The bimolecular "Preferred Values" blocks were taken from text
  extraction of the data sheets and checked against the summary-table images (all agree).
* O Conaire: the LLNL manuscript copy (`h2_paper.pdf`), Table 1 read from the page image.
  The published-journal copy (Drive `kin.20036.pdf`) was NOT compared; digits could differ
  from the journal version.
* Nothing was copied into the repository except typed numbers.

## Conversion (cm3, mol, s, cal/mol)

Baulch prints k = A T^n exp(-C/T) in molecule units (bimolecular cm3 molecule-1 s-1,
termolecular cm6 molecule-2 s-1, unimolecular s-1).  With N_A = 6.02214076e23 and
R = 1.98720 cal mol-1 K-1:

    A_mol = A * N_A^(m-1)     (m = molecularity of the printed unit: 2, 3, or 1)
    Ea    = C * R  [cal/mol]  (C < 0, i.e. exp(+|C|/T), gives negative Ea)
    k(T)  = A_mol T^n exp(-Ea/(R T))

O Conaire prints A (cm3 mol s), n, Ea (kcal/mol); Ea x 1000 gives cal/mol.  Third-body
efficiencies from the table footnotes multiply O Conaire's k0 (N2 = 1; Ar in rxn 5 is 1,
not listed).  Where O Conaire has only the reverse direction, the Baulch direction is
formed with an equilibrium constant PRINTED BY BAULCH: k_fwd = Kc x k_rev for B02
(p. 804) and B13 (p. 1032), k = k_OC3/Kc for B09 (p. 1029), and for association vs
dissociation k = k x Kc x N_A or k x Kc / N_A (rows B18, B21, B23).  G01/G02 are full
falloff rates at 1 atm computed here (Lindemann x Troe with Baulch's Sec. 2.4 broadening,
N = 0.75 - 1.27 log Fc), not Baulch values.  O Conaire's Fc = 0.5 follows from the Troe
parameters of its footnote f.  The "in range" columns mark 1000/2000 K outside Baulch's
recommended range ("no(extrapolated)"); ratios there are consistency checks, not tests.

## UNSURE values

None: every digit is read from a rendered or extracted page and the two reading routes agree.
Three PRINTING ANOMALIES in Baulch itself (values kept as printed, interpretation noted in the
`notes` column):

1. p. 909, H2(+M), M=H2: "k0 = 1.5e-9 exp(-48350T)" (slash missing; read as /T; the O Conaire
   and Table 4.3 context fix the sense).
2. p. 922, H + H2O: printed Kc = 15.9 T^1.52 exp(-7510/T) is inconsistent with its own
   dS and with the OH+H2 sheet (p. 1029: 6.29e-2 T^0.161 exp(+7510/T)); the T exponent should
   be -0.161.  The p. 1029 Kc is used.
3. p. 913, H + OH(+M): printed Kc = 1.03e25 T^0.010 exp(+59700/T) vs p. 918 9.7e24 ...
   exp(-59700/T), whose reciprocal is 1.03e-25 (printed sign of the power of ten appears lost).
   The p. 918 value is used.
Also: p. 1037, H2O2 k_inf: Preferred range 1000-1500 K but Reliability says "700-1500 K".

## Differences larger than a factor 1.5 (Baulch/OC at 1000 K and 2000 K)

Rows with Baulch's temperature in range:

| row | reaction | 1000 K | 2000 K |
|---|---|---|---|
| B01 | O+H2->OH+H | 0.58 | 1.12 |
| B03 | O+HO2->OH+O2 | 0.63 | (0.56, extrap.) |
| B06 | H+HO2->H2+O2 | 3.42 | (4.66, extrap.) |
| B07 | H+HO2->2OH | 3.64 | (4.78, extrap.) |
| B10 | H+H2O2->H2+HO2 | 0.23 | (0.080, extrap.) |
| B11 | H+H2O2->OH+H2O | 0.52 | (0.47, extrap.) |
| B13 | OH+OH->H2O+O | 1.25 | 1.91 |
| B14b | OH+HO2->H2O+O2, high-T expr. | (0.037, extrap.) | 3.46 |
| B15 | OH+H2O2->H2O+HO2 | 0.38 | (18.8, extrap.) |
| B17a/b/c | H+O2(+M) k0 Ar / N2 / H2O | 0.72 / 0.93 / 0.72 | 0.55 / 0.66 / 0.63 |
| B18a | H+H(+M) k0(H2), via Kc | 1.29 | 1.76 |
| B20a/b/c | H+OH(+M) k0 Ar / N2 / H2O | 0.49 / 0.49 / 0.26 | 0.49 / 0.49 / 0.26 |
| G01 | H+O2(+M) at 1 atm, N2 | 0.95 | (0.67, k0 edge) |

Extrapolated only: B04 O+H2O2 (0.09 / 0.02; Baulch range 283-500 K, OC takes Tsang-Hampson
T^2 form), B19a/b H2 dissociation k0 (7.2 / 2.0 and 11.7 / 3.2, range 2500-8000 K), B21
H2O dissociation at 1000 K (6.3; 0.85 at 2000 K, in range), B23a (13-14, range 200-400 K).

Agreement (within 10 % at both temperatures): B02, B05 (1.13/0.74), B09, B12, B14a, B16 (same
source, Hippler et al.), B17d (k_inf), B22a-c (H2O2 dissociation, 1000 K).

Reading: the two real disagreements are the HO2 + H pair (Baulch k2 and k1 about 3.5x OC at
1000 K; OC took Mueller 1999), H + H2O2 (OC 2-4x higher), and H + OH + M (OC doubled the
Tsang-Hampson A, so it is 2x Baulch for N2/Ar and 3.8x for H2O).

## In Baulch but not O Conaire, and the reverse

* In Baulch only: H + HO2 -> H2O + O (298 K only); O + H2O2 overall (OC has channel 1);
  OH + OH(+M) -> H2O2(+M) (OC only has H2O2 dissociation); both directions of H + H, H + OH.
* In O Conaire only: O + O + M = O2 + M (rxn 6) and O + H + M = OH + M (rxn 7) -- NOT evaluated
  in Baulch 2005 (no data sheet or table row); H2O + O = 2OH appears only as the reverse
  direction of Baulch's OH+OH.
* Not evaluated by Baulch: O3 and any O+O2, HO2 + H2, H2O2 + O2; no data sheet exists.
