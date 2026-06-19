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

#include "ScalingIndices.H"

#include <cmath>

namespace Choupo {
namespace electrolyte {

// ---------------------------------------------------------------------------
// The Stiff-Davis empirical "K" correction.
//
// Stiff & Davis (1952), Trans. AIME 195, 213-216, extended the Langelier
// saturation index to OIL-FIELD BRINES by replacing the dilute-water
// solubility-product term with an apparent (conditional) value read off a
// NOMOGRAPH of K vs total ionic strength (their original chart, valid to
// I ~ 4 mol/kg, 0-90 C).  K rises with ionic strength and falls with
// temperature, raising the scaling tendency.
//
// This is a TRANSPARENT CHART FIT to that ionic-strength correction, of the
// extended-Debye-Huckel form used by the standard water-chemistry codes for
// the Stiff-Davis conditional constants (cf. Loewenthal & Marais, Carbonate
// Chemistry of Aquatic Systems, 1976; the same 2.5*sqrt(I)/(1+5.3*sqrt(I)+5.5*I)
// activity term WTW / French-Creek use):
//
//     K_SD(I,T) = [ 2.5 sqrt(I) / (1 + 5.3 sqrt(I) + 5.5 I) ] * f_T(T)
//
// The bracket is the I-correction at 25 C; it is ZERO at I = 0 (Stiff-Davis
// then collapses EXACTLY onto Langelier's LSI) and grows monotonically toward
// ~0.8 at I = 4.  f_T is a mild linear temperature scaling normalised to 1.0
// at 25 C (K falls a few % per 10 C, per the nomograph trend) -- kept small and
// honest, since the dominant Stiff-Davis correction is the ionic-strength one.
//
// IT IS EMPIRICAL: it is a single published number standing in for the full
// set of ion activity coefficients.  That is precisely why Stiff-Davis (like
// LSI) diverges from the rigorous activity SI at high I -- the lesson the
// surfacing cases make visible.
// ---------------------------------------------------------------------------
double ScalingIndices::stiffDavisK(double I, double T)
{
    if (I < 0.0) I = 0.0;
    const double sI = std::sqrt(I);
    const double iCorr25 = 2.5 * sI / (1.0 + 5.3 * sI + 5.5 * I);   // 25 C bracket
    // Mild temperature trend of the nomograph: K decreases ~2.3 %/10 C above
    // 25 C (Stiff & Davis 1952 chart slope), normalised to 1.0 at 298.15 K and
    // clamped non-negative so the fit stays physical outside the chart range.
    double fT = 1.0 - 0.0023 * (T - 298.15);
    if (fT < 0.0) fT = 0.0;
    return iCorr25 * fT;
}

ScalingIndexResult ScalingIndices::compute(double pH,
                                           double c_Ca,
                                           double c_HCO3,
                                           double I,
                                           double T,
                                           double logK_calcite_T)
{
    ScalingIndexResult r;
    // The indices are concentration-based: they need positive Ca2+ and HCO3-
    // CONCENTRATIONS (mol/L).  Absent / non-positive -> not applicable; the
    // caller omits the columns honestly instead of emitting -inf / NaN.
    if (!(c_Ca > 0.0) || !(c_HCO3 > 0.0))
        return r;                                 // valid stays false

    // -- Langelier saturation pH (Langelier 1936, J. AWWA 28(10) 1500) --------
    //   pHs = (pKsp - pK2) + p[Ca2+] + p[HCO3-],   p[x] = -log10(x in mol/L)
    // The HCO3-basis calcite dissolution is
    //   CaCO3(s) + H+ = Ca2+ + HCO3-,   K_cc = a_Ca a_HCO3 / a_H,
    //   logK_cc = pK2 - pKsp   (combine CaCO3 = Ca + CO3 (-pKsp) with
    //                           CO3 + H = HCO3 (+pK2)).
    // Setting the saturation SI = log(a_Ca a_HCO3 / a_H / K_cc) = 0 gives
    //   pHs = logK_cc + p[Ca2+] + p[HCO3-]
    // (i.e. pKsp - pK2 = +logK_cc on this basis).  So
    //   LSI = pH - pHs = pH - logK_cc - p[Ca2+] - p[HCO3-]
    // which is IDENTICALLY the rigorous SI_calcite formula EXCEPT it uses
    // CONCENTRATIONS where the SI uses ACTIVITIES (a_i = gamma_i m_i).  The two
    // therefore COINCIDE at low I (gamma -> 1) and DIVERGE as gamma departs from
    // 1 at high I / at the wall -- the whole lesson, exposed by sharing logK at T.
    const double pCa   = -std::log10(c_Ca);
    const double pHCO3 = -std::log10(c_HCO3);
    r.pHs = logK_calcite_T + pCa + pHCO3;
    r.LSI = pH - r.pHs;                            // Langelier 1936

    // -- Ryznar stability index (Ryznar 1944, J. AWWA 36(4) 472) -------------
    //   RSI = 2 pHs - pH   (same pHs as LSI; a practical 0..14 stability scale:
    //   RSI < ~6 scaling, ~6-7 balanced, > ~7 increasingly corrosive).
    r.RSI = 2.0 * r.pHs - pH;

    // -- Stiff-Davis index (Stiff & Davis 1952, Trans. AIME 195, 213) --------
    // Brine-corrected LSI: ADD the empirical ionic-strength K to pHs, RAISING
    // the saturation pH and LOWERING the index in concentrated brine -- a single
    // tabulated number standing in for the ion activity-coefficient reduction
    // (which makes the true SI lower than the activity-free LSI).  So
    //   stiffDavis = pH - (pHs + K_SD) = LSI - K_SD,
    // pulling the brackish/brine index DOWN toward the rigorous activity SI.  At
    // I -> 0 the correction is 0 and Stiff-Davis collapses EXACTLY onto LSI.  It
    // remains EMPIRICAL: a chart fit, not the real per-ion gammas, so it still
    // diverges from the rigorous SI at the high I the wall reaches.
    r.K_SD       = stiffDavisK(I, T);
    r.pHs_SD     = r.pHs + r.K_SD;
    r.stiffDavis = pH - r.pHs_SD;

    r.valid = true;
    return r;
}

} // namespace electrolyte
} // namespace Choupo
