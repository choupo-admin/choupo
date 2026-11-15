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
    src/unitOperations/membrane/MembraneTypedProperties.H

Description
    A MEMBRANE UNIT'S BLOCK DOES NOT CARRY A PROPERTY (DEV.md 4c C402, the
    membrane family; the rule is C398 addendum A4).  The spiral-wound module,
    its rated-test probe and the batch diafilter used to read a feed density
    (`rho_feed`, `rho`, `rho_diafiltrate`), a viscosity and a solute
    diffusivity typed in the unit, and kept 1000 kg/m3, 1e-3 Pa.s and
    1.6e-9 m2/s when the case typed none.  They ask the package through the
    one door (thermo/LiquidPropertyDoor.H).  The words this family's code read
    beyond the common list, and the line each is replaced by, are here; the
    refusal itself is the generic one (unitOperations/UnitTypedProperties.H).
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitTypedProperties.H"

#include <string>
#include <utility>
#include <vector>

namespace Choupo {
namespace membrane {

//  The key and the line that replaces it (the family's own wording first,
//  the common list beside it).
inline const std::vector<std::pair<std::string, std::string>>& typedPropertyWords()
{
    static const std::string dens =
        "nothing in the unit: the density of the feed comes from the package at the feed's"
        " own T, P and composition -- a component's liquid volume, a `volumetric { liquid {"
        " measured { <name> { use method; reason \"...\"; } } } }` with"
        " constant/experiments/<name>.dat (property liquidDensity), or, for a solute that"
        " keeps its mass and adds no volume, `approximations { massWithoutVolume {"
        " components ( ... ); maxMassFraction <w>; reason \"...\"; } }`, all in"
        " constant/thermoPhysPropDict";
    static const std::string visc =
        "`transport { liquid { viscosity { model <word>; } } }` in constant/thermoPhysPropDict"
        " (each record's law and the mixing rule), or, where the case's source states a"
        " value for the mixture, `transport { liquid { viscosity { measured { <name> {"
        " use method; reason \"...\"; } } } } }` with the value in"
        " constant/experiments/<name>.dat (property liquidViscosity; system; solvent;"
        " columns mu [Pa.s]; a box in T and the mass fractions; provenance { citation;"
        " basis })";
    static const std::string diff =
        "`transport { liquid { diffusivity { returns infiniteDilution; infiniteDilution {"
        " default { model WilkeChang; } entries ( { solute <salt>; solvent water; kind"
        " infiniteDilution; value <D> m2/s; T <T> K; box { T (<lo> <hi>); } source \"...\"; }"
        " ); } } } }` in constant/thermoPhysPropDict, ONE entry per solute (each lumped"
        " salt has its own value in water; an ion reads its species record's D0)";
    static const std::vector<std::pair<std::string, std::string>> w = {
        { "rho_feed", dens }, { "rho_diafiltrate", dens }, { "rho", dens },
        { "density", dens }, { "liquidDensity", dens },
        { "mu_feed", visc }, { "viscosity", visc }, { "liquidViscosity", visc },
        { "mu", visc },
        { "D_solute", diff }, { "diffusivity", diff }, { "liquidDiffusivity", diff },
    };
    return w;
}

} // namespace membrane
} // namespace Choupo
