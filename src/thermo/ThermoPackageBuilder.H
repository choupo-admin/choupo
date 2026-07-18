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
#include "thermo/ChemistrySystem.H"
#include "thermo/ThermoPackage.H"

namespace Choupo {

class Database;

class ThermoPackageBuilder
{
public:
    // Assemble a ThermoPackage from a parsed propertyPackage record.
    // `chem` (optional) is the case's ACTIVE-CHEMISTRY SELECTION, resolved
    // from constant/chemistryDict by the caller via resolveChemistryContext
    // ; a chemistry{} block inside the system dict is
    // REFUSED with the migration message.
    static ThermoPackage build(const DictPtr& pkg, const Database& db,
                               const ChemistrySystem* chem = nullptr);

    // ---- v2-NATIVE path (migration steps 1-2; the plan lives in
    // docs/architecture/v2-native-migration.md) ---------------------------
    // v2NativeFormulation: does the authored v2 dict declare a formulation
    // the NATIVE path serves?  (Pilot: phiPhi.)  The caller uses it to pick
    // buildV2; an unimplemented shape gets a NAMED refusal from the
    // dispatch -- never a silent switch.
    static bool v2NativeFormulation(const DictPtr& v2);

    // buildV2: authored v2 grammar -> assembled ThermoPackage, directly.
    // Verifies the declared caloric routes, resolves binaryInteractions
    // source records (with the eos-match refusal + citation announce), and
    // assembles via ThermoPackage::assemblePhiPhi.  Refuses a formulation
    // v2NativeFormulation() does not claim.
    static ThermoPackage buildV2(const DictPtr& v2, const Database& db,
                                 const ChemistrySystem* chem = nullptr);
};

} // namespace Choupo
