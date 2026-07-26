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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
Namespace
    Choupo::electrolyte  (ion-transport tier accessors)

Description
    THE accessor of the ion-transport tier -- the `transport { radius; D0; }`
    block of a species record (data/standards/species/<ion>.dat, case-local
    ions.dat overlay honoured via electrolyte::findAqueousSpecies).

    Re-homed 2026-07-25 from the electrochem unit-op header: thermophysical
    DATA is served by the thermo tier, never by one unit op to another (the
    old home coupled membrane -> electrochem, an inversion the header itself
    confessed).  Electrodialysis (conductivity, limiting current) and the
    DSPM-DE membrane model (Stokes radii -> steric hindrance factors) consume
    the SAME tier through here.

    Refuse-LOUDLY contract: an absent ion or an absent transport block throws
    with the curation remedy -- never a silent zero (the run would otherwise
    compute a meaningless conductivity / limiting current / hindrance factor).
    Coverage today: the eight master ions (Nightingale 1959 radii; D0 via
    Nernst-Einstein from lambda0).  Extending coverage is a curation act.
\*---------------------------------------------------------------------------*/

#pragma once

#include "../../core/Identifiers.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <stdexcept>
#include <string>

namespace Choupo {
namespace electrolyte {

// Effective (Stokes/hydrated) ion radius [m].
inline scalar ionRadius(const SpeciesId& id)
{
    const std::string& species = id.key;
    auto row = findAqueousSpecies(species);
    if (!row)
        throw std::runtime_error("ion-transport tier: ion '" + species
            + "' has no species row (case-local constant/electrolyte/ions.dat"
              " or data/standards/species/) -- curate the species record"
              " before using it in a unit that transports ions.");
    if (!row->found("radius"))
        throw std::runtime_error("ion-transport tier: ion '" + species
            + "' has no `radius` -- the transport block (radius + D0) is"
              " curated for the eight master ions today (Nightingale 1959)."
              "  Add a `radius` row (raw SI metres, primary-cited) to the"
              " species record before using '" + species + "' here.");
    return row->lookupScalar("radius");
}

// Infinite-dilution (Nernst) diffusion coefficient [m2/s], 25 C.
inline scalar ionD0(const SpeciesId& id)
{
    const std::string& species = id.key;
    auto row = findAqueousSpecies(species);
    if (!row)
        throw std::runtime_error("ion-transport tier: ion '" + species
            + "' has no species row (case-local constant/electrolyte/ions.dat"
              " or data/standards/species/) -- curate the species record"
              " before using it in a unit that transports ions.");
    if (!row->found("D0"))
        throw std::runtime_error("ion-transport tier: ion '" + species
            + "' has no `D0` -- the transport block (radius + D0) is curated"
              " for the eight master ions today (D0 from lambda0 via"
              " Nernst-Einstein).  Add a `D0` row (m2/s, primary-cited) to"
              " the species record before using '" + species + "' here.");
    return row->lookupScalar("D0");
}

} // namespace electrolyte
} // namespace Choupo
