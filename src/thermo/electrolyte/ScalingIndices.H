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
-------------------------------------------------------------------------------
Class
    Choupo::electrolyte::ScalingIndices

Description
    The INDUSTRY calcite-scaling indices (Langelier LSI, Stiff & Davis,
    Ryznar RSI), in closed form, as a DELIBERATE CONTRAST to Choupo's
    rigorous activity-based SI_calcite.

    THE PEDAGOGICAL POINT (this is the whole reason the leaf exists):

      * The rigorous SI uses real ION ACTIVITIES
            SI_calcite = log10( a_Ca * a_CO3 / Ksp(T) )
        with a_i = gamma_i * m_i from a full Davies / Pitzer model.

      * The industry indices use ION CONCENTRATIONS plus an EMPIRICAL
        ionic-strength correction (a published pK-shift / chart-fit K) --
        they NEVER form a single ion activity.  The empirical correction
        is calibrated for natural / brackish waters and BREAKS DOWN at high
        ionic strength -- exactly the regime at the membrane WALL in a
        high-recovery RO concentrate, where concentration polarisation
        drives the local I far above the bulk.

    So the indices AGREE with the rigorous SI at low I (validation) and
    MISLEAD at the wall in a high-I concentrate.  That divergence is the
    lesson; this kernel keeps the activity-vs-concentration distinction
    EXPLICIT (concentrations + an empirical I-shift here; activities in the
    SI path) and is announced as empirical everywhere it surfaces.

    Closed forms (the saturation pH pHs is the pH at which calcite is just
    saturated; an index compares the actual pH to pHs):

      LSI  = pH - pHs                                       (Langelier 1936)
      pHs  = -logK_cc(T) + p[Ca2+] + p[HCO3-]
             with p[x] = -log10( concentration, mol/L )
             and logK_cc(T) the HCO3-basis calcite log K
                 CaCO3(s) + H+ = Ca2+ + HCO3-,  logK_cc = pK2 - pKsp
             so  pHs = (pK2 - pKsp) + p[Ca2+] + p[HCO3-]  -- the textbook
             pK-form, every term VISIBLE.  CONCENTRATIONS, not activities.

      Stiff-Davis = pH - pHs_SD                       (Stiff & Davis 1952)
      pHs_SD = pK2 - pKsp + p[Ca2+] + p[HCO3-] - K_SD(I,T)
             K_SD is the Stiff-Davis "K" -- an EMPIRICAL chart fit in ionic
             strength + temperature for BRINES (their Fig. originally read
             off a nomograph).  It REPLACES the activity correction with a
             single tabulated number; honest about being a chart fit.

      RSI  = 2*pHs - pH                                       (Ryznar 1944)
             the Ryznar Stability Index -- same pHs as LSI, recast as a
             practical 0..14 stability scale (RSI < 6 scaling, > 7 corrosive).

    PRIMARY SOURCES (cited in the .cpp at each formula):
      Langelier, W.F. (1936) J. AWWA 28(10) 1500-1521.
      Stiff, H.A. & Davis, L.E. (1952) Trans. AIME 195, 213-216.
      Ryznar, J.W. (1944) J. AWWA 36(4) 472-486.
\*---------------------------------------------------------------------------*/

#pragma once

namespace Choupo {
namespace electrolyte {

// One evaluation of the three industry indices at a local water state.
// All three are derived from CONCENTRATIONS + the catalogue calcite log K
// at T + (for Stiff-Davis) the empirical K_SD(I,T) -- NO ion activities.
struct ScalingIndexResult
{
    double LSI        = 0.0;   // Langelier saturation index  = pH - pHs
    double stiffDavis = 0.0;   // Stiff-Davis index           = pH - pHs_SD
    double RSI        = 0.0;   // Ryznar stability index       = 2 pHs - pH
    double pHs        = 0.0;   // LSI saturation pH (the shared building block)
    double pHs_SD     = 0.0;   // Stiff-Davis saturation pH (brine-corrected)
    double K_SD       = 0.0;   // the empirical Stiff-Davis K(I,T) used
    bool   valid      = false; // false when Ca or HCO3 is absent / non-positive
};

class ScalingIndices
{
public:
    // Compute LSI / Stiff-Davis / Ryznar from CONCENTRATIONS.
    //
    //   pH          local pH (activity of H+ -> -log10 a_H, as everywhere)
    //   c_Ca        Ca2+ CONCENTRATION  [mol/L]   (NOT activity)
    //   c_HCO3      HCO3- CONCENTRATION [mol/L]   (carbonate alkalinity carrier)
    //   I           ionic strength      [mol/kg]  (for the empirical K_SD)
    //   T           temperature         [K]       (for the empirical K_SD)
    //   logK_calcite_T   the HCO3-basis calcite log K at the run T
    //                    (= pK2 - pKsp; from the catalogue via logK_T) -- so the
    //                    index uses the SAME thermodynamic anchor as the rigorous
    //                    SI and the ONLY difference is concentration-vs-activity.
    //
    // valid=false (all indices 0) when Ca or HCO3 is missing / non-positive --
    // the caller then omits the index columns honestly rather than emit a NaN.
    static ScalingIndexResult compute(double pH,
                                      double c_Ca,
                                      double c_HCO3,
                                      double I,
                                      double T,
                                      double logK_calcite_T);

    // The Stiff-Davis empirical "K" as a function of ionic strength I [mol/kg]
    // and temperature T [K].  Stiff & Davis (1952) read it off a nomograph; this
    // is a transparent CHART FIT to that family of curves (announced as such).
    // Pure, static, no I/O -- the call site announces the empirical nature.
    static double stiffDavisK(double I, double T);
};

} // namespace electrolyte
} // namespace Choupo
