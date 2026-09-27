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
    Choupo::pureSolidPhase

Description
    A PURE SOLID PHASE IN AN EQUILIBRIUM REACTOR, in ONE place (commission
    C14, 2026-09-27: solid carbon in a steam reformer).

    Two reactors carry a pure solid (graphite, `referenceState pureSolid;`):
    `gibbsReactor`, which is told SPECIES and minimises G over them
    (gibbsMethod/GibbsSolidPhase.cpp), and `equilibriumReactor`, which is
    told REACTIONS and drives each to its own K.  They decide the solid's
    phase set the same way -- its ACTIVITY in the solid-free answer: above
    one (ln a > kLnActivityAppears) the solid appears and the fluid is
    re-equilibrated to a = 1; at or below one it is absent -- and they must
    say so in ONE vocabulary.  Everything the two reactors both need lives
    here, so it cannot drift between them:

      * which record IS a pure solid (`isPureSolid`, the record's own word);
      * the appearance threshold on ln a;
      * the solid's rung: g and h on `Component::g_formation / h_formation
        (T, "solid")` -- the leg the energy report prices a stream's `s[]`
        on -- never `g_pure_ig` / `h_pure_ig`, which a pureSolid record
        refuses (the reference rung);
      * a reaction's equilibrium constant with a solid participant
        (`reactionEquilibrium`): the solid's activity is ONE and it has no
        mixing term, so it leaves ln Q and enters ln K through its pure-solid
        standard potential; the fluid part is `Reaction::equilibrium`
        itself, and so is the whole of a reaction with no solid;
      * the APPEARS / ABSENT sentence and the KPI names
        (`n_solid_<s>_mol_s`, `activity_<s>`, `F_solid_kmol_h`);
      * the activity of a solid NO declared reaction touches, read off an
        equilibrated fluid through its element potentials
        (`activityFromFluid`) -- defined only where the fluid is in
        complete internal equilibrium, and refused by name where it is not.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/reaction/Reaction.H"

#include <cstddef>
#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Component;
class ThermoPackage;

namespace pureSolidPhase {

//  The record decides, by its own `referenceState pureSolid;` -- never the
//  name, never a list in code.
bool isPureSolid(const Component& c);

//  A solid APPEARS when ln a > this in the solid-free answer.  One number
//  for both reactors: a threshold with two homes would let the same fluid
//  coke in one reactor and not in the other.
constexpr scalar kLnActivityAppears = 1.0e-10;

//  The pure-solid standard potential g_s(T)/RT and enthalpy h_s(T) [J/mol],
//  on the SOLID rung (formation datum, elements at 298.15 K).
scalar gOverRT(const Component& c, scalar T);
scalar enthalpy(const Component& c, scalar T);

//  A species' enthalpy on its OWN rung for an equilibriumReactor's
//  reaction enthalpy: the solid rung for a pure solid, the ideal-gas rung
//  (the rung its K is priced on) for everything else.
scalar speciesEnthalpy(const Component& c, scalar T);

//  Reaction::equilibrium with every pure-solid participant priced at
//  activity one on its own rung: ln K = ln K_fluid - Sum_s nu_s g_s/RT, and
//  sumNu is the FLUID Sum nu (a solid adds nothing to the pressure term).
//  A reaction with no pure solid returns Reaction::equilibrium unchanged.
Reaction::Equilibrium reactionEquilibrium(const ThermoPackage& thermo,
                                          const sVector&       nu,
                                          scalar               T);

//  The phase-set verdict, APPEARS or ABSENT, with the activity that decided
//  it.  `minimumOf` names the minimum the solid-free answer is not (the
//  Gibbs reactor's is over every species, the equilibrium reactor's along
//  its declared reactions); `howSolved` closes the APPEARS sentence (each
//  reactor says how it re-equilibrated the fluid).  Printed by the caller
//  after its own prefix and logged by it on AdvisoryLog.
std::string verdict(const std::string& solid,
                    scalar lnActivityWithout,
                    bool   present,
                    scalar n_mol_s,
                    scalar lnActivityAt,
                    const std::string& minimumOf,
                    const std::string& howSolved);

//  The KPIs of one tested solid: its amount [mol/s] and its activity at the
//  answer (1 when present, < 1 when absent, and possibly > 1 for a solid
//  the declared reactions cannot form).
//  `haveActivity` false withholds the activity (undefined) and publishes
//  the amount alone -- a number with no meaning is not published as one.
void publishKpis(std::map<std::string, scalar>& kpis, const std::string& solid,
                 scalar n_mol_s, scalar activity, bool haveActivity = true);

//  The total solid flow of a reactor that tested any solid [kmol/s in,
//  published as kmol/h].
void publishSolidFlow(std::map<std::string, scalar>& kpis, scalar F_solid_kmol_s);

//  The activity of pure solid `s` read off a fluid through its element
//  potentials: mu_i/RT = g_i/RT + ln(y_i P/P0) = Sum_k pi_k A_ki over the
//  EQUILIBRATED fluid species `fluid` (amounts `n` [any unit], mole
//  fractions over `ntot`), then ln a_s = Sum_k pi_k A_ks - g_s/RT.  The
//  element potentials exist only if the fluid is in COMPLETE internal
//  equilibrium; a fluid equilibrated along a declared SUBSET of its
//  reactions has none, and the activity of a solid is then a property of
//  the ROUTE, not of the gas -- `defined` is false and `reason` says why.
struct FluidActivity
{
    bool        defined = false;
    scalar      lnActivity = 0.0;
    scalar      maxResidual = 0.0;   // max |mu_i/RT - Sum_k pi_k A_ki|
    std::string reason;
};
FluidActivity activityFromFluid(const ThermoPackage&            thermo,
                                const std::vector<std::size_t>& fluid,
                                const sVector&                  n,
                                scalar                          ntot,
                                scalar                          T,
                                scalar                          P,
                                std::size_t                     s);

//  The consistency band of `activityFromFluid`, in ln units: the declared
//  residual of every ln Q is converged to 1e-10, so an equilibrated fluid
//  fits its element potentials to well inside this.
constexpr scalar kElementPotentialFit = 1.0e-7;

} // namespace pureSolidPhase
} // namespace Choupo
