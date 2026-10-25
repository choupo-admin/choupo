# NanoFiltran — the reference program for Choupo's DSPM-DE pore

**What it is.**  NanoFiltran is the program of Vítor Geraldes and Ana Maria
Alves (Instituto Superior Técnico, 2007), published as

> V. Geraldes, A. M. Alves, "Computer program for simulation of mass transport
> in nanofiltration membranes", *J. Membr. Sci.* 321 (2008) 172–182.

It solves the Donnan–steric–dielectric pore model (DSPM&DE) with non-ideal
electrolytes and concentration polarisation: the extended Nernst–Planck
equations discretised by finite differences across the active layer,
linearised, and every node solved at once (a dense LAPACK solve, under-relaxed
Newton).  Choupo's `poreSolver { method finiteDifference; }` (DEV.md 4c C138)
solves the same model, built independently -- and since C142 (2026-10-24,
Vitor: "Eu quero que faças um solver melhor!") by a different method: one
Newton per station carrying the pore, the wall and the water flux, an
analytic Jacobian, a block-tridiagonal solve and no under-relaxation.  This
directory holds NanoFiltran as the REFERENCE the two are compared with, on
the same model, reproducibly (timings and iterations side by side:
`docs/design/a-stiff-pore-solved-at-once.md` section 11).  It is **not** part of
Choupo's build: nothing in `src/` includes it, and no Choupo binary needs it.

Vendored at Vítor's word (2026-10-22: *"O nanofiltran pode ser usado sem
problema!"*).

## What is here

| path | what |
|---|---|
| `src/NANOFILTRAN.F`, `src/LINEAR.F`, `src/SIMPLEX.F` | the source, **byte for byte as received** (Fortran 77 fixed form, CRLF line ends, `NANOFILTRAN.F` in Latin-1; `.gitattributes` here stops any conversion) |
| `shipped/INPUT.XLS`, `shipped/IONS.XLS` | the example input and the ion database as shipped (tab-separated, Latin-1, CRLF) |
| `regenerate.py` | builds the program, runs the reference matrix, writes/checks `reference.tsv` |
| `cases/<op>_p<n>/INPUT.XLS`, `cases/IONS.XLS` | the inputs of every reference run (ND 204 shown; the ND 102 run differs only in that cell) — written by `regenerate.py --write` from `shipped/` by changing value cells only |
| `reference.tsv` | NanoFiltran's permeate and interface concentrations at ND 102 and 204, their Richardson extrapolation, iterations and final residual, per op / point / ion |
| `regenerate_paper.py`, `paper.tsv` | the paper's own two comparisons (Table 2 and Fig. 3) run by NanoFiltran, and its Table 2 transcribed -- the reference of the paper case's parts B and C (section "The paper's own comparisons" below) |
| `fig4_profiles.tsv` | the two N = 350 pore profiles of Fig. 4 node by node (as received; corrected), written by `regenerate_paper.py --write` beside `paper.tsv` |
| `export_case.py`, `paper_case.py` | the case's `constant/reference/` files exported from the tables here (`--check` holds them), and the one home of which op belongs to which part of the case |
| `LICENSE-LAPACK.txt` | the LAPACK licence (see below) |

sha256 of the five files as received (held by
`bin/curate/check_nanofiltran_reference.py` arm (a)):

    104962dd36dc31d1f4794e93e682e1394639586414d3ad6a076c8e31f15e3f33  src/NANOFILTRAN.F
    704852b0b5ed5ab057964e24878bd433f3dbcedc3550594165d2728fb806d5b9  src/LINEAR.F
    c0d158ede21f05b3b5e80bf7a88babc9aca8df41b8bbe23f40e06476b3660e99  src/SIMPLEX.F
    0e56d7ab07b0d17382411606d31ca75798239a2741bded3208bccbb900d84442  shipped/INPUT.XLS
    bbf2b6e7703b63fd3ea8c9c4c101b5e6cd75ac9a8c3b0e1bc8414f1a8a68f859  shipped/IONS.XLS

