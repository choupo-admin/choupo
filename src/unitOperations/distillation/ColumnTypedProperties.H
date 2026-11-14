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
File
    src/unitOperations/distillation/ColumnTypedProperties.H

Description
    A COLUMN'S BLOCK DOES NOT CARRY A PROPERTY (DEV.md 4c C398, ADDENDUM A4,
    and the architect's ruling 3 on slice (d)'s first hand-back).  Until
    slice (d) a column took a liquid viscosity typed in `packing {}` or
    `efficiency {}` and used it for the liquid AND, through its own
    Wilke-Chang, for the diffusivity, and the property dictionary said
    nothing of it.  The property dictionary now has the slot -- a measured
    mixture viscosity of a constituent set (`transport { liquid { viscosity
    { measured {} } } }`) -- and the column asks the package.  So a property
    value typed in the column's `operation` or any block of it is refused,
    with the line to write in the property dictionary.  The sixteen shipped
    cases that typed one were migrated, each to the same number.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"

#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {
namespace columnTypedProperties {

//  The property words a column block might carry, each with the line that
//  holds it in the property dictionary.
inline const std::vector<std::pair<std::string, std::string>>& words()
{
    static const std::vector<std::pair<std::string, std::string>> w = {
        { "liquidViscosity",
          "`transport { liquid { viscosity { measured { <name> { use method; reason"
          " \"...\"; } } } } }` in constant/thermoPhysPropDict, with the value in"
          " constant/experiments/<name>.dat (property liquidViscosity; system; solvent;"
          " columns mu [Pa.s] and, where the source states them, T and w[<c>]; a box"
          " in T and the mass fractions; provenance { citation })" },
        { "liquidDiffusivity",
          "`transport { liquid { diffusivity { returns effective; composition { rule"
          " <name>; } infiniteDilution { default { model WilkeChang; } entries ("
          " ... ); } thermodynamicFactor { take 1; } } } }`" },
        { "liquidDensity",
          "`volumetric { liquid { measured { <name> { use method; ... } } } }` with"
          " constant/experiments/<name>.dat (property liquidDensity)" },
        { "surfaceTension",
          "`transport { interface { surfaceTension { model <word>; } } }`" },
        { "liquidThermalConductivity",
          "`transport { liquid { thermalConductivity { model <word>; } } }`" },
        { "liquidConductivity",
          "`transport { liquid { thermalConductivity { model <word>; } } }`" },
        { "vapourViscosity",
          "`transport { vapour { viscosity { model <word>; } } }`" },
        { "vapourDiffusivity",
          "`transport { vapour { diffusivity { model <word>; } } }`" },
        { "vapourThermalConductivity",
          "`transport { vapour { thermalConductivity { model <word>; } } }`" },
    };
    return w;
}

//  Refuse a property word in `operation` or in any block directly inside it.
inline void refuse(const DictPtr& operDict, const std::string& who)
{
    auto check = [&](const DictPtr& d, const std::string& where)
    {
        for (const auto& [k, line] : words())
            if (d->found(k))
                throw std::runtime_error(who + "`" + k + "` typed in `" + where + "` --"
                    " a column block does not carry a property: the property dictionary"
                    " holds it, and the column asks the package for it (DEV.md 4c C398,"
                    " A4).  Write " + line + ", and remove the key here.");
    };
    check(operDict, "operation");
    for (const auto& [path, child] : operDict->childDictsUnnoted())
        check(child, "operation." + path);
}

//  The column's liquid film takes the EFFECTIVE liquid diffusivity the
//  property dictionary declares (LiquidPropertyDoor, Property::diffusivity).
//  Checked before the solve, so a case without the declaration is told the
//  line to write rather than refused in the middle of an iteration.
inline void requireEffectiveLiquidDiffusivity(const ThermoPackage& thermo, const std::string& who)
{
    const auto& d = thermo.liquidDiffusivityDeclaration();
    if (!d.declared || d.returns != liquidTransport::Returns::effective)
        throw std::runtime_error(who + "the liquid film needs the effective liquid"
            " diffusivity of the binary, and the property dictionary "
            + std::string(d.declared ? "returns infinite-dilution values" : "declares no liquid diffusivity")
            + ".  Write `transport { liquid { diffusivity { returns effective; composition"
              " { rule <CaldwellBabb|Vignes|LefflerCullinan|AndersonBabb>; } infiniteDilution"
              " { default { model WilkeChang; } } thermodynamicFactor { take 1; } } } }` in"
              " constant/thermoPhysPropDict (the rule is the case's choice; the Theory"
              " Guide's section \"The liquid diffusivity a package returns\" gives each).");
}

} // namespace columnTypedProperties
} // namespace Choupo
