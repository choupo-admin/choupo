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
    Choupo::PitzerSingleSalt

Description
    The Pitzer ion-interaction model for ONE fully-dissociated salt in water
    --- the first, smallest electrolyte slice (NaCl by default).  Returns, as a
    GLASS-BOX closed form (every term visible), the mean ionic activity
    coefficient gamma_pm, the osmotic coefficient phi, and the water activity,
    all at 25 C from the molality m [mol/kg].

    For a salt M(nu_c) X(nu_a) -> nu_c cations (z_c) + nu_a anions (z_a),
    nu = nu_c + nu_a, ionic strength I = 1/2 (nu_c z_c^2 + nu_a z_a^2) m:

      ln gamma_pm = |z_c z_a| f^g
                  + m (2 nu_c nu_a / nu)       B^g
                  + m^2 (2 (nu_c nu_a)^{3/2}/nu) C^g

      f^g = -A_phi [ sqrt(I)/(1 + b sqrt(I)) + (2/b) ln(1 + b sqrt(I)) ]
      B^g = 2 beta0 + h(a1, beta1) + h(a2, beta2),
            h(a, beta) = (2 beta/(a^2 I)) [1 - (1 + a sqrt(I) - a^2 I/2) e^{-a sqrt(I)}]
      C^g = (3/2) Cphi

    The second term h(a2, beta2) is the 2:2 ion-pairing contribution: for 1:1 /
    2:1 / 1:2 salts beta2 = 0 and it vanishes identically; for 2:2 salts (MgSO4,
    CaSO4, ...) set beta2 and use a1 = 1.4, a2 = 12 (Pitzer's 2:2 convention).

    and the osmotic coefficient (same parameters, sibling form)

      phi - 1 = -|z_c z_a| A_phi sqrt(I)/(1 + b sqrt(I))
              + m (2 nu_c nu_a/nu)        (beta0 + beta1 e^{-a1 sqrt(I)} + beta2 e^{-a2 sqrt(I)})
              + m^2 (2 (nu_c nu_a)^{3/2}/nu) Cphi

      ln a_w = -phi (nu m) M_w / 1000     (M_w = 18.015 g/mol)

    PRIMARY SOURCES (cite these per value, not the compilation that carries them):
      * Pitzer, K.S., J. Phys. Chem. 77 (1973) 268  -- the model.
      * Pitzer & Mayorga, J. Phys. Chem. 77 (1973) 2300 -- the NaCl parameters
        beta0, beta1, Cphi (and a1 = 2.0, b = 1.2; A_phi(25 C) = 0.3915).
    (PHREEQC's pitzer.dat, USGS public domain, is a convenient compilation
    CHANNEL for the same values; the citation is the primary paper.)

    SCOPE: single salt, 0-6 mol/kg, 25 C -- now 1:1, 2:1, 1:2 AND 2:2 (the
    beta2/alpha2 term).  NOT yet covered (honest gaps, flagged for later slices):
    temperature dependence of the parameters; multi-salt mixing terms (theta,
    psi).  Those arrive with the multi-ion model.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/electrolyte/SolventProperties.H"
#include "thermo/electrolyte/PitzerForm.H"

#include <cmath>

namespace Choupo {

class PitzerSingleSalt
{
public:
    // Stoichiometry / charges.  Defaults: NaCl (1:1).
    double nu_c = 1.0;     // cations per formula unit
    double nu_a = 1.0;     // anions  per formula unit
    double z_c  = 1.0;     // cation charge (magnitude)
    double z_a  = 1.0;     // anion  charge (magnitude)

    // Pitzer interaction parameters (NaCl, 25 C; Pitzer & Mayorga 1973).
    double beta0 = 0.0765;
    double beta1 = 0.2664;
    double beta2 = 0.0;      // 2:2 ion-pairing term; 0 for 1:1 / 2:1 / 1:2 salts
    double Cphi  = 0.00127;

    // Silvester-Pitzer (1977) temperature derivatives of the virial
    // parameters, fitted to CALORIMETRY (heats of dilution L_phi), applied
    // linearly: beta0(T) = beta0 + dbeta0_dT (T - 298.15), etc.  Default 0
    // -> byte-identical at every T to the frozen-beta form; the 25 C
    // activity anchor is NEVER moved (the correction vanishes at 298.15 K).
    // Fitted at curation time (bin/curate/fit_lphi_pitzer.py) against the
    // Parker NSRDS-NBS 2 Phi_L dataset; carried per pair in pairs.dat.
    double dbeta0_dT = 0.0;  // [1/K]
    double dbeta1_dT = 0.0;  // [1/K]
    double dCphi_dT  = 0.0;  // [1/K]

    // FULL T-functions, Silvester & Pitzer 1977 (J. Phys. Chem. 81, 1822,
    // eqs 30-32; NaCl q's in their Table IV), applied as a DEVIATION from
    // the catalogue's 25 C surface -- the same doctrine as the linear slots
    // (the T-extension never touches the validated 25 C values):
    //   beta0(T) = beta0_25 + [f0_SP(T) - f0_SP(298.15)]
    // Present when the pair record carries a tFunction block; overrides the
    // linear slots.  (Cross-check: the SP77 d beta0/dT at 25 C is 7.15e-4,
    // the Parker-calorimetric linear fit gave 7.58e-4 -- 6 % apart, two
    // independent data families.)
    bool   spForm = false;
    double spB0[5] = {0,0,0,0,0};    // q1,q2,q3,q4,q5   (eq 30)
    double spB1[3] = {0,0,0};        // q6,q9,q10        (eq 31)
    double spCp[4] = {0,0,0,0};      // q11,q12,q13,q14  (eq 32)
    double TvalidLo = 273.15, TvalidHi = 573.15;

    static double spEval30(const double q[5], double T)
    {
        constexpr double Tr = 298.15;
        return q[0] + q[1]*(1.0/T - 1.0/Tr) + q[2]*std::log(T/Tr)
             + q[3]*(T - Tr) + q[4]*(T*T - Tr*Tr);
    }
    static double spEval31(const double q[3], double T)
    {
        constexpr double Tr = 298.15;
        return q[0] + q[1]*(T - Tr) + q[2]*(T*T - Tr*Tr);
    }
    static double spEval32(const double q[4], double T)
    {
        constexpr double Tr = 298.15;
        return q[0] + q[1]*(1.0/T - 1.0/Tr) + q[2]*std::log(T/Tr)
             + q[3]*(T - Tr);
    }

    // Universal Pitzer constants (25 C).
    double alpha1 = 2.0;     // 2.0 for 1:1 / 1:2 / 2:1; use 1.4 for 2:2 salts
    double alpha2 = 12.0;    // second range parameter, only active when beta2 != 0
    double b      = 1.2;
    double A_phi  = 0.3915;  // Debye-Huckel osmotic slope, water, 25 C (reference)

    // Molar mass of the solvent (water) [g/mol], for the water activity.
    double Mw_solvent = 18.015;

    // A_phi(T): the 25 C osmotic Debye-Huckel slope scaled by the Born-Bjerrum
    // factor (eps_w(T), rho_w(T)); = 0.3915 at 25 C.  The virial parameters
    // (beta0, beta1, Cphi) are kept at their 25 C values -- their temperature
    // derivatives (Silvester-Pitzer 1977) are a later slice; A_phi(T) carries the
    // dominant long-range temperature dependence.
    double aPhi(double T) const { return A_phi * SolventProperties::debyeHuckelFactor(T); }

    // Virial parameters at T (linear Silvester-Pitzer correction; see above).
    double beta0T(double T) const
    {
        if (spForm) return beta0 + (spEval30(spB0, T) - spEval30(spB0, 298.15));
        return beta0 + dbeta0_dT * (T - 298.15);
    }
    double beta1T(double T) const
    {
        if (spForm) return beta1 + (spEval31(spB1, T) - spEval31(spB1, 298.15));
        return beta1 + dbeta1_dT * (T - 298.15);
    }
    double CphiT (double T) const
    {
        if (spForm) return Cphi + (spEval32(spCp, T) - spEval32(spCp, 298.15));
        return Cphi  + dCphi_dT  * (T - 298.15);
    }

    // I = 1/2 (nu_c z_c^2 + nu_a z_a^2) m   [mol/kg]
    double ionicStrength(double m) const
    {
        return 0.5 * (nu_c * z_c * z_c + nu_a * z_a * z_a) * m;
    }

    // ln of the mean ionic activity coefficient at molality m, temperature T.
    double lnGammaPM(double m, double T = 298.15) const
    {
        if (m <= 0.0) return 0.0;
        const double nu = nu_c + nu_a;
        const double I  = ionicStrength(m);

        // The shared Pitzer form (PitzerForm.H) -- ONE implementation, byte-
        // identical associativity to the original inline math.
        const double fg = electrolyte::PitzerForm::fGamma(I, aPhi(T));

        // bGammaSingleSalt(a, beta) = (2 beta/(a^2 I)) [1 - (1 + a sqrt I -
        //   a^2 I/2) e^{-a sqrt I}]  (the single-salt B^gamma + I B' grouping).
        const double Bg = 2.0 * beta0T(T)
                        + electrolyte::PitzerForm::bGammaSingleSalt(alpha1, beta1T(T), I)
                        + electrolyte::PitzerForm::bGammaSingleSalt(alpha2, beta2, I);

        const double Cg = 1.5 * CphiT(T);

        return std::fabs(z_c * z_a) * fg
             + m            * (2.0 * nu_c * nu_a / nu)               * Bg
             + m * m        * (2.0 * std::pow(nu_c * nu_a, 1.5) / nu) * Cg;
    }

    double gammaPM(double m, double T = 298.15) const { return std::exp(lnGammaPM(m, T)); }

    // Osmotic coefficient phi at molality m, temperature T.
    double osmoticCoefficient(double m, double T = 298.15) const
    {
        if (m <= 0.0) return 1.0;
        const double nu = nu_c + nu_a;
        const double I  = ionicStrength(m);

        // Shared Pitzer form (PitzerForm.H), byte-identical to the inline math.
        const double fphi = electrolyte::PitzerForm::fPhi(I, aPhi(T));
        const double Bphi = electrolyte::PitzerForm::Bphi(I, beta0T(T), beta1T(T), beta2,
                                             alpha1, alpha2);

        return 1.0
             + std::fabs(z_c * z_a) * fphi
             + m            * (2.0 * nu_c * nu_a / nu)               * Bphi
             + m * m        * (2.0 * std::pow(nu_c * nu_a, 1.5) / nu) * CphiT(T);
    }

    // Relative apparent molal enthalpy L_phi(m,T) [J/mol salt] by the
    // Gibbs-Helmholtz identity on THIS kernel's own surface (the one
    // implementation the props op, the activity adapter's FD and the
    // curation fit all agree with):
    //   g_ex = nu[(1-phi)+ln gamma_pm],  L_phi = -R T^2 dg_ex/dT  (central FD)
    double Lphi(double m, double T = 298.15) const
    {
        if (m <= 1.0e-12) return 0.0;
        const double nu = nu_c + nu_a, h = 0.05, R = 8.314462618;
        auto gex = [&](double TT)
        { return nu * ((1.0 - osmoticCoefficient(m, TT)) + std::log(gammaPM(m, TT))); };
        return -R * T * T * (gex(T + h) - gex(T - h)) / (2.0 * h);
    }

    // Water activity from the osmotic coefficient: ln a_w = -phi (nu m) Mw/1000.
    double waterActivity(double m, double T = 298.15) const
    {
        const double nu = nu_c + nu_a;
        return std::exp(-osmoticCoefficient(m, T) * nu * m * Mw_solvent / 1000.0);
    }
};

} // namespace Choupo
