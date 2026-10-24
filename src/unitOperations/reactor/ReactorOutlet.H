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
Description
    reactorOutlet -- THE ONE HOME of the phase state a steady reactor
    publishes on its outlet: the outlet MEANS ITS OWN EQUILIBRIUM.

    Written inside ConversionReactor.cpp on 2026-10-17 (DEV.md 4c C72) and
    moved here VERBATIM the same day, when the `cstr` and the `pfr` needed the
    same sentence (C73): three copies of "resolve the outlet at its own
    (T, P, z)" would be the arity sin in the machinery that ends it.

    THE POSTURE THIS REPLACES.  The three reactors used to publish their
    outlet at the INLET's vapour fraction -- the conversion reactor since the
    2026-08-24 F2 ruling (docs/design/llm-authoring-benchmark-2026-08-23.md),
    the cstr and the pfr since they were written, under the comment "a
    reactor is NOT a phase-change device".  Carrying is not the absence of a
    phase model -- it is a second one, and it is wrong whenever the reaction
    moves the outlet across a phase boundary (C68 finding iii, met on
    `ammoniaRoutes01_screening`): a liquid feed whose product is a gas
    published the gas at vf = 0 and priced it on the liquid rung.  The family
    is CLAUDE.md §6's: THE STATE A UNIT COMPUTES WITH IS NOT THE STATE ITS
    STREAMS CARRY -- here the outlet's vf belonged to another (T, z).

    THE RULE.  The outlet is a stream at (T, P, zout) that nobody declared, so
    it MEANS its own equilibrium (CLAUDE.md §3), resolved by the one home,
    `flashState::equilibriumAt`, in the unit's own thermo world.  A split
    above every present Tc is discarded and the outlet is the one fluid phase
    it can be (vf = 1), as an outlet search does
    (`takeSupercriticalAsSinglePhase`).  The caller prices its duty on exactly
    the vf published (through `flashState::priceState` -- the rule the energy
    report applies to the same stream), so unit and report cannot part.

    THE PRESSURE.  A reactor that does not compute its own outlet pressure
    publishes P = 0 and the flowsheet fills it with the pressure of its FIRST
    inlet (`Flowsheet.cpp`, `P_inherit`); the `feed {}` block a unit is handed
    carries exactly that pressure (`UnitInputs.cpp`).  So the caller passes
    the feed's P -- or, where it does compute one (a `pfr` with an Ergun drop),
    the outlet P it publishes.  Never P = 0.

    A DECLARED INLET PHASE IS A DECLARATION ABOUT THE INLET.  `phase liquid;`
    on a feed says what the feed is at ITS (T, P, z); it says nothing about a
    product of another composition, and carrying it would publish a label the
    outlet's own equilibrium may contradict -- the impossible-label shape of
    F1 in docs/design/glass-box-reading-benchmark-2026-08-24.md.  So the pin
    is NOT carried, and when the outlet's equilibrium departs from the phase
    the inlet declared, the unit SAYS so (stderr + AdvisoryLog, once per
    process), naming the remedy: a reactor meant to hold that phase is
    declared at a pressure where its product does.

    When the equilibrium cannot be resolved (a package that refuses the state,
    a flash that does not converge), the inlet's vf is carried -- ANNOUNCED,
    never silent; a package with no vapour phase has nothing to split and the
    inlet's vf stands.

    `unitType` is the registered type word (`conversionReactor`, `cstr`,
    `pfr`): it names the locus, the AdvisoryLog keys and the stderr tag, so
    each unit speaks in its own name and the conversion reactor's messages are
    byte-identical to what C72 shipped.
\*---------------------------------------------------------------------------*/

#ifndef CHOUPO_REACTOR_OUTLET_H
#define CHOUPO_REACTOR_OUTLET_H

#include "core/Types.H"

#include <string>

