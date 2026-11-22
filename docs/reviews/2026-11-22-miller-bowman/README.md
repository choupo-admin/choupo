# Miller & Bowman (1989) mechanism, read from the page images

Source: J.A. Miller and C.T. Bowman, "Mechanism and modeling of nitrogen
chemistry in combustion", Prog. Energy Combust. Sci. 15 (1989) 287-338,
doi:10.1016/0360-1285(89)90017-8.  The PDF (52 pages, the complete article;
the scan carries a text layer made by OCR) was kept outside the repository and
is not committed, nor is its text.  Only numbers and reaction strings were
taken, as a table of facts.

## What is in the paper

* Appendix A (pp. 331-336): the full C/H/O/N mechanism, 234 numbered reactions
  plus reaction 5a = **235 reactions** (A1-A234 + A5a), 5 of them pressure
  fall-off (A1 Troe, A2 SRI, A73, A79, A98 Lindemann) and 21 with a bare
  third body M (some with efficiencies).
* Appendix B (pp. 337-338): the ammonia (Thermal DeNOx / NH3 flame) mechanism,
  73 reactions, "essentially the same as" Appendix A for the overlap plus 16
  reactions only B has (the N2H2 / 2HNO / NH+O family).
* Units, stated by the paper on every page: moles, cubic centimetres,
  seconds, Kelvins, calories/mole; k_f = A T^beta exp(-E/RT).  A is therefore
  cm3/mol/s per order, E is cal/mol (not E/R).  Reverse rates are by
  equilibrium (the paper's arrows are reversible), which is what CHEMKIN does.
* Species thermochemistry is NOT printed in the appendices (Table 1, p. 289,
  lists only some standard heats of formation); the paper uses the CHEMKIN
  thermodynamic data base.  This case therefore reads thermo from the NASA
  table of the tree (see Phase B).

## Output

`mb1989_table.tsv`: one row per reaction, columns table (A/B), printed page,
reaction number as printed, equation (plain-text normalised: `=` for the
reversible arrow, species written without subscripts, `1CH2` the singlet),
type, A, n, E (the paper's units), low-pressure A, n, E, fall-off form and
parameters, third-body efficiencies, notes.  Footnotes 1-3 of Appendix A
(Troe, SRI, Lindemann) are carried in the fall-off column.

## How it was read

1. Pass 1: each table page rendered at 220 dpi and read from the image into
   `pass1` (every row).
2. Pass 2: each page re-rendered at 300 dpi and read in half-page crops into a
   separate file (`pass2`), transcribed without looking at pass 1 in the
   sense that no row was copied from it.  HONEST LIMIT: both passes were made
   by the same reader in one session, so they are two readings, not two
   independent readers; the second differs only in resolution and in the order
   of attention.
3. Third reader, mechanical: the OCR text layer (`pdftotext -layout`),
   normalised for its habitual confusions (O/0, I and l/1, `e--13`).  It is
   not a reader of record: its sign and digit errors are frequent.
4. A fourth, internal check: Appendix B repeats 57 of Appendix A's rates; the
   two appendices were compared programmatically after reading.

## Disagreements and how they were resolved

* Pass 1 vs pass 2: 0 disagreements of value.  Two rows are marked uncertain
  in BOTH passes because the scan itself is damaged:
  * A117 (C4H2+OH=C3H2+HCO) E: the second digit is speckled; read -410 at
    4x enlargement (a "1" whose stem carries a blot).  Value kept as -410.
  * A185 (CN+N2O=NCO+N2) A: the leading digit is partly lost; read 1.00e+13.
    Not an independent check, but 1.00e+13 is the value of the neighbouring
    rows of the same radical family and of the reverse-order Appendix B-type
    entries.
* Pass 1 vs the OCR layer: three digit disagreements, each looked at again on
  the image (all OCR errors): A129 E = 82360 (OCR 82380), A204 E = 15200 (OCR
  16200), B50 E = 48680 (OCR 46680).  A further ~40 OCR flags were sign or
  letter confusions (`e4-`, `e--`) of the OCR, not of the reading.
* Appendix B vs Appendix A: one real difference, printed in the paper itself:
  N2O + M = N2 + O + M has A = 1.60e+14 in A205 and 1.62e+14 in B25 (both
  pages read twice; kept as printed).  The third-body efficiency lists
  differ by design (B5 has no CO and CO2; B64 has its own).

## Values still uncertain

* A117 E and A185 A as above (damaged scan, read as stated).
* A106 efficiency is printed "H = 0.0" (a symbol H, not H2).  CHEMKIN-style
  mechanisms of the period have H2 intended or the entry is a misprint; the
  case does not use the efficiency (see Phase B notes), and the TSV records it
  as printed.
* The SRI row of A2 prints four numbers (0.45 797 979 1.); the fifth SRI
  parameter e is not printed and is taken as 0 in the usual CHEMKIN reading.

## Interpretations (the printed text does not fix them; each is declared in the case too)

* **Troe footnote (A1).**  Printed: F_cent = (1-a) exp(-T/T*) + a exp(-T**/T), a = 0.604, T* = 6927,
  T** = 132.  Read as the CHEMKIN-II `TROE / a T*** T* /` of the same mechanism family,
  F_cent = (1-a) exp(-T/6927) + a exp(-T/132); the printed exp(-T**/T) looks like a typesetting
  inversion, and CHEMKIN's Troe has no form with `a` weighting exp(-T**/T).  A1 is 2CH3 (+M) = C2H6 (+M).
* **SRI (A2).**  Four numbers printed (0.45 797 979 1.): read as a b c d with e = 0; the engine takes 3 or 5.
* **Appendix B reaction 10** (2H + M = H2 + M) prints no efficiencies; B11 and B12 supply the H2 and H2O
  colliders, as A139, where H2 = 0, H2O = 0 (CO2 = 0 too, absent from B's species).  B10 is given H2 = 0, H2O = 0.
* **Species names.**  The singlet CH2 is `SCH2` in the transcription (CHEMKIN would read `1CH2` as a coefficient)
  and the component `1CH2` in the case; water, acetylene, ethylene, ethane, HCHO, C2H3_vinyl and
  C3H3_1propynl are the tree's names for H2O, C2H2, C2H4, C2H6, CH2O, C2H3, C3H3.

## Phase B and C (two cases)

`gen_chemkin.py` writes `mb1989_appA.inp` / `mb1989_appB.inp` from the table; `build_cases.py` runs
`bin/curate/chemkin_to_choupo.py --reactions-only` on them, renames the reactions to the paper's numbers,
writes the case-local NASA-9 overrides of the stable species (`build_components.py`) and the dictionaries
of `tutorials/batch/combustion/nox02_millerbowman_denox` (Fig. 57, Appendix B) and
`nox03_millerbowman_large` (Appendix A).  All 235 + 73 reactions were imported (0 not written) and Cantera
loaded all of them (it refuses an unbalanced reaction: every one balances in C, H, O, N).
`cantera_mech.py` builds the Cantera input from the same transcription with the same NASA-9 Cp (a7 and a8
set so H(298.15) = dHf and S(298.15) = s_298, as Choupo integrates); `compare_cantera.py` and `timing.py`
compare the runs; `compare_paper.py` reads Fig. 57 (digitised, +-3 ppm).  Results are in the two case READMEs.
Not done: the Petersen, Davidson & Hanson 1999 shock-tube point; a PDF rebuild.
