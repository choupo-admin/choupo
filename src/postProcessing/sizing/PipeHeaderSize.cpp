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

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "PipeHeaderSize.H"
#include "thermo/LiquidPropertyDoor.H"
#include "PhaseDensity.H"
#include "TrainSplit.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/hydraulics/friction/FrictionFactorCorrelation.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

constexpr scalar kPi = 3.14159265358979323846;

std::string fmt(scalar v)
{
    char b[48];
    std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(v));
    return b;
}

//  A named sub-dict, from the header first and then from the entry.
DictPtr blockOf(const DictPtr& header, const DictPtr& rules, const char* name,
                const std::string& who)
{
    for (const DictPtr& d : { header, rules })
        if (d->found(name) && std::holds_alternative<DictPtr>(d->entryValue(name)))
            return d->subDict(name);
    throw std::runtime_error(who + ": `" + name + " { ... }` is declared"
        " neither on the header nor on the entry.  A header is sized from"
        " numbers the CASE chooses (a velocity window, the bores it can buy, a"
        " roughness); none is taken by default.");
}

void needText(const DictPtr& b, const char* block, const char* key,
              const std::string& who)
{
    if (!b->found(key) || b->lookupWord(key).empty())
        throw std::runtime_error(who + ": `" + block + " { " + key
            + " \"...\"; }` is not declared -- a number the case chose carries"
              " where it came from and why it is this plant's.");
}

} // namespace

