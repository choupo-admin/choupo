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
    Choupo::pricedDensity

Description
    WHICH COMPONENTS A PHASE DENSITY CAN BE ASKED OVER -- the ONE home of
    that choice (moved verbatim out of `StorageTank.cpp`, 2026-10-07, when a
    second caller arrived: the sizing pass's storage and inventory items,
    DEV.md 4c C44).

    A liquid ammonia product carries dissolved H2, N2 and Ar.  Those are
    supercritical there: they have no liquid molar volume, and the
    mole-weighted Rackett the package uses returns NaN for the whole mixture
    because of them.  The caller does NOT compute a density of its own (that
    would be a second home for a rule `ThermoPackage::density` owns).  It
    chooses the QUESTION: the same call, over the components the package can
    actually price -- each component is asked ALONE, and one whose pure
    density is not a finite positive number is left out -- renormalised.

    This file only SELECTS.  What a caller says about the components left
    out, and whether it refuses, stays with the caller: a unit and a
    post-processing pass announce in their own words.  Two callers that
    applied two different criteria (one asked the package, one compared T
    with Tc) would have been two answers to one question; this is why the
    selection moved here instead of being written a second time.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <string>

namespace Choupo {
namespace pricedDensity {

struct Selection
{
    sVector     zPriced;              // the priced components, renormalised
    scalar      keptFraction    = 0.0;
    scalar      droppedFraction = 0.0;
    std::string dropped;              // their names, ", "-separated
};

//  `z` need not be normalised.  When no component can be priced,
//  `keptFraction` is 0 and `zPriced` is all zeros -- the caller refuses in
//  its own words.
Selection select(const ThermoPackage& thermo, scalar T, scalar P,
                 const sVector& z, DensityPhase ph);

} // namespace pricedDensity
} // namespace Choupo