## Rebuilding and regenerating

    gfortran -O2 -std=legacy -ffixed-line-length-none -Wno-tabs NANOFILTRAN.F
    # (in a directory holding the three .F files: NANOFILTRAN.F INCLUDEs the other two)

The program reads `INPUT.XLS` and `IONS.XLS` from its working directory and
writes `OUTPUT.XLW`.  `regenerate.py` does all of it:

    bin/curate/nanofiltran/regenerate.py            # run, print, compare with reference.tsv
    bin/curate/nanofiltran/regenerate.py --write    # rewrite cases/ and reference.tsv
    bin/curate/nanofiltran/regenerate.py --check    # also check cases/ byte for byte
    bin/curate/nanofiltran/regenerate.py --report-davies

Without `gfortran` it **refuses** (exit 2) — it never passes on a check it
could not run.  The golden case does not need it: NanoFiltran's numbers are
committed (`reference.tsv`, and as anchor rows in
`tutorials/props/membrane/nanofiltran_geraldesAlves2008/expected`, part A), and the
gate that holds them reruns Choupo only.  Measured on 2026-10-22 with gfortran
13.3 (x86-64): 26 runs, a few minutes on four cores.

## Matching the inputs — what was changed, and where

**The source is never edited.**  Three things in NanoFiltran are *constants*,
not model, and each is cancelled through an **input**:

1. **Diffusivity at T.**  NanoFiltran corrects every D to T through its Vogel
   viscosity, `D(T) = D25 · 0.897e-3/298.15 · T / exp(-10.5 + 530/(T-146))`,
   which at 298.15 K is 1.000140779, not 1.  `cases/IONS.XLS` divides each D
   by that factor, so the D the program uses is the tabulated 25 °C value —
   the one Choupo's species records carry.
2. **The Born constant.**  NanoFiltran writes `6.95E-5·z²/r·(1/ε_p − 1/ε_w)/(8.314 T)`;
   CODATA gives `e²N_A/(8πε₀) = 6.9468e-5 J m/mol` and R = 8.314462618, so its
   Born exponent is 5.2e-4 larger.  The pore dielectric input is set to the
   value that gives the CODATA exponent (60 → 60.0078; 80 is left at 80,
   where the Born term vanishes).
3. **Single-precision literals in the hindrance polynomial.**  The
   Dechadilok–Deen polynomial is written with REAL (single-precision) constants
   (`1.56034`, `0.528155`, …).  At λ = 0.875 (Mg²⁺, 0.35 nm, in a 0.4 nm pore)
   the polynomial is a small number left by the cancellation of O(1) terms, so
   the literals' rounding moves K_d by **−1.55e-4** (Na⁺ −2.4e-7, Cl⁻ −5.8e-8,
   SO₄²⁻ −8.3e-7); the program's own printed `KDF` reproduces the
   single-precision value exactly.  `cases/IONS.XLS` multiplies each D by
   K_d(double)/K_d(single), so the product D·K_d the pore sees is the
   double-precision one.  **Uncorrected, this alone parts the two programs by
   5.5e-5 on MgCl₂ and by 6.8e-4 on the trace Na⁺ of the example** — which is
   how it was found: the first comparison disagreed only where Mg²⁺ was
   present.

**One patch, for the Davies rows only** (`DAVIES_PATCH` in `regenerate.py`,
applied to a copy in the build directory): the two lines that compute the
Davies constant become `A = ln 10 · 1.82483e6 (εT)^-1.5`.  See the finding
below.  The op that uses it runs with ε_p = 80, because with the Born term on
the matched pore dielectric (2) would also move the pore-side A by 2e-4, which
the example's trace Na⁺ amplifies to 5.5e-4 (measured with a one-off build
whose pore A used 60 exactly: then the two programs agree to 1.3e-7).

