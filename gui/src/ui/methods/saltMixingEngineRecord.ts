/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  A RECORDED engine run, against which the salt-mixtures page's own Pitzer
  arithmetic is held (DEV.md 4c C316).

  WHAT WAS RUN.  choupoProps at commit 27926ad57 (2026-11-11), a scratch case
  with NO case-local records (constant/ holds thermoPhysPropDict, water.dat
  and NaCl.dat only), so every Pitzer record resolved from data/standards/:
  pairs/Na-Cl.dat, pairs/K-Cl.dat, theta/K-Na.dat (-0.012), psi/K-Na-Cl.dat
  (-0.0015).  Four `speciate` operations with
      activityCoefficients { model PitzerHMW; referenceBasis aqueousMolality; }
      analyticalTotals { Na .. mol/kg; K .. mol/kg; Cl .. mol/kg; }
      pH 7.0; networkScope restricted; network ( water-dissociation );
  and two `pitzerActivity` operations (the single-salt kernel).  The values
  below are the run's own diagnostics block (12 significant figures) and
  pitzerActivity CSV rows (9), copied, never rounded.

  WHY A RECORDING AND NOT A WITNESS CASE.  A new tutorial case would move
  the release inventory and BRAIN.md's generated FACTS; this slice is GUI +
  data only.  The single-salt half IS also held live: the GUI test reads the
  engine's outputs of the shipped witnesses pitzer_gamma_hamer_wu (NaCl and
  KCl at 25 C) and pitzer_hmw_hot_agreement (NaCl at 100 C) through
  tests/witnessOutputs.ts.  The mixture half is this recording; if the
  engine's PitzerHMW or a record it reads changes, tests/saltMixing.test.ts
  goes red here and this block is re-recorded with the new commit.

  THE ONE DIFFERENCE between the two computations, measured rather than
  assumed: `pH 7.0` keeps H+ (~2e-8 mol/kg) and OH- (~1.3e-7 mol/kg) in the
  engine's solution, so its ionic strength is 6.47000007 where the page's is
  6.47.  The effect on ln gamma is of order 1e-8, which is the tolerance the
  test states.
\*---------------------------------------------------------------------------*/

export const ENGINE_RECORD = {
  commit: "27926ad57",
  date: "2026-11-11",
  binary: "choupoProps",
} as const;

/** pitzerHMW speciate runs: molalities in, per-ion gamma out. */
export const ENGINE_MIXTURES: readonly {
  name: string; T: number; mNa: number; mK: number;
  gammaNa: number; gammaK: number; gammaCl: number; I: number;
  SIhalite: number; SIsylvite: number;
}[] = [
  { name: "mix_298_a", T: 298.15, mNa: 5.8, mK: 0.67,
    gammaNa: 1.02901942924, gammaK: 0.522136555011, gammaCl: 0.993034364767,
    I: 6.47000007405, SIhalite: 0.0137201269931, SIsylvite: -0.548272539336 },
  { name: "mix_298_b", T: 298.15, mNa: 5.12, mK: 2.08,
    gammaNa: 1.07645825198, gammaK: 0.548512114195, gammaCl: 0.966448431947,
    I: 7.20000006337, SIhalite: 0.0137783345203, SIsylvite: -0.000239259189906 },
  { name: "mix_323", T: 323.15, mNa: 4.9, mK: 3.0,
    gammaNa: 1.10142572059, gammaK: 0.58329041492, gammaCl: 0.967128333434,
    I: 7.90000030559, SIhalite: -0.00679646561217, SIsylvite: 0.110912621952 },
  { name: "mix_343", T: 343.15, mNa: 1.7, mK: 5.2,
    gammaNa: 0.855116312587, gammaK: 0.64365025075, gammaCl: 0.743896328615,
    I: 6.90000086022, SIhalite: -0.785408979509, SIsylvite: 0.13973255212 },
];

/** pitzerActivity (single-salt kernel) rows: m, gamma_+-. */
export const ENGINE_SINGLE_SALT: readonly {
  salt: "NaCl" | "KCl"; T: number; m: number; gammaPM: number;
}[] = [
  { salt: "KCl", T: 323.15, m: 1.0, gammaPM: 6.09014665e-01 },
  { salt: "KCl", T: 323.15, m: 3.0, gammaPM: 5.93380465e-01 },
  { salt: "KCl", T: 323.15, m: 5.0, gammaPM: 6.24481460e-01 },
  { salt: "NaCl", T: 343.15, m: 1.0, gammaPM: 6.47501755e-01 },
  { salt: "NaCl", T: 343.15, m: 3.5, gammaPM: 7.47388108e-01 },
  { salt: "NaCl", T: 343.15, m: 6.0, gammaPM: 9.56451290e-01 },
];
