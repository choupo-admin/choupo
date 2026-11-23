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

#include "PurePhaseDiagram.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include "thermo/vaporPressure/VaporPressureModel.H"

#include "thermo/RecordResolver.H"
namespace Choupo {

int PurePhaseDiagram::run(const DictPtr& dict,
                          const ThermoPackage& globalThermo,
                          int verbosity)
{
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    if (thermo.n() != 1)
        throw std::runtime_error("purePhaseDiagram: needs EXACTLY 1 component; got "
                                 + std::to_string(thermo.n()));
    const Component& comp = thermo.comp(0);
    if (!comp.hasVaporPressure())
        throw std::runtime_error("purePhaseDiagram: '" + comp.name()
            + "' has no vapour-pressure model (need it for the saturation curve)");

    const scalar Tc   = comp.Tc();
    const scalar Pc   = comp.Pc() * 1.0e5;   // bar -> Pa
    const scalar Tb   = comp.Tb();
    if (Tc <= 0.0)
        throw std::runtime_error("purePhaseDiagram: '" + comp.name() + "' needs Tc");

    std::size_t n = 40;
    if (dict->found("grid"))
    {
        auto g = dict->subDict("grid");
        if (g->found("n")) n = std::max<std::size_t>(4, static_cast<std::size_t>(g->lookupScalar("n")));
    }
    const std::size_t m = std::max<std::size_t>(6, n / 2);

    // -- optional solid-phase data (else liquid-vapour + critical only) ----
    // PRECEDENCE: the component's curated `sublimation{}` reference-state block
    // wins (the intrinsic triple-point + fusion/sublimation enthalpies live WITH
    // the component); the op-dict `solid{}` block is the backward-compat
    // fallback (and the ONLY source of deltaVfus, the fusion-line slope -- a
    // sample/measurement input the component block deliberately omits).
    bool hasSolid = false;
    scalar Tt = 0, Pt = 0, Hfus = 0, Hsub = 0, dVfus = 0;

    if (comp.hasSublimation())
    {
        Tt   = comp.subTripleT();
        Pt   = comp.subTripleP();
        Hfus = comp.subHfus();
        Hsub = comp.subHsub();
    }
    if (dict->found("solid"))
    {
        // op-dict fills any gap the component left, and is the sole deltaVfus
        // source; it does NOT silently override a component-curated value.
        auto s = dict->subDict("solid");
        if (Tt   <= 0.0) Tt   = s->lookupScalarOrDefault("tripleT", 0.0);
        if (Pt   <= 0.0) Pt   = s->lookupScalarOrDefault("tripleP", 0.0);
        if (Hfus <= 0.0) Hfus = s->lookupScalarOrDefault("Hfus", 0.0);
        if (Hsub <= 0.0) Hsub = s->lookupScalarOrDefault("Hsub", 0.0);
        dVfus = s->lookupScalarOrDefault("deltaVfus", 0.0);
    }
    // The sublimation line needs the triple point + Hsub; the fusion line in
    // addition needs Hfus and deltaVfus.  Draw the sublimation curve + triple
    // marker whenever the solid-vapour anchor is present, even without dVfus.
    const bool hasSub    = (Tt > 0.0 && Pt > 0.0 && Hsub > 0.0);
    const bool hasFusion = (hasSub && Hfus > 0.0 && dVfus != 0.0);
    hasSolid = hasSub;

    auto outDict = dict->subDict("output");
    const std::string outFile = outDict->lookupWord("file");
    records::refuseStandardsWrite("purePhaseDiagram", "file", outFile);
    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("purePhaseDiagram: cannot open '" + outFile + "'");
    csv << "T,P,curve\n";
    csv << std::scientific << std::setprecision(8);
    PublishedTable tab;
    tab.name = "diagram";
    tab.description = "one row per point of the P-T diagram: T, P and the curve (family 0 saturation, 1 critical point, 2 sublimation, 3 triple point, 4 fusion)";
    tab.columns = { { "T_K", "K" }, { "P_bar", "bar" }, { "family", "-" } };
    comp_ = comp.name();

    constexpr scalar R = 8.314462618;       // J/(mol K)

    // -- saturation (liquid-vapour): triple (or low T) -> critical ---------
    const scalar Tlo = hasSolid ? Tt : 0.45 * Tc;
    for (std::size_t k = 0; k < n; ++k)
    {
        const scalar T = Tlo + (Tc - Tlo) * static_cast<scalar>(k) / static_cast<scalar>(n - 1);
        scalar P = 0.0;
        try { P = thermo.Psat(0, T); } catch (const std::exception&) { rethrowHardRefusal(); continue; }
        if (P > 0.0) { csv << T << "," << P << ",saturation\n"; tab.rows.push_back({ T, P / 1.0e5, 0.0 }); }
    }
    csv << Tc << "," << Pc << ",critical\n";
    tab.rows.push_back({ Tc, Pc / 1.0e5, 1.0 });

    std::size_t nSub = 0, nFus = 0;
    if (hasSolid)
    {
        // -- sublimation (solid-vapour): low T -> triple, Clausius-Clapeyron.
        //    Start ~0.78 Tt so P stays within ~3 decades of the triple point
        //    (going much lower swamps the log axis with a vanishing tail).
        const scalar Ts0 = 0.78 * Tt;
        for (std::size_t k = 0; k < m; ++k)
        {
            const scalar T = Ts0 + (Tt - Ts0) * static_cast<scalar>(k) / static_cast<scalar>(m - 1);
            const scalar P = Pt * std::exp(-(Hsub / R) * (1.0 / T - 1.0 / Tt));
            if (P > 0.0) { csv << T << "," << P << ",sublimation\n"; ++nSub; tab.rows.push_back({ T, P / 1.0e5, 2.0 }); }
        }
        csv << Tt << "," << Pt << ",triple\n";
        tab.rows.push_back({ Tt, Pt / 1.0e5, 3.0 });

        // -- fusion (solid-liquid): triple -> high P, Clapeyron melting line
        //    dP/dT = Hfus/(T dVfus)  ->  T(P) = Tt + (Tt dVfus/Hfus)(P - Pt)
        //    Drawn only when the fusion slope (Hfus + deltaVfus) is available;
        //    the component sublimation{} block alone yields the sublimation
        //    curve + triple marker (no deltaVfus there by design).
        if (hasFusion)
        {
            const scalar Phi = std::max(Pc, 1.0e8);   // up past the plot top
            for (std::size_t k = 0; k < m; ++k)
            {
                const scalar P = Pt + (Phi - Pt) * static_cast<scalar>(k) / static_cast<scalar>(m - 1);
                const scalar T = Tt + (Tt * dVfus / Hfus) * (P - Pt);
                csv << T << "," << P << ",fusion\n"; ++nFus;
                tab.rows.push_back({ T, P / 1.0e5, 4.0 });
            }
        }
    }
    csv.close();
    tables_.clear();
    tables_.push_back(std::move(tab));

    if (verbosity >= 2)
        std::cout << "\n=========================  PurePhaseDiagram  ===============\n"
                  << "  " << comp.name() << ": Tc=" << Tc << " K, Pc=" << (Pc / 1e5)
                  << " bar" << (Tb > 0 ? ", Tb=" + std::to_string(Tb) + " K" : "")
                  << (hasSolid ? "  + solid (triple " + std::to_string(Tt) + " K)" : "  (L-V only)")
                  << "\n  saturation " << n << ", sublimation " << nSub << ", fusion " << nFus << "\n"
                  << "============================================================\n";

    diag_["Tc"]       = Tc;
    diag_["Pc_bar"]   = Pc / 1.0e5;
    diag_["has_solid"] = hasSolid ? 1.0 : 0.0;
    return 0;
}

std::string PurePhaseDiagram::defaultViews(const std::string& op) const
{
    if (tables_.empty() || tables_[0].rows.empty()) return {};
    bool has[5] = { false, false, false, false, false };
    for (const auto& r : tables_[0].rows) has[static_cast<int>(r[2])] = true;
    auto one = [&](const char* name, const char* label, int fam, const char* style)
    {
        return std::string(" { name ") + name + "; label \"" + label + "\"; op " + op + "; table diagram; select { family "
             + std::to_string(fam) + "; } x T_K; y P_bar; style " + style + "; }";
    };
    std::string ser;
    if (has[0]) ser += one("saturation", "liquid-vapour (saturation)", 0, "lines");
    if (has[2]) ser += one("sublimation", "solid-vapour (sublimation)", 2, "lines");
    if (has[4]) ser += one("fusion", "solid-liquid (fusion)", 4, "lines");
    if (has[1]) ser += one("critical", "critical point", 1, "markers");
    if (has[3]) ser += one("triple", "triple point", 3, "markers");
    return "{ name phaseDiagram; type series; title \"" + op + ": P-T phase diagram of " + comp_ + "\";"
           " xAxis { label \"temperature, T\"; } yAxis { label \"pressure, P\"; scale log; } series (" + ser + " ); }\n";
}
} // namespace Choupo
