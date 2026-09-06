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
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "TransportBench.H"
#include "core/Dimensions.H"
#include "thermo/Component.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/ThermoPackage.H"
#include "thermo/transport/DiffusivityModel.H"
#include "thermo/transport/GasMixingRules.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/ThermalConductivityModel.H"
#include "thermo/transport/TransportModel.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

//  One verify row, printed the same way for every family.
struct Row
{
    std::string family;
    std::string model;
    std::string window;
    std::string source;
    CorrelationVerify v;
};

//  Registered names include lowercase aliases ("chung", "eucken"); the bench
//  reports each MODEL once, keyed on what the object calls itself.
template <class Base>
std::vector<std::unique_ptr<Base>> distinctModels()
{
    std::vector<std::unique_ptr<Base>> out;
    std::set<std::string> seen;
    for (const auto& key : Base::availableModels())
    {
        auto m = Base::New(Dictionary::fromString("model " + key + ";"));
        if (seen.insert(m->modelName()).second) out.push_back(std::move(m));
    }
    return out;
}

template <class Base>
void collect(const std::string& family, std::vector<Row>& rows)
{
    for (auto& m : distinctModels<Base>())
        rows.push_back({ family, m->modelName(), m->validityWindow(),
                         m->citation(), m->verify() });
}

std::string pct(scalar x)
{
    std::ostringstream s;
    s << std::fixed << std::setprecision(4) << (100.0 * x) << " %";
    return s.str();
}

} // namespace

