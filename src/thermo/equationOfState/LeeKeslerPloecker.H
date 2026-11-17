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
    Choupo::LeeKeslerPloecker

Description
    The Lee-Kesler equation of state with the Ploecker-Knapp-Prausnitz mixing
    rules -- a THREE-PARAMETER CORRESPONDING-STATES correlation for non-polar
    and slightly polar fluids and their mixtures, vapour and liquid, from one
    analytic equation.

        B. I. Lee & M. G. Kesler, AIChE J. 21 (1975) 510-527   [LK]
        U. Ploecker, H. Knapp & J. Prausnitz, Ind. Eng. Chem. Process Des.
            Dev. 17 (1978) 324-332                               [PKP]

    A fluid of acentric factor omega is priced from TWO fluids of the same
    modified-BWR form (LK Eq. 3), a simple fluid (omega = 0) and a reference
    fluid (n-octane, omega_r = 0.3978), each at the SAME T_r and P_r:

        Z = Z0 + (omega/omega_r) (Zr - Z0)                       (LK Eq. 2)

        Z = P_r V_r / T_r
          = 1 + B/V_r + C/V_r^2 + D/V_r^5
              + c4/(T_r^3 V_r^2) (beta + gamma/V_r^2) exp(-gamma/V_r^2)   (3)
        B = b1 - b2/T_r - b3/T_r^2 - b4/T_r^3                    (4)
        C = c1 - c2/T_r + c3/T_r^3                               (5)
        D = d1 + d2/T_r                                          (6)

    V_r = P_c V/(R T_c) is NOT the reduced volume (LK p. 513).  The constants
    of both fluids are LK Table 1 (p. 511); the same quantity is printed again
    in PKP Table A-I, where the simple fluid's d1 reads 0.155428 -- a
    transposition against LK's 0.155488, the value used here (the gate pins
    both readings).

    Every other property is the SAME blend of the two fluids' own functions
    (LK Eqs. 9-12, p. 513-514), with the ideal-gas state at the SAME (T, P):

        ln(f/P)    = Z - 1 - ln Z + B/V_r + C/(2V_r^2) + D/(5V_r^5) + E       (9)
        E          = c4/(2 T_r^3 gamma) { beta + 1
                       - (beta + 1 + gamma/V_r^2) exp(-gamma/V_r^2) }         (10)
        H^R/(R T)  = Z - 1 - (b2 + 2 b3/T_r + 3 b4/T_r^2)/(T_r V_r)
                       - (c2 - 3 c3/T_r^2)/(2 T_r V_r^2)
                       + d2/(5 T_r V_r^5) + 3E                                (11)
        S^R/R      = ln Z - (b1 + b3/T_r^2 + 2 b4/T_r^3)/V_r
                       - (c1 - 2 c3/T_r^3)/(2 V_r^2) - d1/(5 V_r^5) + 2E     (12)

    (Eq. 11 prints (H - H*)/(R T_c) = T_r { ... }, so H^R = R T { ... }; Eq. 12
    prints (S - S*)/R + ln(P/P*), the departure against the ideal gas at the
    same P.)  These satisfy G^R = H^R - T S^R = R T ln phi identically.

    THE ROOT.  Eq. (3) at (T_r, P_r) has one or three real roots in V_r.  The
    vapour root is the LARGEST, the liquid root the SMALLEST; each fluid
    (simple, reference) takes the requested phase's root of its own equation,
    as the LK tables do.  A single root answers both requests (the family's
    PSEUDO-ROOT flags say which phase it belongs to, by V_r against 0.29, the
    simple fluid's own P_c V/(R T_c) at the critical point).

    MIXTURES (PKP Eqs. 9-14).  One-fluid theory with pseudo-critical constants:

        V_cM   = sum_j sum_k z_j z_k V_cjk                       (10)
        T_cM   = V_cM^(-eta) sum_j sum_k z_j z_k V_cjk^eta T_cjk (9)
        omega_M = sum_j z_j omega_j                              (11)
        T_cjk  = sqrt(T_cj T_ck) kappa_jk                        (12)
        V_cjk  = (1/8) (V_cj^(1/3) + V_ck^(1/3))^3               (13)
        P_cM   = (0.2905 - 0.085 omega_M) R T_cM / V_cM          (14)

    with the universal exponent eta = 0.25 (PKP p. 325).  A pure component's
    critical volume is V_c = (0.2905 - 0.085 omega) R T_c / P_c (LK Eqs. 20-21,
    p. 525), so NO critical volume is read from the catalogue, and for a pure
    fluid Eqs. 9-14 return T_c and P_c exactly.

    kappa_jk (PKP Table I, p. 327) is a MULTIPLIER of the geometric mean: 1
    means none, 1.0-1.5 for methane against heavier alkanes.  It is declared
    in `binaryInteractions` like a cubic's k_ij, from a cited record whose
    `eos` is LeeKeslerPloecker.  A pair NOT declared runs at kappa = 1, the
    geometric mean that PKP's Eq. 12 reduces to for a symmetric pair, ANNOUNCED
    BY NAME once with the consequence (PKP Figures 10-13 estimate unlisted
    pairs from a graph; no graph is read here).  Hydrogen and helium are
    REFUSED: PKP p. 325 gives them temperature-dependent effective critical
    constants (Gunn et al. 1966) that this model does not carry.

    FUGACITY OF A COMPONENT (PKP Eqs. A6-A13).  Differentiating ln phi_M with
    the pseudo-critical constants and omega_M as functions of composition:

        ln phi_i = ln phi_M
                 - sum_{j != i} z_j [ (H^R/(R T)) / T_cM * dT_cM/dz_j
                                      - (z_M - 1)/P_cM * dP_cM/dz_j
                                      + (d ln phi_M/d omega_M) dOmega_M/dz_j ]

    with d ln phi_M/d omega_M = [ (ln phi)^r - (ln phi)^0 ] / omega_r (A8) and
    the composition derivatives A9-A13 (z_i the dependent mole fraction).

    VALIDITY (LK p. 510): T_r = 0.3-4, P_r = 0-10, non-polar and slightly polar
    fluids; accuracy is best subcooled and superheated and falls near the
    critical region of a widely boiling mixture; PKP: no strongly polar
    fluids.  An evaluation outside the window is ANNOUNCED once, with its
    T_r and P_r, never silently extrapolated.

    Dictionary form:

        equationOfState
        {
            model              LeeKeslerPloecker;
            binaryInteractions { CH4-nHeptane { source "...LKP/CH4-nHeptane.dat"; } }
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/Component.H"

#include <array>
#include <string>
#include <vector>

namespace Choupo {

class LeeKeslerPloecker : public EquationOfState
{
public:
    //  LK Table 1: the 12 constants of Eq. (3) for ONE fluid (d1, d2 stored
    //  WITHOUT the 1e-4 the table factors out).
    struct Fluid
    {
        scalar b1, b2, b3, b4, c1, c2, c3, c4, d1, d2, beta, gamma;
    };
    static const Fluid simpleFluid;       // omega = 0
    static const Fluid referenceFluid;    // n-octane, omega_r below
    static constexpr scalar omegaRef = 0.3978;    // LK p. 514 / PKP Table A-I
    static constexpr scalar eta      = 0.25;      // PKP p. 325

    //  Everything the correlation gives at one (T_r, P_r) for ONE fluid, on the
    //  requested root.  The functions of the header block, per unit of R.
    struct Reduced
    {
        scalar Vr = 0, Z = 0, lnPhi = 0, hOverRT = 0, sOverR = 0;
    };
    static Reduced reduced(const Fluid& f, scalar Tr, scalar Pr, bool liquidRoot);

    //  The blend of both fluids at (T_r, P_r, omega) -- a pure fluid or the
    //  one-fluid mixture's pseudo-critical state; what the LK tables print.
    struct Blend
    {
        Reduced simple, reference;
        scalar Z = 0, lnPhi = 0, hOverRT = 0, sOverR = 0;
        scalar dLnPhiDomega = 0;        // (A8)
    };
    static Blend blend(scalar Tr, scalar Pr, scalar omega, bool liquidRoot);

    //  The smallest (liquid) and largest (vapour) root of eq. (3) in V_r; equal
    //  when the equation has one root only.
    static void roots(const Fluid& f, scalar Tr, scalar Pr, scalar& VrLiquid,
                      scalar& VrVapour);

    LeeKeslerPloecker(const DictPtr& dict, const std::vector<Component>& comps);

    std::size_t n() const override { return n_; }

    sVector phi       (scalar T_K, scalar P_Pa, const sVector& y) const override;
    sVector phiLiquid (scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  molarVolume(scalar T_K, scalar P_Pa, const sVector& y) const override;
    bool    hasLiquidRoot() const override { return true; }
    scalar  molarVolumeLiquid(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  Z         (scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  H_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  S_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  H_residualLiquid(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  S_residualLiquid(scalar T_K, scalar P_Pa, const sVector& y) const override;
    bool    vapourRootIsPseudo(scalar T_K, scalar P_Pa, const sVector& y) const override;
    bool    liquidRootIsPseudo(scalar T_K, scalar P_Pa, const sVector& y) const override;

    const std::string& modelName() const override { return name_; }
    std::vector<std::string> requiredComponentProperties() const override
    {
        return { "Tc", "Pc", "omega" };
    }

    //  The pseudo-critical constants of the mixture at y (PKP Eqs. 9-14), and
    //  their derivatives with respect to z_j, z_i the dependent fraction
    //  (A9-A13): the numbers the glass-box surface prints.
    struct Pseudo
    {
        scalar Tc = 0, Vc = 0, omega = 0, Pc = 0;
        std::vector<scalar> dTc, dVc, dPc, dOmega;
    };
    Pseudo pseudo(const sVector& y, std::size_t dependent) const;

    //  kappa_jk as read (1 = no interaction).
    scalar kappa(std::size_t i, std::size_t j) const { return kappa_[i * n_ + j]; }

    std::string mixingRuleNote() const override { return mixingNote_; }

private:
    std::size_t         n_;
    std::string         name_ = "LeeKeslerPloecker";
    std::vector<scalar> Tc_, Vc_, omega_;            // K, m3/mol, -
    std::vector<scalar> Tcjk_, Vcjk_;                // n*n (Tcjk includes kappa)
    std::vector<scalar> kappa_;                      // n*n, 1 default
    std::string         mixingNote_;                 // the resolved view's line

    //  Everything one phase request needs at (T, P, y).
    struct State
    {
        scalar Tr = 0, Pr = 0;
        Pseudo p;
        Blend  b;
    };
    State state(scalar T, scalar P, const sVector& y, bool liquidRoot) const;
    sVector phiAt(scalar T, scalar P, const sVector& y, bool liquidRoot) const;
    void  warnWindow(scalar Tr, scalar Pr) const;
};

} // namespace Choupo