std::vector<EquipmentSizing> PipeHeaderSize::size(const std::string& unitName,
    const SimulationResult& result, const Material& material,
    const DictPtr& designRules) const
{
    const std::string unitWho = "pipeHeader '" + unitName + "'";
    const int N   = trainSplit::trainsOf(result, designRules, unitWho);
    const int nTr = std::max(1, N);

    if (!designRules->hasDictList("headers"))
        throw std::runtime_error(unitWho + ": `headers ( { role feed; stream"
            " <name>; } ... );` is not declared -- the headers to size and the"
            " stream each carries.");
    const std::vector<DictPtr> headers = designRules->lookupDictList("headers");
    if (headers.empty())
        throw std::runtime_error(unitWho + ": `headers` is empty.");

    std::vector<EquipmentSizing> out;
    for (const DictPtr& H : headers)
    {
        if (!H->found("role") || !H->found("stream"))
            throw std::runtime_error(unitWho + ": every header declares `role`"
                " and `stream`.");
        const std::string role   = H->lookupWord("role");
        const std::string stream = H->lookupWord("stream");
        const std::string who = "pipeHeader '" + unitName + "' " + role
            + " header (stream " + stream + ")";

        //  ---- the declarations --------------------------------------------
        const DictPtr vel = blockOf(H, designRules, "velocity", who);
        for (const char* k : { "source", "reason" }) needText(vel, "velocity", k, who);
        if (!vel->found("origin")
            || (vel->lookupWord("origin") != "literature"
                && vel->lookupWord("origin") != "assumed"))
            throw std::runtime_error(who + ": `velocity { origin literature|"
                "assumed; }` is not declared.");
        if (!vel->found("min") || !vel->found("max"))
            throw std::runtime_error(who + ": `velocity { min <m/s>; max <m/s>;"
                " }` is not declared -- a velocity WINDOW needs both ends.");
        const scalar vMin = vel->lookupScalar("min", Dims::velocity);
        const scalar vMax = vel->lookupScalar("max", Dims::velocity);
        if (!(vMin > 0.0) || !(vMax > vMin))
            throw std::runtime_error(who + ": the velocity window [" + fmt(vMin)
                + ", " + fmt(vMax) + "] m/s must satisfy 0 < min < max.");

        const DictPtr ns = blockOf(H, designRules, "nominalSizes", who);
        for (const char* k : { "source", "reason" }) needText(ns, "nominalSizes", k, who);
        if (!ns->found("origin")
            || (ns->lookupWord("origin") != "literature"
                && ns->lookupWord("origin") != "assumed"))
            throw std::runtime_error(who + ": `nominalSizes { origin literature|"
                "assumed; }` is not declared.");
        if (!ns->hasDictList("sizes"))
            throw std::runtime_error(who + ": `nominalSizes { sizes ( {"
                " insideDiameter <m>; } ... ); }` is not declared.");
        std::vector<scalar> bores;
        for (const DictPtr& s : ns->lookupDictList("sizes"))
        {
            if (!s->found("insideDiameter"))
                throw std::runtime_error(who + ": a nominal size declares"
                    " `insideDiameter <length>;`.");
            const scalar d = s->lookupScalar("insideDiameter", Dims::length);
            if (!(d > 0.0))
                throw std::runtime_error(who + ": a nominal inside diameter"
                    " must be positive; got " + fmt(d) + " m.");
            bores.push_back(d);
        }
        if (bores.empty())
            throw std::runtime_error(who + ": `nominalSizes.sizes` is empty.");
        std::sort(bores.begin(), bores.end());

        const DictPtr rg = blockOf(H, designRules, "roughness", who);
        for (const char* k : { "source", "reason" }) needText(rg, "roughness", k, who);
        if (!rg->found("value"))
            throw std::runtime_error(who + ": `roughness { value <m>; }` is not declared.");
        const scalar eps = rg->lookupScalar("value", Dims::length);
        if (!(eps >= 0.0))
            throw std::runtime_error(who + ": the roughness must not be negative.");

        std::string model;
        if (H->found("frictionModel")) model = H->lookupWord("frictionModel");
        else if (designRules->found("frictionModel")) model = designRules->lookupWord("frictionModel");
        else
            throw std::runtime_error(who + ": `frictionModel <word>;` is not"
                " declared (a registered friction-factor correlation).");

        //  ---- what is read ------------------------------------------------
        const phaseDensity::Reading rd = phaseDensity::of(result, stream, who);
        const scalar rho = rd.rho;
        const scalar Qplant = rd.massFlow / rho;                  // m3/s
        const scalar Q = Qplant / nTr;

        scalar mu = 0.0;
        std::string muFrom;
        {
            const DictPtr vb = (H->found("viscosity")
                                && std::holds_alternative<DictPtr>(H->entryValue("viscosity")))
                ? H->subDict("viscosity")
                : (designRules->found("viscosity")
                   && std::holds_alternative<DictPtr>(designRules->entryValue("viscosity")))
                    ? designRules->subDict("viscosity") : nullptr;
            if (vb)
            {
                for (const char* k : { "source", "reason" }) needText(vb, "viscosity", k, who);
                if (!vb->found("value"))
                    throw std::runtime_error(who + ": `viscosity { value <Pa.s>; }` is not declared.");
                mu = vb->lookupScalar("value", Dims::viscosity);
                muFrom = "declared by the case: " + vb->lookupWord("source");
            }
            else
            {
                const ProcessStream& s = result.streams.at(stream);
                std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
                if (!pkg || !pkg->hasLiquidViscosity())
                    throw std::runtime_error(who + ": the case's package has no"
                        " liquid-viscosity model and the header declares no"
                        " `viscosity { value <Pa.s>; source; reason; }`.  No"
                        " viscosity is guessed.");
                mu = liquidProperty::evaluate(*pkg, liquidProperty::Property::viscosity, s.T, s.P, s.z, liquidProperty::Consumer{"sizing.pipeHeader", who}).value;
                muFrom = "the case's liquid-viscosity model";
            }
        }
        if (!(mu > 0.0) || !std::isfinite(mu))
            throw std::runtime_error(who + ": non-physical viscosity " + fmt(mu) + " Pa.s.");

        //  ---- the choice --------------------------------------------------
        const scalar Dreq = std::sqrt(4.0 * Q / (kPi * vMax));
        scalar Dnom = -1.0;
        for (scalar d : bores)
            if (d >= Dreq * (1.0 - 1e-12)) { Dnom = d; break; }
        auto velocityAt = [&](scalar d) { return 4.0 * Q / (kPi * d * d); };
        std::string list;
        for (scalar d : bores) list += (list.empty() ? "" : ", ") + fmt(d);
        if (Dnom < 0.0)
            throw std::runtime_error(who + ": NO declared size fits.  Q = "
                + fmt(Q * 3600.0) + " m3/h per train needs a bore of at least "
                + fmt(Dreq) + " m for v <= " + fmt(vMax) + " m/s; the largest"
                " declared is " + fmt(bores.back()) + " m (declared bores, m: "
                + list + ").  Declare a larger size, a higher maximum velocity,"
                " or more trains.");
        const scalar v = velocityAt(Dnom);
        if (v < vMin * (1.0 - 1e-12))
            throw std::runtime_error(who + ": NO declared size fits.  Q = "
                + fmt(Q * 3600.0) + " m3/h per train: the smallest bore that"
                " keeps v <= " + fmt(vMax) + " m/s is " + fmt(Dnom) + " m, where"
                " v = " + fmt(v) + " m/s is below the window's minimum "
                + fmt(vMin) + " m/s (declared bores, m: " + list
                + ").  Declare a bore between " + fmt(Dreq) + " m and "
                + fmt(std::sqrt(4.0 * Q / (kPi * vMin))) + " m, or widen the window.");

        FrictionFactorCorrelation::registerBuiltins();
        auto corr = FrictionFactorCorrelation::New(model);
        FrictionContext fc;
        fc.Re = rho * v * Dnom / mu;
        fc.relRough = eps / Dnom;
        const FrictionResult fr = corr->evaluate(fc);
        const scalar dpdl = fr.f / Dnom * 0.5 * rho * v * v;

        EquipmentSizing d;
        d.unitName      = unitName;
        d.equipmentType = type_;
        d.material      = material.name;
        d.stream        = stream;      // the sheet draws this stream as its inlet
        d.set("flowPlant",             Qplant * 3600.0,  "m3/h");
        d.set("flow",                  Q * 3600.0,       "m3/h");
        d.set("density",               rho,              "kg/m3");
        d.set("viscosity",             mu,               "Pa.s");
        d.set("velocityMin",           vMin,             "m/s");
        d.set("velocityMax",           vMax,             "m/s");
        d.set("requiredInsideDiameter", Dreq,            "m");
        d.set("nominalInsideDiameter", Dnom,             "m");
        d.set("headerNominalDiameter", Dnom,             "m");
        d.set("velocity",              v,                "m/s");
        d.set("reynolds",              fc.Re,            "-");
        d.set("relativeRoughness",     fc.relRough,      "-");
        d.set("frictionFactor",        fr.f,             "-");
        d.set("pressureDropPerMetre",  dpdl,             "Pa/m");
        d.basis = role + " header on stream " + stream + ": Q = m / rho"
            + (N > 0 ? " / " + std::to_string(N) + " trains" : std::string())
            + " (rho " + fmt(rho) + " kg/m3 from the case's package at the"
              " stream's own state); D_required = sqrt(4 Q / (pi v_max)) with"
              " v_max " + fmt(vMax) + " m/s; the smallest declared bore not"
              " below it is taken and its velocity must stay >= v_min "
            + fmt(vMin) + " m/s; dP/L = f/D rho v^2/2 with f from "
            + model + " at Re " + fmt(fc.Re) + ", eps/D " + fmt(fc.relRough)
            + "; viscosity " + fmt(mu) + " Pa.s (" + muFrom + ").  The"
              " velocity window is " + vel->lookupWord("origin") + " ("
            + vel->lookupWord("source") + "); the bores are "
            + ns->lookupWord("origin") + " (" + ns->lookupWord("source")
            + ").  Not modelled: the header's length and fittings, its wall"
              " and pressure class, the change of flow along the manifold"
              " (sized at the train's full flow), surge";
        d.notCostedBecause = "no cost set is read for a header pipe here; the"
            " money is the case's declared quote (`costing { quotes }`)";
        d.notPlacedBecause = "a header is part of the rack the plot plan"
            " places; the routed pipes are the layout's";
        if (!fr.inValidity && !fr.validityNote.empty())
            std::cerr << "[sizing] " << who << ": " << fr.validityNote << "\n";

        if (N == 0)
        {
            d.equipmentTag = role;
            out.push_back(std::move(d));
            continue;
        }
        for (int k = 1; k <= N; ++k)
        {
            EquipmentSizing t = d;
            trainSplit::stamp(t, k, N);
            t.equipmentTag = "train" + std::to_string(k) + "." + role;
            t.parallelGroup = role;
            out.push_back(std::move(t));
        }
    }
    return out;
}

} // namespace Choupo
