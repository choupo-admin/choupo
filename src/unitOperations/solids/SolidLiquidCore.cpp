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

#include "unitOperations/solids/SolidLiquidCore.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace Choupo {

namespace {

//  `scal` holds F, T, P, vf; `parent` holds `composition {}` and `solids {}`.
SlurryState readOne(const DictPtr& scal, const DictPtr& parent,
                    const ThermoPackage& thermo, const std::string& owner)
{
    const std::size_t n = thermo.n();
    SlurryState s;
    s.name = scal->found("streamName") ? scal->lookupWord("streamName") : "feed";
    const scalar F = scal->lookupScalar("F");
    s.T  = scal->lookupScalar("T");
    s.P  = scal->lookupScalar("P");
    s.vf = scal->lookupScalarOrDefault("vf", 0.0);
    s.liquid.assign(n, 0.0);
    s.solid.assign(n, 0.0);
    if (parent->found("composition"))
    {
        auto comp = parent->subDict("composition");
        for (const auto& k : comp->keys())
            s.liquid[thermo.indexOf(k)] = std::max(0.0, F * comp->lookupScalar(k));
    }
    if (parent->found("solids"))
    {
        auto sol = parent->subDict("solids");
        if (sol->found("solidMolarFlows"))
        {
            auto sf = sol->subDict("solidMolarFlows");
            for (const auto& k : sf->keys())
                s.solid[thermo.indexOf(k)] = sf->lookupScalar(k);
        }
        if (sol->found("diameters"))
        {
            s.psd.diameter = sol->lookupList("diameters");
            s.psd.massFrac = sol->lookupList("massFractions");
            if (sol->found("sizeEdges")) s.psd.edges = sol->lookupList("sizeEdges");
        }
    }
    s.mLiquid = massOf(s.liquid, thermo);
    s.mSolids = massOf(s.solid, thermo);
    if (s.mLiquid > 0.0 && s.vf > 0.0)
        throw std::runtime_error(owner + ": inlet '" + s.name + "' carries vapour "
            "(vf > 0).  A solid-liquid separator receives a liquid and its "
            "solids; flash the stream first.");
    return s;
}

} // namespace

scalar massOf(const sVector& n, const ThermoPackage& thermo)
{
    scalar m = 0.0;
    for (std::size_t i = 0; i < n.size() && i < thermo.n(); ++i)
        if (n[i] > 0.0) m += n[i] * thermo.comp(i).MW();
    return m;
}

SlurryState readSingleInlet(const DictPtr& dict, const ThermoPackage& thermo,
                            const std::string& owner)
{
    if (!dict->found("feed"))
        throw std::runtime_error(owner + ": no inlet -- declare `in <stream>;`.");
    return readOne(dict->subDict("feed"), dict, thermo, owner);
}

std::vector<SlurryState> readInputStreams(const DictPtr& dict,
                                          const ThermoPackage& thermo,
                                          const std::string& owner)
{
    std::vector<SlurryState> out;
    if (dict->found("inputStreams") && dict->hasDictList("inputStreams"))
    {
        for (const auto& d : dict->lookupDictList("inputStreams"))
            out.push_back(readOne(d, d, thermo, owner));
        return out;
    }
    out.push_back(readSingleInlet(dict, thermo, owner));
    return out;
}

scalar solidDensity(const sVector& s, const ThermoPackage& thermo,
                    const std::string& owner)
{
    const scalar m = massOf(s, thermo);
    if (!(m > 0.0)) return 0.0;
    scalar inv = 0.0;
    for (std::size_t i = 0; i < s.size(); ++i)
    {
        if (!(s[i] > 0.0)) continue;
        const scalar rp = thermo.comp(i).rho_p();
        if (!(rp > 0.0))
            throw std::runtime_error(owner + ": solid '" + thermo.comp(i).name()
                + "' has no particle density -- add `solid { rho_p <kg/m^3>; }` "
                  "to its component record.");
        inv += (s[i] * thermo.comp(i).MW() / m) / rp;
    }
    return 1.0 / inv;
}

scalar liquidDensity(const sVector& n, scalar T, scalar P, const ThermoPackage& thermo)
{
    scalar tot = 0.0;
    for (auto v : n) tot += std::max(0.0, v);
    sVector x(n.size(), 0.0);
    for (std::size_t i = 0; i < n.size(); ++i) x[i] = std::max(0.0, n[i]) / tot;
    return thermo.density(T, P, x, DensityPhase::Liquid);
}

scalar liquidViscosity(const sVector& n, scalar T, const ThermoPackage& thermo,
                       const std::string& owner)
{
    if (!thermo.hasLiquidViscosity())
        throw std::runtime_error(owner + ": the liquid's viscosity is needed "
            "(the filtration and settling laws are linear in it) and the case "
            "declares no liquid viscosity model.  Add `transport { liquid { "
            "viscosity { model Andrade; } } }` (or Vogel) to "
            "constant/thermoPhysPropDict, with the coefficients in each liquid "
            "component's record.");
    scalar tot = 0.0;
    for (auto v : n) tot += std::max(0.0, v);
    sVector x(n.size(), 0.0);
    for (std::size_t i = 0; i < n.size(); ++i) x[i] = std::max(0.0, n[i]) / tot;
    return thermo.viscosityLiquid(T, x);
}

ProcessStream makeSlurryStream(const std::string& name, scalar T, scalar P,
                               const sVector& liquid, const sVector& solid,
                               const ParticleSizeDistribution& psd)
{
    ProcessStream p;
    p.name = name;
    p.T = T; p.P = P; p.vf = 0.0;
    scalar F = 0.0;
    for (auto v : liquid) F += v;
    p.F = F;
    p.z.assign(liquid.size(), 0.0);
    if (F > 0.0) for (std::size_t i = 0; i < liquid.size(); ++i) p.z[i] = liquid[i] / F;
    p.s = solid;
    scalar ms = 0.0;
    for (auto v : solid) ms += v;
    if (ms > 0.0 && !psd.empty()) p.psd = psd;
    return p;
}

scalar componentClosure(const std::vector<const sVector*>& in,
                        const std::vector<const sVector*>& out)
{
    if (in.empty()) return 0.0;
    const std::size_t n = in.front()->size();
    scalar tot = 0.0, worst = 0.0;
    for (const auto* v : in) for (auto x : *v) tot += std::abs(x);
    if (!(tot > 0.0)) return 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar a = 0.0, b = 0.0;
        for (const auto* v : in)  a += (*v)[i];
        for (const auto* v : out) b += (*v)[i];
        worst = std::max(worst, std::abs(b - a));
    }
    return worst / tot;
}

} // namespace Choupo
