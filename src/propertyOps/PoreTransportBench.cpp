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

#include "core/Constants.H"
#include "core/Dimensions.H"
#include "thermo/RecordResolver.H"
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
#include <fstream>
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
    tables_.clear();
    ions_.clear();
    poreIons_.clear();
    nPoints_ = 0;
    profileWritten_ = false;
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
    const Membrane& recordMem = MembraneRegistry::byName(memName);
    //  `chargeDensity` on the OP replaces the record's X_d for this op only
    //  (C145): a membrane whose charge was FITTED as a function of the feed
    //  -- Bowen & Mohammad's CA30, X_d from the dye and chloride of each
    //  feed -- has no one X_d its record could carry.  Announced with both
    //  values; the record is never modified.
    std::unique_ptr<Membrane> withCharge;
    if (dict->found("chargeDensity"))
    {
        const scalar X = dict->lookupScalar("chargeDensity");
        if (!std::isfinite(X))
            throw std::runtime_error(site + ": `chargeDensity` must be a finite"
                " signed fixed charge in mol/m3");
        if (!recordMem.hasPoreModel())
            throw std::runtime_error(site + ": `chargeDensity` replaces the"
                " fixed charge of a poreModel {} -- membrane '" + memName
                + "' has none");
        withCharge = std::make_unique<Membrane>(recordMem.withChargeDensity(X));
        std::cout << "  [poreTransport] chargeDensity " << X << " mol/m3 DECLARED"
                     " on this op: it replaces the record's "
                  << (recordMem.hasChargeDensity()
                          ? std::to_string(recordMem.chargeDensity_molm3()) + " mol/m3"
                          : std::string("absent X_d"))
                  << " for this op only\n";
    }
    const Membrane& mem = withCharge ? *withCharge : recordMem;

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
    //  a refusal the spiral-wound module lifts for a law that decomposes
    //  salts itself since C148 (`decomposesSaltsIntoIons`; design §9.7).
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
    //  `points`, the second published table: one row per J_v point, the same
    //  numbers as the per-point diagnostics, so a plot of a rejection against
    //  J_v names columns instead of a list of keys (DEV.md 4c C147).
    PublishedTable pointsTab;
    pointsTab.name = "points";
    pointsTab.description = "one row per imposed J_v point: the feed, wall and permeate"
                            " of every ion, both rejections and the pore's numerics";
    scalar chargeMax = 0.0;
    std::vector<TransportSolution::PoreProfile> profiles;
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
        //  The imposed flux of THIS point, beside the concentrations it
        //  produced (DEV.md 4c C154: a reader's per-point table needs the J_v
        //  each row was solved at, and it is the op's to say, not the GUI's to
        //  re-read from the declaration).
        diag_["Jv" + tag] = Jvs[p];
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
            diag_["c_bulk_" + names[k] + tag] = cb[k];
            diag_["c_wall_" + names[k] + tag] = cw[k];
            diag_["c_perm_" + names[k] + tag] = cp[k];
            diag_["Rreal_"  + names[k] + tag] = Rr;
            diag_["Robs_"   + names[k] + tag] = Ro;
        }
        {
            //  The columns are fixed by the first point (every point solves the
            //  same feed, so the same ions); a point that disagrees refuses.
            std::vector<PublishedTable::Column> cols{ {"point", "-"}, {"Jv_mps", "m/s"} };
            std::vector<scalar> row{ static_cast<scalar>(p + 1), Jvs[p] };
            for (std::size_t k = 0; k < names.size(); ++k)
            {
                cols.push_back({ "c_bulk_" + names[k] + "_molm3", "mol/m3" });
                cols.push_back({ "c_wall_" + names[k] + "_molm3", "mol/m3" });
                cols.push_back({ "c_perm_" + names[k] + "_molm3", "mol/m3" });
                cols.push_back({ "Rreal_" + names[k], "-" });
                cols.push_back({ "Robs_" + names[k], "-" });
                row.push_back(cb[k]); row.push_back(cw[k]); row.push_back(cp[k]);
                row.push_back(1.0 - cp[k] / cw[k]); row.push_back(1.0 - cp[k] / cb[k]);
            }
            if (sol.hasPoreProfile)
            {
                cols.push_back({ "dPsi_m_V", "V" });
                cols.push_back({ "poreNewton", "-" });
                cols.push_back({ "poreNodes", "-" });
                row.push_back(sol.poreProfile.psiPerm * constant::R * T / constant::F);
                row.push_back(static_cast<scalar>(sol.pore.newtonTotal));
                row.push_back(static_cast<scalar>(sol.pore.nodes));
            }
            if (p == 0) { pointsTab.columns = cols; ions_ = names; }
            else
            {
                bool same = cols.size() == pointsTab.columns.size();
                for (std::size_t c = 0; same && c < cols.size(); ++c)
                    same = cols[c].name == pointsTab.columns[c].name;
                if (!same)
                    throw std::runtime_error(site + ": J_v point " + std::to_string(p + 1)
                        + " published different columns from point 1 -- the points table"
                          " would not be rectangular");
            }
            pointsTab.rows.push_back(std::move(row));
        }
        std::cout << "    permeate charge |sum z c| / sum |z| c = "
                  << std::scientific << std::setprecision(2) << charge << "\n";
        if (sol.hasPoreProfile)
        {
            //  THE POTENTIAL DIFFERENCE ACROSS THE MEMBRANE, as Geraldes &
            //  Alves (2008) define it (their Table 2's Delta Psi_m): the
            //  permeate's potential psi_p against the feed-side solution at
            //  the wall, psi_m = 0 (their Eq. 24's reference) -- Donnan jumps
            //  at both faces included.  psi is solved in RT/F units; volts
            //  with the CODATA R and F.
            const scalar VT  = constant::R * T / constant::F;
            const scalar dPsi = sol.poreProfile.psiPerm * VT;
            diag_["dPsi_m_V" + tag]         = dPsi;
            diag_["poreNewton" + tag]       = static_cast<scalar>(sol.pore.newtonTotal);
            diag_["poreContinuations" + tag] = static_cast<scalar>(sol.pore.continuations);
            diag_["poreNodes" + tag]        = static_cast<scalar>(sol.pore.nodes);
            std::cout << "    potential difference across the membrane psi_p - psi_m = "
                      << std::fixed << std::setprecision(6) << dPsi << " V;  pore "
                      << sol.pore.nodes << " nodes, " << sol.pore.newtonTotal
                      << " Newton iterations"
                      << (p == 0 ? " (from the seed)" : " (warm-started from the previous point)")
                      << (sol.pore.continuations > 0 ? ", by continuation" : "") << "\n";
            profiles.push_back(sol.poreProfile);
        }
    }
    tables_.push_back(std::move(pointsTab));

    // ---- the solved pores: ONE published table, the CSV written from it --
    //  `pore` holds the solved pore of every point: x across the equivalent
    //  thickness dx/A_k (the length the pore model sees; the record's
    //  porosityOverThickness), each ion species' concentration (summed over
    //  the salts that carry it) and the potential in volts on the same
    //  reference as dPsi_m_V.  It is published to the run whether or not the
    //  case asks for a file (DEV.md 4c C147, C149: a view names it);
    //  `profile <file>.csv;` writes the same rows to disk, a props case's
    //  CSV being a run output.
    if (!profiles.empty())
    {
        std::vector<std::string> species;
        for (const auto& pr : profiles)
            for (const auto& nm : pr.ionNames)
                if (std::find(species.begin(), species.end(), nm) == species.end())
                    species.push_back(nm);
        const scalar VT = constant::R * T / constant::F;
        const scalar dxe_um = 1.0e6 / mem.porosityOverThickness();
        PublishedTable tab;
        tab.name = "pore";
        tab.description = "the solved pore of every J_v point, node by node from"
                          " the feed face (xi = 0) to the permeate face (xi = 1)";
        tab.columns = { {"point", "-"}, {"Jv_mps", "m/s"}, {"node", "-"},
                        {"xi", "-"}, {"x_um", "um"} };
        for (const auto& nm : species) tab.columns.push_back({ "c_" + nm + "_molm3", "mol/m3" });
        tab.columns.push_back({ "psi_V", "V" });
        for (std::size_t p = 0; p < profiles.size(); ++p)
        {
            const auto& pr = profiles[p];
            for (std::size_t k = 0; k < pr.xi.size(); ++k)
            {
                std::vector<scalar> row{ static_cast<scalar>(p + 1), Jvs[p],
                                         static_cast<scalar>(k), pr.xi[k],
                                         pr.xi[k] * dxe_um };
                for (const auto& nm : species)
                {
                    scalar c = 0.0;
                    for (std::size_t m = 0; m < pr.ionNames.size(); ++m)
                        if (pr.ionNames[m] == nm) c += pr.c[k][m];
                    row.push_back(c);
                }
                row.push_back(pr.psi[k] * VT);
                tab.rows.push_back(std::move(row));
            }
        }
        poreIons_ = species;
        tables_.push_back(std::move(tab));
    }
    if (dict->found("profile"))
    {
        const std::string path = dict->lookupWord("profile");
        records::refuseStandardsWrite(site, "profile", path);
        if (tables_.back().name != "pore")
            throw std::runtime_error(site + ": `profile " + path + ";` -- the law"
                " published no solved pore (DSPM-DE's pore is solved at every"
                " point with a positive J_v)");
        const PublishedTable& tab = tables_.back();
        std::ofstream csv(path);
        if (!csv)
            throw std::runtime_error(site + ": cannot write '" + path + "'");
        for (std::size_t c = 0; c < tab.columns.size(); ++c)
            csv << (c ? "," : "") << tab.columns[c].name;
        csv << "\n";
        csv << std::setprecision(12);
        for (const auto& row : tab.rows)
        {
            for (std::size_t c = 0; c < row.size(); ++c)
                csv << (c ? "," : "") << row[c];
            csv << "\n";
        }
        profileWritten_ = true;
        std::cout << "\n  pore profiles written to " << path << " (" << profiles.size()
                  << " point(s); x over the equivalent thickness dx/A_k = "
                  << std::setprecision(4) << 1.0e6 / mem.porosityOverThickness() << " um)\n";
    }
    diag_["n_points"] = static_cast<scalar>(Jvs.size());
    nPoints_ = Jvs.size();
    diag_["permeateCharge_max"] = chargeMax;
    std::cout << "\n  R_real = 1 - c_perm/c_wall, R_obs = 1 - c_perm/c_bulk."
                 "  Nothing was fitted.\n"
              << "=================================================================\n";
    return 0;
}

