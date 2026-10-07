/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::phaseDensity

Description
    THE DENSITY OF THE PHASE A NAMED STREAM CARRIES, for a post-processing
    pass that must turn a volume into a mass or a mass flow into a volume
    (2026-10-07, DEV.md 4c C44): a storage tank is sized on the density of
    the liquid it stores, and an item's inventory is its volume times the
    density of what fills it.

    ONE HOME FOR THE READING, AND IT COMPUTES NOTHING OF ITS OWN.  The
    density is `ThermoPackage::density` -- the package's one door, with its
    own route announced by the package itself -- evaluated on the case's
    declared package at the STATE THE STREAM CARRIES.  This file decides
    only two things, and states both:

      * WHICH PHASE.  A stream whose vapour fraction is 0 is a liquid, 1 a
        vapour.  A stream carrying BOTH is REFUSED: its density is not one
        number, and the remedy -- name the stream that carries each phase,
        which a flash drum's own outlets are -- is in the message.
        A stream carrying solids is refused too: no phase density here
        prices a crystal.

      * WHICH COMPONENTS THE DENSITY IS ASKED OVER -- and this is NOT
        decided here: `thermo/PricedDensity` is the one home, the selection
        the `storageTank` unit makes too.  A gas dissolved in a liquid (H2,
        N2, Ar in liquid ammonia) has no liquid molar volume at a state
        above its critical temperature, so the package cannot price it
        alone; the density is taken over the other components,
        renormalised, the share left out is ANNOUNCED and published, and
        the MASS still counts every component.  A large share is a finding
        the caller reports, not one it decides about (`storageTank`'s
        posture, kept).

    THE CASE'S GLOBAL PACKAGE.  A unit with its own `thermo {}` world is
    priced here on the global one, and the announcement says "the case's
    package" so a reader is not told otherwise.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "result/SimulationResult.H"

#include <map>
#include <string>

namespace Choupo {
namespace phaseDensity {

struct Reading
{
    std::string                   phase;        // "liquid" | "vapour"
    scalar                        T   = 0.0;    // [K]
    scalar                        P   = 0.0;    // [Pa]
    scalar                        rho = 0.0;    // [kg/m3]
    scalar                        massFlow = 0.0;   // [kg/s] of the stream
    std::map<std::string, scalar> massFraction;     // per component [-]
    //  The mole fraction of components the package could not price alone
    //  at this state, left out of the density (`pricedDensity::select`).
    scalar                        unpricedMoleFraction = 0.0;
};

//  The density of the single phase `stream` carries, at its own state.
//  `who` names the asking item in every refusal and announcement.  Throws
//  (by name, with the remedy) when the result carries no package, the
//  stream does not exist, carries two phases or solids, or no component of
//  it can be priced.
Reading of(const SimulationResult& result,
           const std::string&      stream,
           const std::string&      who);

} // namespace phaseDensity
} // namespace Choupo
