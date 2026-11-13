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
\*---------------------------------------------------------------------------*/

#include "PropertySourceDeclarations.H"

#include "core/PropertySourceLog.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace propertySourceDeclarations {

namespace {

struct Row { const char* property; std::vector<const char*> classes; };

//  The inventory of docs/design/thermophysical-slice0-plan.md section 1,
//  per unit type.
const std::map<std::string, std::vector<Row>>& table()
{
    static const std::map<std::string, std::vector<Row>> t = {
        { "pump",              { { "liquidDensity",     { "bypass" } } } },
        { "pressureExchanger", { { "liquidVolume",      { "bypass" } } } },
        { "cstr",              { { "liquidVolume",      { "bypass" } },
                                 { "vapourVolume",      { "kernel" } } } },
        { "pfr",               { { "liquidVolume",      { "bypass" } },
                                 { "liquidDiffusivity", { "kernel" } } } },
        { "crystalliser",      { { "liquidVolume",      { "bypass" } } } },
        { "sprayDryer",        { { "liquidDensity",     { "bypass" } },
                                 { "liquidViscosity",   { "kernel", "declared", "bypass" } },
                                 { "surfaceTension",    { "kernel", "declared", "bypass" } } } },
        { "spiralWoundModule", { { "liquidDensity",     { "declared", "bypass" } },
                                 { "liquidViscosity",   { "kernel", "declared", "bypass" } },
                                 { "liquidDiffusivity", { "kernel", "declared", "bypass", "record" } } } },
        { "electrodialysisStack", { { "liquidDensity",  { "bypass" } },
                                    { "liquidViscosity", { "kernel" } },
                                    { "liquidKinematicViscosity", { "kernel", "bypass" } } } },
        { "batchElectrodialysis", { { "liquidDensity",  { "bypass" } },
                                    { "liquidKinematicViscosity", { "kernel", "bypass" } } } },
        { "batchDiafilter",    { { "liquidDensity",     { "declared", "bypass" } } } },
        { "valve",             { { "liquidDensity",     { "kernel" } } } },
        { "storageTank",       { { "liquidDensity",     { "kernel" } } } },
        { "heatExchanger",     { { "liquidDensity",     { "kernel" } },
                                 { "liquidViscosity",   { "kernel" } } } },
        { "pipe",              { { "liquidDensity",     { "kernel" } },
                                 { "liquidViscosity",   { "kernel", "declared" } },
                                 { "surfaceTension",    { "kernel", "declared" } } } },
        { "phaseChanger",      { { "liquidDensity",     { "kernel" } },
                                 { "liquidViscosity",   { "kernel" } },
                                 { "surfaceTension",    { "kernel" } } } },
        { "distillationColumn",{ { "liquidDensity",     { "kernel" } },
                                 { "liquidViscosity",   { "kernel", "declared" } },
                                 { "surfaceTension",    { "kernel", "declared" } },
                                 { "liquidDiffusivity", { "own" } } } },
        { "hydrocyclone",      { { "liquidDensity",     { "kernel" } } } },
        { "cakeFilter",        { { "liquidDensity",     { "kernel" } },
                                 { "liquidViscosity",   { "kernel" } } } },
        { "thickener",         { { "liquidDensity",     { "kernel" } } } },
        { "sedimentingCentrifuge", { { "liquidDensity", { "kernel" } },
                                     { "liquidViscosity", { "kernel" } } } },
    };
    return t;
}

} // namespace

void declareFor(const std::string& type, const std::string& unit)
{
    const auto it = table().find(type);
    if (it == table().end()) return;
    for (const auto& row : it->second)
        for (const char* cls : row.classes)
            PropertySourceLog::instance().declare(type, unit, row.property, cls);
}

} // namespace propertySourceDeclarations
} // namespace Choupo