## Findings about the program (reported, not changed)

- **The Davies coefficient is a log10 constant used with exp().**
  `A = 1.825e6 (εT)^-1.5` (0.495 at ε = 80, 298 K) is Davies' constant for
  **log10** γ; NanoFiltran evaluates `γ = exp(−A z² (√I/(1+√I) − 0.3 I))`, so
  ln γ is ln 10 = 2.303 times too small.  On the reference case's Davies op
  the as-received program puts 7.7 % more Na⁺, 4.8 % more Cl⁻ and 3.8 % more
  Mg²⁺ in the permeate than the corrected one (`--report-davies`).  Choupo
  built with the same mistake reproduces the as-received numbers to 5e-6
  (a by-hand sabotage of the gate), which is how the explanation is known to
  be complete.
- **Single-precision literals** (above): harmless where the polynomial is
  O(1), a 1.5e-4 error in K_d near λ = 0.9.
- **Convergence floor.**  The normalised residuals sum absolute values over
  every interval, so their floor grows with ND and with the stiffness.  At
  `TOL 1e-9` the program stopped at ITMAX = 4000 without reaching it on four
  runs: NaCl at ND 204 (residual 4.8e-9 and 2.4e-9) and Na₂SO₄ at both grids
  (7.1e-8, 2.8e-8) — the divalent co-ion at 0.007 mol/m³ against 10 in the
  feed.  Their extrapolated permeates still agree with Choupo's to 1.1e-7 and
  1.8e-7: the iteration had stopped improving the residual, not the answer.
  At `TOL 1e-10` the NaCl runs reached ITMAX = 20 000 at both grids.
- **Mesh and input loops**: the comment "ENSURE THAT ND IS ODD" precedes code
  that makes ND **even** (the mirrored mesh needs it even); the ion-database
  read loop tests `IOS.EQ.1` for its end, while end of file is a negative
  IOSTAT; three COMMON blocks name their integer slots in three orders
  (`/NFDATA/` in the main program, `MODEL`/`DATAIN`, and `INIT`) — harmless,
  because each routine uses only the names it reads.
- `LINEAR.F` declares the LAPACK routines `REAL*8` under their
  single-precision names (`SGESV`, …).  The netlib BLAS FAQ asks that a
  modified routine be renamed; recorded, not changed (the file is kept as
  received).

## The paper's own comparisons (DEV.md 4c C145, 2026-10-24)

