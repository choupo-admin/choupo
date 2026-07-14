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
  ENRTLMultiSalt --- MULTICOMPONENT (multi-salt) symmetric electrolyte NRTL,
  Song & Chen 2009 (Ind. Eng. Chem. Res. 48, 7788, DOI 10.1021/ie9004578),
  aqueous single-solvent slice, closed form + a finite-difference ORACLE.

  WHAT THIS IS.  The 2009 reformulation of eNRTL: the excess Gibbs energy is
  written species-wise (molecules m, cations c, anions a) with

      G^ex,lc/nRT :  eq 20   (three sums: molecule-centred, cation-centred,
                              anion-centred local cells; X_j = C_j x_j with
                              C_j = |z_j| for ions, 1 for molecules)
      G^ex,PDH/nRT:  eq 60   (extended symmetric Pitzer-Debye-Huckel with the
                              multicomponent ionic strength, eq 62)

  and the activity coefficients are the analytic derivatives: eq 25 (molecule),
  eqs 26/27 (cation/anion, divided by z), eq 70 (PDH).  The NONADJUSTABLE
  ion-molecule / ion-ion binaries come from the published mixing rules over
  the adjustable (m,ca) and (ca,c'a')/(ca,ca') pair parameters:

      charge fractions   Y_c = X_c / sum_c' X_c',  Y_a likewise   (eqs 36-37)
      G_cm = sum_a Y_a G_ca,m          G_mc = sum_a Y_a G_m,ca    (eqs 38,40)
      G_am = sum_c Y_c G_ca,m          G_ma = sum_c Y_c G_m,ca    (eqs 39,41)
      G_ca (c around central a) = sum_c' Y_c' G_ca,c'a            (eq 42)
      G_ac (a around central c) = sum_a' Y_a' G_ac,a'c            (eq 43)
      tau = -ln G / alpha  for every effective binary             (eq 44)

  REFERENCE STATES.  The symmetric model references pure fused salt (eq 15).
  This slice exposes the AQUEOUS INFINITE-DILUTION (unsymmetric) surface the
  validation data uses, via the published normalisation:
      ln gamma*lc_i  = ln gamma^lc_i - ln gamma^lc,inf_i          (eqs 52-55;
        the x_w -> 1 limit, which for a cation is z_c (G_cw tau_cw + tau_wc))
      ln gamma*PDH_i = eq 70 with I0_x = 0 (the unsymmetric PDH; the paper's
        remark after eq 62).
  For ONE salt this collapses exactly onto the validated ENRTLSingleSalt
  kernel (the reduction pin the op locks); the fused-salt-referenced branch
  is deliberately NOT exposed until a use case needs it.

  THE ORACLE.  verify() rebuilds every ln gamma by central finite differences
  of n.G^ex/RT in mole numbers (eq 2) and returns the max |analytic - FD| --
  the same self-check contract as PitzerHMW::verify().  Index bugs in eqs
  26/27 cannot hide from it.

  SCOPE (declared, not silent): one molecular solvent (water); electrolyte-
  electrolyte parameters tau_ca,c'a (same anion) and tau_ca,ca' (same cation)
  supported with a fixed alpha_ee; no temperature extension of tau beyond the
  (298.15/T) scaling used by the single-salt kernel; no mixed solvent (that
  is ENRTLMixedSolvent's job; eqs 77-78 arrive with a validated use case).
\*---------------------------------------------------------------------------*/

#pragma once

#include "SolventProperties.H"
#include <cmath>
#include <string>
#include <vector>

namespace Choupo {

class ENRTLMultiSalt
{
public:
    // ---- species ---------------------------------------------------------
    struct IonSpec { std::string name; double z; };    // z = |charge|

    // solvent (index 0 of the species vector)
    double Mw   = 18.015;      // [g/mol]
    double A_DH = 2.9127;      // mole-fraction PDH parameter, water 25 C
    double rho  = 14.9;        // closest approach

    std::vector<IonSpec> cations;
    std::vector<IonSpec> anions;

    // ---- adjustable parameters -------------------------------------------
    // per (cation,anion) pair: molecule<->electrolyte energies + nonrandomness
    struct PairParams { double tau_m_ca = 0, tau_ca_m = 0, alpha = 0.2; };
    // pp[c][a] over the cation/anion lists
    std::vector<std::vector<PairParams>> pp;

    // electrolyte-electrolyte (eqs 28-29): tauEEsameA[c][c'][a] would be the
    // full shape; this slice stores the same-anion tau_ca,c'a and same-cation
    // tau_ca,ca' as dense matrices (0 = absent, the common case).
    //   tauEE_A[a][c][cp] : tau_(c a),(c' a)   -- same anion a
    //   tauEE_C[c][a][ap] : tau_(c a),(c a')   -- same cation c
    std::vector<std::vector<std::vector<double>>> tauEE_A, tauEE_C;
    double alphaEE = 0.2;

    // temperature scaling of tau (the single-salt kernel's convention)
    static double tauT(double tau25, double T) { return tau25 * (298.15 / T); }

    // ---- setup helpers ----------------------------------------------------
    int addCation(const std::string& n, double z)
    { cations.push_back({n, z}); resize(); return int(cations.size()) - 1; }
    int addAnion(const std::string& n, double z)
    { anions.push_back({n, z}); resize(); return int(anions.size()) - 1; }
    void setPair(int c, int a, double tmca, double tcam, double alpha = 0.2)
    { pp[c][a] = {tmca, tcam, alpha}; }
    void setTauEEsameAnion(int a, int c, int cp, double tau)          // tau_(ca),(c'a)
    { tauEE_A[a][c][cp] = tau; }
    void setTauEEsameCation(int c, int a, int ap, double tau)         // tau_(ca),(ca')
    { tauEE_C[c][a][ap] = tau; }

    // ------------------------------------------------------------------
    //  Species bookkeeping: index 0 = solvent, then cations, then anions.
    // ------------------------------------------------------------------
    int nC() const { return int(cations.size()); }
    int nA() const { return int(anions.size()); }
    int nSp() const { return 1 + nC() + nA(); }
    int idxC(int c) const { return 1 + c; }
    int idxA(int a) const { return 1 + nC() + a; }
    double zOf(int i) const
    {
        if (i == 0) return 0.0;
        if (i <= nC()) return cations[i-1].z;
        return anions[i-1-nC()].z;
    }
    double Cfac(int i) const { return i == 0 ? 1.0 : zOf(i); }        // eq 21

    // ------------------------------------------------------------------
    //  The effective binary tables G[i][j], tau[i][j] ("i around central j")
    //  at composition X (charge-weighted fractions) and temperature T.
    //  Composition-DEPENDENT through the charge fractions Y (eqs 32-43) --
    //  rebuilt at every state, glass-box, no caching cleverness.
    // ------------------------------------------------------------------
    void buildTables(const std::vector<double>& X, double T,
                     std::vector<std::vector<double>>& G,
                     std::vector<std::vector<double>>& tau) const
    {
        const int N = nSp();
        G.assign(N, std::vector<double>(N, 1.0));
        tau.assign(N, std::vector<double>(N, 0.0));

        // charge fractions (eqs 36-37); at zero total ions fall back to
        // equal fractions (the Y's multiply ion-ion terms that vanish there).
        double sC = 0, sA = 0;
        for (int c = 0; c < nC(); ++c) sC += X[idxC(c)];
        for (int a = 0; a < nA(); ++a) sA += X[idxA(a)];
        auto Yc = [&](int c){ return sC > 0 ? X[idxC(c)]/sC : 1.0/nC(); };
        auto Ya = [&](int a){ return sA > 0 ? X[idxA(a)]/sA : 1.0/nA(); };

        // pair G's at T
        auto Gmca = [&](int c, int a){ return std::exp(-pp[c][a].alpha * tauT(pp[c][a].tau_m_ca, T)); };
        auto Gcam = [&](int c, int a){ return std::exp(-pp[c][a].alpha * tauT(pp[c][a].tau_ca_m, T)); };

        // ---- ion <-> molecule (eqs 38-41), tau back via eq 44 ------------
        for (int c = 0; c < nC(); ++c)
        {
            double g = 0, alph = 0;
            for (int a = 0; a < nA(); ++a) { g += Ya(a)*Gcam(c,a); alph += Ya(a)*pp[c][a].alpha; }
            G[idxC(c)][0] = g;  tau[idxC(c)][0] = -std::log(g)/alph;               // c around m
            double g2 = 0;
            for (int a = 0; a < nA(); ++a) g2 += Ya(a)*Gmca(c,a);
            // m around c uses the same composition-average over the anions
            G[0][idxC(c)] = g2; tau[0][idxC(c)] = -std::log(g2)/alph;              // eq 40
        }
        for (int a = 0; a < nA(); ++a)
        {
            double g = 0, alph = 0;
            for (int c = 0; c < nC(); ++c) { g += Yc(c)*Gcam(c,a); alph += Yc(c)*pp[c][a].alpha; }
            G[idxA(a)][0] = g;  tau[idxA(a)][0] = -std::log(g)/alph;               // a around m
            double g2 = 0;
            for (int c = 0; c < nC(); ++c) g2 += Yc(c)*Gmca(c,a);
            G[0][idxA(a)] = g2; tau[0][idxA(a)] = -std::log(g2)/alph;              // eq 41
        }

        // ---- ion <-> ion (eqs 42-43): like-ion entries stay 1/0 ----------
        // c around central a: average over the OTHER cations sharing a
        for (int a = 0; a < nA(); ++a)
            for (int c = 0; c < nC(); ++c)
            {
                double g = 0;
                for (int cp = 0; cp < nC(); ++cp)
                    g += Yc(cp) * std::exp(-alphaEE * tauT(tauEE_A[a][c][cp], T));
                G[idxC(c)][idxA(a)] = g;
                tau[idxC(c)][idxA(a)] = -std::log(g)/alphaEE;
            }
        // a around central c
        for (int c = 0; c < nC(); ++c)
            for (int a = 0; a < nA(); ++a)
            {
                double g = 0;
                for (int ap = 0; ap < nA(); ++ap)
                    g += Ya(ap) * std::exp(-alphaEE * tauT(tauEE_C[c][a][ap], T));
                G[idxA(a)][idxC(c)] = g;
                tau[idxA(a)][idxC(c)] = -std::log(g)/alphaEE;
            }
    }

    // ------------------------------------------------------------------
    //  n.G^ex,lc/RT  (eq 19/20 times n) from raw MOLE NUMBERS.
    //  The FD oracle differentiates THIS.
    // ------------------------------------------------------------------
    double nGexLC(const std::vector<double>& nmoles, double T) const
    {
        const int N = nSp();
        double ntot = 0; for (double v : nmoles) ntot += v;
        std::vector<double> X(N);
        for (int i = 0; i < N; ++i) X[i] = Cfac(i) * nmoles[i] / ntot;

        std::vector<std::vector<double>> G, tau;
        buildTables(X, T, G, tau);

        auto cell = [&](int centre, bool excludeLike) -> double
        {
            double num = 0, den = 0;
            for (int i = 0; i < N; ++i)
            {
                if (excludeLike && sameChargeGroup(i, centre)) continue;
                den += X[i]*G[i][centre]; num += X[i]*G[i][centre]*tau[i][centre];
            }
            return den > 0 ? num/den : 0.0;
        };
        double g = nmoles[0] * cell(0, false);                                   // molecule-centred
        for (int c = 0; c < nC(); ++c)
            g += zOf(idxC(c)) * nmoles[idxC(c)] * cell(idxC(c), true);           // cation-centred
        for (int a = 0; a < nA(); ++a)
            g += zOf(idxA(a)) * nmoles[idxA(a)] * cell(idxA(a), true);           // anion-centred
        return g;                                                                 // = n.Gex,lc/RT
    }

    // like-ion repulsion bookkeeping: ions of the same charge sign never
    // neighbour each other; the central species itself is excluded too.
    bool sameChargeGroup(int i, int centre) const
    {
        if (centre == 0) return false;
        const bool centreCat = centre <= nC();
        if (i == 0) return false;
        const bool iCat = i <= nC();
        return iCat == centreCat;                     // includes i == centre
    }

    // ------------------------------------------------------------------
    //  n.G^ex,PDH/RT (symmetric, eqs 60-62 + 64-67) from mole numbers.
    // ------------------------------------------------------------------
    double IxOf(const std::vector<double>& nmoles) const                          // eq 62
    {
        double ntot = 0; for (double v : nmoles) ntot += v;
        double I = 0;
        for (int i = 1; i < nSp(); ++i) I += (nmoles[i]/ntot) * zOf(i)*zOf(i);
        return 0.5 * I;
    }
    double Ix0Of(const std::vector<double>& nmoles) const                         // eqs 65-67
    {
        double sIons = 0; for (int i = 1; i < nSp(); ++i) sIons += nmoles[i];
        if (sIons <= 0) return 0.0;
        double I = 0;
        for (int i = 1; i < nSp(); ++i) I += (nmoles[i]/sIons) * zOf(i)*zOf(i);
        return 0.5 * I;
    }
    double nGexPDH(const std::vector<double>& nmoles, double T, bool symmetric) const
    {
        double ntot = 0; for (double v : nmoles) ntot += v;
        const double A  = A_DH * SolventProperties::debyeHuckelFactor(T);
        const double Ix  = IxOf(nmoles);
        const double I0  = symmetric ? Ix0Of(nmoles) : 0.0;
        if (Ix <= 0) return 0.0;
        return -ntot * (4.0*A*Ix/rho)
               * std::log((1.0 + rho*std::sqrt(Ix)) / (1.0 + rho*std::sqrt(I0)));  // eq 60
    }

    // ------------------------------------------------------------------
    //  ANALYTIC ln gamma's.
    // ------------------------------------------------------------------
    // local-composition part for every species (eqs 25-27), SYMMETRIC surface
    std::vector<double> lnGammaLC(const std::vector<double>& X, double T) const
    {
        const int N = nSp();
        std::vector<std::vector<double>> G, tau;
        buildTables(X, T, G, tau);

        auto cellSums = [&](int centre, bool excl, double& num, double& den)
        {
            num = den = 0;
            for (int i = 0; i < N; ++i)
            {
                if (excl && sameChargeGroup(i, centre)) continue;
                den += X[i]*G[i][centre]; num += X[i]*G[i][centre]*tau[i][centre];
            }
        };
        std::vector<double> ln(N, 0.0);

        // eq 25: molecule
        {
            double num, den; cellSums(0, false, num, den);
            double v = num/den;                                       // own-cell ratio
            for (int j = 0; j < N; ++j)                               // as neighbour in every cell
            {
                if (j == 0) { double n2, d2; cellSums(0, false, n2, d2);
                              v += X[0]*G[0][0]/d2 * (tau[0][0] - n2/d2); continue; }
                double n2, d2; cellSums(j, true, n2, d2);
                if (d2 <= 0) continue;
                v += X[j]*G[0][j]/d2 * (tau[0][j] - n2/d2);
            }
            ln[0] = v;
        }
        // eqs 26/27: ions (result multiplied by z at the end)
        for (int s = 1; s < N; ++s)
        {
            double v = 0;
            {   // as neighbour in the molecule cell
                double n2, d2; cellSums(0, false, n2, d2);
                v += X[0]*G[s][0]/d2 * (tau[s][0] - n2/d2);
            }
            {   // own cell (like ions excluded)
                double n2, d2; cellSums(s, true, n2, d2);
                if (d2 > 0) v += n2/d2;
            }
            // as neighbour in every oppositely-charged cell
            for (int j = 1; j < N; ++j)
            {
                if (sameChargeGroup(j, s)) continue;
                double n2, d2; cellSums(j, true, n2, d2);
                if (d2 <= 0) continue;
                v += X[j]*G[s][j]/d2 * (tau[s][j] - n2/d2);
            }
            ln[s] = zOf(s) * v;
        }
        return ln;
    }

    // ------------------------------------------------------------------
    //  THE CONSISTENT (refined) CORRECTION.  The published expressions
    //  (eqs 25-27) differentiate G^ex,lc treating the effective binaries
    //  G[i][j], tau[i][j] as CONSTANTS -- but the mixing rules (eqs 32-43)
    //  make them functions of the charge fractions Y, which depend on the
    //  ionic mole numbers.  The exact derivative adds, by the chain rule,
    //
    //     Delta_i = sum_{j,k} [ dnG/dG[j][k] * dG[j][k]/dn_i
    //                         + dnG/dtau[j][k] * dtau[j][k]/dn_i ]
    //
    //  with (w_k = the cell weight: n_w for the molecule cell, z_k n_k for
    //  ion cells; num_k/den_k the cell sums):
    //     dnG/dtau[j][k] = w_k X_j G[j][k] / den_k
    //     dnG/dG[j][k]   = w_k X_j (tau[j][k] den_k - num_k) / den_k^2
    //  and dG/dn_i, dtau/dn_i through dY/dn_i only (Y is a ratio of ionic
    //  mole numbers -- the solvent count cancels):
    //     dY_a/dn_i = (delta_{ia} - Y_a) C_i / sum_a' C_a' n_a'   (i anion)
    //  This is the refined-eNRTL idea (Bollas, Chen & Barton 2008, AIChE J
    //  54, 1608) applied to the 2009 symmetric formulation: gamma becomes
    //  the EXACT derivative of the same excess Gibbs energy, and the FD
    //  oracle drops to ~1e-9 at every composition -- the self-validating
    //  property that defines the correction.
    // ------------------------------------------------------------------
    std::vector<double> lnGammaLCConsistentDelta(const std::vector<double>& nmoles,
                                                 double T) const
    {
        const int N = nSp();
        double ntot = 0; for (double v : nmoles) ntot += v;
        std::vector<double> X(N);
        for (int i = 0; i < N; ++i) X[i] = Cfac(i) * nmoles[i] / ntot;

        std::vector<std::vector<double>> G, tau;
        buildTables(X, T, G, tau);

        // charge-fraction denominators (sums of C_j n_j over each sign group)
        double SC = 0, SA = 0;
        for (int c = 0; c < nC(); ++c) SC += Cfac(idxC(c)) * nmoles[idxC(c)];
        for (int a = 0; a < nA(); ++a) SA += Cfac(idxA(a)) * nmoles[idxA(a)];
        auto Yc = [&](int c){ return SC > 0 ? Cfac(idxC(c))*nmoles[idxC(c)]/SC : 1.0/nC(); };
        auto Ya = [&](int a){ return SA > 0 ? Cfac(idxA(a))*nmoles[idxA(a)]/SA : 1.0/nA(); };

        // pair G's at T (same shorthands as buildTables)
        auto Gmca = [&](int c, int a){ return std::exp(-pp[c][a].alpha * tauT(pp[c][a].tau_m_ca, T)); };
        auto Gcam = [&](int c, int a){ return std::exp(-pp[c][a].alpha * tauT(pp[c][a].tau_ca_m, T)); };
        auto GeeA = [&](int a, int c, int cp){ return std::exp(-alphaEE * tauT(tauEE_A[a][c][cp], T)); };
        auto GeeC = [&](int c, int a, int ap){ return std::exp(-alphaEE * tauT(tauEE_C[c][a][ap], T)); };

        // cell weights and sums at the state
        auto cellWeight = [&](int k){ return k == 0 ? nmoles[0] : zOf(k)*nmoles[k]; };
        auto cellSums = [&](int centre, double& num, double& den)
        {
            num = den = 0;
            const bool excl = (centre != 0);
            for (int i = 0; i < N; ++i)
            {
                if (excl && sameChargeGroup(i, centre)) continue;
                den += X[i]*G[i][centre]; num += X[i]*G[i][centre]*tau[i][centre];
            }
        };

        // sensitivity of nGexLC to ONE table entry (j around centre k)
        auto dnG_dG = [&](int j, int k, double& wrtG, double& wrtTau)
        {
            double num, den; cellSums(k, num, den);
            const double w = cellWeight(k);
            if (den <= 0) { wrtG = wrtTau = 0; return; }
            wrtTau = w * X[j]*G[j][k] / den;
            wrtG   = w * X[j] * (tau[j][k]*den - num) / (den*den);
        };

        std::vector<double> delta(N, 0.0);

        // For each perturbable species i (ions only -- Y is solvent-free),
        // accumulate the chain-rule terms over every Y-DEPENDENT table entry.
        for (int i = 1; i < N; ++i)
        {
            const bool iCat = (i <= nC());
            double d = 0.0;

            // dY of the same-sign group under dn_i
            auto dYc = [&](int c){ return (iCat && SC > 0)
                ? ((idxC(c) == i ? 1.0 : 0.0) - Yc(c)) * Cfac(i)/SC : 0.0; };
            auto dYa = [&](int a){ return (!iCat && SA > 0)
                ? ((idxA(a) == i ? 1.0 : 0.0) - Ya(a)) * Cfac(i)/SA : 0.0; };

            // ---- ion-molecule entries -----------------------------------
            for (int c = 0; c < nC(); ++c)
            {
                // G[c][0] = sum_a Ya Gcam ; abar = sum_a Ya alpha
                double g = G[idxC(c)][0];
                double abar = 0; for (int a = 0; a < nA(); ++a) abar += Ya(a)*pp[c][a].alpha;
                double dg = 0, dabar = 0;
                for (int a = 0; a < nA(); ++a) { dg += dYa(a)*Gcam(c,a); dabar += dYa(a)*pp[c][a].alpha; }
                if (dg != 0 || dabar != 0)
                {
                    const double dtau = -(dg/(g*abar)) + std::log(g)*dabar/(abar*abar);
                    double wG, wT; dnG_dG(idxC(c), 0, wG, wT);
                    d += wG*dg + wT*dtau;
                }
                // G[0][c] = sum_a Ya Gmca (m around c), same abar
                double g2 = G[0][idxC(c)];
                double dg2 = 0; for (int a = 0; a < nA(); ++a) dg2 += dYa(a)*Gmca(c,a);
                if (dg2 != 0 || dabar != 0)
                {
                    const double dtau2 = -(dg2/(g2*abar)) + std::log(g2)*dabar/(abar*abar);
                    double wG, wT; dnG_dG(0, idxC(c), wG, wT);
                    d += wG*dg2 + wT*dtau2;
                }
            }
            for (int a = 0; a < nA(); ++a)
            {
                double g = G[idxA(a)][0];
                double abar = 0; for (int c = 0; c < nC(); ++c) abar += Yc(c)*pp[c][a].alpha;
                double dg = 0, dabar = 0;
                for (int c = 0; c < nC(); ++c) { dg += dYc(c)*Gcam(c,a); dabar += dYc(c)*pp[c][a].alpha; }
                if (dg != 0 || dabar != 0)
                {
                    const double dtau = -(dg/(g*abar)) + std::log(g)*dabar/(abar*abar);
                    double wG, wT; dnG_dG(idxA(a), 0, wG, wT);
                    d += wG*dg + wT*dtau;
                }
                double g2 = G[0][idxA(a)];
                double dg2 = 0; for (int c = 0; c < nC(); ++c) dg2 += dYc(c)*Gmca(c,a);
                if (dg2 != 0 || dabar != 0)
                {
                    const double dtau2 = -(dg2/(g2*abar)) + std::log(g2)*dabar/(abar*abar);
                    double wG, wT; dnG_dG(0, idxA(a), wG, wT);
                    d += wG*dg2 + wT*dtau2;
                }
            }

            // ---- ion-ion entries (alphaEE fixed => dabar = 0) -----------
            for (int a = 0; a < nA(); ++a)
                for (int c = 0; c < nC(); ++c)
                {
                    // G[c][a] = sum_c' Yc' GeeA(a,c,c')
                    double g = G[idxC(c)][idxA(a)];
                    double dg = 0; for (int cp = 0; cp < nC(); ++cp) dg += dYc(cp)*GeeA(a,c,cp);
                    if (dg != 0)
                    {
                        const double dtau = -dg/(g*alphaEE);
                        double wG, wT; dnG_dG(idxC(c), idxA(a), wG, wT);
                        d += wG*dg + wT*dtau;
                    }
                }
            for (int c = 0; c < nC(); ++c)
                for (int a = 0; a < nA(); ++a)
                {
                    double g = G[idxA(a)][idxC(c)];
                    double dg = 0; for (int ap = 0; ap < nA(); ++ap) dg += dYa(ap)*GeeC(c,a,ap);
                    if (dg != 0)
                    {
                        const double dtau = -dg/(g*alphaEE);
                        double wG, wT; dnG_dG(idxA(a), idxC(c), wG, wT);
                        d += wG*dg + wT*dtau;
                    }
                }

            delta[i] = d;
        }
        return delta;
    }

    // symmetric PDH for every species (eqs 69-70 with the I0 terms, eqs 72-76)
    std::vector<double> lnGammaPDH(const std::vector<double>& nmoles, double T,
                                   bool symmetric) const
    {
        const int N = nSp();
        const double A  = A_DH * SolventProperties::debyeHuckelFactor(T);
        const double Ix = IxOf(nmoles);
        const double sI = std::sqrt(Ix);
        std::vector<double> ln(N, 0.0);
        if (Ix <= 0) return ln;

        // solvent: eq 69.  I0 is a function of ION fractions only, so d I0/dn_w
        // = 0 and the reference term of eq 60 contributes nothing new to the
        // solvent derivative -- eq 69 holds for both reference states.
        ln[0] = 2.0*A*std::pow(Ix,1.5)/(1.0 + rho*sI);

        // ions: eq 70
        double sIons = 0; for (int i = 1; i < N; ++i) sIons += nmoles[i];
        for (int i = 1; i < N; ++i)
        {
            const double z = zOf(i);
            double v = -A * ((2.0*z*z/rho) * std::log(1.0 + rho*sI)
                     + (z*z*sI - 2.0*std::pow(Ix,1.5)) / (1.0 + rho*sI));
            if (symmetric && sIons > 0)
            {
                const double I0v = Ix0Of(nmoles);
                const double s0  = std::sqrt(I0v);
                // n dI0/dn_i  (eqs 75-76): I0 depends on ion fractions only
                double ndI0 = 0.0;
                for (int j = 1; j < N; ++j)
                {
                    const double xj0 = nmoles[j]/sIons;
                    const double d   = ((i == j ? 1.0 : 0.0) - xj0) / sIons;
                    ndI0 += 0.5 * zOf(j)*zOf(j) * d;
                }
                // eq 70's I0 terms (per mole basis: the derivation of eq 60)
                v += A * (2.0*z*z/rho) * std::log(1.0 + rho*s0);
                double ntot = 0; for (double q : nmoles) ntot += q;
                v += A * (4.0*Ix/rho) * (rho/(2.0*s0*(1.0+rho*s0))) * (ndI0 * ntot);
            }
            ln[i] = v;
        }
        return ln;
    }

    // ------------------------------------------------------------------
    //  THE AQUEOUS UNSYMMETRIC SURFACE (what the validation data speaks).
    //  molalities: per-cation and per-anion mol/kg water.
    //  Returns mole-fraction-scale ln gamma* per ion, aqueous inf-dilution
    //  referenced (eqs 52-55 + unsymmetric PDH).
    // ------------------------------------------------------------------
    struct State
    {
        std::vector<double> nmoles;   // solvent + ions
        std::vector<double> X;        // charge-weighted fractions
    };
    State stateOf(const std::vector<double>& mCat, const std::vector<double>& mAn) const
    {
        State s;
        s.nmoles.assign(nSp(), 0.0);
        s.nmoles[0] = 1000.0 / Mw;
        for (int c = 0; c < nC(); ++c) s.nmoles[idxC(c)] = mCat[c];
        for (int a = 0; a < nA(); ++a) s.nmoles[idxA(a)] = mAn[a];
        double ntot = 0; for (double v : s.nmoles) ntot += v;
        s.X.assign(nSp(), 0.0);
        for (int i = 0; i < nSp(); ++i) s.X[i] = Cfac(i) * s.nmoles[i] / ntot;
        return s;
    }

    std::vector<double> lnGammaStarX(const std::vector<double>& mCat,
                                     const std::vector<double>& mAn,
                                     double T = 298.15,
                                     bool consistent = false) const
    {
        const State s = stateOf(mCat, mAn);
        const int N = nSp();

        // symmetric lc at the state
        std::vector<double> lc = lnGammaLC(s.X, T);

        if (consistent)
        {
            // the refined correction at the state ...
            const std::vector<double> dl = lnGammaLCConsistentDelta(s.nmoles, T);
            // ... and at the aqueous infinite-dilution reference (the SAME
            // ionic ratios at vanishing molality -- Delta converges there,
            // see the tutorial's dilution-limit check).
            const double scale = 1e-10;
            std::vector<double> mCr(mCat), mAr(mAn);
            for (double& v : mCr) v *= scale;
            for (double& v : mAr) v *= scale;
            const State r = stateOf(mCr, mAr);
            const std::vector<double> dl0 = lnGammaLCConsistentDelta(r.nmoles, T);
            for (int i = 1; i < N; ++i) lc[i] += dl[i] - dl0[i];
        }

        // aqueous infinite-dilution lc reference (eqs 54-55): the x_w -> 1
        // limit, evaluated with the SAME effective binaries the state sees
        // (the charge fractions Y are composition ratios and survive the
        // dilution limit).
        {
            std::vector<std::vector<double>> G, tau;
            buildTables(s.X, T, G, tau);
            for (int i = 1; i < N; ++i)
                lc[i] -= zOf(i) * (G[i][0]*tau[i][0] + tau[0][i]);
        }

        // unsymmetric PDH (I0 = 0)
        std::vector<double> pdh = lnGammaPDH(s.nmoles, T, /*symmetric=*/false);

        std::vector<double> ln(N, 0.0);
        for (int i = 1; i < N; ++i) ln[i] = lc[i] + pdh[i];
        return ln;                                                    // ions only
    }

    // molality-scale mean ionic gamma of salt (c,a) with stoichiometry from
    // electroneutrality (nu_c = z_a, nu_a = z_c), in the mixed solution.
    double gammaPMm(int c, int a,
                    const std::vector<double>& mCat, const std::vector<double>& mAn,
                    double T = 298.15, bool consistent = false) const
    {
        const std::vector<double> ln = lnGammaStarX(mCat, mAn, T, consistent);
        const double zc = cations[c].z, za = anions[a].z;
        const double lnpm = (za*ln[idxC(c)] + zc*ln[idxA(a)]) / (zc + za);   // eq 10
        double mIons = 0;
        for (double v : mCat) mIons += v;
        for (double v : mAn)  mIons += v;
        return std::exp(lnpm) / (1.0 + 0.001 * Mw * mIons);           // x -> m scale
    }

    // ------------------------------------------------------------------
    //  THE ORACLE: max |analytic - FD| over all species' ln gamma at the
    //  given state, on the SYMMETRIC surface (lc + symmetric PDH), where
    //  ln gamma_i = d(n Gex/RT)/dn_i exactly (eq 2).
    // ------------------------------------------------------------------
    //  TWO honest readings of the result:
    //  * single-salt states (no composition-dependence in the mixing rules):
    //    the published expressions ARE the exact derivative -- expect ~1e-9.
    //    This is the correctness gate for the implementation.
    //  * MIXED states: the published model is NOT exactly Gibbs-Duhem
    //    consistent -- eqs 25-27 treat the effective binaries as constants
    //    while the mixing rules (eqs 32-43) make them composition-dependent
    //    through the charge fractions Y.  This is the documented limitation
    //    the "refined eNRTL" (Bollas, Chen & Barton 2008, AIChE J 54, 1608 --
    //    the paper's own ref 13) exists to fix.  verify() REPORTS that
    //    inconsistency instead of hiding it; the op prints it aloud.
    double verify(const std::vector<double>& mCat, const std::vector<double>& mAn,
                  double T = 298.15, bool consistent = false) const
    {
        const State s = stateOf(mCat, mAn);
        const int N = nSp();

        std::vector<double> lc  = lnGammaLC(s.X, T);
        if (consistent)
        {
            const std::vector<double> dl = lnGammaLCConsistentDelta(s.nmoles, T);
            for (int i = 0; i < N; ++i) lc[i] += dl[i];
        }
        std::vector<double> pdh = lnGammaPDH(s.nmoles, T, /*symmetric=*/true);

        double maxDev = 0.0;
        for (int i = 0; i < N; ++i)
        {
            if (s.nmoles[i] <= 0.0) continue;      // absent species: no derivative
            const double h = 1e-6 * std::max(1.0, s.nmoles[i]);
            std::vector<double> np = s.nmoles, nm = s.nmoles;
            np[i] += h; nm[i] -= h;
            const double num =
                (nGexLC(np, T) + nGexPDH(np, T, true))
              - (nGexLC(nm, T) + nGexPDH(nm, T, true));
            const double fd = num / (2.0 * h);
            const double an = lc[i] + pdh[i];
            maxDev = std::max(maxDev, std::fabs(an - fd));
        }
        return maxDev;
    }

private:
    void resize()
    {
        pp.assign(cations.size(), std::vector<PairParams>(anions.size()));
        tauEE_A.assign(anions.size(),
            std::vector<std::vector<double>>(cations.size(),
                std::vector<double>(cations.size(), 0.0)));
        tauEE_C.assign(cations.size(),
            std::vector<std::vector<double>>(anions.size(),
                std::vector<double>(anions.size(), 0.0)));
    }
};

} // namespace Choupo
