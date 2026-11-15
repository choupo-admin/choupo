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
    src/unitOperations/UnitTypedProperties.H

Description
    A UNIT BLOCK DOES NOT CARRY A PROPERTY (DEV.md 4c C398 addendum A4; C402,
    "no legacy").  ONE home of the refusal, for any unit: the property
    dictionary holds a liquid or vapour property (a viscosity, a diffusivity,
    a density, a surface tension, a conductivity) and the unit asks the
    package through the door (thermo/LiquidPropertyDoor.H).  A property
    word typed in `operation` or any block inside it is refused BY NAME,
    with the line to write in the property dictionary instead.  The column
    family was migrated in C398 slice (d) (ColumnTypedProperties.H calls
    this with kind "column"); the membrane family in C402 (spiral-wound
    module, rated-test inversion, batch diafilter).  A unit family not yet
    migrated does not call it; the count of its sites is the ratchet's
    debt (bin/curate/check_liquid_property_ratchet.py, class `keyRead`),
    and a family leaves that debt when it calls this.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <functional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {
namespace unitTypedProperties {

//  The property words a column block might carry, each with the line that
//  holds it in the property dictionary.  THE LIST IS OF WHAT THE COLUMN CODE
//  READ AS A PROPERTY, aliases included (DEV.md 4c C398 review row DG-01,
//  audited 2026-11-15 over every key src/unitOperations/distillation/ looks
//  up): `liquidViscosity` (packing, efficiency) and `sigma` (hydraulics) were
//  the two it read; every other spelling of a transport or volumetric
//  property is refused beside them, so a case cannot type one under another
//  name.  The reaction and adsorption data a reactive column reads (`Ka`,
//  `lnKa`, `dHrxn`, `K`) are the case's kinetics and equilibrium constants,
//  not a phase property, and stay where they are.
inline const std::vector<std::pair<std::string, std::string>>& words()
{
    static const std::string visc =
        "`transport { liquid { viscosity { measured { <name> { use method; reason"
        " \"...\"; } } } } }` in constant/thermoPhysPropDict, with the value in"
        " constant/experiments/<name>.dat (property liquidViscosity; system; solvent;"
        " columns mu [Pa.s] and, where the source states them, T and w[<c>]; a box"
        " in T and the mass fractions; provenance { citation; basis })";
    static const std::string diff =
        "`transport { liquid { diffusivity { returns effective; composition { rule"
        " <name>; } infiniteDilution { default { model WilkeChang; } entries ("
        " ... ); } thermodynamicFactor { take 1; } } } }`";
    static const std::string dens =
        "`volumetric { liquid { measured { <name> { use method; ... } } } }` with"
        " constant/experiments/<name>.dat (property liquidDensity)";
    static const std::string sigma =
        "`transport { interface { surfaceTension { model <word>; } } }` (or the"
        " records' laws, `surfaceTension { }`)";
    static const std::string lk  = "`transport { liquid { thermalConductivity { model <word>; } } }`";
    static const std::string vv  = "`transport { vapour { viscosity { model <word>; } } }`";
    static const std::string vd  = "`transport { vapour { diffusivity { model <word>; } } }`";
    static const std::string vk  = "`transport { vapour { thermalConductivity { model <word>; } } }`";
    static const std::string rhoV = "the vapour's equation of state (`equilibrium { vapour { fugacityModel"
                                    " <word>; } }`): a vapour density is computed, never typed";
    static const std::vector<std::pair<std::string, std::string>> w = {
        { "liquidViscosity", visc }, { "viscosity", visc }, { "mu", visc }, { "muL", visc },
        { "mu_L", visc }, { "liquidDiffusivity", diff }, { "diffusivity", diff }, { "DL", diff },
        { "D_L", diff }, { "liquidDensity", dens }, { "density", dens }, { "rho", dens },
        { "rhoL", dens }, { "rho_L", dens }, { "surfaceTension", sigma }, { "sigma", sigma },
        { "liquidThermalConductivity", lk }, { "liquidConductivity", lk },
        { "thermalConductivity", lk }, { "vapourViscosity", vv }, { "vaporViscosity", vv },
        { "muV", vv }, { "mu_V", vv }, { "muG", vv }, { "vapourDiffusivity", vd },
        { "vaporDiffusivity", vd }, { "DV", vd }, { "D_V", vd }, { "DG", vd },
        { "vapourThermalConductivity", vk }, { "vapourDensity", rhoV }, { "vaporDensity", rhoV },
        { "rhoV", rhoV }, { "rho_V", rhoV }, { "rhoG", rhoV },
    };
    return w;
}

//  Refuse a property word in `operation` or in ANY block inside it, at every
//  depth (lists of blocks included: `feeds ( { ... } )`).
//  `kind` names the unit family in the message ("column", "membrane
//  module"); `extraWords` are the spellings that family's own code used to
//  read beyond the common list, and the lines it writes instead of the common
//  one where the family asks for a different quantity (a key and its line).
inline void refuse(const DictPtr& operDict, const std::string& who,
                   const std::string& kind,
                   const std::vector<std::pair<std::string, std::string>>& extraWords = {})
{
    auto check = [&](const DictPtr& d, const std::string& where)
    {
        auto one = [&](const std::string& k, const std::string& line)
        {
            if (d->found(k))
                throw std::runtime_error(who + "`" + k + "` typed in `" + where + "` --"
                    " a " + kind + " block does not carry a property: the property dictionary"
                    " holds it, and the " + kind + " asks the package for it (DEV.md 4c C398,"
                    " A4; C402).  Write " + line + ", and remove the key here.");
        };
        for (const auto& [k, line] : extraWords) one(k, line);   // the family's own line first
        for (const auto& [k, line] : words()) one(k, line);
    };
    std::function<void(const DictPtr&, const std::string&)> walk =
        [&](const DictPtr& d, const std::string& where)
    {
        check(d, where);
        for (const auto& [path, child] : d->childDictsUnnoted(where))
            walk(child, path);
    };
    walk(operDict, "operation");
}

} // namespace unitTypedProperties
} // namespace Choupo