`regenerate_paper.py` runs NanoFiltran on the two comparisons of its paper
and writes `paper.tsv` (and `fig4_profiles.tsv`), the reference of
`tutorials/props/membrane/nanofiltran_geraldesAlves2008` -- ONE case for the
paper since DEV.md 4c C147 (Vitor: "Nao multipliques casos!"): part C is
section 4.2 (Table 2, Fig. 4), part B section 4.1 (Fig. 3: Bowen &
Mohammad's measured CA30 rejections), part A the code-to-code matrix of
`regenerate.py`.  The `views` of the case's propsDict generate the paper's tables
and figures from the run, beside NanoFiltran's numbers exported into its
`constant/reference/` by `export_case.py` (`--check`, held by
`bin/curate/check_postprocessing.py`).  The paper itself is
the publisher's and is not here; its Table 2 is transcribed in the script
(`PAPER_TABLE2`) and its Fig. 3 digitised by
`bin/curate/digitise_geraldes_alves2008.py` into the case's
`constant/experimental/` -- numbers, cited, held by
`check_source_licence` (`ACCEPTED_PAPER_FACTS`, which also refuses the PDF
and its figures anywhere in the tree).

    bin/curate/nanofiltran/regenerate_paper.py            # run, print, compare
    bin/curate/nanofiltran/regenerate_paper.py --write    # rewrite paper.tsv
    bin/curate/nanofiltran/regenerate_paper.py --check    # REFUSES without gfortran

Three more DECLARED patches, each applied to a copy in a temporary build
directory and each required to match exactly once (`src/` is never edited):

- **ARRAY_PATCH** (every build): `NDX=205` -> `NDX=351` in the six
  PARAMETER lines.  Table 2 runs N = 300 and 350, beyond the vendored cap,
  so the paper's own build carried a larger array.  Measured: the program
  gives the same numbers, to every printed digit, with and without it at
  N = 10, 50 and 200.
- **DAVIES_PATCH** (`regenerate.py`'s): ln 10 restored in the Davies A.
- **BORN_PATCH** (the code-to-code variant only): the Born constant written
  as the CODATA e^2 N_A/(8 pi eps0), scaled by 8.314/R_CODATA because the
  program divides by its own R.  `regenerate.py` matches the Born constant
  through the pore dielectric INPUT instead, which would here also move the
  pore-side Davies A by 2e-4 -- and Table 2's case has Davies and Born on at
  once.

**What Table 2 turned out to be.**  NanoFiltran AS RECEIVED, on the shipped
`INPUT.XLS` and `IONS.XLS` (the paper's section 4.2 case IS the shipped
example, T = 298 K) with the paper's numerics (URF 0.2, TOL 1e-4),
reproduces Table 2: the iteration counts 71 ... 88 exactly, Mg2+, Cl- and
the potential within 6e-6, the trace Na+ within 2.6e-5 (the residue a
loosely converged iteration leaves on a different compiler).  The
Davies-corrected program does not (Na+ 10.7 % higher at N = 350).  So
**Table 2 carries the ln-10 Davies defect** -- and so do the paper's own
Eqs. 12-13 as printed (Eq. 13 is the log10 constant, Eq. 12 takes ln gamma
with it).  The paper's Delta Psi_m is the permeate node's potential PHI(ND),
psi_m = 0 being its Eq. 24's reference: the Donnan jumps included.

**Fig. 3.**  Run as received with section 4.1's inputs (Eqs. 43-46 at each
measured feed, 20 nodes, URF 0.2, TOL 1e-4) the program lands on the
paper's drawn line within half a reading error at every marker -- the
inputs were read right.  Converged on matched inputs (ND 102/204, TOL 1e-9)
these runs stop at ITMAX with residuals of 9e-9 to 4e-7, the floor the
section above describes; their permeates agree with Choupo's to 2e-8.

## Licences — each kept with its own text

- **NanoFiltran** (`src/NANOFILTRAN.F`): MIT licence, Copyright © 2007
  Vítor Geraldes and Ana Maria Alves, Instituto Superior Técnico — the notice
  is the file's own header and stays with it.
- **SIMPLEX** (`src/SIMPLEX.F`, Nelder–Mead): MIT licence, Copyright © 1998–2004
  Michael F. Hutt — the notice is the file's own header.
- **LAPACK 3.0 and the reference BLAS** (`src/LINEAR.F`: `SGESV`, `SGETRF`,
  `SGETRS`, `SGETF2`, `SLASWP`, `ILAENV`, `IEEECK`, `XERBLA`, `LSAME`, and the
  BLAS kernels `SGEMM`, `STRSM`, `SGEMV`, …): the LAPACK licence, a modified
  BSD licence, reproduced verbatim in `LICENSE-LAPACK.txt` (fetched from
  https://netlib.org/lapack/LICENSE.txt on 2026-10-22, sha256
  `a14cc25e10d40a3aa705b7de2fb764a6535d8ee9b2db4e1724900585457dfd55`).  The
  netlib BLAS FAQ states the reference BLAS is freely available and may be
  included in commercial packages, asking only for credit to its authors.

All three are permissive and compatible with Choupo's GPL-3.0-or-later; the
code here is aggregated beside Choupo's, not linked into it.  NOTICE lists
them, and `bin/curate/check_source_licence.py` holds this directory to them
(`ACCEPTED_VENDORED_CODE`).
