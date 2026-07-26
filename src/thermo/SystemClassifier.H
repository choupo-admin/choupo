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
Class
    Choupo::SystemClassifier (free function classifySystem)

Description
    The COMPONENT-FACTS classifier of the ThermoResolver (ratified
    2026-07-26): reads permanent, substance-level facts from the canonical
    component records -- never a name, never an ad-hoc case list -- and
    classifies every component of the present system:

        AqueousSolvent        the DECLARED aqueous solvent (read from the
                              case's aqueous formulation, no `if water`)
        ApparentElectrolyte   typed bridge to ionic species
                              (aqueousMapping / dissociatesTo)
        MolecularReactive     `aqueousSpeciation <setName>;` -- joins the
                              aqueous equilibrium speciation network
        MolecularNonionising  `aqueousSpeciation none;` -- curated fact of
                              non-participation at this level
        Nonvolatile           role nonvolatile (solids, salts-as-feed)
        Unknown               NO aqueous-speciation fact on the record

    An Unknown molecular component inside an ELECTROLYTE system is a named
    refusal (curation remedy in the message); in a purely molecular system
    the fact is irrelevant and absence is tolerated.

    The classifier produces announce-ready `[resolver]` report lines: the
    student sees what was read, what was concluded, and what is missing.
    It selects nothing and estimates nothing -- selection stays with the
    builder (declared package, verified) and generation with the curation
    tool (choupo-resolve).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

class Component;

struct ComponentClassification
{
    enum class Kind
    {
        AqueousSolvent,
        ApparentElectrolyte,
        MolecularReactive,
        MolecularNonionising,
        Nonvolatile,
        Unknown
    };
    Kind        kind = Kind::Unknown;
    std::string name;
    std::string speciationSet;   // MolecularReactive: the canonical set name
    std::string note;            // one human-readable classification line
};

struct SystemClassification
{
    std::vector<ComponentClassification> components;
    bool electrolyteSystem = false;   // any electrolyte / reactive present
    std::vector<std::string> report;  // "[resolver] ..." lines, announce-ready
    std::vector<std::string> refusals;// nonempty => the system cannot be served
};

//  Classify the present system from canonical facts.  `declaredSolvent` is
//  the aqueous solvent the case's formulation declares (the classifier never
//  recognises a solvent by name).
SystemClassification classifySystem(const std::vector<Component>& comps,
                                    const std::vector<std::string>& names,
                                    const std::string& declaredSolvent);

} // namespace Choupo
