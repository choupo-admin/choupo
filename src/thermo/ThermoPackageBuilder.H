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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  ThermoPackageBuilder -- the runtime ASSEMBLY step of the property
  architecture (a.k.a. PropertyPackageAssembler).  The case's INLINE
  constant/propertyDict manifest declares components, chemistry, property
  methods and parameters; this builder READS that declaration and ASSEMBLES
  a runtime ThermoPackage.

  It is NOT a "resolver" -- "resolver" is reserved for curation-time estimation.
  The builder ONLY LOADS declared records; any missing field is a hard, named
  failure (it NEVER estimates -- U3 of docs/architecture/final-property-architecture.md).

  Records are loaded + verified through the ONE record resolver
  (thermo/RecordResolver.H: the case's mirrored constant/ tree, the legacy
  propertyData/ snapshot, else the standards catalogue): components/ (the
  unified substance records), species/<name>.dat, chemistry/, and
  parameters/Pitzer/pairs/.  (Water, a plain molecular component,
  is loaded by name as usual.)
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"

namespace Choupo {

class Database;

class ThermoPackageBuilder
{
public:
    // THE v2 reader (consolidated 2026-07-18: the v1 propertyDict grammar is
    // RETIRED -- thermophysicalPropertySystem is the ONE case grammar).  Reads
    // the physically-decomposed blocks (equilibrium / aqueousProperties /
    // caloric / transport / pureFluids) into the in-memory assembly forms:
    // the FLAT dict for plain worlds (readFromDict), the manifest for the
    // worlds that need the builder (declared pair files, electrolyte, Henry).
    // STRICT: declared routes are verified against the implemented ones;
    // unknown formulations/routes refuse loudly.  Prints the resolved plan
    // ([v2 plan]).  The name keeps its history; the role is permanent.
    static DictPtr translateV2(const DictPtr& v2);

    // Assemble a ThermoPackage from a parsed propertyPackage record.
    static ThermoPackage build(const DictPtr& pkg, const Database& db);
};

} // namespace Choupo
