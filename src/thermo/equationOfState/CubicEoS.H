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
    Choupo::CubicEoS

Description
    The generic two-parameter cubic equation of state, ONE home for SRK and
    PR (DEV.md 4c C245 slice 4).  Both are the same equation with two
    different pairs of constants (Michelsen & Mollerup, Thermodynamic Models:
    Fundamentals and Computational Aspects, 2nd ed. (2007), ch. 4):

        P = R·T / (v − b) − a(T) / [ (v + ε·b)(v + σ·b) ]

            SRK:  ε = 0,       σ = 1
            PR :  ε = 1 − √2,  σ = 1 + √2

    In Z, with A = a·P/(R·T)² and B = b·P/(R·T):

        Z³ + c2·Z² + c1·Z + c0 = 0
        c2 = (ε + σ − 1)·B − 1
        c1 = ε·σ·B² − (ε + σ)·(B² + B) + A
        c0 = −[ ε·σ·(B³ + B²) + A·B ]

    (SRK: Z³ − Z² + (A − B − B²)Z − AB;  PR: Z³ − (1 − B)Z² +
    (A − 2B − 3B²)Z − (AB − B² − B³) -- the two cubics the classes used to
    carry separately.)  The fugacity coefficient and the departures are the
    generalised-cubic forms with I = ln[(Z + σB)/(Z + εB)] / (σ − ε):

        ln φ_i = (b_i/b)(Z − 1) − ln(Z − B)
               − (A/B)·[ 2 Σ_j y_j a_ij / a − b_i/b ]·I
        H^R    = R·T·(Z − 1) + (T·da/dT − a)/b · I
        S^R    = R·ln(Z − B) + (da/dT)/b · I

    (Sandler, Chemical, Biochemical and Engineering Thermodynamics, 4th ed.,
    eqs. 6.4-29 to 6.4-31 and 9.4-9.)

    THE ROOT PICKER (`pickRoot`, the one place a root is chosen).
      * Cardano / trigonometric roots, the chosen one POLISHED by at most two
        Newton steps on f(Z), each accepted only when |f| falls.  Cardano
        loses digits when two roots are close; the polish recovers them.
      * Three real roots: the liquid is the smallest above B, the vapour the
        largest.
      * One real root: WHICH PHASE IT IS is read from the ISOTHERM, not from
        f(Z) (f is monotone in Z for a deeply subcooled liquid too).  In
        u = v/b = Z/B and beta = a/(bRT) = A/B, dP/dv = 0 reads
            beta = h(u) = (u+ε)²(u+σ)² / ((2u+ε+σ)(u−1)²),
        and h has one minimum on u > 1, at (u_c, beta_c), the critical point
        of this cubic (SRK: beta_c = 4.934 = Ωa/Ωb, u_c = 3.847; PR: 5.877,
        3.951).  If beta ≤ beta_c the isotherm is monotone: no spinodal, no
        sides, the one root serves both labels, unflagged.  If beta > beta_c
        the isotherm has spinodals u_L < u_c < u_V, one root means P lies
        outside the loop, and the root is LIQUID-like (u < u_c) or
        VAPOUR-like (u > u_c).  If it lies on the requested side it is
        returned.  If it does not, the requested phase has no root at this
        (T, P, y), and returning the other phase's root under this label is
        the trivial root that used to price a "vapour" on the liquid's own
        density, unflagged.  A PSEUDO-ROOT is returned instead: the requested
        phase's SPINODAL volume (u_V for a vapour, u_L for a liquid),
        Z = B·u.  At the spinodal pressure that IS the vanishing root, so Z
        is continuous across the spinodal; past it the density is held at
        the spinodal's -- the densest vapour (lightest liquid) the isotherm
        can hold.  `pseudo` is set, the EoS announces the fact once per pass
        (AdvisoryLog), and callers can ask `vapourRootIsPseudo` /
        `liquidRootIsPseudo`.
        The idea of a LABELLED pseudo-root for a phase whose root does not
        exist is Poling, Grens & Prausnitz, Ind. Eng. Chem. Process Des.
        Dev. 20 (1981) 127; Mathias, Boston & Watanasiri, AIChE J. 30
        (1984) 182 build the pseudo-density by EXTRAPOLATING past the
        spinodal.  Holding it AT the spinodal is this code's simplification
        (no extra parameter, continuous in P); its derivative in P jumps at
        the spinodal, which is stated here, not hidden.
        MEASURED (column08, 16 bar, SRK vapour, unseeded): the vapour of a
        stage at 287 K had ONE root, liquid-like (u = 1.2), and f monotone
        in Z; vapour and liquid were priced on that one root, every K came
        out ~1 and the CMO seed converged to a trivial profile.  With the
        pseudo-root the same unseeded case converges to the real profile.

    THE MIXING-RULE DERIVATIVE.  a_ij = (1 − k_ij)·√(a_i a_j) and its T
    derivative used to be written ½(√(a_j/a_i)·a_i' + √(a_i/a_j)·a_j'),
    which is 0/0 at the minimum of the α function (1 + m(1 − √Tr) = 0,
    reached at Tr = (1 + 1/m)², e.g. ~2200 K for H2).  It is now written
    with the SIGNED root s_i = √a_c,i·(1 + m_i(1 − √Tr)), |s_i| = √a_i:
        d(|s_i||s_j|)/dT = sgn(s_i)·s_i'·|s_j| + |s_i|·sgn(s_j)·s_j'
    -- the same number wherever the old form was defined, finite at the
    minimum.  a_ij itself is unchanged (|s_i||s_j|), so no model moves.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquationOfState.H"