std::string PoreTransportBench::diagnosticUnit(const std::string& key) const
{
    auto starts = [&](const char* p) { return key.rfind(p, 0) == 0; };
    if (starts("c_bulk_") || starts("c_wall_") || starts("c_perm_")) return "mol/m3";
    if (starts("dPsi_m_V")) return "V";
    if (starts("Jv_p")) return "m/s";
    if (starts("Rreal_") || starts("Robs_") || starts("poreNewton")
        || starts("poreContinuations") || starts("poreNodes")
        || key == "n_points" || key == "permeateCharge_max") return "-";
    return {};
}


std::string PoreTransportBench::defaultViews(const std::string& op) const
{
    std::string out;
    if (nPoints_ >= 2 && !ions_.empty())
    {
        std::string ys;
        for (const auto& i : ions_) ys += " Robs_" + i;
        out += "{ name rejection; type series; op " + op + "; table points; x Jv_mps; y (" + ys
             + " ); style linesMarkers; title \"" + op + ": observed rejection of every ion"
               " against the permeate flux\"; xAxis { label \"permeate flux J_v\"; scale log; }"
               " yAxis { label \"observed rejection R_obs = 1 - c_p/c_b\"; } }\n";
    }
    if (profileWritten_ && !poreIons_.empty())
    {
        std::string ys;
        for (const auto& i : poreIons_) ys += " c_" + i + "_molm3";
        const std::string pt = std::to_string(nPoints_);
        out += "{ name pore; type profile; op " + op + "; table pore; select { point " + pt
             + "; } x x_um; y (" + ys + " ); style lines; title \"" + op + ": the ions across"
               " the pore (J_v point " + pt + ")\"; xAxis { label \"position across the"
               " equivalent thickness, x\"; } yAxis { label \"concentration in the pore\";"
               " scale log; } }\n";
        out += "{ name potential; type profile; op " + op + "; table pore; select { point " + pt
             + "; } x x_um; y ( psi_V ); style lines; title \"" + op + ": the potential across"
               " the pore (J_v point " + pt + "; psi_m = 0 at the feed-side wall)\"; xAxis {"
               " label \"position across the equivalent thickness, x\"; } yAxis { label"
               " \"potential psi\"; } }\n";
    }
    return out;
}

} // namespace Choupo
