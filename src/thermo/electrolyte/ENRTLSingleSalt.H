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
  ENRTLSingleSalt -- the electrolyte-NRTL (Chen-Song-Evans) mean ionic activity
  coefficient for ONE fully-dissociated salt in water, as a GLASS-BOX closed
  form.  PDH long-range + NRTL local + (mixed solvent) Born, ported from IDAES
  (US DOE, open-source); validated vs Hamer & Wu NaCl at 25 C: AAD 1.8 %.

  TEMPERATURE DEPENDENCE (like the molecular NRTL's tau = a + b/T):
    * NRTL energy params: tau(T) = tau_ref * (T_ref / T)  -- the Delta_g/RT form
      with a T-independent interaction energy (a = 0, b = tau_ref * 298.15); the
      single published 25 C value sets b.  Reduces to tau_ref at 25 C.
    * Debye-Huckel A_DH(T): the 25 C value times the Born-Bjerrum factor
      (rho_w/rho25)^0.5 (eps25 T25 / (eps_w(T) T))^1.5  -- via eps_w(T), rho_w(T)
      (SolventProperties).  = A_DH(25) at 25 C.
    * Born / PDH evaluated at the actual T, not a hard-coded 298.15.
  Every term is anchored so that at T = 298.15 K it returns EXACTLY the
  validated 25 C kernel (golden masters unchanged); off 25 C it is physical.

  PRIMARY: Chen & Evans, AIChE J. 32 (1986) 444 (model + water-NaCl tau =
  (8.885, -4.549), alpha = 0.2).  Water eps(T)/rho(T): Malmberg-Maryott 1956 /
  Kell 1975 (public).  SCOPE: single salt; mixed-solvent Born radius calibrated
  to KCl water+ethanol; the antisolvent permittivity is taken at the value the
  caller supplies (evaluate it at T upstream if a temperature coefficient exists).
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/electrolyte/SolventProperties.H"

#include <array>
#include <cmath>

namespace Choupo {

class ENRTLSingleSalt
{
public:
    // Stoichiometry / charges (NaCl 1:1 default).
    double nu_c = 1.0, nu_a = 1.0, z_c = 1.0, z_a = 1.0;
    // eNRTL energy parameters (water<->salt) at the 25 C reference + nonrandomness.
    double tau_m_ca = 8.885;   // molecule -> electrolyte (25 C)
    double tau_ca_m = -4.549;  // electrolyte -> molecule (25 C)
    double alpha    = 0.2;
    // Constants.
    double A_DH    = 2.9127;   // mole-fraction Debye-Huckel param, water 25 C (reference)
    double rho     = 14.9;     // closest-approach
    double Mw      = 18.015;   // solvent molar mass [g/mol]

    // ---- Temperature helpers -------------------------------------------
    double aDH(double T)  const { return A_DH * SolventProperties::debyeHuckelFactor(T); }
    double tauMCa(double T) const { return tau_m_ca * (298.15 / T); }   // Delta_g/RT form
    double tauCaM(double T) const { return tau_ca_m * (298.15 / T); }

    double gammaPM(double m, double T = 298.15) const
    {
        if (m <= 0.0) return 1.0;
        return std::exp(lnGammaX(m, aDH(T), Mw, T)) / (1.0 + 0.001 * Mw * (nu_c + nu_a) * m);
    }

    // ln gamma_pm (mole-fraction scale, before the molality conversion), with the
    // Debye-Huckel A and solvent molar mass Mwsolv and temperature T as
    // parameters -- so the same core serves the aqueous gammaPM and the
    // mixed-solvent gammaPMMixed.  tau(T) is applied inside.
    double lnGammaX(double m, double A, double Mwsolv, double T) const
    {
        const double nu = nu_c + nu_a;
        const double nw = 1000.0 / Mwsolv;             // mol solvent per kg
        const double ntot = nw + (nu_c + nu_a) * m;
        // species 0 = water (m), 1 = cation (c), 2 = anion (a)
        const double Ix = 0.5 * ((nu_c * m / ntot) * z_c * z_c
                                + (nu_a * m / ntot) * z_a * z_a);

        // G[i][j], tau[i][j] over {m,c,a} (single salt: G_ca = 1, tau_ca = 0),
        // with the temperature-scaled energy parameters.
        const double t_mca = tauMCa(T), t_cam = tauCaM(T);
        const double Gcm = std::exp(-alpha * t_cam);   // ion -> water
        const double Gmc = std::exp(-alpha * t_mca);   // water -> ion
        double G[3][3], tau[3][3];
        for (int i = 0; i < 3; ++i) for (int j = 0; j < 3; ++j) { G[i][j] = 1.0; tau[i][j] = 0.0; }
        G[1][0] = Gcm; G[2][0] = Gcm; G[0][1] = Gmc; G[0][2] = Gmc;   // G[1][2]=G[2][1]=1
        tau[1][0] = t_cam; tau[2][0] = t_cam; tau[0][1] = t_mca; tau[0][2] = t_mca;

        // FAITHFUL local-composition lnγ (IDAES Eqns 26/27), single cation/anion.
        auto inSame = [](int s, int i){ return i == s; };               // like-charge group
        auto lc = [&](int s, const double X[3]) -> double
        {
            const int opp = (s == 1) ? 2 : 1;
            const double Z = (s == 1) ? z_c : z_a;
            // term1: over molecules (only m=0)
            double den1 = 0, num1 = 0;
            for (int i = 0; i < 3; ++i) { den1 += X[i]*G[i][0]; num1 += X[i]*G[i][0]*tau[i][0]; }
            const double t1 = (X[0]*G[s][0]/den1) * (tau[s][0] - num1/den1);
            // term2: i over aqu minus like-ions
            double den2 = 0, num2 = 0;
            for (int i = 0; i < 3; ++i) if (!inSame(s,i)) { den2 += X[i]*G[i][s]; num2 += X[i]*G[i][s]*tau[i][s]; }
            const double t2 = num2/den2;
            // term3: over opposite ions (only `opp`); denominator i over aqu minus opposite
            double den3 = 0, num3 = 0;
            for (int i = 0; i < 3; ++i) if (i != opp) { den3 += X[i]*G[i][opp]; num3 += X[i]*G[i][opp]*tau[i][opp]; }
            const double t3 = (X[opp]*G[s][opp]/den3) * (tau[s][opp] - num3/den3);
            return Z * (t1 + t2 + t3);
        };

        const double Xact[3] = { nw/ntot, nu_c*m/ntot, nu_a*m/ntot };
        const double Xref[3] = { 1.0, 0.0, 0.0 };          // unsymmetric: ion in pure water
        const double lcC = lc(1, Xact) - lc(1, Xref);
        const double lcA = lc(2, Xact) - lc(2, Xref);

        // PDH long-range (Eqn 70, unsymmetric I0->0, ndIdn=0)
        const double sI = std::sqrt(Ix);
        auto pdh = [&](double z) {
            return -A * ((2.0*z*z/rho) * std::log(1.0 + rho*sI)
                + (z*z*sI - 2.0*std::pow(Ix,1.5)) / (1.0 + rho*sI));
        };
        return (nu_c*(pdh(z_c)+lcC) + nu_a*(pdh(z_a)+lcA)) / nu;
    }

    // Water (solvent) activity a_w = gamma_water * x_water -- the molecule branch
    // (IDAES Eqn 25 local + Eqn 69 PDH; symmetric solvent reference, -> 1 at pure
    // water).  Validated vs NaCl osmotic data at 25 C: phi AAD 1.4 %.
    double waterActivity(double m, double T = 298.15) const
    {
        if (m <= 0.0) return 1.0;
        const double nw = 1000.0 / Mw, ntot = nw + (nu_c + nu_a) * m;
        const double X[3] = { nw/ntot, nu_c*m/ntot, nu_a*m/ntot };
        const double Ix = 0.5 * (X[1]*z_c*z_c + X[2]*z_a*z_a);
        const double t_mca = tauMCa(T), t_cam = tauCaM(T);
        const double Gcm = std::exp(-alpha * t_cam), Gmc = std::exp(-alpha * t_mca);
        double G[3][3], tau[3][3];
        for (int i = 0; i < 3; ++i) for (int j = 0; j < 3; ++j) { G[i][j] = 1.0; tau[i][j] = 0.0; }
        G[1][0] = Gcm; G[2][0] = Gcm; G[0][1] = Gmc; G[0][2] = Gmc;
        tau[1][0] = t_cam; tau[2][0] = t_cam; tau[0][1] = t_mca; tau[0][2] = t_mca;

        // local lnγ_water (Eqn 25): term1 + molecule self-term (mp=0) + ion terms
        double den = 0, val = 0;
        for (int i = 0; i < 3; ++i) { den += X[i]*G[i][0]; val += X[i]*G[i][0]*tau[i][0]; }
        val /= den;
        { double dd = 0, nn = 0; for (int i = 0; i < 3; ++i) { dd += X[i]*G[i][0]; nn += X[i]*G[i][0]*tau[i][0]; }
          val += X[0]*G[0][0]/dd * (tau[0][0] - nn/dd); }                     // mp = 0 (water)
        for (int c = 1; c <= 2; ++c)   // c=1 (cation), c=2 (anion): same structure
        {
            double dd = 0, nn = 0;
            for (int i = 0; i < 3; ++i) if (i != c) { dd += X[i]*G[i][c]; nn += X[i]*G[i][c]*tau[i][c]; }
            val += X[c]*G[0][c]/dd * (tau[0][c] - nn/dd);
        }
        const double pdh_m = 2.0 * aDH(T) * std::pow(Ix, 1.5) / (1.0 + rho * std::sqrt(Ix));
        return std::exp(pdh_m + val) * X[0];
    }

    // Osmotic coefficient from the water activity: ln a_w = -phi * nu * m * Mw/1000.
    double osmoticCoefficient(double m, double T = 298.15) const
    {
        if (m <= 0.0) return 1.0;
        return -std::log(waterActivity(m, T)) * 1000.0 / ((nu_c + nu_a) * m * Mw);
    }

    // MIXED-SOLVENT gamma_pm: water + an antisolvent at salt-free mole fraction
    // xAnti (molar mass MwAnti [g/mol], relative permittivity epsAnti, molar
    // volume vAnti [m3/mol]).  Drowning-out = dielectric mixing (A_DH grows as eps
    // drops) + Born (ion transfer from water to the lower-eps mix).  Now fully
    // temperature-dependent (eps_w(T), v_w(T), tau(T), Born at T).  xAnti=0 ->
    // the aqueous gammaPM; T=298.15 -> the validated 25 C kernel.
    double gammaPMMixed(double m, double xAnti, double MwAnti,
                        double epsAnti, double vAnti, double T = 298.15,
                        double bornR = 1.0e-10) const
    {
        if (m <= 0.0) return 1.0;
        const double epsW = SolventProperties::epsWater(T);
        const double vW   = SolventProperties::vWater(T);
        const double xW = 1.0 - xAnti;
        const double wW = xW * Mw / (xW * Mw + xAnti * MwAnti);
        const double epsmix = wW * epsW + (1.0 - wW) * epsAnti;
        const double vmix   = xW * vW + xAnti * vAnti;
        const double Mwmix  = xW * Mw + xAnti * MwAnti;
        const double Amix = (1.0/3.0) * std::sqrt(2.0*M_PI*NA/vmix)
            * std::pow(ech*ech / (4.0*M_PI*epsmix*e0*kB*T), 1.5);
        const double born = (ech*ech / (8.0*M_PI*e0*kB*T)) * (1.0/epsmix - 1.0/epsW) / bornR;
        return std::exp(lnGammaX(m, Amix, Mwmix, T) + born)
             / (1.0 + 0.001 * Mwmix * (nu_c + nu_a) * m);
    }

private:
    // Physical constants (SI).
    static constexpr double NA  = 6.02214076e23;
    static constexpr double ech = 1.602176634e-19;
    static constexpr double kB  = 1.380649e-23;
    static constexpr double e0  = 8.8541878128e-12;
};

} // namespace Choupo
