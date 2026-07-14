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

#include "IsothermModel.H"

#include "core/Advisory.H"
#include "core/Constants.H"

#include <cmath>
#include <iostream>
#include <limits>
#include <map>
#include <stdexcept>

namespace Choupo {

// ---------------------------------------------------------------------------
//  Common record fields + declared-basis validation
// ---------------------------------------------------------------------------

void IsothermModel::readCommon(const DictPtr& record,
                               const std::string& sourcePath)
{
    adsorbent_     = record->lookupWord("adsorbent");
    adsorbate_     = record->lookupWord("adsorbate");
    tRef_          = record->lookupScalar("tRef");                    // K
    loadingBasis_  = record->lookupWord("loadingBasis");
    pressureBasis_ = record->lookupWord("pressureBasis");
    quality_       = record->lookupWordOrDefault("quality", "unclassified");
    if (record->found("provenance"))
        origin_ = originFromWord(record->subDict("provenance")
            ->lookupWordOrDefault("origin", "unattributed"));

    if (quality_ != "unclassified" && quality_ != "teachingOnly"
     && quality_ != "designGrade")
        throw std::runtime_error("isotherm record " + sourcePath
            + ": unknown quality '" + quality_ + "'. Supported values are"
              " teachingOnly and designGrade (or omit while unclassified).");

    // Bases are DECLARED and the engine converts; an unimplemented basis is
    // refused loudly --- never a silent unit guess.
    if (loadingBasis_ != "molPerKgAdsorbent")
        throw std::runtime_error("isotherm record " + sourcePath
            + ": loadingBasis '" + loadingBasis_ + "' is not implemented.  "
            "Canonical loading is mol per kg of adsorbent --- declare "
            "`loadingBasis molPerKgAdsorbent;` (and convert the parameters, "
            "recording the conversion in provenance{}).");
    if (pressureBasis_ != "partialPressureBar"
     && pressureBasis_ != "partialPressurePa")
        throw std::runtime_error("isotherm record " + sourcePath
            + ": pressureBasis '" + pressureBasis_ + "' is not implemented.  "
            "Declare `pressureBasis partialPressureBar;` (affinity per bar) "
            "or `pressureBasis partialPressurePa;` (affinity per Pa).");
    if (tRef_ <= 0.0)
        throw std::runtime_error("isotherm record " + sourcePath
            + ": tRef must be a positive absolute temperature [K].");
}

void IsothermModel::announceUse() const
{
    if (quality_ != "teachingOnly") return;
    const std::string locus = "isotherm '" + adsorbent_ + "/" + adsorbate_ + "'";
    const std::string message = "TEACHING-ONLY adsorption parameters are in use;"
        " they preserve historical tutorial behaviour but are not design-grade."
        " Replace them with a reproducible sample-specific regression before design use."
        " Origin=" + std::string(originToWord(origin_)) + ".";
    if (AdvisoryLog::instance().add("provenance", "warning", locus, message))
        std::cout << "  [provenance] " << locus << ": " << message << "\n";
}

scalar IsothermModel::pScale() const
{
    return (pressureBasis_ == "partialPressureBar") ? constant::Pa_to_bar : 1.0;
}

scalar IsothermModel::pInBasis(scalar p_Pa) const
{
    return (pressureBasis_ == "partialPressureBar")
        ? p_Pa * constant::Pa_to_bar
        : p_Pa;
}

// ---------------------------------------------------------------------------
//  HenryIsotherm:  q = H(T) * p
// ---------------------------------------------------------------------------

void HenryIsotherm::read(const DictPtr& record, const std::string& sourcePath)
{
    readCommon(record, sourcePath);
    auto p = record->subDict("parameters");
    H_298_  = p->lookupScalar("H_298");                  // mol/kg per declared-p
    dH_ads_ = p->lookupScalar("dH_ads");                 // J/mol (<0)
    if (H_298_ <= 0.0)
        throw std::runtime_error("isotherm record " + sourcePath
            + ": henry H_298 must be > 0.");
}

scalar HenryIsotherm::henryCoefficient(scalar T) const
{
    return H_298_ * std::exp(-dH_ads_ / constant::R * (1.0 / T - 1.0 / tRef_));
}

scalar HenryIsotherm::q(scalar T, scalar p) const
{
    return henryCoefficient(T) * pInBasis(p);
}

scalar HenryIsotherm::dq_dp(scalar T, scalar) const
{
    return henryCoefficient(T) * pScale();
}

scalar HenryIsotherm::q_sat() const
{
    // A linear isotherm has NO saturation --- +infinity is the honest answer;
    // callers building competitive forms must branch on saturates().
    return std::numeric_limits<scalar>::infinity();
}

// ---------------------------------------------------------------------------
//  LangmuirIsotherm:  q = q_max * b(T)*p / (1 + b(T)*p)
// ---------------------------------------------------------------------------

void LangmuirIsotherm::read(const DictPtr& record, const std::string& sourcePath)
{
    readCommon(record, sourcePath);
    auto p = record->subDict("parameters");
    q_max_  = p->lookupScalar("q_max");                  // mol/kg
    b_298_  = p->lookupScalar("b_298");                  // 1 per declared-p @tRef
    dH_ads_ = p->lookupScalar("dH_ads");                 // J/mol (<0)
    if (q_max_ <= 0.0 || b_298_ <= 0.0)
        throw std::runtime_error("isotherm record " + sourcePath
            + ": langmuir q_max and b_298 must be > 0.");
}

scalar LangmuirIsotherm::affinity(scalar T) const
{
    // b(T) = b_298 * exp( -dH_ads/R * (1/T - 1/tRef) ); dH_ads<0 => b falls
    // as T rises (adsorption is exothermic), the physically-correct sign.
    return b_298_ * std::exp(-dH_ads_ / constant::R * (1.0 / T - 1.0 / tRef_));
}

scalar LangmuirIsotherm::q(scalar T, scalar p) const
{
    const scalar b  = affinity(T);
    const scalar pb = pInBasis(p);
    return q_max_ * b * pb / (1.0 + b * pb);
}

scalar LangmuirIsotherm::dq_dp(scalar T, scalar p) const
{
    const scalar b  = affinity(T);
    const scalar d  = 1.0 + b * pInBasis(p);
    return q_max_ * b / (d * d) * pScale();
}

// ---------------------------------------------------------------------------
//  Explicit factory
// ---------------------------------------------------------------------------

namespace {

std::map<std::string, IsothermModel::Factory>& factories()
{
    static std::map<std::string, IsothermModel::Factory> f;
    return f;
}

} // anonymous namespace

void IsothermModel::registerType(const std::string& name, Factory f)
{
    factories()[name] = std::move(f);
}

std::unique_ptr<IsothermModel> IsothermModel::New(const DictPtr& record,
                                                  const std::string& sourcePath)
{
    const std::string model = record->lookupWord("model");
    auto it = factories().find(model);
    if (it == factories().end())
    {
        std::string avail;
        for (const auto& kv : factories()) avail += " " + kv.first;
        throw std::runtime_error("IsothermModel::New: unknown model '" + model
            + "' in " + sourcePath + ".  Registered:"
            + (avail.empty() ? " (none)" : avail));
    }
    return it->second(record, sourcePath);
}

void IsothermModel::registerBuiltins()
{
    // Idempotent: AdsorbentRegistry calls this explicitly wherever it first
    // needs the factory (loadFrom at start-up, or the case-local overlay in
    // byName) --- never a static initialiser.
    static bool done = false;
    if (done) return;
    done = true;

    registerType("henry", [](const DictPtr& d, const std::string& src)
    {
        auto m = std::make_unique<HenryIsotherm>();
        m->read(d, src);
        return std::unique_ptr<IsothermModel>(std::move(m));
    });
    registerType("langmuir", [](const DictPtr& d, const std::string& src)
    {
        auto m = std::make_unique<LangmuirIsotherm>();
        m->read(d, src);
        return std::unique_ptr<IsothermModel>(std::move(m));
    });
}

} // namespace Choupo