int TransportBench::run(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    diag_.clear();
    //  1e-4 relative, not the friction bench's 3 %: every anchor here is
    //  either an exact identity or a literal written to six figures, so the
    //  only thing a looser tolerance could admit is a wrong coefficient.
    const scalar devTol = dict->lookupScalarOrDefault("deviationTolerance", 1.0e-4);

    TransportModel::registerBuiltins();              // idempotent
    ThermalConductivityModel::registerBuiltins();
    DiffusivityModel::registerBuiltins();
    LiquidViscosityModel::registerBuiltins();
    LiquidConductivityModel::registerBuiltins();

    std::ostringstream os;
    os << "\n========  Transport-correlation bench  ========\n"
       << "  Each correlation reproduces its OWN anchor.  The deviation is"
          " printed beside\n  the primary citation and the KIND of anchor,"
          " because this catalogue holds NO\n  measured transport data: a"
          " 0.0000 % on an ARITHMETIC anchor proves the\n  transcription and"
          " nothing else, and only a THEORY anchor proves a constant.\n\n";

    std::vector<Row> rows;
    collect<TransportModel>("gas viscosity", rows);
    collect<ThermalConductivityModel>("gas thermal conductivity", rows);
    collect<DiffusivityModel>("gas binary diffusivity", rows);
    collect<LiquidViscosityModel>("liquid viscosity", rows);
    collect<LiquidConductivityModel>("liquid thermal conductivity", rows);
    rows.push_back({ "gas mixing rule", "wilkePhi",
                     "any composition; phi_ij shared by Wilke (mu) and "
                     "Wassiljewa/Mason-Saxena (k)",
                     gasMixing::wilkeCitation() + "; " + gasMixing::wassiljewaCitation(),
                     gasMixing::verifyIdentity() });

    bool allPass = true;
    std::size_t nTheory = 0, nArith = 0;
    for (const auto& r : rows)
    {
        const bool pass = (r.v.dev <= devTol);
        allPass = allPass && pass;
        if (r.v.kind == "theory") ++nTheory; else ++nArith;
        diag_["dev_" + r.model] = r.v.dev;
        os << "  " << std::left << std::setw(13) << r.model
           << "  [" << r.family << "]\n"
           << "               value  = " << std::scientific << std::setprecision(6)
           << r.v.value_choupo << "   anchor = " << r.v.value_published
           << "   dev = " << pct(r.v.dev) << "  "
           << (pass ? "[PASS]" : "[FAIL]") << "   kind: " << r.v.kind << "\n"
           << "               window:   " << r.window << "\n"
           << "               source:   " << r.source << "\n"
           << "               anchor:   " << r.v.anchor << "\n\n";
    }
    os << "  deviation tolerance = " << pct(devTol) << "\n"
       << "  " << rows.size() << " correlation(s): " << nTheory
       << " anchored on THEORY (an identity kinetic theory or the author"
          " supplies),\n  " << nArith << " on ARITHMETIC (the correlation's"
          " own closed form).  Neither kind is a\n  comparison with a"
          " measurement; the catalogue carries none for transport.\n";
    diag_["n_theory_anchors"] = scalar(nTheory);
    diag_["n_arithmetic_anchors"] = scalar(nArith);

    // -----------------------------------------------------------------
    //  THE COMPARISON -- optional.  Every gas model, every component, one
    //  point; then the case's declared mixing rules.  Reported, never
    //  adjudicated.
    // -----------------------------------------------------------------
    if (dict->found("compare"))
    {
        auto cmp = dict->subDict("compare");
        const scalar T = cmp->lookupScalar("T", Dims::temperature);
        const scalar P = cmp->lookupScalar("P", Dims::pressure);
        if (T <= 0.0 || P <= 0.0)
            throw std::runtime_error("transportBench: compare.T and compare.P"
                " must be positive.");
        const std::size_t N = thermo.n();

        sVector y(N, 1.0 / scalar(N));
        std::string ySource = "equimolar (no y list declared -- announced,"
                              " not assumed silently)";
        if (cmp->found("y"))
        {
            auto yl = cmp->lookupList("y");
            if (yl.size() != N)
                throw std::runtime_error("transportBench: compare.y has "
                    + std::to_string(yl.size()) + " entries for "
                    + std::to_string(N) + " components.");
            scalar s = 0.0;
            for (std::size_t i = 0; i < N; ++i) { y[i] = yl[i]; s += yl[i]; }
            if (std::abs(s - 1.0) > 1.0e-6)
                throw std::runtime_error("transportBench: compare.y sums to "
                    + std::to_string(s) + ", not 1.");
            ySource = "declared in compare.y";
        }

        os << "\n  ---- the same question, every registered model, every"
              " component ----\n"
           << "  T = " << std::fixed << std::setprecision(2) << T
           << " K   P = " << std::scientific << std::setprecision(3) << P
           << " Pa   composition for the mixing rules: " << ySource << "\n";

        auto muModels = distinctModels<TransportModel>();
        auto kModels  = distinctModels<ThermalConductivityModel>();
        diag_["n_models_mu"] = scalar(muModels.size());
        diag_["n_models_k"]  = scalar(kModels.size());

        //  The conductivity models need a viscosity, and the bench feeds
        //  them the one the CASE declared -- never one it picked itself.
        const TransportModel* declaredMu = thermo.transportModel();
        if (!declaredMu)
            throw std::runtime_error("transportBench: the comparison needs the"
                " case's declared gas-viscosity model to feed the conductivity"
                " models and the mixing rules -- add transport { vapour {"
                " viscosity { model Chung; } } } to thermoPhysPropDict.");

        os << "\n  gas viscosity [Pa.s]\n";
        for (std::size_t i = 0; i < N; ++i)
        {
            const Component& c = thermo.comp(i);
            for (const auto& m : muModels)
            {
                const scalar mu = m->viscosityGasPure(c, T);
                diag_["mu_" + m->modelName() + "_" + c.name()] = mu;
                const std::string note = m->windowNote(c, T);
                os << "    " << std::left << std::setw(10) << c.name()
                   << std::setw(13) << m->modelName()
                   << std::scientific << std::setprecision(6) << mu
                   << (note.empty() ? "" : "   <-- OUTSIDE ITS WINDOW") << "\n";
                if (!note.empty()) os << "               " << note << "\n";
            }
        }

        os << "\n  gas thermal conductivity [W/(m.K)]  (mu from the case's"
              " declared " << declaredMu->modelName() << ")\n";
        for (std::size_t i = 0; i < N; ++i)
        {
            const Component& c = thermo.comp(i);
            if (!c.hasCpIdealGas())
            {
                os << "    " << std::left << std::setw(10) << c.name()
                   << "(no idealGasHeatCapacity on the record -- Eucken"
                      " needs Cp; nothing evaluated)\n";
                continue;
            }
            const scalar mu = declaredMu->viscosityGasPure(c, T);
            const scalar cp = c.cpIdealGas().Cp(T);
            for (const auto& m : kModels)
            {
                const scalar k = m->conductivityGasPure(c, T, mu, cp);
                diag_["k_" + m->modelName() + "_" + c.name()] = k;
                const std::string note = m->windowNote(c, T);
                os << "    " << std::left << std::setw(10) << c.name()
                   << std::setw(13) << m->modelName()
                   << std::scientific << std::setprecision(6) << k
                   << (note.empty() ? "" : "   <-- APPROXIMATION HERE") << "\n";
                if (!note.empty()) os << "               " << note << "\n";
            }
        }

        //  Mixture values through the package -- the SAME functions every
        //  unit operation calls, so what the bench prints is what a dryer
        //  or a pipe would be handed.
        const scalar muMix = thermo.viscosityGas(T, y);
        diag_["mu_mix_Wilke"] = muMix;
        os << "\n  mixture, Wilke (1950):                        mu_mix = "
           << std::scientific << std::setprecision(6) << muMix << " Pa.s\n";
        if (thermo.hasThermalConductivity())
        {
            const scalar kMix = thermo.thermalConductivityGas(T, y);
            diag_["k_mix_Wassiljewa"] = kMix;
            os << "  mixture, Wassiljewa / Mason-Saxena:           k_mix  = "
               << kMix << " W/(m.K)\n";
        }
        else
            os << "  mixture conductivity: no thermalConductivity model"
                  " declared in the case -- not evaluated\n";

        //  THE SPREAD ACROSS MODELS, per family, and what a spread of ONE
        //  means.  The spread is over MODELS at fixed component (worst
        //  component reported), so with one model per family it is exactly
        //  0 -- and that is not agreement.
        auto spreadOver = [&](const std::string& prefix,
                              const std::vector<std::string>& models) -> scalar
        {
            scalar worst = 0.0;
            for (std::size_t i = 0; i < N; ++i)
            {
                scalar lo = 0.0, hi = 0.0; bool f = true;
                for (const auto& mn : models)
                {
                    auto it = diag_.find(prefix + mn + "_" + thermo.comp(i).name());
                    if (it == diag_.end()) continue;
                    if (f) { lo = hi = it->second; f = false; }
                    lo = std::min(lo, it->second); hi = std::max(hi, it->second);
                }
                if (!f && lo > 0.0) worst = std::max(worst, (hi - lo) / lo);
            }
            return worst;
        };
        std::vector<std::string> muNames, kNames;
        for (const auto& m : muModels) muNames.push_back(m->modelName());
        for (const auto& m : kModels)  kNames.push_back(m->modelName());
        const scalar sMu = spreadOver("mu_", muNames);
        const scalar sK  = spreadOver("k_",  kNames);
        diag_["spread_mu_pct"] = 100.0 * sMu;
        diag_["spread_k_pct"]  = 100.0 * sK;
        os << "\n  spread across gas-viscosity models (worst component)    = "
           << std::fixed << std::setprecision(2) << (100.0 * sMu) << " %  ("
           << muModels.size() << " model(s) registered)\n"
           << "  spread across gas-conductivity models (worst component) = "
           << (100.0 * sK) << " %  (" << kModels.size() << " model(s) registered)\n";
        if (muModels.size() < 2 || kModels.size() < 2)
            os << "  A SPREAD OVER ONE MODEL IS NOT AGREEMENT -- it is the"
                  " absence of a second opinion.\n  Chapman-Enskog (Lennard-"
                  "Jones sigma and eps/k, which no record carries yet) is the\n"
                  "  named next member of both families; until it is curated"
                  " this column says 0 and\n  means nothing.\n";
        os << "  The bench does NOT say which model is right: that depends on"
              " the gas and the state,\n  and ranking them here would hide the"
              " choice the engineer has to make.\n";
    }
    os << "===============================================\n\n";

    if (verbosity >= 1) std::cout << os.str();
    diag_["allPass"] = allPass ? 1.0 : 0.0;
    if (!allPass)
        throw std::runtime_error("transportBench: a correlation deviates from"
            " its own anchor beyond the tolerance -- check the coefficient or"
            " the formula, and do not loosen the tolerance silently.");
    return 0;
}

} // namespace Choupo
