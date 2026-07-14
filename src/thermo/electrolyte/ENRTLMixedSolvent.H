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
  ENRTLMixedSolvent -- the GENERALIZED segment-based electrolyte-NRTL of
  Chen & Song, AIChE J 50(8):1928-1941 (2004), DOI 10.1002/aic.10151, for ONE
  fully-dissociated 1-1 salt in a water + alcohol MIXED SOLVENT at 25 C.

  THE SEGMENT CONCEPT (the paper's key idea): the alcohol is decomposed into
  a hydrophobic -C2H4- segment (ion-REPULSIVE) and a hydrophilic -OH segment
  (ion-ATTRACTIVE, identical to water):  CnH2n+1OH -> X (C2H4) + Z (OH), Eq 75.
  Water = one OH segment.  Near an ion the alcohol orients OH-toward /
  C2H4-away; recognising those distinct ion-segment interactions is what makes
  the mixed-solvent gamma_pm quantitative (the monomeric-alcohol treatment is
  not -- the paper's Figs 2 vs 4).

  MODEL STRUCTURE (all closed-form, no iteration):
    ln gamma*_pm = local (segment NRTL, Eqs A1-A3, 3-term) + PDH long-range
    * LOCAL term: SEGMENT mole-fraction scale over {OH, C2H4, cation, anion};
      the 3-term ion expression (molecular centers + own center + opposite-ion
      center) has the exact structure of the validated ENRTLSingleSalt::lc.
    * REFERENCE: unsymmetric, infinite dilution in the MIXED SOLVENT (Eqs
      51-53) -- matching how the paper fit Table 6/7 and how Esteso reports
      gamma_pm (per-solvent anchor, gamma->1 as m->0 in THAT solvent).  No
      Born term on this reference (Born belongs to the aqueous-reference
      route, Eqs 66-68).
    * PDH (Eq 59): COMPONENT mole-fraction scale (molecules + ions).  The
      paper's Eqs 56/58 typeset the PDH x_i as segment-based; in pure water
      the two scales COINCIDE (water = 1 segment) so the aqueous limit cannot
      distinguish them -- against the mixed-solvent golden (Esteso 1989) the
      component scale reproduces the paper's fit (AAD ~4%) while the segment
      scale under-weights the ionic strength at high alcohol (AAD ~14%).
      Empirical resolution, stated openly; ENRTLSingleSalt (validated) is
      component-scale too.
    * Molal conversion: ln gamma_pm,m = ln gamma_pm,x - ln(1 + nu m M_s/1000)
      (Eq 74), M_s the mole-average solvent MW.

  PARAMETERS (25 C, defaults = water-ethanol-NaCl):
    tau_OH_ca / tau_ca_OH   hydrophilic(=water) <-> salt   [Table 2, aqueous]
    tau_C2_ca / tau_ca_C2   hydrophobic segment <-> salt   [Table 7, fit to
                            Esteso et al., J. Solution Chem. 18 (1989) 277]
    tau_C2_OH / tau_OH_C2   segment binary (water-hexane LLE)      [Table 4]
    Xseg : Zseg             alcohol hydrophobicity:hydrophilicity  [Table 4]
    A_phi                   molality-scale Debye-Huckel parameter OF THE MIXED
                            SOLVENT (composition-dependent; pass the measured
                            value, e.g. Esteso Table II) -- NOT recomputed
                            internally, so the caller controls provenance.

  SCOPE (declared): single 1-1 salt, complete dissociation, isothermal 25 C
  (the published taus are 25 C values).  At >=80 wt% ethanol Esteso measures
  strong ion pairing (K_A = 30-46) which a complete-dissociation model cannot
  represent -- expect a systematic +~8% there; that is physics, not a bug.

  VALIDATION: tutorials/props/electrolyte/enrtl_mixed_nacl_ethanol_esteso
  locks gamma_pm against Esteso's Table I (47 points, 0-90 wt% ethanol):
  AAD ~4.3% overall, ~1% in water, ~1.2% at 70 wt% -- paper-grade (Chen &
  Song quote RMS 0.026 on gamma) with ZERO refit of the published parameters.
\*---------------------------------------------------------------------------*/

#pragma once

#include <cmath>

namespace Choupo {
namespace electrolyte {

class ENRTLMixedSolvent
{
public:
    // ---- published parameters (25 C); defaults = water-ethanol-NaCl --------
    double tau_OH_ca = 8.886,  tau_ca_OH = -4.549;  // Table 2 (OH == water)
    double tau_C2_ca = 15.526, tau_ca_C2 =  0.759;  // Table 7 (fit to Esteso)
    double tau_C2_OH = 6.562,  tau_OH_C2 =  3.364;  // Table 4 (water-hexane LLE)
    double alphaIon  = 0.2,    alphaSeg  =  0.3;
    double Xseg = 1.811, Zseg = 0.609;              // ethanol X:Z (Table 4)
    double MwWater = 18.015, MwAlcohol = 46.069;    // g/mol
    double rho = 14.9;                              // PDH closest approach

    // gamma_pm (MOLAL scale) of the 1-1 salt at molality m [mol/kg mixed
    // solvent], alcohol mole fraction yAlc in the salt-free solvent, and the
    // mixed solvent's molality-scale Debye-Huckel parameter Aphi.
    double gammaPM(double m, double yAlc, double Aphi) const
    {
        const double MwSolv = (1.0 - yAlc) * MwWater + yAlc * MwAlcohol;

        // -- segment amounts per mol of solvent (LOCAL term bookkeeping) ----
        const double nOH   = (1.0 - yAlc) + yAlc * Zseg;   // water=1 OH
        const double nC2   = yAlc * Xseg;
        const double nSalt = m * MwSolv / 1000.0;          // mol salt / mol solvent
        const double Nseg  = nOH + nC2 + 2.0 * nSalt;

        double X[4]  = { nOH / Nseg, nC2 / Nseg, nSalt / Nseg, nSalt / Nseg };
        const double Ns = nOH + nC2;
        double Xr[4] = { nOH / Ns, nC2 / Ns, 0.0, 0.0 };   // inf-dil in mixed solvent

        const double lnLocC = lc(2, X) - lc(2, Xr);        // cation, unsymmetric
        const double lnLocA = lc(3, X) - lc(3, Xr);        // anion

        // -- PDH long-range on the COMPONENT mole-fraction scale ------------
        const double Ncomp = 1.0 + 2.0 * nSalt;            // 1 mol solvent + ions
        const double Ix    = nSalt / Ncomp;                // 0.5*sum x_i z_i^2, z=1
        const double sI    = std::sqrt(Ix);
        const double pref  = std::sqrt(1000.0 / MwSolv) * Aphi;
        const double lnPDH = -pref * ((2.0 / rho) * std::log(1.0 + rho * sI)
                             + (sI - 2.0 * Ix * sI) / (1.0 + rho * sI));

        // -- mean ionic (Eq 69) + mole-fraction -> molal (Eq 74) ------------
        const double lnPMx = 0.5 * ((lnLocC + lnPDH) + (lnLocA + lnPDH));
        return std::exp(lnPMx - std::log(1.0 + 2.0 * m * MwSolv / 1000.0));
    }

private:
    // species index: 0=OH, 1=C2H4 (molecular segments), 2=cation, 3=anion
    static bool isIon(int i)             { return i >= 2; }
    static bool sameCharge(int i, int j) { return (i == 2 && j == 2) || (i == 3 && j == 3); }

    double tau(int i, int j) const
    {
        if (i == 1 && j == 0) return tau_C2_OH;   // C2H4 -> OH
        if (i == 0 && j == 1) return tau_OH_C2;   // OH -> C2H4
        if (i == 0 && isIon(j)) return tau_OH_ca; // OH -> salt
        if (i == 1 && isIon(j)) return tau_C2_ca; // C2H4 -> salt
        if (isIon(i) && j == 0) return tau_ca_OH; // salt -> OH
        if (isIon(i) && j == 1) return tau_ca_C2; // salt -> C2H4
        return 0.0;                                // like/counter-ion: single salt
    }
    double alpha(int i, int j) const { return (isIon(i) || isIon(j)) ? alphaIon : alphaSeg; }
    double gee(int i, int j) const { return std::exp(-alpha(i, j) * tau(i, j)); }

    // 3-term local-composition ln gamma of ion s (structure of the validated
    // ENRTLSingleSalt::lc, generalized to TWO molecular segments).
    double lc(int s, const double X[4]) const
    {
        const int opp = (s == 2) ? 3 : 2;
        double t1 = 0.0;                                 // molecular centers
        for (int mm = 0; mm <= 1; ++mm)
        {
            double den = 0, num = 0;
            for (int i = 0; i < 4; ++i)
            { den += X[i] * gee(i, mm); num += X[i] * gee(i, mm) * tau(i, mm); }
            t1 += (X[mm] * gee(s, mm) / den) * (tau(s, mm) - num / den);
        }
        double den2 = 0, num2 = 0;                       // own center (no like ions)
        for (int i = 0; i < 4; ++i) if (!sameCharge(s, i))
        { den2 += X[i] * gee(i, s); num2 += X[i] * gee(i, s) * tau(i, s); }
        const double t2 = num2 / den2;
        double den3 = 0, num3 = 0;                       // opposite-ion center
        for (int i = 0; i < 4; ++i) if (!sameCharge(opp, i))
        { den3 += X[i] * gee(i, opp); num3 += X[i] * gee(i, opp) * tau(i, opp); }
        const double t3 = (X[opp] * gee(s, opp) / den3) * (tau(s, opp) - num3 / den3);
        return t1 + t2 + t3;
    }
};

} // namespace electrolyte
} // namespace Choupo
