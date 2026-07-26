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
Header
    Choupo::Identifiers  (ComponentId · SpeciesId · SolidId)

Description
    THE identity spaces, as strong types (settled 2026-07-25, three-way).

    Choupo has three distinct chemical vocabularies that historically shared
    one representation -- a bare std::string:

        ComponentId   the flowsheet space: what a stream carries and a
                      balance conserves (CaCO3 the fed salt, Ca the fed
                      calcium total);
        SpeciesId     the aqueous-model space: what a speciation network
                      resolves (Ca the free ion, CaCO3aq the neutral pair,
                      NH4 the master);
        SolidId       the admitted solid phases (calcite, gypsum).

    The same spelling in two spaces is two DIFFERENT objects -- the component
    CaCO3 is a salt you can feed; the species CaCO3aq is an ion pair that
    exists only inside the model.  While these were all std::string, code
    could (and did) cross spaces by lexical equality, silently.  These types
    make the crossing UNWRITABLE: there is no implicit conversion, so a
    component index cannot become a species key without going through the
    one declared bridge (AqueousChemistry::aqueousMapping, built by the
    ThermoPackageBuilder from each component's declared mapping).

    Loader contract (the condition under which a declared reference counts
    as typed): a name written in a record (`dissociatesTo`, `aqueousMapping`,
    a gas record's `dissolved`) is converted to its strong type AT LOAD,
    validated against the registry of that type, and propagated ONLY as the
    strong type.  A std::string validated once and then passed around as a
    string is not typing.

    The `.key` member is public because dictionaries, reports and JSON need
    the spelling -- but touching `.key` to CROSS spaces is the exact move
    the curation gate (check_typed_identifiers.py) exists to refuse.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {

//- The flowsheet space: streams, balances, feeds.
struct ComponentId
{
    std::string key;
    explicit ComponentId(std::string k) : key(std::move(k)) {}
    ComponentId() = default;
    bool operator<(const ComponentId& o)  const { return key < o.key; }
    bool operator==(const ComponentId& o) const { return key == o.key; }
};

//- The aqueous-model space: masters, complexes, everything a speciation
//  network resolves and an ion-transport tier serves.
struct SpeciesId
{
    std::string key;
    explicit SpeciesId(std::string k) : key(std::move(k)) {}
    SpeciesId() = default;
    bool operator<(const SpeciesId& o)  const { return key < o.key; }
    bool operator==(const SpeciesId& o) const { return key == o.key; }
    bool operator!=(const SpeciesId& o) const { return key != o.key; }
};

//- The admitted solid phases (constant/chemistryDict).
struct SolidId
{
    std::string key;
    explicit SolidId(std::string k) : key(std::move(k)) {}
    SolidId() = default;
    bool operator<(const SolidId& o)  const { return key < o.key; }
    bool operator==(const SolidId& o) const { return key == o.key; }
};

//- One leg of the component -> aqueous-species bridge: CaCl2 dissolving is
//  {Ca,1} and {Cl,2}.  The bridge is ALWAYS declared (a component's
//  `aqueousMapping` block, or its legacy `dissociatesTo` converted at load);
//  there is deliberately NO name-identity fallback -- that would be the
//  lexical coupling these types exist to remove, relocated.
struct SpeciesStoich
{
    SpeciesId species;
    double    nu = 1.0;
};

} // namespace Choupo
