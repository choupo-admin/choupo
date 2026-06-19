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
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

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
    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("purePhaseDiagram: cannot open '" + outFile + "'");
    csv << "T,P,curve\n";
    csv << std::scientific << std::setprecision(8);

    constexpr scalar R = 8.314462618;       // J/(mol K)

    // -- saturation (liquid-vapour): triple (or low T) -> critical ---------
    const scalar Tlo = hasSolid ? Tt : 0.45 * Tc;
    for (std::size_t k = 0; k < n; ++k)
    {
        const scalar T = Tlo + (Tc - Tlo) * static_cast<scalar>(k) / static_cast<scalar>(n - 1);
        scalar P = 0.0;
        try { P = comp.vp().Psat_Pa(T); } catch (const std::exception&) { continue; }
        if (P > 0.0) csv << T << "," << P << ",saturation\n";
    }
    csv << Tc << "," << Pc << ",critical\n";

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
            if (P > 0.0) { csv << T << "," << P << ",sublimation\n"; ++nSub; }
        }
        csv << Tt << "," << Pt << ",triple\n";

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
            }
        }
    }
    csv.close();

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

} // namespace Choupo
