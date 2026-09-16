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

Class
    Choupo::membrane::SDEM

Description
    The SOLUTION-DIFFUSION-ELECTROMIGRATION transport law: per-ion
    solution-diffusion with the ions coupled by the electric field that
    arises, spontaneously, because a membrane is not equally permeable to
    a salt's cation and anion.  Selected by `transport SDEM;` in the
    spiral-wound module's operation block.

    WHY IT EXISTS.  `solutionDiffusion` on an ION-declared feed (Ca Mg Na K
    Cl SO4 HCO3 + water) gives each ion its own permeance and nothing
    couples them, so the permeate carries a net charge -- measured on
    membrane07 at -0.82 % of the cation equivalents against the -0.35 % the
    water analysis itself carries.  The remedy that does NOT add a parameter
    is this law: the per-ion permeances stay exactly the record's, and ONE
    state variable is added per z station -- the dimensionless electric
    potential across the active layer -- fixed by ONE constraint that the
    uncoupled law never imposed: zero electric current.

    THE MODEL (Yaroshchuk, Bruening & Licon Bernal, J. Membr. Sci. 447 (2013)
    463-476; the ternary analytical solution: Yaroshchuk & Bruening,
    J. Membr. Sci. 523 (2017) 361-372).  Nernst-Planck on VIRTUAL
    concentrations -- the concentration of the bulk solution that would be
    in equilibrium with each point inside the membrane -- so that the
    permeance P_i = D_i K_i / delta already CONTAINS the partition
    coefficient, exactly as B_s does in the solution-diffusion law; no
    partition coefficient is declared separately.  Across the active layer
    (x scaled on its thickness, psi in RT/F units):

        j_i  =  -P_i ( dc_i/dx + z_i c_i dpsi/dx )                     (1)
        sum_i z_i c_i(x) = 0        virtual solution electroneutral      (2)
        sum_i z_i j_i    = 0        zero electric current                (3)
        j_i  =  J_v c_p,i           convective closure at the permeate  (4)

    (2) and (3) together fix the field at every x with no parameter:
        dpsi/dx = -( sum_i z_i j_i / P_i ) / ( sum_i z_i^2 c_i ).
    A NEUTRAL solute (z = 0) decouples and follows the plain law.  For ONE
    salt the system collapses EXACTLY to the classical single-solute form
    R = J_v / (J_v + P_s) with the AMBIPOLAR salt permeance

        P_s = (z+ + |z-|) P+ P- / (z+ P+ + |z-| P-)

    which is why the per-ion permeances are calibratable from SINGLE-SALT
    tests -- the measurement manufacturers and the literature actually
    publish -- rather than from per-ion permeate analyses nobody publishes.
    The witness cases carry the NF270 permeances of Fernandez de Labastida
    & Yaroshchuk, Membranes 11 (2021) 272 (CC BY 4.0), whose Table 1 salt
    permeances reproduce the ambipolar identity to their own rounding.

    WHAT IT ASSUMES, said here and in the run banner: constant permeances
    (independent of concentration); virtual-solution electroneutrality
    inside the membrane (the Yaroshchuk formulation, NOT a constant-field
    Goldman integration -- the two differ, and only this one gives the exact
    single-salt limit above); NO fixed charge (a charged active layer is
    DSPM-DE's subject); ideal dilute solutions (activities = concentrations);
    and a polarisation film that is FIELD-FREE UNLESS the case declares
    `polarisation { ionCoupling electroneutral; }` -- by default each ion
    polarises alone with the unit's film coefficient (the diffusion
    potential exists in the film too; announced as an approximation), and
    with the declaration the wall comes from the Geraldes & Afonso (2007)
    interface model (massTransfer/Polarisation.H: per-ion k_c,i, one
    interface potential gradient, electroneutral wall, no film thickness).
    The wall is never computed here: the law asks the shared Polarisation
    object for it at every trial permeate.

    WHAT IT REFUSES, by name: a solute with no declared aqueous bridge (the
    law needs each solute's charge, read through `aqueousMapping`, never a
    name); a solute the membrane record gives no permeance (an impermeable
    ion cannot sit in a zero-current balance -- give it a value or use
    solutionDiffusion); a feed that is not electroneutral (the law's own
    premise, and the FilmTec protocol's: balance the analysis first --
    `aqueousAnalysis {}` reconciles one); a feed with fewer than two ions
    (nothing to couple: use solutionDiffusion).

    NUMERICS.  Per z station an OUTER Newton-1D in J_w (the osmotic
    back-pressure, as in solutionDiffusion) wraps an INNER Newton in the
    permeate composition c_p: each residual evaluation integrates (1)-(2)
    BACKWARD, from the permeate face toward the wall, with a fixed-step RK4,
    and requires the profile to ARRIVE at the wall concentrations the shared
    polarisation object gives for that same c_p (per ion by default, coupled
    by the interface field when the case declares it), for all but one ion,
    plus (3) written as permeate electroneutrality.  The direction is not a
    detail: shoot from the face where the unknown IS, or the integration
    lands on values orders of magnitude from where it started while dividing
    by an ionic strength that is smallest exactly there.  The Jacobian is finite
    differences; the problem has at most a handful of ions.  The potential
    drop is integrated alongside and published (`psi`, RT/F units; the
    module converts to mV) -- the pedagogical point of the law is that the
    student SEES the field that makes Cl- wait for Na+.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

namespace Choupo {
namespace membrane {

class SDEM : public TransportModel
{
public:
    const std::string& type() const override { return type_; }

    TransportSolution localFluxes(const TransportContext& ctx) const override;

private:
    inline static const std::string type_ = "SDEM";

    //  Resolved ONCE on the first station: each solute's charge, read
    //  through its declared aqueous bridge, and the banner that states the
    //  model, its assumptions and the per-ion permeances it was handed.
    mutable bool             resolved_ = false;
    mutable std::vector<int> z_;
    //  Warm start: the previous station's permeate composition seeds the
    //  next one's inner Newton.
    mutable std::vector<scalar> cpPrev_;

    void resolveOnce(const TransportContext& ctx) const;
};

} // namespace membrane
} // namespace Choupo