#include "core/Constants.H"
#include "thermo/Component.H"

#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class CubicEoS : public EquationOfState
{
public:
    // The cubic's constants: Ωa, Ωb (a_c = Ωa R² Tc²/Pc, b = Ωb R Tc/Pc) and
    // the (ε, σ) of the attractive denominator.
    struct Constants
    {
        scalar omegaA;
        scalar omegaB;
        scalar eps;
        scalar sig;
    };

    // One chosen root.  `pseudo` = the requested phase has no root here and
    // Z is the pseudo-root described in the header.
    struct Root
    {
        scalar Z      = 0.0;
        bool   pseudo = false;
    };

    // THE root picker (public and static so a probe can exercise it alone).
    static Root pickRoot(scalar A, scalar B, scalar eps, scalar sig,
                         bool liquid);

    std::size_t n() const override { return n_; }

    sVector phi(scalar T_K, scalar P_Pa, const sVector& y) const override;
    sVector phiLiquid(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  molarVolume(scalar T_K, scalar P_Pa, const sVector& y) const override;
    bool    hasLiquidRoot() const override { return true; }
    scalar  molarVolumeLiquid(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  Z(scalar T_K, scalar P_Pa, const sVector& y) const override;
    bool    vapourRootIsPseudo(scalar T_K, scalar P_Pa, const sVector& y) const override;
    bool    liquidRootIsPseudo(scalar T_K, scalar P_Pa, const sVector& y) const override;

    scalar  H_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  S_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;

    // The one-fluid decomposition, filled by the same buildAi/buildMix the
    // hot path runs (see EquationOfState::MixingLedger).
    bool mixingLedger(scalar T_K, const sVector& y,
                      MixingLedger& out) const override;

    const std::string& modelName() const override { return name_; }

    // Cubic EoS: needs the critical constants + acentric factor per component.
    std::vector<std::string> requiredComponentProperties() const override
    {
        return { "Tc", "Pc", "omega" };
    }

protected:
    // `slope[i]` is the α-function slope m_i(ω_i) the derived class computed
    // (Graboski-Daubert for SRK, PR78 for PR).
    CubicEoS(const std::string& name, const Constants& c,
             const std::vector<Component>& comps,
             const std::vector<scalar>& slope,
             const std::vector<std::vector<scalar>>& kij);

    // The `binaryInteractions ( { i; j; kij; } ... )` list read into an n×n
    // matrix, with the announcements both cubics share.  `model` names the
    // cubic in the messages and in the records directory.
    static std::vector<std::vector<scalar>>
    readKij(const std::string& model, const DictPtr& eosDict,
            const std::vector<Component>& comps);

private:
    struct PureParams
    {
        scalar a_c;          // Ωa R² Tc² / Pc   [Pa·m^6/mol²]
        scalar b;            // Ωb R Tc / Pc     [m³/mol]
        scalar m;            // α slope m(ω)
        scalar Tc;           // [K]
    };

    // a_i(T), and the SIGNED root s_i and its derivative (header).
    void buildAi(scalar T, std::vector<scalar>& a, std::vector<scalar>& dadT,
                 std::vector<scalar>* s = nullptr,
                 std::vector<scalar>* dsdT = nullptr) const;
    void buildMix(scalar T, const sVector& y,
                  scalar& a_mix, scalar& dadT_mix, scalar& b_mix,
                  std::vector<std::vector<scalar>>* aij_out = nullptr) const;

    // (A, B) at (T, P, y) and the chosen root; announces a pseudo-root.
    Root root(scalar T, scalar P, const sVector& y, bool liquid,
              scalar* A_out = nullptr, scalar* B_out = nullptr,
              scalar* a_mix_out = nullptr, scalar* dadT_out = nullptr,
              scalar* b_mix_out = nullptr,
              std::vector<std::vector<scalar>>* aij_out = nullptr) const;
    sVector phiAt(scalar T, scalar P, const sVector& y, bool liquid) const;
    void announcePseudo(bool liquid) const;

    std::string                      name_;
    Constants                        c_;
    std::size_t                      n_;
    std::vector<PureParams>          pure_;
    std::vector<std::vector<scalar>> kij_;     // [n × n], 0 default
};

} // namespace Choupo
