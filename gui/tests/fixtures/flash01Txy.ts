/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/


/*---------------------------------------------------------------------------*\
  THE EQUILIBRIUM CURVE OF tutorials/props/molecular/flash01_operating_line,
  CAPTURED, so a test of the geometry drawn on it has a subject that EXISTS.

  tests/flashOperatingLineTool.test.ts read that case's `txy.csv` -- which is a
  RUN OUTPUT: .gitignore sweeps every CSV under tutorials/.  It passes on a checkout
  where somebody happened to run the witness and throws ENOENT on one where
  nobody did, so the suite was green by circumstance: the `check_true_ions`
  shape, one plane over.  (The same glob feeds the GUI bundle, so on a machine
  that HAS run it the file is also inlined into the shipped app -- see the
  finding recorded in src/cases/tutorials.ts.)

  PROVENANCE.  Produced by the native `choupoProps` of this tree at
  058fb70dc on 2026-09-21, from that case unmodified; byte-identical to the
  run output then on disk.  51 points, benzene(1)-toluene(2) at 1.01325 bar.

  IT IS NOT A GOLDEN, and nothing here pins a number of physics.  It is a
  PARSER AND GEOMETRY fixture: the assertions it feeds are identities that
  hold for ANY monotone equilibrium curve (the operating line pivots about
  (z, z); its slope is -L/V; the lever arms reproduce V/F).  What it must stay
  faithful to is its SHAPE, and the test cross-checks that against two TRACKED
  facts of the case -- the swept variable and the 51 points its own golden
  pins -- so a curve regenerated at another resolution cannot slip in unseen.
\*---------------------------------------------------------------------------*/

/** The case's `txy.csv`, verbatim. */
export const FLASH01_TXY_CSV = `x[benzene],T_bubble,y_eq_benzene
0.00000000e+00,3.83773094e+02,0.00000000e+00
2.00000000e-02,3.82835787e+02,4.58299959e-02
4.00000000e-02,3.81919207e+02,8.95354770e-02
6.00000000e-02,3.81022665e+02,1.31240934e-01
8.00000000e-02,3.80145503e+02,1.71062297e-01
1.00000000e-01,3.79287085e+02,2.09107589e-01
1.20000000e-01,3.78446800e+02,2.45477529e-01
1.40000000e-01,3.77624061e+02,2.80266087e-01
1.60000000e-01,3.76818305e+02,3.13560988e-01
1.80000000e-01,3.76028989e+02,3.45444183e-01
2.00000000e-01,3.75255592e+02,3.75992278e-01
2.20000000e-01,3.74497614e+02,4.05276925e-01
2.40000000e-01,3.73754573e+02,4.33365188e-01
2.60000000e-01,3.73026007e+02,4.60319878e-01
2.80000000e-01,3.72311469e+02,4.86199854e-01
3.00000000e-01,3.71610534e+02,5.11060314e-01
3.20000000e-01,3.70922788e+02,5.34953049e-01
3.40000000e-01,3.70247837e+02,5.57926689e-01
3.60000000e-01,3.69585299e+02,5.80026917e-01
3.80000000e-01,3.68934809e+02,6.01296682e-01
4.00000000e-01,3.68296015e+02,6.21776381e-01
4.20000000e-01,3.67668576e+02,6.41504037e-01
4.40000000e-01,3.67052166e+02,6.60515456e-01
4.60000000e-01,3.66446471e+02,6.78844382e-01
4.80000000e-01,3.65851188e+02,6.96522628e-01
5.00000000e-01,3.65266025e+02,7.13580208e-01
5.20000000e-01,3.64690701e+02,7.30045453e-01
5.40000000e-01,3.64124946e+02,7.45945121e-01
5.60000000e-01,3.63568497e+02,7.61304498e-01
5.80000000e-01,3.63021104e+02,7.76147493e-01
6.00000000e-01,3.62482523e+02,7.90496722e-01
6.20000000e-01,3.61952520e+02,8.04373596e-01
6.40000000e-01,3.61430869e+02,8.17798389e-01
6.60000000e-01,3.60917352e+02,8.30790310e-01
6.80000000e-01,3.60411758e+02,8.43367572e-01
7.00000000e-01,3.59913885e+02,8.55547448e-01
7.20000000e-01,3.59423534e+02,8.67346331e-01
7.40000000e-01,3.58940518e+02,8.78779782e-01
7.60000000e-01,3.58464651e+02,8.89862585e-01
7.80000000e-01,3.57995758e+02,9.00608789e-01
8.00000000e-01,3.57533666e+02,9.11031751e-01
8.20000000e-01,3.57078211e+02,9.21144177e-01
8.40000000e-01,3.56629231e+02,9.30958158e-01
8.60000000e-01,3.56186572e+02,9.40485208e-01
8.80000000e-01,3.55750083e+02,9.49736291e-01
9.00000000e-01,3.55319620e+02,9.58721858e-01
9.20000000e-01,3.54895041e+02,9.67451870e-01
9.40000000e-01,3.54476211e+02,9.75935834e-01
9.60000000e-01,3.54062998e+02,9.84182800e-01
9.80000000e-01,3.53655273e+02,9.92201435e-01
1.00000000e+00,3.53252912e+02,1.00000000e+00
`;
