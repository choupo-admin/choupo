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

    A record may DECLARE where its D0 came from -- `transport { provenance
    { D0 { origin; method; reviewStatus; notes; } } }` -- and an
    `origin estimated` is ANNOUNCED once per run by ionD0() on the
    component tier's own [estimate] channel and into AdvisoryLog
    (2026-09-19; the wine tutorial's case-local organic anions are the
    first such records).  No provenance block, no line.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Identifiers.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <cstdio>
#include <iostream>
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
    const scalar D0 = row->lookupScalar("D0");
    //  AN ESTIMATE THAT IS USED IS ANNOUNCED (2026-09-19, the module/stack
    //  record rule reaching the species tier).  A record that declares
    //  `transport { provenance { D0 { origin estimated; ... } } }` is read
    //  by every consumer of this accessor -- the electrodialysis units, the
    //  DSPM-DE and polarisation models -- and each of them would otherwise
    //  price a guessed diffusivity in the same silence as a measured one.
    //  Once per run per species (announceOnce), on the same channel the
    //  component tier's [estimate] line uses, and into AdvisoryLog so it
    //  reaches the end-of-run caveat block and the result JSON.  A record
    //  declaring no provenance produces no line: silence keeps meaning
    //  "nothing was assumed".
    const std::string origin = row->lookupWordOrDefault("D0origin", "");
    if ((origin == "estimated" || origin == "estimate")
        && announceOnce("estimateD0:" + species))
    {
        const std::string status = row->lookupWordOrDefault("D0reviewStatus", "");
        const std::string method = row->lookupWordOrDefault("D0method", "");
        const std::string notes  = row->lookupWordOrDefault("D0notes", "");
        char v[48];
        std::snprintf(v, sizeof(v), "%.4g", static_cast<double>(D0));
        std::string msg = std::string("`D0` = ") + v + " m2/s is an ESTIMATE"
            + (method.empty() ? "" : " (" + method + ")")
            + (status.empty() ? "" : ", reviewStatus " + status)
            + (notes.empty()  ? "" : " -- " + notes);
        std::cerr << "[estimate] species '" << species << "': " << msg << "\n";
        AdvisoryLog::instance().add("provenance", "warning",
                                    "species '" + species + "'", msg);
    }
    return D0;
}

} // namespace electrolyte
} // namespace Choupo
