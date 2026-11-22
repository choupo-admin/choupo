# O Conaire 2004, Table I: read from the journal version

Source: O Conaire, Curran, Simmie, Pitz & Westbrook, "A comprehensive modeling study of
hydrogen oxidation", Int. J. Chem. Kinet. 36 (2004) 603-622, doi 10.1002/kin.20036.
Journal PDF (user's Drive, file `kin.20036.pdf`, 20 pages, kept outside the repository).

## How it was read

* Table I, "Revised H2/O2 Reaction Mechanism", is on journal page 607 (PDF page 5).
  The page was rendered at 170 dpi and every number was read from the image; the text
  extraction (`pdftotext -layout`) was used only as a cross-check and agrees with the
  image in every value.
* Table I has 19 numbered reactions in 23 printed lines: reactions 9 and 15 are Troe
  fall-offs (low-pressure limit line, then high-pressure limit line), reactions 14 and 19
  are summed pairs (footnote h).  The TSV has one row per printed line (23 rows).
  Table II (thermochemistry, same page) is not transcribed.
* Units (Table I caption): cm3, mol, s, kcal, K.  k = A T^n exp(-Ea/RT); Ea in kcal/mol.
* The 19 reactions are written as reversible; the paper states reverse rates come from
  microscopic reversibility, so no reverse parameters are printed.
* Files: `oconaire2004_table.tsv` (values as printed), `oconaire2004_read.py` (regenerates
  the TSV and prints the comparisons below).

## Hard-to-read or odd values (no digit is ambiguous)

* Troe parameters (footnote f): the page prints "T*** = 1.0 x -30" for both reactions,
  which can only mean 1.0e-30 (the printed exponent lacks its "10"); T* = 1.0e+30;
  reaction 9 also has T** = 1.0e+100, reaction 15 has no T** printed.  Recorded as printed
  in the notes column, with the 1e-30 reading stated.
* Footnote i (reaction 15 efficiencies) ends with a stray semicolon; harmless.
* The footnote letters are superscripts; the letter-to-reaction mapping was confirmed on
  the image (a:5, b:6, c:7, d,e:8, f,g:9, h:14 and 19, i,f:15).

## Comparison with the shipped case

Case: `tutorials/batch/combustion/ignition01_h2o2/constant/reactions` (the task named
`tutorials/batch/reactor/ignition01_h2o2`, which does not exist; the case is under
`combustion/`).  It carries 21 dict entries (R1..R19, with R14 and R19 split a/b), each in
cm3/mol/s and kcal/mol and converted by the engine; its header says Ar/He efficiencies are
omitted (no argon or helium in the case).

k_case/k_paper was computed from the case's own A, b, Ea against the paper's, in the one
basis both use (cm3, mol, s, kcal), so no unit conversion enters (the engine's kcal to J
and cm3/mol/s to SI conversions are the engine's and were not checked here).

Result: **all 23 lines agree exactly, ratio 1.000000 at 1000 K and at 2000 K** (the limit
lines of reactions 9 and 15 compared separately; no ratio outside 1 +- 1e-3, so no
diagnosis is needed: no typo, no different source copy).  Third-body efficiencies: R5
H2O 12, H2 2.5; R6 and R7 H2O 12, H2 2.5; R8 H2O 12, H2 0.73; R9 H2 1.3, H2O 14; R15 H2O
12, H2 2.5 -- all equal to footnotes a, b, c, e, g, i (Ar, He omitted by design).  Troe:
R9 (0.5, 1e-30, 1e+30, 1e+100) and R15 (0.5, 1e-30, 1e+30) equal footnote f with the 1e-30
reading above.  The per-line ratios are printed by the script; every one is 1.000000.

## Comparison with `baulch2005_HO.tsv` (information only)

1. The `OC_A_cm3_mol_s`, `OC_n`, `OC_Ea_kcal_mol` columns of that file (read earlier from the
   LLNL manuscript copy) equal the journal values read here for every mechanism reaction
   they cover (1, 2, 3, 4, 5, 8, 9 low and high, 10-13, 14, 15, 16-19), so the manuscript
   copy and the journal copy of Table I agree in these numbers.  Reactions 6 and 7
   (O+O+M, O+H+M) have no Baulch counterpart.  That file's caveat that the journal copy
   was not compared is now closed for Table I.
2. The Baulch/O Conaire ratios in that file therefore stand unchanged (same numbers).
   B over OC at 1000 K / 2000 K: within 10 % of 1 at both temperatures only for B16
   (1.006/1.003), B22b (0.945/0.947), B22c (0.973/0.995), B17d (1.003/0.964), B09
   (0.915/0.982, via Baulch's Kc) and B14a (0.999, outside its 250-400 K range); B12 is
   1.061/1.075.  Large differences are the paper adopting other sources (Mueller et al. for
   HO2 + H: B06/B07 3.4 to 4.8 times; Tsang & Hampson x1.25 for H + H2O2: 0.23/0.08; the
   factor 2 on H + OH + M: 0.49) and Baulch ranges that do not cover 1000 or 2000 K
   (flagged in that TSV).  They show two independent evaluations, not a mistyped copy.
