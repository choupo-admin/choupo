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
    Choupo::membrane::DSPM_DE

Description
    The charge-aware Donnan-Steric-Pore Model with Dielectric Exclusion
    (DSPM-DE) for nanofiltration -- a sibling of SolutionDiffusion in the
    membrane::TransportModel factory, selected with `transport DSPM-DE;`.

    PRIMARY references (cited per relation in the .cpp):
      * Bowen, Mohammad & Hilal, "Characterisation of nanofiltration
        membranes for predictive purposes -- use of salt, uncharged solutes
        and atomic force microscopy", J. Membr. Sci. 126 (1997) 91-105.
        (the steric / Donnan extended Nernst-Planck pore model -- DSPM).
      * Bowen & Welfoot, "Modelling the performance of membrane
        nanofiltration -- critical assessment and model development",
        Chem. Eng. Sci. 57 (2002) 1121-1137.  (adds DIELECTRIC EXCLUSION
        -- the Born partition term and the pore-dielectric eps_p -- giving
        DSPM-DE).
      * Deen, "Hindered transport of large molecules in liquid-filled
        pores", AIChE J. 33 (1987) 1409-1425.  (the hydrodynamic hindrance
        factors K_d (diffusive) and K_c (convective) from lambda = r_i/r_p).

    THE PHYSICS, per ion i across the pore axial coordinate x in [0, dx]:

      extended Nernst-Planck flux (constant along x at steady state):
        j_i = -K_d,i D_i dc_i/dx
              - (z_i c_i D_i K_d,i F / RT) dpsi/dx
              + K_c,i c_i J_v                                       (1)

      interfacial PARTITION at each face (feed|pore and pore|permeate),
      the three exclusion mechanisms multiplied (Bowen-Welfoot Eq. 7):
        c_pore,i / (gamma_i c_bulk,i)
            = Phi_S,i * exp(-z_i F dpsi_Donnan / RT) * exp(-dW_i / kT)  (2)
        Phi_S,i = (1 - lambda_i)^2                       (steric)
        Born:  dW_i = (z_i^2 e^2 / 8 pi eps0 r_i)(1/eps_p - 1/eps_b)    (3)

      pore ELECTRONEUTRALITY (closes the Donnan potential at each face):
        sum_i z_i c_pore,i + X_d = 0                                (4)

      ZERO NET CURRENT through the pore (closes dpsi/dx inside):
        sum_i z_i j_i = 0                                           (5)

    The classic NF SIGNATURE the tutorials demonstrate falls out of (2)-(4):
    a divalent co-ion (e.g. SO4 against a negative X_d) is excluded far more
    strongly than a monovalent one, so MgSO4 / CaCl2 are rejected above NaCl
    even at equal pore radius.

    STAGED EXCLUSIONS (the §9 K=1-trap lesson -- a symmetric charged solve can
    collapse to the trivial Donnan = 0 saddle).  The model is built and verified
    as visible switches, each SEEDED from the previous, simpler converged state:
      (a) STERIC only   : X_d = 0, eps_p = eps_b  => Donnan = 0, Born = 0.
                          Seeded from the SolutionDiffusion result.
      (b) +DONNAN       : X_d != 0.  Seeded from (a).
      (c) +BORN (DE)    : eps_p < eps_b.  Seeded from (b).
    The active stage is chosen by the membrane .dat (which pore fields are
    present) and ANNOUNCED in the run header -- no silent fallback.

    SCOPE / INTERFACE GLUE.  The host SpiralWoundModule marches per SALT
    COMPONENT (NaCl, MgSO4, ...), one B_s and one c_b per salt.  DSPM-DE works
    ion-by-ion, so the law DECOMPOSES each salt solute into its (cation, anion)
    via the component's `electrolyte { cation; anion; }` block, solves the
    coupled ion pore problem ONCE per z station, and COLLAPSES the result back
    to a per-salt effective wall / permeate concentration the march expects.
    Ion ACTIVITIES (Davies gamma at the wall, via the speciation hook) enter the
    partition (2); the gammas are evaluated ONCE per station (the scaling-audit
    pattern), never inside the inner Newton.  Membranes lacking the pore tier --
    or salts lacking the cation/anion block -- are refused LOUDLY.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

namespace Choupo {
namespace membrane {

class DSPM_DE : public TransportModel
{
public:
    const std::string& type() const override { return type_; }

    TransportSolution localFluxes(const TransportContext& ctx) const override;

private:
    inline static const std::string type_ = "DSPM-DE";
    // The stage banner (which exclusions are active) is announced ONCE per run.
    mutable bool banner_done_ = false;
};

} // namespace membrane
} // namespace Choupo
