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

#include "PoreTransportBench.H"

#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "unitOperations/membrane/massTransfer/MassTransferModel.H"
#include "unitOperations/membrane/massTransfer/Polarisation.H"
#include "unitOperations/membrane/osmotic/OsmoticModel.H"
#include "unitOperations/membrane/transport/TransportModel.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <stdexcept>

namespace Choupo {

int PoreTransportBench::run(const DictPtr& dict,
                            const ThermoPackage& thermo,
                            int verbosity)
{
    using namespace membrane;
    diag_.clear();
    const std::string opName = dict->name().empty() ? type() : dict->name();
    const std::string site   = "poreTransport '" + opName + "'";

    const scalar T = dict->lookupScalar("T", Dims::temperature);

    // ---- the law: DSPM-DE only (the one law that honours an imposed J_v) --
    const std::string law = dict->lookupWordOrDefault("transport", "DSPM-DE");
    if (law != "DSPM-DE")
        throw std::runtime_error(site + ": `transport " + law + ";` -- this"
            " bench imposes J_v, and only the DSPM-DE law honours an imposed"
            " water flux (TransportContext::imposedJv).  Say `transport"
            " DSPM-DE;` or omit the key.");
    membrane::TransportModel::registerBuiltins();   // idempotent
    std::unique_ptr<membrane::TransportModel> model = membrane::TransportModel::New(law);
    if (dict->found("transportParameters"))
        model->readParameters(dict->subDict("transportParameters"));

    // ---- the membrane record ------------------------------------------------
    if (!dict->found("membrane"))
        throw std::runtime_error(site + ": declare `membrane <name>;`, a"
            " membrane record carrying a poreModel {} block");
    const std::string memName = dict->lookupWord("membrane");
    const Membrane& mem = MembraneRegistry::byName(memName);

    // ---- the feed: salt components and their molar concentrations ---------
    if (!dict->found("feedMolPerM3"))
        throw std::runtime_error(site + ": declare `feedMolPerM3 { <salt> <c>;"
            " ... }` -- the salt components of the package and their bulk"
            " concentrations in mol/m3");
    const auto feed = dict->subDict("feedMolPerM3");
    std::vector<std::size_t> soluteIdx;
    std::vector<scalar> c_b;                         // kmol/m3, the module's unit
    std::vector<std::string> saltNames;
    for (const auto& nm : feed->keys())
    {
        bool hit = false;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).name() == nm) { soluteIdx.push_back(i); hit = true; break; }
        if (!hit)
            throw std::runtime_error(site + ": feed salt '" + nm + "' is not a"
                " component of this case's thermoPhysPropDict");
        const scalar c = feed->lookupScalar(nm);
        if (!(c > 0.0))
            throw std::runtime_error(site + ": feed salt '" + nm + "' must have"
                " a positive concentration (mol/m3)");
        c_b.push_back(c * 1.0e-3);
        saltNames.push_back(nm);
    }
    const std::size_t Ns = soluteIdx.size();
    std::vector<scalar> B_s(Ns, 0.0);
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const auto& all = mem.allBs();
        const auto it = all.find(saltNames[s]);
        if (it != all.end()) B_s[s] = it->second;
    }

    // ---- the operating points ----------------------------------------------
    if (!dict->found("J_v"))
        throw std::runtime_error(site + ": declare `J_v ( ... );`, the imposed"
            " permeate fluxes in m/s");
    const auto Jvs = dict->lookupList("J_v");
    for (const scalar j : Jvs)
        if (!(j > 0.0))
            throw std::runtime_error(site + ": every J_v must be positive (m/s)");

    // ---- the wall: ONE home, the same builder the module uses -------------
    std::unique_ptr<MassTransferModel> corr;
    MassTransferContext hyd;
    scalar kConst = 0.0;
    if (dict->found("massTransfer"))
    {
        if (dict->found("k_film"))
            throw std::runtime_error(site + ": declare `k_film` OR"
                " `massTransfer {}`, not both");
        auto mt = dict->subDict("massTransfer");
        MassTransferModel::registerBuiltins();
        corr = MassTransferModel::New(mt->lookupWord("model"));
        corr->readParameters(mt);
        if (!mt->found("viscosity") || !mt->found("density"))
            throw std::runtime_error(site + ": massTransfer {} must declare"
                " `viscosity` (Pa.s) and `density` (kg/m3)");
        hyd.mu  = mt->lookupScalar("viscosity");
        hyd.rho = mt->lookupScalar("density");
        hyd.u   = mt->lookupScalarOrDefault("velocity", 0.0);
        hyd.d_h = mt->lookupScalarOrDefault("hydraulicDiameter", 0.0, Dims::length);
    }
    else if (dict->found("k_film"))
        kConst = dict->lookupScalar("k_film");
    else
        throw std::runtime_error(site + ": declare the film -- `k_film <m/s>;`"
            " or `massTransfer { model ...; }` (a vanishing film is a large"
            " k_film, e.g. NanoFiltran's 10 m/s when it simulates no"
            " polarisation)");
    //  The policy is read by the module's own reader.  The object is built
    //  from it directly rather than by buildPolarisation, because the
    //  feed here is declared as SALTS: that builder resolves each solute's
    //  charge through its aqueous bridge and REFUSES `ionCoupling
    //  electroneutral;` on salts (no single-species bridge, so no charged
    //  solute) -- right for solutionDiffusion, which polarises solutes, and
    //  a refusal the spiral-wound module still applies to a DSPM-DE salt
    //  feed (recorded in docs/design/a-stiff-pore-solved-at-once.md §9).
    //  DSPM-DE decomposes the salts itself and hands the kernel every ion's
    //  own z and D (DSPM_DE.cpp, wallIons / wallFromPermeate); it reads
    //  only the policy and the k supplier from this object.
    const PolarisationPolicy policy = readPolarisationPolicy(dict);
    std::vector<Polarisation::Solute> solutes(Ns);
    for (std::size_t s = 0; s < Ns; ++s) solutes[s].name = saltNames[s];
    const Polarisation polar(policy, solutes, corr.get(), kConst, T);
    (void)verbosity;

    OsmoticModel::registerBuiltins();
    std::unique_ptr<OsmoticModel> osm = OsmoticModel::New("vanHoff");

    std::cout << "\n========  Pore-transport bench (DSPM-DE at imposed J_v)  ========\n"
              << "  membrane " << mem.name() << ",  T = " << std::fixed
              << std::setprecision(2) << T << " K,  " << Jvs.size()
              << " point(s);  the same TransportModel the membrane units"
                 " march, J_v handed to it\n";

    // ---- the points --------------------------------------------------------
    scalar chargeMax = 0.0;
    for (std::size_t p = 0; p < Jvs.size(); ++p)
    {
        TransportContext ctx{ thermo, soluteIdx, B_s, mem.A_w(), polar, hyd,
                              2.0e5, 1.0e5, T, c_b, *osm, &mem, nullptr };
        ctx.imposedJv = Jvs[p];
        const TransportSolution sol = model->localFluxes(ctx);

        //  Sum the ion rows by species (an ion carried by two salts appears
        //  once per salt), keeping first-appearance order.
        std::vector<std::string> names;
        std::vector<int> zs;
        std::vector<scalar> cb, cw, cp;
        for (const auto& st : sol.ions)
        {
            const auto it = std::find(names.begin(), names.end(), st.name);
            if (it == names.end())
            {
                names.push_back(st.name); zs.push_back(st.z);
                cb.push_back(st.c_bulk); cw.push_back(st.c_wall); cp.push_back(st.c_perm);
            }
            else
            {
                const std::size_t k = std::size_t(it - names.begin());
                cb[k] += st.c_bulk; cw[k] += st.c_wall; cp[k] += st.c_perm;
            }
        }
        scalar q = 0.0, qa = 0.0;
        for (std::size_t k = 0; k < names.size(); ++k)
        { q += zs[k] * cp[k]; qa += std::abs(scalar(zs[k])) * cp[k]; }
        const scalar charge = qa > 0.0 ? std::abs(q) / qa : 0.0;
        chargeMax = std::max(chargeMax, charge);

        std::cout << "\n  J_v = " << std::scientific << std::setprecision(4)
                  << Jvs[p] << " m/s\n"
                  << "    ion        z     c_bulk        c_wall        c_perm"
                     "        R_real          R_obs\n";
        const std::string tag = "_p" + std::to_string(p + 1);
        for (std::size_t k = 0; k < names.size(); ++k)
        {
            const scalar Rr = 1.0 - cp[k] / cw[k];
            const scalar Ro = 1.0 - cp[k] / cb[k];
            char b[220];
            std::snprintf(b, sizeof(b),
                "    %-8s %+2d  %12.6e  %12.6e  %12.6e  %14.10f  %14.10f\n",
                names[k].c_str(), zs[k], static_cast<double>(cb[k]),
                static_cast<double>(cw[k]), static_cast<double>(cp[k]),
                static_cast<double>(Rr), static_cast<double>(Ro));
            std::cout << b;
            diag_["c_wall_" + names[k] + tag] = cw[k];
            diag_["c_perm_" + names[k] + tag] = cp[k];
            diag_["Rreal_"  + names[k] + tag] = Rr;
            diag_["Robs_"   + names[k] + tag] = Ro;
        }
        std::cout << "    permeate charge |sum z c| / sum |z| c = "
                  << std::scientific << std::setprecision(2) << charge << "\n";
    }
    diag_["n_points"] = static_cast<scalar>(Jvs.size());
    diag_["permeateCharge_max"] = chargeMax;
    std::cout << "\n  R_real = 1 - c_perm/c_wall, R_obs = 1 - c_perm/c_bulk."
                 "  Nothing was fitted.\n"
              << "=================================================================\n";
    return 0;
}

} // namespace Choupo