namespace Choupo {

class ThermoPackage;

namespace reactorOutlet {

struct OutletState
{
    scalar      vf = 0.0;
    std::string origin;      //  how `vf` was arrived at, for the log
};

//  The outlet's phase state at (T, P, zout), in the unit's own thermo world.
//  `pinned_in` / `vf_in` are the INLET's: carried only when the outlet's own
//  equilibrium cannot be resolved (announced), and read to say when the
//  outlet departs from a phase the inlet DECLARED.
OutletState outletState(scalar               T,
                        scalar               P,
                        const sVector&       zout,
                        bool                 pinned_in,
                        scalar               vf_in,
                        const ThermoPackage& thermo,
                        const std::string&   unitType,
                        const std::string&   unitName);

//  The outlet's state, one line, without leaving the stream's precision
//  changed for whatever prints next (the next unit's banner reads it).
void printOutletState(const OutletState& o);

//  ---- THE ENERGY SOLVES ON THE PUBLISHED SURFACE (C77) ----------------------
//
//  A NON-ISOTHERMAL `cstr` or `pfr` (adiabatic, jacketed, cooled) finds its
//  outlet T from an energy balance.  Until C77 (2026-10-17) that balance was
//  solved on the INLET's phase rung (`H_stream_formation` at the inlet's vf)
//  while the outlet was published at its own equilibrium (C73) and its duty
//  priced on that state -- so when the product crossed a phase boundary the
//  T was not the adiabatic (or jacketed) temperature of the state published,
//  and an "adiabatic" reactor published a duty: the enthalpy of a phase
//  change its balance never saw.  C73 SAID so (`announceEnergyRungMismatch`);
//  C77 closes it, and the announcement went with the gap.
//
//  THE RULE: the enthalpy a T-solve balances is the enthalpy the outlet
//  would be PRICED at if it were published at that T -- resolved by the
//  rule `outletState` applies, priced by the rule `flashState::priceState`
//  applies (the equilibrium phases of a split through `hOfState`, else the
//  resolved single phase).  One flash per evaluation, silent (a trial T is
//  not a state anybody reads).  `pricedOutlet` is that function; the unit's
//  published `Q_kW` (priceState on the published stream) and the energy
//  report then price the SAME number, so an adiabatic reactor publishes
//  Q = 0 to the solve's tolerance and a jacketed one exactly its jacket's
//  heat.  `F` in mol/s gives W; in kmol/s, kW.
struct PricedState
{
    scalar H  = 0.0;   //  F x h on the elements datum
    scalar vf = 0.0;   //  the vapour fraction the outlet would be published at
};
PricedState pricedOutlet(scalar               T,
                         scalar               P,
                         const sVector&       z,
                         scalar               F,
                         scalar               vf_in,
                         const ThermoPackage& thermo);

//  THE INVERSE, for a balance that marches the ENTHALPY and recovers T (the
//  `pfr`): the T at which the published-surface molar enthalpy equals `h`
//  [J/mol] at (P, z).  `Tguess` / `vfGuess` are the previous evaluation's
//  answer: while the state stays in that one phase the inversion is a Newton
//  on that phase's smooth rung, CONFIRMED by one resolution at the answer;
//  when the resolution says another phase or a split, the inversion
//  BRACKETS the root on the published surface itself (monotone in T: an
//  equilibrium mixture's enthalpy rises through its boiling range) and
//  closes it by false position.
//
//  A PURE fluid's enthalpy JUMPS at its saturation temperature: (T, P) do
//  not fix its quality there (CLAUDE.md 3), so an enthalpy inside the jump
//  has no T on this surface.  The inversion then returns the saturation T
//  with `unmatched_J_per_mol` = what the published state cannot carry, and
//  the caller announces it (`announceUnmatchedEnthalpy`).  No corpus case and
//  no gate fixture reaches it: a mixture's enthalpy is continuous, and the
//  product of a kinetic reactor is a mixture unless a reaction runs to exact
//  completion on a stoichiometric feed (the `pfr`'s fraction-to-boundary
//  commit can do that).  It is announced rather than left silent because
//  silence there would be exactly the defect this slice closes.
struct EnthalpyInversion
{
    scalar T  = 0.0;
    scalar vf = 0.0;
    scalar unmatched_J_per_mol = 0.0;   //  0 unless a pure fluid's jump
};
//
//  `solids` / `F` (2026-10-24, the adiabatic mixer -- its second caller):
//  a stream that also carries CRYSTALS in `s[]` prices them on the solid
//  rung (`flashState::priceSolids`, kW for kmol/s) beside its fluid, so the
//  enthalpy matched is the fluid's PLUS the crystals' per mole of fluid,
//  `h = (H_fluid + H_solid) / F` -- the rule the energy report applies to
//  every stream.  Absent (nullptr, the reactors), nothing changes.
EnthalpyInversion temperatureOfEnthalpy(scalar               h,
                                        scalar               P,
                                        const sVector&       z,
                                        scalar               Tguess,
                                        scalar               vfGuess,
                                        scalar               vf_in,
                                        const ThermoPackage& thermo,
                                        const sVector*       solids = nullptr,
                                        scalar               F      = 0.0);

//  Said once per unit (stderr + AdvisoryLog), with the duty it leaves.
void announceUnmatchedEnthalpy(const std::string& unitType,
                               const std::string& unitName,
                               const std::string& mode,
                               scalar             T_out,
                               scalar             unmatched_kW);

} // namespace reactorOutlet
} // namespace Choupo

#endif
