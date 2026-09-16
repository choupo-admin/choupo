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
Namespace
    Choupo::edLimitingCurrent

Description
    THE LIMITING CURRENT DENSITY OF AN ELECTRODIALYSIS STACK -- two models,
    in one home, with the accepted words in ONE place.

    THE SENTENCE THIS FILE REPLACES.  ElectrodialysisStack.H used to end:
    *"there is exactly ONE limiting-current correlation in v1 (Cowan-Brown)
    and ONE mass-transfer estimate -- so they are INLINE with a clear
    comment, not a factory-for-one (the settled 'no factory for a single
    model' rule)."*  That was true and it is no longer: there are TWO, so
    the dispatch is justified and it lives here, with the enumeration
    `acceptedModels()` beside the branches that read it and a refusal
    through `registryRefusal::message` for a word neither branch knows
    (the 2026-09-07 rule -- an if-chain with a catch-all `else` silently
    selects the default).

      * `CowanBrown` -- the LEGACY route, unchanged bit for bit.  Cowan &
        Brown (1959) is really an EXPERIMENTAL METHOD (read i_lim off the
        minimum of the stack resistance dV/I against 1/I); what the engine
        carried under that name is the classical single-salt working form
            i_lim = z F k c_dil / (t_cu - t_co)
        with k from a Leveque-type estimate and t_cu DECLARED on the
        membrane record.  It needs no ion diffusivities beyond a mean and
        no stack record, so it stays the route for a case that names
        neither.

      * `GeraldesAfonso2010` -- the PREDICTION.  V. Geraldes, M.D. Afonso,
        "Limiting current density in the electrodialysis of multi-ionic
        solutions", J. Membr. Sci. 360 (2010) 499-508.  The transport
        number STOPS being a declared parameter: the Nernst-Planck
        equations in the film, linearised on nearly-linear concentration
        profiles and closed by electroneutrality, give the limiting
        transport numbers EXPLICITLY from the ion diffusivities and the
        diluate bulk composition (Eqs. 12 and 13), and the limiting
        current follows in closed form (Eq. 15).  Nothing is fitted; the
        only equipment datum is the stack's own Sherwood correlation.

    THE EQUATIONS, by the paper's own numbering.

      (A13) the effective diffusivity of the multi-ionic solution.  The
            paper derives it over n SALTS, cation k paired with anion n+k,
            each with an equivalent fraction x_k.  Written out, the
            x-weights collapse: x_k is simultaneously the equivalent
            fraction of cation k and of anion n+k, so

                D_eff = [ SUM_i X+_i D_i * SUM_j X-_j (z_i + |z_j|) D_j ]
                        ---------------------------------------------------
                        [ SUM_i X+_i z_i D_i + SUM_j X-_j |z_j| D_j ]

            with X+_i = z_i C_i / C_S over the cations and X-_j = |z_j| C_j
            / C_S over the anions.  This is IDENTICAL to (A13) wherever a
            salt decomposition exists that reproduces those ion fractions,
            and it needs no decomposition -- which matters, because a
            decomposition is NOT unique from the ions alone (Na, Mg, Cl,
            SO4 is NaCl + MgSO4 or Na2SO4 + MgCl2 or any blend, and the
            paper's own MgCl2 + MgSO4 case pairs one cation twice).  A
            single salt recovers the classical Nernst-Hartley
            D_S = (z1 + |z2|) D1 D2 / (z1 D1 + |z2| D2).

      (12)  t^m_{j,lim} = z_j D_j C_j,b / SUM_cations z_j D_j C_j,b
      (13)  t^m_{j,lim} = |z_j| D_j C_j,b / SUM_anions |z_j| D_j C_j,b

            the limiting transport numbers of the counter-ions in a
            strongly charged cation- and anion-exchange membrane.  The
            CO-ION numbers are taken NULL, which is the model's central
            assumption and is why no membrane property enters i_lim.

      (15)  i_lim = F (k_c,eff / D_eff) SUM_j C_j,b / SUM_j t^m_{j,lim}/(z_j D_j)

            evaluated over ALL ions in the numerator and, through the null
            co-ion numbers, over one membrane's counter-ions in the
            denominator.  It is POSITIVE for the cation-exchange membrane
            and NEGATIVE for the anion-exchange one (the paper's x
            coordinate); the applicable value is the LOWEST of the two
            absolute values, and the engine says which membrane set it.

      (16)  i_lim = F k_c C_b / ( t^m_{1,lim} - z1 D1/(z1 D1 + |z2| D2) )

            the classical single-salt result.  (15) reduces to it EXACTLY
            for one salt -- the engine computes both on a single-salt feed
            and prints them side by side, because a route that is claimed
            to reduce to another should be seen doing it.

    ASSUMPTIONS, stated because they are what a student must weigh:
    negligible steric exclusion (so the limiting current is attained when
    the concentration of EVERY counter-ion vanishes at the diluate/membrane
    interface); null co-ion transport numbers; strongly charged membranes
    (ionic diffusion inside the membrane negligible, electromigration
    only); nearly linear ionic profiles in the film (the linearisation);
    dilute solutions, so only solute-solvent friction (individual ionic
    diffusivities, no Onsager cross terms); film theory for the boundary
    layer, i.e. no electroconvection -- which is exactly the regime that
    ENDS at i_lim.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {
namespace edLimitingCurrent {

//- One ion of the DILUATE bulk, as the model needs it.
struct Ion
{
    std::string name;
    scalar      z = 0.0;    // charge number (signed)
    scalar      C = 0.0;    // bulk concentration [mol/m3]
    scalar      D = 0.0;    // ionic diffusivity at the run temperature [m2/s]
};

//- The accepted `limitingCurrent { model <word>; }` words, in ONE place.
const std::vector<std::string>& acceptedModels();

//- Eq. (A13) in its ion-equivalent-fraction form.  Refuses a composition
//  with no cation or no anion (an equivalent fraction would divide by zero).
scalar effectiveDiffusivity(const std::vector<Ion>& ions);

//- Eqs. (12) / (13).  Returns one number per ion, zero on every co-ion.
std::vector<scalar> limitingTransportNumbers(const std::vector<Ion>& ions,
                                             bool cationExchangeMembrane);

//- Eq. (15) for ONE membrane, SIGNED as the paper writes it (positive for
//  the cation-exchange membrane, negative for the anion-exchange one).
scalar limitingCurrentEq15(const std::vector<Ion>&     ions,
                           const std::vector<scalar>&  t_lim,
                           scalar                      k_c_eff,
                           scalar                      D_eff);

//- Eq. (16), the classical single-salt form, on the salt's own effective
//  diffusivity.  Returns false (and leaves `i_lim` alone) when the feed is
//  not exactly one cation and one anion.
bool singleSaltEq16(const std::vector<Ion>& ions,
                    scalar                  k_c,
                    scalar                  t_cu_lim,
                    scalar&                 i_lim);

} // namespace edLimitingCurrent
} // namespace Choupo
