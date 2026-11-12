# Third-party sources in the public tree: licence and use (2026-11-12)

A fact sheet for a one-hour legal review (DEV.md 4c C335).  It states what
each source's licence text SAYS, when it was read, and what Choupo stores from
it.  It draws no legal conclusion.  "Card" is the source's record under
`thirdParty/<source>/README.md`; the enforcing gate is
`bin/curate/check_source_licence.py`.

Choupo's own code is GPL-3.0-or-later; its manuals are CC BY-SA 4.0; bundled
data keeps the licence of its source (CLAUDE.md 10).

## Sources whose values the public tree stores

| Source | Licence as read | Read | What Choupo stores |
|---|---|---|---|
| NASA/TP-2002-211556 (McBride, Zehe & Gordon 2002, NASA Glenn coefficients) | US government work; card: not subject to US copyright (17 U.S.C. 105) | card 2026-10-25; report fetched again 2026-11-12 | values: dHf, S, NASA-9 Cp coefficients, each cited to its page; 44 catalogue records cite it with `licence publicDomain;` (gate count, 2026-11-12).  The report's own per-species sources (Gurvich, Chase 1998 = JANAF 4th ed., TRC, Jacox, ...) are recorded as notes |
| NASA TR R-132 (Svehla 1962), Lennard-Jones sigma, eps/k | US government work; card: public domain | card 2026-09-06 | values, in a page-image transcription (`bin/curate/svehla1962/`) and in one case-local witness; no catalogue record |
| ChemSep pure-component databank (`chemsep1.xml`, `chemsep2.xml`) | ChemSep LITE licence: the databank "(and ONLY the ... Databank) is governed by the Artistic License"; "Sublicense of SOFTWARE ... not permitted" | card 2026-09-28 | values, per record, cited (360 catalogue records counted by the gate) |
| ChemSep binary interaction tables (`.ipd`) and the `thermo` package's copy | LITE licence, no sublicence; the files' headers say "DECHEMA"; `thermo` is MIT on its code only | card 2026-09-28 | nothing (gate EXCLUDED_TABLES; no record names them) |
| NIST/TRC ThermoML Archive (DOI 10.18434/mds2-2422) | NIST open licence on the archive record; that licence disclaims third-party rights in the measurements | card 2026-08-25 | no archive file; measurements enter only cited to the ORIGINAL article; fitted pair parameters regressed by Choupo from them (records name their fitting case) |
| LVPP sigma-profile database, release 18.07 | MIT, Copyright (c) 2017 LVPP | card 2026-09-06 (update 2026-11-11) | 51-point sigma profiles COMPUTED by Choupo from LVPP's surface segments, `licence MIT;` with the LVPP citation |
| Sander, Henry's-law compilation (Atmos. Chem. Phys. 15 (2015) 4399) | no card; the records state "Sander DATA retains its own CC-BY licence" | not read in this slice | values (about 240 Henry pair records cite it) |
| NBS Tables (Wagman et al., J. Phys. Chem. Ref. Data 11, Suppl. 2, 1982) | read 2026-11-12 on the issue's masthead: "Copyright 1982 by the U.S. Secretary of Commerce, copyright assigned to the American Institute of Physics and the American Chemical Society"; the same page grants "permission ... to quote from this journal with the customary acknowledgement of the source".  Several records describe it as public domain; that description does not match the masthead | 2026-11-12 | individual values, cited (about 100 catalogue records name Wagman) |
| CODATA Key Values (Cox, Wagman & Medvedev 1989) | no card; not read in this slice | -- | individual values, cited (about 130 catalogue records) |
| IAPWS releases (R12-08, R15-11, 2011 conductivity) | no card; not read in this slice | -- | correlation coefficients / single values, cited (4 catalogue records; many case-local mirrors) |
| PHREEQC databases (USGS) | no card; not read in this slice | -- | equilibrium constants and diffusivities, cited (about 240 catalogue records) |
| Monogenidou, Assael & Huber 2018 (JPCRD 47, 023102), NH3 viscosity | no card; read in the NIST reprint (srd.nist.gov/jpcrdreprint) | 2026-10-11 (C65) | a two-constant fit to its Table 6 (7 values quoted) |
| Geraldes & Alves 2008 (J. Membr. Sci. 321) | publisher's copyright; gate contract ACCEPTED_PAPER_FACTS | 2026-10-24 | table and figure NUMBERS as cited facts; the paper and its figure images are hash-refused |
| NanoFiltran code (vendored, `bin/curate/nanofiltran/`) | MIT (NanoFiltran; SIMPLEX by M. F. Hutt) and LAPACK modified BSD | 2026-10-22 | the code, each file carrying its notice; NOTICE names all holders |

## Sources the public tree must NOT take values from

| Source | Licence as read | Read | Status after this slice |
|---|---|---|---|
| Burcat / Third Millennium database (ReSpecTh) | "provided free of charge for non commercial use" | 2026-09-01 (index row in `thirdParty/README.md`) | 7 catalogue records still pinned (`debt_registry.NC_COMPILATION`): C3H5, C4H4, C5H5, CH3O2, HSO, HSO3, N2H3 -- no usable public-domain entry for those molecules.  Case-local mirrors: see the residual list below |
| GRI-Mech 3.0 | no licence; "permission to cite"; no redistribution grant | 2026-10-25 | no value in the tree (gate arm, none pinned) |
| VT-2005 sigma profiles | no licence on the original page; NIST bundle: non-commercial by BioVia permission | 2026-09-06 | not shipped (`installed false;`) |
| ATcT (Active Thermochemical Tables, ANL) | no licence or rights statement found on atct.anl.gov, its data page (ver. 1.228) or its OSTI dataset record (DOI 10.17038/CSE/3703591); produced under DOE contract by contractor staff | 2026-11-12 | NOT used.  Named once in records as a cross-check direction, no value |
| Engineering Toolbox, REFPROP | no-grant (CLAUDE.md 10) | -- | see residual pins below |
| NIST WebBook, DIPPR, Yaws, CRC (as a product), DECHEMA/DDBST (direct transcription) | no-grant (CLAUDE.md 10) | -- | see residual pins below |

## Residual pins after this slice (measured 2026-11-12)

* `NC_COMPILATION`: 7 catalogue records (above); was 20.
* `SOURCE_LICENCE`: 3 -- `components/methylAcetate.dat` (critical constants and
  dHf credited to "NIST WebBook / DIPPR-class compilations"),
  `parameters/NRTL/ethanol-water.dat` ("Curated from DECHEMA"),
  `parameters/SRK/N2-CH4.dat` (Knapp et al. 1982, a monograph in the DECHEMA
  series; ruling pending).  Was 4 (H3PO4 re-sourced).
* `NO_GRANT_CASE_LOCAL`: 5 sealed NH3 mirrors (the four green-ammonia plants,
  whose re-import moves golden rows awaiting Vitor's review, and
  `basis01_two_unit_chain`, which the importer cannot stage); was 25.
* Outside every pin, named by the gate's own comment and not scanned by it:
  sealed case-local mirrors under `tutorials/` that still carry a
  NonCommercial-compilation number (the H, O, HO2, H2O2, S, S2, SO, CS2
  mirrors in five combustion/Gibbs cases, whose re-import moves golden rows,
  and two ADOPTED records, N and NH, in `nox01_zeldovich_postflame`; two
  more cases were cleaned in this slice), four mirrors of
  `methylAcetate.dat`, and thirteen authored case-local pair records that
  transcribe DECHEMA.  The gate scans `data/standards/` for every name and
  `tutorials/` only for Engineering Toolbox and REFPROP.
