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
    Choupo::electrolyte::PitzerHMW

Description
    The multi-ion Pitzer (Harvie-Moller-Weare) aqueous activity model -- a full
    per-ION ln gamma for the CORE seawater/brine ion system
        cations  Na  K  Ca  Mg  H
        anions   Cl  SO4  OH
    on the molality scale, referenced to infinite dilution in water.  It IS-A
    AqueousActivity (registered "pitzerHMW"), so `activityModel pitzerHMW;` in a
    speciation case routes every per-ion gamma through this model instead of
    Davies.  All the Pitzer arithmetic comes from the shared PitzerForm.H (the
    SAME g/g'/B/C the single-salt kernel uses), so there is ONE Pitzer surface.

    THE LONGHAND (Pitzer 1991 eq. 3; HMW 1984) -- binaries + ternary in S3 -----
      ln gamma_M = z_M^2 F
                 + sum_a m_a (2 B_Ma + Z C_Ma)
                 + |z_M| sum_c sum_a m_c m_a C_ca
                 + sum_c m_c (2 Phi_Mc + sum_a m_a psi_Mca)   <- cation mixing
                 + sum_{a<a'} m_a m_a' psi_Maa'               <- anion triplets
      ln gamma_X = z_X^2 F
                 + sum_c m_c (2 B_cX + Z C_cX)
                 + |z_X| sum_c sum_a m_c m_a C_ca
                 + sum_a m_a (2 Phi_Xa + sum_c m_c psi_Xac)   <- anion mixing
                 + sum_{c<c'} m_c m_c' psi_Xcc'               <- cation triplets
      F = -A_phi [ sqrt(I)/(1 + b sqrt I) + (2/b) ln(1 + b sqrt I) ]
          + sum_c sum_a m_c m_a B'_ca
      Z = sum_i |z_i| m_i,   b = 1.2,   A_phi(T) = 0.3915 * debyeHuckelFactor(T)
    with B_ca, B'_ca, B^phi_ca, C_ca = C^phi_ca / (2 sqrt|z_c z_a|) from
    PitzerForm.H and beta0/beta1/beta2/Cphi/alpha1/alpha2 read per (cation,anion)
    from the SHARED catalogue data/standards/parameters/Pitzer/pairs/ (case-local
    overlay honoured, exactly like the single-salt loader).

    SCOPE -- BINARIES + TERNARY MIXING + E_theta.  theta_ij + psi_ijk are read
    per like-sign pair / triplet from data/standards/parameters/Pitzer/
    (per-entry case-local overlay, same rule as pairs.dat).  The mixing parameter
    is the FULL Pitzer form
        Phi_ij  = theta_ij + E_theta_ij(I)     Phi'_ij = E_theta'_ij(I)
    where E_theta(I) is the higher-order UNSYMMETRIC electrostatic mixing term
    (Pitzer 1975), non-zero only for like-sign pairs of DIFFERENT charge and built
    from the J(x)/J'(x) integrals in PitzerForm.H.  For LIKE-charge pairs E_theta
    vanishes identically (x_ij = x_ii = x_jj), so theta-only same-charge mixing is
    unchanged.  For a single salt there is one cation and one anion, so EVERY
    theta/psi/E_theta sum is empty and the model reduces EXACTLY to
    PitzerSingleSalt -- verify() proves it to floating point for every binary in
    pairs.dat (the skeptic's gate), to the Debye-Huckel limiting law as I -> 0,
    and checks the J(x) kernel vs the published tabulated anchors.  (The remaining
    v2 deferral is the full beta(T)/theta(T) temperature surface, 25 C base here.)

    Neutral / non-ion species (z == 0, e.g. dissolved gases, the exchange site
    X-) are EXCLUDED from every sum and get gamma = 1, exactly as Davies excludes
    them -- their molality still enters the solver's ionic strength by the same
    rule (0.5 z^2 m = 0), so nothing about the neutral handling changes.

    PRIMARY SOURCES (cite per value, not the compilation):
      * Pitzer, K.S., J. Phys. Chem. 77 (1973) 268; Pitzer (ed.), Activity
        Coefficients in Electrolyte Solutions, 2nd ed., CRC (1991) ch. 3.
      * Harvie, Moller & Weare, Geochim. Cosmochim. Acta 48 (1984) 723 (the
        multi-ion assembly used here).
      * Pair virials: as cited per row in pairs.dat (Appelo et al., via the USGS
        PHREEQC pitzer.dat public-domain channel).
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/electrolyte/AqueousActivity.H"

#include <set>

#include <string>

namespace Choupo {
namespace electrolyte {

class PitzerHMW : public AqueousActivity
{
public:
    const std::string& modelName() const override;

    // Freeze the per-ion Pitzer gammas for the pass state (full molality + name
    // + charge vectors).  Fills BOTH gamma(z) (charge-keyed fallback, used for
    // species absent from pairs.dat) and gammaNamed(name, z) (the per-identity
    // accessor the solver prefers).
    ActivityResult evaluate(const IonState& st, double T) const override;

    // Glass-box parameter dump (verbosity >= 3, once per solve): enumerate which
    // beta/Cphi binaries, theta/psi ternaries, and lambda/zeta neutral terms are
    // ACTIVE (non-zero) for the present ion set -- the student SEES the parameter
    // set actually in play, not a black box.
    void announceParameters(const IonState& st, std::ostream& os) const override;

    // TIER-1 self-test (the skeptic's gate): for EVERY binary in pairs.dat,
    // assert this multi-ion model's single-salt-solution mean ln gamma_pm
    // reproduces PitzerSingleSalt::lnGammaPM to floating point, and check the
    // I -> 0 Debye-Huckel limiting law.  Returns the max single-salt deviation
    // across all binaries (0 in exact arithmetic; ~1e-13 from FP reassociation).
    // Prints the limiting-law anchor at verbosity >= 3.  Mirrors IF97::verify().
    // `onlyIons` (Codex seal-audit, 2026-07-18): restrict the single-salt
    // oracle to the pairs whose cation AND anion are in the set -- the
    // per-run gate checks the CASE's ions only (an NaCl run must not depend
    // on the other 54 catalogue pairs); the FULL sweep lives in the dedicated
    // validation case (pitzer_hmw_hot_agreement, verifyGlobal).
    static double verify(int verbosity = 0,
                         const std::set<std::string>* onlyIons = nullptr);
};

} // namespace electrolyte
} // namespace Choupo
