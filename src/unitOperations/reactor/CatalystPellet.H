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
Function
    Choupo::announceUnresolvedPellet

    THE PELLET IS A POINT, AND UNTIL NOW NOTHING SAID SO.

    `catalystLoading` is a unit conversion and never claimed to be anything
    else: a heterogeneous rate constant is reported per gram of dry catalyst,
    and the bed turns it into a volumetric rate.  Four reactors read it --
    `cstr`, `pfr`, `batchReactor`, `dynamicCSTR` -- and all four then evaluate
    the rate at BULK conditions.  That is a modelling assumption with a name:
    the effectiveness factor is taken as

        eta = 1,

    i.e. the reactant is assumed to reach the centre of every pellet with no
    concentration drop at all.  Nothing in the engine, the dictionaries or the
    output said this.  A student ran a packed bed, got an answer, and the
    answer carried an approximation nobody had told them about.

    WHY THIS IS NOT DECORATION.  eta MULTIPLIES the rate.  For the standard
    first-order sphere,

        eta = (1/phi) [ 1/tanh(3 phi) - 1/(3 phi) ],   phi = (R/3) sqrt(k/D_eff)

    which at phi = 5 gives eta = 0.1867: a bed sized on eta = 1 would be
    UNDERSIZED by more than a factor of five, silently, at exit 0.  The engine
    cannot tell the reader whether that is their case -- a Weisz-Prater check
    needs the pellet dimension and an effective diffusivity, and no case
    declares either.  So this announces the assumption and states the remedy;
    it JUDGES nothing and moves no number.  That is deliberate, and it is the
    same posture the project took over the extrapolated sub-273 K Antoine and
    the sub-band Davies: announced, never judged.

    WHY IT IS HERE AND NOT IN FOUR PLACES.  The arity doctrine covers
    DECISIONS, not only values -- the forward reaction `order` had five
    readers with five defaults and that cost a silent wrong rate law.  "What
    do we assume about the pellet, and how do we say it" is one decision, so
    it has one home; `reactor/ReactionHeat.H` is the precedent, included by
    `batch/` and `dynamic/` for exactly this reason.

    THE ABSENCE STILL MEANS WHAT IT MEANT.  A reactor with no
    `catalystLoading` is the homogeneous case: there is no pellet to resolve,
    no assumption is being made about one, and nothing is announced.  Only a
    case that DECLARES a solid catalyst gets the sentence.

    NOT YET BUILT, and named rather than implied: the pellet itself.  The real
    slice needs a `kind catalyst;` asset record (mirroring `Adsorbent` +
    `AdsorbentRegistry`, which already carry `dParticle()` and `sphericity()`),
    an arity ruling on where D_eff lives, and a rate multiplier these same four
    reactors would apply.  Scope: docs/design/edutools-curriculum-survey.md
    Sec. 6.1.  Until it lands, this sentence is the whole of what the engine
    honestly knows.

\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

//  Announce, ONCE per locus, that a declared heterogeneous catalyst is being
//  used with no pellet model.  Does nothing when `catalystLoading` <= 0 (the
//  homogeneous case: no pellet is claimed, so none is unresolved).
//
//  Rides AdvisoryLog under category "model", so it reaches the reader through
//  the end-of-run ASSUMPTIONS AND CAVEATS block and the result JSON as well as
//  the log at its site -- an announcement a thousand lines above the answer
//  has been delivered and not received.  The log line is gated on the
//  advisory being NEW, so a unit whose setup runs more than once (a sweep, an
//  optimisation pass) says it once.
//
//  THE LOCUS IS THE CALLER'S, and that is not laziness.  `BatchUnitOperation`
//  and `DynamicUnitOperation` carry `name()`, so they say `batchReactor 'R1'`;
//  the steady `UnitOperation::solve(dict, thermo, verbosity)` is handed no
//  name at all, so `cstr` and `pfr` can only name their type -- which is what
//  every other steady advisory in the tree does (`Heater.cpp` writes
//  `"heater (Q -> outlet state)"`).  Minting a name here would be inventing
//  one.  The consequence is stated rather than hidden: two catalytic CSTRs in
//  one flowsheet dedup to a single advisory, because the sentence and the
//  locus are then identical.  The assumption is the same in both, so the
//  reader loses no fact -- only the count.
void announceUnresolvedPellet(const std::string& locus,
                              scalar             catalystLoading,
                              int                verbosity);

} // namespace Choupo
