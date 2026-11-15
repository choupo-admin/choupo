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

#include <functional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {
namespace columnTypedProperties {

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
    std::function<void(const DictPtr&, const std::string&)> walk =
        [&](const DictPtr& d, const std::string& where)
    {
        check(d, where);
        for (const auto& [path, child] : d->childDictsUnnoted(where))
            walk(child, path);
    };
    walk(operDict, "operation");
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
