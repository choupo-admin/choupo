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

#include "FixedBedAdsorber.H"

#include "core/Constants.H"
#include "io/SolutionWriter.H"
#include "solver/ODE/ODEIntegrator.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/adsorbent/Adsorbent.H"
#include "thermo/adsorbent/AdsorbentRegistry.H"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

// Resolve an adsorbent by name (same fallback as batchAdsorber: choupoBatch
// does not pre-load the adsorbent catalogue at start-up, so when byName --
// including its case-local constant/adsorbents/ overlay -- cannot answer,
// load the standards catalogue explicitly, ANNOUNCED, then retry).
const Adsorbent& resolveAdsorbent(const std::string& name, int verbosity)
{
    namespace fs = std::filesystem;
    try
    {
        return AdsorbentRegistry::byName(name);
    }
    catch (const std::exception&)
    {
        fs::path dataRoot;
        if (const char* env = std::getenv("CHOUPO_HOME"))
            dataRoot = fs::path(env) / "data";
        else
        {
            fs::path p = fs::current_path();
            for (int up = 0; up < 8; ++up)
            {
                if (fs::exists(p / "data" / "standards" / "assets"))
                {
                    dataRoot = p / "data";
                    break;
                }
                if (!p.has_parent_path() || p == p.parent_path()) break;
                p = p.parent_path();
            }
        }
        if (dataRoot.empty()) throw;
        if (verbosity >= 2)
            std::cout << "  [fixedBedAdsorber] adsorbent catalogue loaded from "
                      << (dataRoot / "standards" / "assets").string()
                      << "\n";
        AdsorbentRegistry::loadFrom(dataRoot.string());
        return AdsorbentRegistry::byName(name);
    }
}

} // anonymous namespace

void FixedBedAdsorber::initialise(const DictPtr&       unitDict,
                                  const ThermoPackage& thermo,
                                  const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();
    compNames_.clear();
    compNames_.reserve(n);
    for (std::size_t i = 0; i < n; ++i)
        compNames_.push_back(thermo.comp(i).name());

    verbosity_ = thermoAnnounceLevel();
    if (unitDict->found("solver"))
    {
        auto solverDict = unitDict->subDict("solver");
        verbosity_ = static_cast<int>(
            solverDict->lookupScalarOrDefault("verbosity", verbosity_));
        rtol_             = solverDict->lookupScalarOrDefault("rtol", rtol_);
        samplingInterval_ = solverDict->lookupScalarOrDefault(
                                "samplingInterval", samplingInterval_);
        if (samplingInterval_ <= 0.0)
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': solver.samplingInterval must be > 0 s (it is the"
                " declared breakthrough-sampler resolution)");
    }

    auto opDict = unitDict->subDict("operation");

    // -----------------------------------------------------------------
    //  Declared mesh -- no silent default, no silent minimum.
    // -----------------------------------------------------------------
    if (!opDict->found("nCells"))
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.nCells is MISSING -- the axial mesh is the"
            " student's declared discretisation choice (no silent default)."
            "  Declare e.g. `nCells 100;` and do a mesh study (25/50/100/200)"
            " to see the first-order upwind convergence.");
    const scalar nCellsRaw = opDict->lookupScalar("nCells");
    N_ = static_cast<std::size_t>(nCellsRaw + 0.5);
    if (nCellsRaw < 3.0 || std::abs(nCellsRaw - static_cast<scalar>(N_)) > 1e-9)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.nCells = " + std::to_string(nCellsRaw)
            + " -- must be an integer >= 3 (the Danckwerts inlet, interior"
            " and outlet stencils need three distinct cells).  Remedy:"
            " declare nCells 25 or more and refine.");

    // -----------------------------------------------------------------
    //  Declared geometry + operating constants (u, P, T constant is the
    //  A3 contract: Ergun / energy land in A4).
    // -----------------------------------------------------------------
    L_   = opDict->lookupScalar("L",    Dims::length);
    A_   = opDict->lookupScalar("area", Dims::area);
    eps_ = opDict->lookupScalar("eps");
    u_   = opDict->lookupScalar("u",    Dims::velocity);
    T_   = opDict->lookupScalar("T",    Dims::temperature);
    P_   = opDict->lookupScalar("P",    Dims::pressure);
    Dax_ = opDict->lookupScalar("Dax",  Dims::diffusivity);
    const std::string flowModel =
        opDict->lookupWordOrDefault("flowModel", "constantVelocity");
    if (flowModel != "constantVelocity" && flowModel != "ergun")
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.flowModel must be constantVelocity or ergun");
    ergun_ = (flowModel == "ergun");
    Pout_ = ergun_ ? opDict->lookupScalar("P_out", Dims::pressure) : P_;
    muGas_ = opDict->found("muGas")
           ? opDict->lookupScalar("muGas", Dims::viscosity) : 0.0;

    if (L_ <= 0.0 || A_ <= 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.L and operation.area must be > 0");
    if (eps_ <= 0.0 || eps_ >= 1.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.eps = " + std::to_string(eps_)
            + " -- the interparticle void fraction must lie in (0, 1)");
    if (u_ <= 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.u = " + std::to_string(u_)
            + " m/s -- the declared superficial velocity must be > 0"
            " (flow reversal is an A5 cycle step, not an A3 state)");
    if (T_ <= 0.0 || P_ <= 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.T and operation.P must be positive"
            " (declared absolute temperature and pressure)");
    if (Dax_ < 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.Dax = " + std::to_string(Dax_)
            + " m2/s -- a negative axial dispersion is anti-diffusion and"
              " is refused.  Declare Dax >= 0 (0 = pure advection).");
    if (ergun_ && Pout_ <= 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.P_out must be positive for flowModel ergun");
    if (muGas_ < 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': operation.muGas cannot be negative");

    dz_   = L_ / static_cast<scalar>(N_);
    cTot_ = P_ / (constant::R * T_);

    // -----------------------------------------------------------------
    //  Adsorbent: by NAME from the curated catalogue (case overlay first).
    // -----------------------------------------------------------------
    adsorbentName_ = opDict->lookupWord("adsorbent");
    ads_ = &resolveAdsorbent(adsorbentName_, verbosity_);
    rhoB_ = ads_->rho_bulk();
    if (rhoB_ <= 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': adsorbent '" + adsorbentName_ + "' carries no rho_bulk --"
            " the packed bulk density is the bed's solid inventory basis"
            " (contract section 1.3) and must be curated in the adsorbent"
            " identity file");
    dParticle_ = ads_->dParticle();
    sphericity_ = ads_->sphericity();
    if (ergun_ && dParticle_ <= 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': flowModel ergun requires a positive dParticle in adsorbent '"
            + adsorbentName_ + "' identity; curate it case-locally when it"
              " describes the packed sample");
    if (ergun_ && muGas_ == 0.0 && !thermo.hasTransport())
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': flowModel ergun needs gas viscosity. Add a transport"
              " viscosity model to propertyDict, or declare operation.muGas"
              " only for a controlled test anchor");

    // -----------------------------------------------------------------
    //  Feed + initial gas compositions.  Sum y != 1 is FATAL (spec gate):
    //  the constant-c_tot closure hangs on exact declared fractions.
    // -----------------------------------------------------------------
    auto readY = [&](const DictPtr& block, const std::string& what) -> sVector
    {
        if (!block->found("molarComposition"))
            throw std::runtime_error("fixedBedAdsorber '" + name_ + "': "
                + what + " has no molarComposition{} block");
        auto mc = block->subDict("molarComposition");
        sVector yv(n, 0.0);
        scalar sum = 0.0;
        for (const auto& key : mc->keys())
        {
            auto it = std::find(compNames_.begin(), compNames_.end(), key);
            if (it == compNames_.end())
                throw std::runtime_error("fixedBedAdsorber '" + name_ + "': "
                    + what + ".molarComposition lists '" + key + "' but it"
                    " is not a component of this case (constant/propertyDict"
                    " components)");
            const scalar v = mc->lookupScalar(key);
            if (v < 0.0)
                throw std::runtime_error("fixedBedAdsorber '" + name_ + "': "
                    + what + ".molarComposition." + key + " = "
                    + std::to_string(v) + " -- mole fractions must be >= 0");
            yv[static_cast<std::size_t>(it - compNames_.begin())] = v;
            sum += v;
        }
        if (std::abs(sum - 1.0) > 1.0e-6)
        {
            std::ostringstream os;
            os << "fixedBedAdsorber '" << name_ << "': " << what
               << ".molarComposition sums to " << std::setprecision(12) << sum
               << " != 1 -- FATAL (the c_total = P/(RT) closure needs exact"
                  " declared fractions; renormalising silently would move the"
                  " anchor)";
            throw std::runtime_error(os.str());
        }
        return yv;
    };

    const sVector yFeed = readY(opDict->subDict("feed"),    "operation.feed");
    const sVector yInit = readY(opDict->subDict("initial"), "operation.initial");

    // -----------------------------------------------------------------
    //  kLDF: EQUIPMENT/SAMPLE kinetics -- the A2 schema verbatim (basis
    //  solidFilm + MANDATORY scope/source).  A3 addition: an EXPLICIT
    //  `k <comp> 0;` is the transport-only diagnostic (gate G1) -- a
    //  declared zero is not a silent default; k < 0 is refused.
    // -----------------------------------------------------------------
    sVector kAll(n, 0.0);
    std::vector<bool> hasK(n, false);
    if (opDict->found("kLDF"))
    {
        auto kldf = opDict->subDict("kLDF");

        const std::string basis =
            kldf->lookupWordOrDefault("basis", "(missing)");
        if (basis != "solidFilm")
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': kLDF.basis '" + basis + "' is not accepted -- the"
                " accepted set is { solidFilm } (solid-film linear driving"
                " force, dq/dt = k*(q* - q)).  Declare `basis solidFilm;`");

        if (!kldf->found("scope") || !kldf->found("source"))
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': kLDF is equipment/sample data -- declare scope (what"
                " pellet/sample this k describes) and source (where the"
                " number came from)");

        auto kdict = kldf->subDict("k");
        for (const auto& sp : kdict->keys())
        {
            auto it = std::find(compNames_.begin(), compNames_.end(), sp);
            if (it == compNames_.end())
            {
                if (!ads_->has(sp))
                    throw std::runtime_error("fixedBedAdsorber '" + name_
                        + "': operation.kLDF.k lists '" + sp + "' but"
                        " adsorbent '" + adsorbentName_ + "' carries no"
                        " isotherm record for it"
                        " (data/standards/parameters/adsorption/equilibria/"
                        + adsorbentName_ + "/, or the case-local"
                        " constant/parameters/adsorption/equilibria/"
                        + adsorbentName_ + "/ overlay)");
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': operation.kLDF.k lists '" + sp + "' but it is not"
                    " a component of this case (constant/propertyDict"
                    " components)");
            }
            const std::size_t i =
                static_cast<std::size_t>(it - compNames_.begin());
            if (!ads_->has(sp))
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': operation.kLDF.k lists '" + sp + "' but adsorbent '"
                    + adsorbentName_ + "' carries no isotherm record for it"
                    " (data/standards/parameters/adsorption/equilibria/"
                    + adsorbentName_ + "/, or the case-local"
                    " constant/parameters/adsorption/equilibria/"
                    + adsorbentName_ + "/ overlay)");
            const scalar kv = kdict->lookupScalar(sp, Dims::inverseTime);
            if (kv < 0.0)
            {
                std::ostringstream os;
                os << "fixedBedAdsorber '" << name_ << "': operation.kLDF.k."
                   << sp << " = " << kv << " 1/s -- must be >= 0 (an EXPLICIT"
                      " 0 is the announced transport-only diagnostic;"
                      " negative is unphysical)";
                throw std::runtime_error(os.str());
            }
            kAll[i]  = kv;
            hasK[i]  = true;
        }
    }

    // -----------------------------------------------------------------
    //  Species classification (I = isotherm record, K = kLDF.k entry) --
    //  the A2 refusal table, plus the ONE-carrier rule of the constant
    //  c_total closure.
    // -----------------------------------------------------------------
    adsIdx_.clear();
    k_.clear();
    std::vector<std::size_t> inertsPresent;
    for (std::size_t i = 0; i < n; ++i)
    {
        const bool hasIso  = ads_->has(compNames_[i]);
        const bool present = (yFeed[i] > 0.0 || yInit[i] > 0.0);
        if (hasIso && hasK[i])
        {
            adsIdx_.push_back(i);
            k_.push_back(kAll[i]);
            if (verbosity_ >= 2)
            {
                std::cout << "  [fixedBedAdsorber '" << name_ << "'] "
                          << compNames_[i] << ": "
                          << ads_->isotherm(compNames_[i])->model()
                          << " isotherm on " << adsorbentName_
                          << ", k_LDF = " << kAll[i]
                          << " 1/s (basis solidFilm)";
                if (kAll[i] == 0.0)
                    std::cout << "  -> k = 0 DECLARED: transport-only"
                                 " diagnostic, the solid is frozen (q holds"
                                 " its initial loading; gate G1 mode)";
                std::cout << "\n";
            }
        }
        else if (hasIso && !hasK[i])
        {
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': component '" + compNames_[i] + "' has an isotherm"
                " record on '" + adsorbentName_ + "' but no LDF constant --"
                " declare operation.kLDF.k." + compNames_[i]
                + " (equipment data, no default; an explicit 0 selects the"
                " transport-only diagnostic)");
        }
        else
        {
            if (present) inertsPresent.push_back(i);
            if (verbosity_ >= 1 && present)
                std::cout << "  [fixedBedAdsorber '" << name_ << "'] "
                          << compNames_[i] << ": no isotherm record on "
                          << adsorbentName_ << " -> inert CARRIER candidate"
                          " (transported, never adsorbed)\n";
        }
    }

    if (!ergun_ && inertsPresent.size() != 1)
    {
        std::ostringstream os;
        os << "fixedBedAdsorber '" << name_ << "': the constant-(u, P, T)"
              " contract of A3 closes c_total = P/(RT) through exactly ONE"
              " inert carrier, but " << inertsPresent.size()
           << " non-adsorbing species are present in feed/initial";
        if (inertsPresent.empty())
            os << ".  A fully-adsorbing feed needs the A4 velocity update"
                  " (Ergun) -- declare an inert carrier for this phase.";
        else
        {
            os << " (";
            for (std::size_t i = 0; i < inertsPresent.size(); ++i)
                os << (i ? ", " : "") << compNames_[inertsPresent[i]];
            os << ").  Give the extra species an isotherm record + k, or"
                  " remove it from the feed.";
        }
        throw std::runtime_error(os.str());
    }
    if (!inertsPresent.empty()) carrierIdx_ = inertsPresent[0];
    cInCarrier_ = (!inertsPresent.empty())
                ? yFeed[carrierIdx_] * cTot_ : 0.0;

    const std::size_t nAds = adsIdx_.size();
    if (!ergun_ && nAds == 0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': no integrated species at all -- declare at least one"
            " component with an isotherm record + operation.kLDF.k entry"
            " (a bed of pure carrier has nothing to break through)");

    cIn_.assign(nAds, 0.0);
    c0_.assign(nAds, 0.0);
    q0_.assign(nAds, 0.0);
    for (std::size_t a = 0; a < nAds; ++a)
    {
        cIn_[a] = yFeed[adsIdx_[a]] * cTot_;
        c0_[a]  = yInit[adsIdx_[a]] * cTot_;
    }
    cInAll_.assign(n, 0.0);
    c0All_.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        cInAll_[i] = yFeed[i] * cTot_;
        c0All_[i]  = yInit[i] * cTot_;
    }

    // Initial loading: default 0 (regenerated bed), ANNOUNCED; override
    // via operation.initial.initialLoading{} [mol/kg] (the A2 schema).
    auto initBlock = opDict->subDict("initial");
    if (initBlock->found("initialLoading"))
    {
        auto ql = initBlock->subDict("initialLoading");
        for (const auto& sp : ql->keys())
        {
            auto it = std::find(compNames_.begin(), compNames_.end(), sp);
            if (it == compNames_.end())
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': initial.initialLoading lists '" + sp + "' but it"
                    " is not a component of this case");
            const std::size_t ci =
                static_cast<std::size_t>(it - compNames_.begin());
            auto ait = std::find(adsIdx_.begin(), adsIdx_.end(), ci);
            if (ait == adsIdx_.end())
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': initial.initialLoading lists '" + sp + "' but it"
                    " is not an integrated (isotherm + k) species -- an"
                    " inert cannot carry a loading");
            const scalar q0v = ql->lookupScalar(sp);
            if (q0v < 0.0)
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': initial.initialLoading." + sp + " must be >= 0");
            q0_[static_cast<std::size_t>(ait - adsIdx_.begin())] = q0v;
        }
    }
    else if (verbosity_ >= 2)
        std::cout << "  [fixedBedAdsorber '" << name_ << "'] initialLoading:"
                     " 0 (regenerated bed) -- declare"
                     " operation.initial.initialLoading{} to override\n";

    // -----------------------------------------------------------------
    //  Case time control (the unit owns its sub-stepping, profile grid
    //  and the open-boundary feed commitment -- all read HERE, announced;
    //  we run chdir'ed into the case, same convention as batchAdsorber).
    // -----------------------------------------------------------------
    {
        auto cd = Dictionary::fromFile("system/controlDict");
        startTime_     = cd->lookupScalarOrDefault("startTime", 0.0);
        endTime_       = cd->lookupScalar("endTime");
        deltaT_        = cd->lookupScalar("deltaT");
        writeInterval_ = cd->lookupScalarOrDefault("writeInterval", deltaT_);
        adaptive_      =
            (cd->lookupWordOrDefault("timeStepping", "fixed") == "adaptive");
    }

    // -----------------------------------------------------------------
    //  Packed state Y (spec section 2.1): c | q | M_in | M_out.
    // -----------------------------------------------------------------
    const std::size_t nFlow = ergun_ ? n : nAds;
    y_.assign(nFlow * N_ + nAds * N_ + 2 * nFlow, 0.0);
    hold0_.assign(nAds, 0.0);
    if (ergun_)
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < N_; ++j)
                y_[i * N_ + j] = c0All_[i];
    for (std::size_t a = 0; a < nAds; ++a)
    {
        for (std::size_t j = 0; j < N_; ++j)
        {
            if (!ergun_) y_[a * N_ + j] = c0_[a];
            y_[qOffset_() + a * N_ + j] = q0_[a];
        }
        hold0_[a] = eps_ * A_ * L_ * c0_[a] + rhoB_ * A_ * L_ * q0_[a];
    }
    shedMark_.assign(nFlow, 0.0);
    shedMarkCarrier_ = 0.0;

    // Reusable partial-pressure map (values rewritten per cell through
    // cached iterators -- Adsorbent::loading is the ONLY isotherm locus).
    pMap_.clear();
    pIt_.clear();
    for (std::size_t a = 0; a < nAds; ++a)
        pMap_[compNames_[adsIdx_[a]]] = 0.0;
    for (std::size_t a = 0; a < nAds; ++a)
        pIt_.push_back(pMap_.find(compNames_[adsIdx_[a]]));

    // Per-row absolute tolerances (spec section 2.5): 1e-9*c_in for c rows,
    // 1e-9*q_ref for q rows, 1e-6*A*u*c_in*t_span for the ledger rows.
    atol_.assign(y_.size(), 1.0e-12);
    const scalar tSpan = endTime_ - startTime_;
    for (std::size_t a = 0; a < nAds; ++a)
    {
        const scalar cRef = std::max(cIn_[a], 1.0e-3 * cTot_);
        const IsothermModel* iso = ads_->isotherm(compNames_[adsIdx_[a]]);
        const scalar qRef = iso->saturates()
            ? iso->q_sat()
            : std::max(iso->q(T_, cTot_ * constant::R * T_), 1.0e-6);
        for (std::size_t j = 0; j < N_; ++j)
        {
            if (!ergun_) atol_[a * N_ + j] = 1.0e-9 * cRef;
            atol_[qOffset_() + a * N_ + j] = 1.0e-9 * qRef;
        }
        const scalar ledScale =
            std::max(1.0e-6 * A_ * u_ * cRef * std::max(tSpan, 1.0), 1.0e-12);
        if (!ergun_)
        {
            atol_[inOffset_() + a]  = ledScale;
            atol_[outOffset_() + a] = ledScale;
        }
    }
    if (ergun_)
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar cRef = std::max(cInAll_[i], 1.0e-3 * cTot_);
            for (std::size_t j = 0; j < N_; ++j)
                atol_[i * N_ + j] = 1.0e-9 * cRef;
            const scalar ledScale = std::max(
                1.0e-6 * A_ * u_ * cRef * std::max(tSpan, 1.0), 1.0e-12);
            atol_[inOffset_() + i]  = ledScale;
            atol_[outOffset_() + i] = ledScale;
        }

    // -----------------------------------------------------------------
    //  Visible state: gas hold-up per component, declared T/P, bed volume.
    // -----------------------------------------------------------------
    state_.n.assign(n, 0.0);
    state_.T = T_;
    state_.P = P_;
    state_.V = A_ * L_;
    commit_(y_);

    // Breakthrough sampler seed + analytic anchors.
    tPrev_ = startTime_;
    tNow_  = startTime_;
    nextProfile_ = startTime_;
    fPrev_.assign(nAds, 0.0);
    integral_.assign(nAds, 0.0);
    tCross5_.assign(nAds, -1.0);
    tCross50_.assign(nAds, -1.0);
    tCross95_.assign(nAds, -1.0);
    tStoich_.assign(nAds, -1.0);
    for (std::size_t a = 0; a < nAds; ++a)
        if (cIn_[a] > 0.0)
        {
            fPrev_[a] = y_[(ergun_ ? adsIdx_[a] : a) * N_ + N_ - 1] / cIn_[a];
            tStoich_[a] = (L_ / u_)
                * (eps_ + rhoB_ * qStarFeed_(a) / cIn_[a]);
        }

    // -----------------------------------------------------------------
    //  The GLASS-BOX header: declared hypotheses, derived densities,
    //  dimensionless groups, the stiffness verdict and the Gershgorin
    //  bound term by term (spec sections 1.3 + 2.4).
    // -----------------------------------------------------------------
    if (verbosity_ >= 2)
    {
        std::cout << std::setprecision(10);
        if (ergun_)
            std::cout << "  [fixedBedAdsorber '" << name_
                      << "'] 1-D isothermal fixed bed (A4-flow): ALL species"
                         " concentrations are states; P_j=RT*sum(c_ij) is"
                         " derived and every interior/outlet face velocity"
                         " is the signed Ergun root. Feed superficial u = "
                      << u_ << " m/s at P_feed = " << P_
                      << " Pa; P_out = " << Pout_ << " Pa; dParticle = "
                      << dParticle_ << " m, sphericity = " << sphericity_
                      << ". No carrier-by-difference closure exists.\n";
        else
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] 1-D isothermal"
                         " fixed bed (A3 compatibility mode).  DECLARED constants: u = " << u_
                      << " m/s (superficial), P = " << P_ << " Pa, T = " << T_
                      << " K; ideal gas p_i = c_i R T; c_tot = P/(RT) = " << cTot_
                      << " mol/m3 (constant -> carrier '"
                      << compNames_[carrierIdx_] << "' closes by difference.\n";
        std::cout << "  [fixedBedAdsorber '" << name_ << "'] mesh: nCells = "
                  << N_ << " (declared), dz = " << dz_ << " m; L = " << L_
                  << " m, A = " << A_ << " m2, eps = " << eps_
                  << "; rho_bulk = " << rhoB_ << " kg/m3 (catalogue) ->"
                     " rho_p = rho_b/(1-eps) = " << rhoB_ / (1.0 - eps_)
                  << " kg/m3 (derived -- never asked for, contract 1.3)\n";
        if (Dax_ > 0.0)
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] Pe = u L /"
                         " Dax = " << u_ * L_ / Dax_ << "  (Dax = " << Dax_
                      << " m2/s, declared)\n";
        else
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] Dax = 0"
                         " (declared): pure advection, no dispersive flux\n";
        for (std::size_t a = 0; a < nAds; ++a)
        {
            if (cIn_[a] <= 0.0) continue;
            const std::string& nm = compNames_[adsIdx_[a]];
            const scalar qs  = qStarFeed_(a);
            const scalar Rf  = eps_ + rhoB_ * qs / cIn_[a];
            if (k_[a] > 0.0)
                std::cout << "  [fixedBedAdsorber '" << name_ << "'] " << nm
                          << ": q*(c_in) = " << qs << " mol/kg, R_f = eps +"
                             " rho_b q*/c_in = " << Rf << ", u_sh = u/R_f = "
                          << u_ / Rf << " m/s, t_st = (L/u) R_f = "
                          << (L_ / u_) * Rf << " s  <- expect the front"
                             " here (stoichiometric time, printed BEFORE"
                             " the run)\n";
            else
                std::cout << "  [fixedBedAdsorber '" << name_ << "'] " << nm
                          << ": transport-only (k = 0) -- tracer mean"
                             " residence time L/u_i = "
                          << L_ * eps_ / u_ << " s\n";
        }

        scalar adv = 0.0, disp = 0.0, ldf = 0.0;
        const scalar rho = gershgorin_(adv, disp, ldf);
        const scalar dtBound = 0.5 * 2.78 / rho;
        std::cout << "  [fixedBedAdsorber '" << name_ << "'] Gershgorin"
                     " bound on the RK4 step, term by term: advection"
                     " 2 u_i/dz = " << adv << " 1/s; dispersion 4 D_i/dz^2 = "
                  << disp << " 1/s; LDF k(1 + rho_b q*'(0)/eps) = " << ldf
                  << " 1/s  -> rho(J) <= " << rho << " 1/s, dt_RK4 <="
                     " safety*2.78/rho = " << dtBound
                  << " s (safety 0.5, declared)\n";
        if (ldf > 0.0)
        {
            scalar tScale = endTime_ - startTime_;
            for (std::size_t a = 0; a < nAds; ++a)
                if (tStoich_[a] > 0.0 && k_[a] > 0.0)
                    tScale = tStoich_[a];
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] stiffness:"
                         " |lambda_LDF| = " << ldf << " 1/s over a front"
                         " time of " << tScale << " s -> ratio "
                      << ldf * tScale
                      << (ldf * tScale > 1.0e3 ? "  (STIFF: Rosenbrock23"
                          " recommended -- timeStepping adaptive)"
                          : "  (mildly stiff)") << "\n";
        }
        if (adaptive_)
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] time"
                         " integration: Rosenbrock23 (L-stable), sub-stepped"
                         " by this unit in samplingInterval = "
                      << samplingInterval_ << " s chunks (declared"
                         " breakthrough-sampler resolution), rtol = " << rtol_
                      << ", atol per row (1e-9 c_in | 1e-9 q_ref | 1e-6"
                         " ledger scale).  The Gershgorin bound above is a"
                         " stiffness DIAGNOSTIC here, not a limit.\n";
        std::cout << "  [fixedBedAdsorber '" << name_ << "'] axial profiles:"
                     " <t>/" << name_ << ".profile every writeInterval = "
                  << writeInterval_ << " s (columns z, c_i, q_i)\n";
        std::cout << "  [fixedBedAdsorber '" << name_ << "'] open-boundary"
                     " campaign accounting: materialInventory = bed hold-up"
                     " (gas + solid) + remaining DECLARED feed commitment"
                     " A u c_in (endTime - t); the raffinate leaves as a"
                     " continuous external-outlet ledger record\n";
        if (!ergun_) std::cout << "  [fixedBedAdsorber '" << name_ << "'] KNOWN declared"
                     " error of the constant-(u, P, T) closure: the outlet"
                     " carrier flux is fabricated at exactly the net uptake"
                     " rate (the hidden roll-up).  The campaign material"
                     " balance WILL SHOW this fabrication as a real residual"
                     " on the carrier -- a named error must bite the"
                     " equation that owns it, never be discounted out"
                     " (forum #119).  Pinned as carrier_fabricated_mol and"
                     " physical_mass_closure_rel; the tight telescopic"
                     " model_closure_* columns test the DISCRETISATION,"
                     " not physical conservation.  A4's velocity update"
                     " (Ergun) removes the error physically.\n";
        std::cout << "  [fixedBedAdsorber '" << name_ << "'] energy: not"
                     " ledgered in this isothermal flow slice -- the campaign"
                     " energy balance will report UNAVAILABLE naming this"
                     " gap\n";
    }

    // Fixed-step RK4 must sit under the printed bound -- REFUSED otherwise
    // (no silent sub-stepping crutch).
    if (!adaptive_)
    {
        scalar adv = 0.0, disp = 0.0, ldf = 0.0;
        const scalar dtBound = 0.5 * 2.78 / gershgorin_(adv, disp, ldf);
        if (deltaT_ > dtBound)
        {
            std::ostringstream os;
            os << std::setprecision(10)
               << "fixedBedAdsorber '" << name_ << "': timeStepping fixed"
                  " (explicit RK4) with deltaT = " << deltaT_
               << " s EXCEEDS the Gershgorin stability bound " << dtBound
               << " s (advection " << adv << " + dispersion " << disp
               << " + LDF " << ldf << " 1/s, safety 0.5).  Remedy: reduce"
                  " deltaT below the bound, or select `timeStepping"
                  " adaptive;` (Rosenbrock23, L-stable).";
            throw std::runtime_error(os.str());
        }
    }
}

// -----------------------------------------------------------------------
//  Analytic helpers.
// -----------------------------------------------------------------------
std::size_t FixedBedAdsorber::qOffset_() const
{
    return (ergun_ ? compNames_.size() : adsIdx_.size()) * N_;
}

std::size_t FixedBedAdsorber::inOffset_() const
{
    return qOffset_() + adsIdx_.size() * N_;
}

std::size_t FixedBedAdsorber::outOffset_() const
{
    return inOffset_() + (ergun_ ? compNames_.size() : adsIdx_.size());
}

scalar FixedBedAdsorber::pressureCell_(const sVector& y, std::size_t j) const
{
    scalar c = 0.0;
    for (std::size_t i = 0; i < compNames_.size(); ++i)
        c += std::max(y[i * N_ + j], scalar(0.0));
    return constant::R * T_ * c;
}

scalar FixedBedAdsorber::ergunVelocity_(scalar pLeft, scalar pRight,
                                        scalar distance,
                                        const sVector& cLeft,
                                        const sVector& cRight) const
{
    const scalar dP = pLeft - pRight;
    if (dP == 0.0) return 0.0;

    sVector yMix(compNames_.size(), 0.0);
    scalar cSum = 0.0, rho = 0.0;
    for (std::size_t i = 0; i < compNames_.size(); ++i)
    {
        const scalar ci = 0.5 * (std::max(cLeft[i], scalar(0.0))
                               + std::max(cRight[i], scalar(0.0)));
        yMix[i] = ci;
        cSum += ci;
        rho += ci * thermo_->comp(i).MW() / 1000.0; // mol/m3 * kg/mol
    }
    if (cSum <= 0.0)
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': Ergun face has zero gas concentration");
    for (scalar& yi : yMix) yi /= cSum;
    const scalar mu = muGas_ > 0.0 ? muGas_ : thermo_->viscosityGas(T_, yMix);
    const scalar de = sphericity_ * dParticle_;
    const scalar a = 150.0 * std::pow(1.0 - eps_, 2) * mu
                   / (std::pow(eps_, 3) * de * de);
    const scalar b = 1.75 * (1.0 - eps_) * rho
                   / (std::pow(eps_, 3) * de);
    const scalar g = std::abs(dP) / distance;
    const scalar root = std::sqrt(a * a + 4.0 * b * g);
    // 2g/(a+root) is algebraically the positive quadratic root without
    // cancellation and tends smoothly to Darcy's g/a as g or b -> 0.
    const scalar speed = (b > 0.0) ? 2.0 * g / (a + root) : g / a;
    return std::copysign(speed, dP);
}

scalar FixedBedAdsorber::qStarFeed_(std::size_t a) const
{
    // Competitive equilibrium loading at the FEED gas (all integrated
    // species at their feed partial pressures).  pMap_ values are scratch.
    for (std::size_t b = 0; b < adsIdx_.size(); ++b)
        pIt_[b]->second = cIn_[b] * constant::R * T_;
    return ads_->loading(compNames_[adsIdx_[a]], pMap_, T_);
}

scalar FixedBedAdsorber::gershgorin_(scalar& adv, scalar& disp,
                                     scalar& ldf) const
{
    const scalar ui = u_ / eps_;
    const scalar Di = Dax_ / eps_;
    adv  = 2.0 * ui / dz_;
    disp = 4.0 * Di / (dz_ * dz_);
    ldf  = 0.0;
    for (std::size_t a = 0; a < adsIdx_.size(); ++a)
    {
        if (k_[a] <= 0.0) continue;
        const IsothermModel* iso = ads_->isotherm(compNames_[adsIdx_[a]]);
        const scalar qprime0 = iso->dq_dp(T_, 0.0) * constant::R * T_; // m3/kg
        ldf = std::max(ldf, k_[a] * (1.0 + rhoB_ * qprime0 / eps_));
    }
    return adv + disp + ldf;
}

scalar FixedBedAdsorber::carrierFabricated_() const
{
    if (ergun_)
    {
        const std::size_t i = carrierIdx_;
        scalar cs = 0.0;
        for (std::size_t j = 0; j < N_; ++j) cs += y_[i * N_ + j];
        const scalar hold = eps_ * A_ * dz_ * cs;
        const scalar holdInitial = eps_ * A_ * L_ * c0All_[i];
        return y_[inOffset_() + i] + holdInitial
             - hold - y_[outOffset_() + i];
    }
    // Net uptake [mol] = the carrier moles the constant-(u, P, T)
    // difference closure has created so far (exact identity: d(fab)/dt =
    // rho_b A dz Sum dq/dt -- see materialInventory()).
    const std::size_t nAds = adsIdx_.size();
    scalar fab = 0.0;
    for (std::size_t a = 0; a < nAds; ++a)
    {
        scalar qs = 0.0;
        for (std::size_t j = 0; j < N_; ++j)
            qs += y_[nAds * N_ + a * N_ + j];
        fab += rhoB_ * A_ * dz_ * qs - rhoB_ * A_ * L_ * q0_[a];
    }
    return fab;
}

scalar FixedBedAdsorber::carrierCell_(std::size_t j) const
{
    scalar c = cTot_;
    for (std::size_t a = 0; a < adsIdx_.size(); ++a)
        c -= y_[a * N_ + j];
    return c;
}

// -----------------------------------------------------------------------
//  The audited FV stencil (spec section 2.3, implemented LITERALLY):
//  Danckwerts inlet as the imposed face flux F_1/2 = u*c_in; interior
//  faces upwind + central dispersion; outlet face advective only; source
//  rho_b*k*(q* - q) with NO (1-eps); ledger rows integrated in the ODE.
// -----------------------------------------------------------------------
sVector FixedBedAdsorber::rhs_(const sVector& y)
{
    const std::size_t nAds = adsIdx_.size();
    sVector dy(y.size(), 0.0);

    if (ergun_)
    {
        const std::size_t n = compNames_.size();
        const std::size_t qOff = qOffset_();

        // LDF source, with partial pressures derived from every integrated
        // gas concentration. Carrier matter can no longer be fabricated by
        // a difference closure because it owns its own continuity equation.
        for (std::size_t j = 0; j < N_; ++j)
        {
            for (std::size_t i = 0; i < n; ++i)
                pMap_[compNames_[i]] = std::max(y[i * N_ + j], scalar(0.0))
                                     * constant::R * T_;
            for (std::size_t a = 0; a < nAds; ++a)
                if (k_[a] > 0.0)
                {
                    const scalar qs = ads_->loading(
                        compNames_[adsIdx_[a]], pMap_, T_);
                    dy[qOff + a * N_ + j] = k_[a]
                        * (qs - y[qOff + a * N_ + j]);
                }
        }

        std::vector<sVector> flux(n, sVector(N_ + 1, 0.0));
        for (std::size_t i = 0; i < n; ++i)
            flux[i][0] = u_ * cInAll_[i]; // imposed Danckwerts inlet flux

        sVector cL(n), cR(n);
        for (std::size_t f = 1; f < N_; ++f)
        {
            for (std::size_t i = 0; i < n; ++i)
            {
                cL[i] = y[i * N_ + f - 1];
                cR[i] = y[i * N_ + f];
            }
            const scalar uf = ergunVelocity_(pressureCell_(y, f - 1),
                                              pressureCell_(y, f), dz_, cL, cR);
            for (std::size_t i = 0; i < n; ++i)
            {
                const scalar cup = uf >= 0.0 ? cL[i] : cR[i];
                flux[i][f] = uf * cup - Dax_ * (cR[i] - cL[i]) / dz_;
            }
        }
        for (std::size_t i = 0; i < n; ++i)
            cL[i] = cR[i] = y[i * N_ + N_ - 1];
        const scalar uOut = ergunVelocity_(pressureCell_(y, N_ - 1), Pout_,
                                           0.5 * dz_, cL, cR);
        for (std::size_t i = 0; i < n; ++i)
            flux[i][N_] = uOut * (uOut >= 0.0 ? cL[i] : cInAll_[i]);

        for (std::size_t i = 0; i < n; ++i)
        {
            auto ait = std::find(adsIdx_.begin(), adsIdx_.end(), i);
            const bool adsorbing = (ait != adsIdx_.end());
            const std::size_t a = adsorbing
                ? static_cast<std::size_t>(ait - adsIdx_.begin()) : 0;
            for (std::size_t j = 0; j < N_; ++j)
            {
                const scalar source = adsorbing
                    ? rhoB_ * dy[qOff + a * N_ + j] : 0.0;
                dy[i * N_ + j] = ((flux[i][j] - flux[i][j + 1]) / dz_
                                  - source) / eps_;
            }
            dy[inOffset_() + i]  = A_ * flux[i][0];
            dy[outOffset_() + i] = A_ * flux[i][N_];
        }
        return dy;
    }

    // Pass 1: LDF source dq/dt per (species, cell) -- the competitive q*
    // comes from Adsorbent::loading, the ONE isotherm locus (never
    // reimplemented here).
    for (std::size_t j = 0; j < N_; ++j)
    {
        bool anyK = false;
        for (std::size_t a = 0; a < nAds; ++a)
        {
            pIt_[a]->second = y[a * N_ + j] * constant::R * T_;   // Pa
            if (k_[a] > 0.0) anyK = true;
        }
        if (!anyK) continue;   // transport-only: solid frozen, dq = 0
        for (std::size_t a = 0; a < nAds; ++a)
        {
            if (k_[a] <= 0.0) continue;
            const scalar qs =
                ads_->loading(compNames_[adsIdx_[a]], pMap_, T_);
            dy[nAds * N_ + a * N_ + j] =
                k_[a] * (qs - y[nAds * N_ + a * N_ + j]);
        }
    }

    // Pass 2: conservative flux divergence + source per species.
    for (std::size_t a = 0; a < nAds; ++a)
    {
        const scalar* c  = &y[a * N_];
        const scalar* dq = &dy[nAds * N_ + a * N_];
        scalar*       dc = &dy[a * N_];
        const scalar  ci = cIn_[a];

        // cell 1 (j = 0): F_1/2 = u*c_in imposed (Danckwerts, exact
        // conservative form -- no ghost cell)
        dc[0] = ((u_ * ci - u_ * c[0] + Dax_ * (c[1] - c[0]) / dz_) / dz_
                 - rhoB_ * dq[0]) / eps_;

        // interior cells j = 2 ... N-1
        for (std::size_t j = 1; j + 1 < N_; ++j)
            dc[j] = ((u_ * (c[j - 1] - c[j])
                      + Dax_ * (c[j + 1] - 2.0 * c[j] + c[j - 1]) / dz_) / dz_
                     - rhoB_ * dq[j]) / eps_;

        // cell N: outlet face F_{N+1/2} = u*c_N (dc/dz|L = 0 -- no
        // dispersive term through the outlet)
        dc[N_ - 1] = ((u_ * (c[N_ - 2] - c[N_ - 1])
                       - Dax_ * (c[N_ - 1] - c[N_ - 2]) / dz_) / dz_
                      - rhoB_ * dq[N_ - 1]) / eps_;

        // Ledger rows (mol; area included): dM_in = A u c_in,
        // dM_out = A F_{N+1/2} = A u c_N -- part of the SAME ODE, so the
        // closure is telescopic, never a posterior quadrature (gate G3).
        dy[2 * nAds * N_ + a]        = A_ * u_ * ci;
        dy[2 * nAds * N_ + nAds + a] = A_ * u_ * c[N_ - 1];
    }

    return dy;
}

// -----------------------------------------------------------------------
//  Commit + sampling.
// -----------------------------------------------------------------------
void FixedBedAdsorber::commit_(const sVector& y)
{
    y_ = y;
    const std::size_t nAds = adsIdx_.size();
    std::fill(state_.n.begin(), state_.n.end(), 0.0);
    if (ergun_)
    {
        scalar pAvg = 0.0;
        for (std::size_t i = 0; i < compNames_.size(); ++i)
        {
            scalar cs = 0.0;
            for (std::size_t j = 0; j < N_; ++j) cs += y_[i * N_ + j];
            state_.n[i] = eps_ * A_ * dz_ * cs / 1000.0;
        }
        for (std::size_t j = 0; j < N_; ++j) pAvg += pressureCell_(y_, j);
        state_.T = T_;
        state_.P = pAvg / static_cast<scalar>(N_);
        return;
    }
    scalar cSum = 0.0;   // Sum over cells and species of integrated c
    for (std::size_t a = 0; a < nAds; ++a)
    {
        scalar cs = 0.0;
        for (std::size_t j = 0; j < N_; ++j) cs += y_[a * N_ + j];
        cSum += cs;
        state_.n[adsIdx_[a]] = eps_ * A_ * dz_ * cs / 1000.0;   // kmol, gas
    }
    state_.n[carrierIdx_] =
        eps_ * A_ * (L_ * cTot_ - dz_ * cSum) / 1000.0;         // kmol
    state_.T = T_;
    state_.P = P_;
}

void FixedBedAdsorber::sample_(scalar t)
{
    const std::size_t nAds = adsIdx_.size();
    const scalar dt = t - tPrev_;
    if (dt <= 0.0) return;
    for (std::size_t a = 0; a < nAds; ++a)
    {
        if (cIn_[a] <= 0.0) continue;
        const scalar f = y_[(ergun_ ? adsIdx_[a] : a) * N_ + N_ - 1] / cIn_[a];
        integral_[a] += 0.5 * ((1.0 - fPrev_[a]) + (1.0 - f)) * dt;
        auto cross = [&](scalar level, scalar& tc)
        {
            if (tc >= 0.0 || f < level) return;
            tc = (f > fPrev_[a])
                ? tPrev_ + (level - fPrev_[a]) * dt / (f - fPrev_[a])
                : t;
        };
        cross(0.05, tCross5_[a]);
        const bool had50 = (tCross50_[a] >= 0.0);
        cross(0.50, tCross50_[a]);
        cross(0.95, tCross95_[a]);
        // The stoichiometric comparison, PRINTED the moment the front
        // arrives: the pre-run t_st claim meets the computed t_50.
        if (!had50 && tCross50_[a] >= 0.0 && tStoich_[a] > 0.0
            && k_[a] > 0.0 && verbosity_ >= 2)
        {
            const scalar dev =
                (tCross50_[a] - tStoich_[a]) / tStoich_[a];
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] "
                      << compNames_[adsIdx_[a]]
                      << ": front arrived -- t_50 = " << std::setprecision(10)
                      << tCross50_[a] << " s vs stoichiometric t_st = "
                      << tStoich_[a] << " s (deviation "
                      << std::setprecision(3) << dev * 100.0
                      << "%; LDF + dispersion set the width, stoichiometry"
                         " sets the centre)\n";
        }
        fPrev_[a] = f;
    }
    tPrev_ = t;
}

// -----------------------------------------------------------------------
//  Time integration, OWNED by the unit.
// -----------------------------------------------------------------------
void FixedBedAdsorber::rk4Step_(scalar dt)
{
    sVector& y = y_;
    const auto k1 = rhs_(y);
    sVector ytmp(y.size());
    for (std::size_t i = 0; i < y.size(); ++i)
        ytmp[i] = y[i] + 0.5 * dt * k1[i];
    const auto k2 = rhs_(ytmp);
    for (std::size_t i = 0; i < y.size(); ++i)
        ytmp[i] = y[i] + 0.5 * dt * k2[i];
    const auto k3 = rhs_(ytmp);
    for (std::size_t i = 0; i < y.size(); ++i)
        ytmp[i] = y[i] + dt * k3[i];
    const auto k4 = rhs_(ytmp);
    for (std::size_t i = 0; i < y.size(); ++i)
        y[i] += dt / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
}

void FixedBedAdsorber::step(scalar t, scalar dt)
{
    if (dt <= 0.0) return;

    if (!adaptive_)
    {
        // Fixed explicit RK4 at the case deltaT (validated against the
        // Gershgorin bound at start-up); sampling = every step.
        rk4Step_(dt);
        commit_(y_);
        sample_(t + dt);
        return;
    }

    // Adaptive: the stiff Rosenbrock23 sweeps [t, t+dt] in chunks of
    // samplingInterval so the breakthrough sampler sees every chunk end.
    if (!solver::ODEIntegrator::known("Rosenbrock23"))
        solver::ODEIntegrator::registerBuiltins();
    auto integ = solver::ODEIntegrator::New("Rosenbrock23");

    solver::DerivFn f =
        [this](scalar /*tt*/, const sVector& yy) { return rhs_(yy); };

    const std::size_t nAds = adsIdx_.size();
    std::size_t acc = 0, rej = 0;
    scalar tl = t;
    const scalar tEnd = t + dt;
    while (tl < tEnd - 1.0e-12 * std::max(std::abs(tEnd), 1.0))
    {
        const scalar sub = std::min(samplingInterval_, tEnd - tl);
        solver::ODEControls ctrl;
        ctrl.atol      = atol_;
        ctrl.rtol      = rtol_;
        ctrl.hInit     = (hCarry_ > 0.0) ? std::min(hCarry_, sub) : 0.0;
        ctrl.nPositive = (ergun_ ? compNames_.size() + nAds : 2 * nAds) * N_;
        ctrl.verbosity = 0;               // the unit prints its own summary
        const auto st = integ->integrate(y_, tl, tl + sub, f, ctrl);
        if (!st.ok)
        {
            std::ostringstream os;
            os << "fixedBedAdsorber '" << name_ << "': Rosenbrock23 gave up"
                  " at t = " << tl << " s (step below hMin or maxSteps) --"
                  " loosen rtol, refine the mesh, or reduce"
                  " samplingInterval";
            throw std::runtime_error(os.str());
        }
        hCarry_ = st.hLast;
        acc += st.accepted;
        rej += st.rejected;
        tl  += sub;
        commit_(y_);
        sample_(tl);
    }
    if (verbosity_ >= 3)
        std::cout << "  [fixedBedAdsorber '" << name_ << "'] t = "
                  << std::setprecision(6) << tEnd << " s: Rosenbrock23 "
                  << acc << " accepted, " << rej << " rejected sub-steps,"
                     " h_last = " << hCarry_ << " s\n";
}

// -----------------------------------------------------------------------
//  Profiles: <t>/<name>.profile, OpenFOAM-style physical-time directory.
// -----------------------------------------------------------------------
void FixedBedAdsorber::writeProfile_(scalar t) const
{
    namespace fs = std::filesystem;
    const std::string dir = SolutionWriter::formatTime(t);
    std::error_code ec;
    fs::create_directories(dir, ec);
    if (ec) return;   // profile IO must never kill the physics run

    std::ofstream f(dir + "/" + name_ + ".profile");
    if (!f) return;
    const std::size_t nAds = adsIdx_.size();
    f << "# fixedBedAdsorber '" << name_ << "' axial profile at t = " << t
      << " s  (z [m]; c [mol/m3]; q [mol/kg])\n";
    f << "z";
    if (ergun_) f << " P";
    if (ergun_)
        for (const auto& nm : compNames_) f << " c_" << nm;
    else
    {
        for (std::size_t a = 0; a < nAds; ++a)
            f << " c_" << compNames_[adsIdx_[a]];
        f << " c_" << compNames_[carrierIdx_];
    }
    for (std::size_t a = 0; a < nAds; ++a)
        f << " q_" << compNames_[adsIdx_[a]];
    f << "\n" << std::setprecision(10);
    for (std::size_t j = 0; j < N_; ++j)
    {
        f << (static_cast<scalar>(j) + 0.5) * dz_;
        if (ergun_) f << " " << pressureCell_(y_, j);
        if (ergun_)
            for (std::size_t i = 0; i < compNames_.size(); ++i)
                f << " " << y_[i * N_ + j];
        else
        {
            for (std::size_t a = 0; a < nAds; ++a)
                f << " " << y_[a * N_ + j];
            f << " " << carrierCell_(j);
        }
        for (std::size_t a = 0; a < nAds; ++a)
            f << " " << y_[qOffset_() + a * N_ + j];
        f << "\n";
    }
}

void FixedBedAdsorber::noteTimeAdvanced(scalar t)
{
    tNow_ = t;
    if (writeInterval_ <= 0.0) return;
    while (t >= nextProfile_ - 1.0e-9)
    {
        writeProfile_(t);
        nextProfile_ += writeInterval_;
    }
}

// -----------------------------------------------------------------------
//  Campaign accounting (open boundary -- see class header).
// -----------------------------------------------------------------------
sVector FixedBedAdsorber::materialInventory() const
{
    const std::size_t nAds = adsIdx_.size();
    sVector inv(state_.n.size(), 0.0);
    if (ergun_)
    {
        for (std::size_t i = 0; i < compNames_.size(); ++i)
        {
            scalar cs = 0.0, qs = 0.0;
            for (std::size_t j = 0; j < N_; ++j) cs += y_[i * N_ + j];
            auto ait = std::find(adsIdx_.begin(), adsIdx_.end(), i);
            if (ait != adsIdx_.end())
            {
                const std::size_t a = static_cast<std::size_t>(ait - adsIdx_.begin());
                for (std::size_t j = 0; j < N_; ++j)
                    qs += y_[qOffset_() + a * N_ + j];
            }
            const scalar holdup = eps_ * A_ * dz_ * cs + rhoB_ * A_ * dz_ * qs;
            const scalar feedRemaining = A_ * u_ * cInAll_[i]
                * (endTime_ - startTime_) - y_[inOffset_() + i];
            inv[i] = (holdup + feedRemaining) / 1000.0;
        }
        return inv;
    }
    for (std::size_t a = 0; a < nAds; ++a)
    {
        scalar cs = 0.0, qs = 0.0;
        for (std::size_t j = 0; j < N_; ++j)
        {
            cs += y_[a * N_ + j];
            qs += y_[nAds * N_ + a * N_ + j];
        }
        const scalar holdup = eps_ * A_ * dz_ * cs + rhoB_ * A_ * dz_ * qs;
        const scalar feedRemaining =
            A_ * u_ * cIn_[a] * (endTime_ - startTime_)
            - y_[2 * nAds * N_ + a];                        // total - M_in(t)
        inv[adsIdx_[a]] = (holdup + feedRemaining) / 1000.0;  // kmol
    }
    // Carrier: gas hold-up by difference + its remaining feed commitment.
    // The constant-(u, P, T) closure FABRICATES carrier at exactly the net
    // uptake rate (the hidden roll-up: the bed removes adsorbate but u and
    // c_tot are pinned, so the difference closure invents carrier at the
    // outlet).  That fabrication is NOT discounted here (forum #119): the
    // inventory reports REAL matter, so the campaign balance shows the
    // fabrication as a genuine residual on the carrier -- the named error
    // bites the equation that owns it.  Its size is pinned as the
    // carrier_fabricated_mol KPI and as physical_mass_closure_rel; A4's
    // velocity update (Ergun) removes it physically.
    {
        scalar cSum = 0.0;
        for (std::size_t a = 0; a < nAds; ++a)
            for (std::size_t j = 0; j < N_; ++j) cSum += y_[a * N_ + j];
        const scalar holdup = eps_ * A_ * (L_ * cTot_ - dz_ * cSum);
        const scalar feedRemaining =
            A_ * u_ * cInCarrier_ * (endTime_ - tNow_);
        inv[carrierIdx_] = (holdup + feedRemaining) / 1000.0;
    }
    return inv;
}

std::map<std::string, scalar> FixedBedAdsorber::declaredMaterialResidual() const
{
    if (ergun_) return {};
    // + = fabricated (appears in the outlet without having been fed), in
    // kmol of the carrier species -- the exact identity d(fab)/dt =
    // rho_b A dz Sum dq/dt of the declared constant-(u, P, T) closure.
    return { { compNames_[carrierIdx_], carrierFabricated_() / 1000.0 } };
}

BatchState FixedBedAdsorber::takeContinuousDischarge()
{
    const std::size_t nAds = adsIdx_.size();
    BatchState out;
    out.n.assign(state_.n.size(), 0.0);
    out.T = T_;
    out.P = P_;
    out.V = 0.0;

    if (ergun_)
    {
        out.P = Pout_;
        for (std::size_t i = 0; i < compNames_.size(); ++i)
        {
            const scalar mOut = y_[outOffset_() + i];
            out.n[i] = (mOut - shedMark_[i]) / 1000.0;
            shedMark_[i] = mOut;
        }
        return out;
    }

    scalar mOutSum = 0.0;
    for (std::size_t a = 0; a < nAds; ++a)
    {
        const scalar mOut = y_[2 * nAds * N_ + nAds + a];   // mol, cumulative
        out.n[adsIdx_[a]] = (mOut - shedMark_[a]) / 1000.0; // kmol since last
        shedMark_[a] = mOut;
        mOutSum += mOut;
    }
    // Carrier outlet by difference: total outlet flow is A*u*c_tot exactly
    // (the constant-c_tot closure), so its cumulative is algebraic.
    const scalar mOutCarrier =
        A_ * u_ * cTot_ * (tNow_ - startTime_) - mOutSum;
    out.n[carrierIdx_] = (mOutCarrier - shedMarkCarrier_) / 1000.0;
    shedMarkCarrier_ = mOutCarrier;
    return out;
}

scalar FixedBedAdsorber::vesselEnthalpy(bool& ok, std::string& why) const
{
    ok  = false;
    why = "open fixed-bed inventory (gas + adsorbed phase + declared feed"
          " commitment) not priceable on the elements datum until A4"
          " (dH_ads/Cp wiring)";
    return 0.0;
}

std::string FixedBedAdsorber::energyLedgerGap() const
{
    return "isothermal fixed bed: energy not ledgered (A4)";
}

void FixedBedAdsorber::chargeFrom(const BatchState& /*src*/)
{
    throw std::runtime_error("fixedBedAdsorber '" + name_ + "': recipe"
        " transfer INTO a fixed bed is refused -- the bed is a flow-through"
        " unit fed by its declared feed{}; cycle step transitions (feed"
        " switching, blowdown) arrive with A5");
}

BatchState FixedBedAdsorber::dischargeAll()
{
    throw std::runtime_error("fixedBedAdsorber '" + name_ + "': recipe"
        " transfer OUT of a fixed bed is refused -- the raffinate already"
        " leaves continuously (route it with dischargeTo); emptying a bed"
        " is an A5 cycle step");
}

BatchState FixedBedAdsorber::discharge(scalar /*fraction*/)
{
    return dischargeAll();   // same named refusal
}

// -----------------------------------------------------------------------
//  Trajectory extras, KPIs, status events.
// -----------------------------------------------------------------------
std::vector<std::pair<std::string, scalar>>
FixedBedAdsorber::trajectoryExtras() const
{
    const std::size_t nAds = adsIdx_.size();
    std::vector<std::pair<std::string, scalar>> ex;
    for (std::size_t a = 0; a < nAds; ++a)
    {
        const std::string& nm = compNames_[adsIdx_[a]];
        const scalar cOut = y_[(ergun_ ? adsIdx_[a] : a) * N_ + N_ - 1];
        ex.emplace_back("c_out_" + nm, cOut);
        ex.emplace_back("y_out_" + nm, cOut / cTot_);
    }
    if (!ergun_)
    {
        const scalar cOutCar = carrierCell_(N_ - 1);
        ex.emplace_back("c_out_" + compNames_[carrierIdx_], cOutCar);
        ex.emplace_back("y_out_" + compNames_[carrierIdx_], cOutCar / cTot_);
    }
    for (std::size_t a = 0; a < nAds; ++a)
    {
        scalar qs = 0.0;
        for (std::size_t j = 0; j < N_; ++j)
            qs += y_[qOffset_() + a * N_ + j];
        ex.emplace_back("qbar_" + compNames_[adsIdx_[a]],
                        qs / static_cast<scalar>(N_));
    }
    for (std::size_t a = 0; a < nAds; ++a)
    {
        // Ledger closure (spec 4d, generalised for a pre-loaded bed):
        // |M_in + hold0 - (holdup + M_out)| / (M_in + hold0).
        scalar cs = 0.0, qs = 0.0;
        for (std::size_t j = 0; j < N_; ++j)
        {
            cs += y_[(ergun_ ? adsIdx_[a] : a) * N_ + j];
            qs += y_[qOffset_() + a * N_ + j];
        }
        const scalar holdup = eps_ * A_ * dz_ * cs + rhoB_ * A_ * dz_ * qs;
        const std::size_t fi = ergun_ ? adsIdx_[a] : a;
        const scalar mIn    = y_[inOffset_() + fi];
        const scalar mOut   = y_[outOffset_() + fi];
        const scalar den    = std::max(mIn + hold0_[a], 1.0e-30);
        // MODEL-EQUATION closure (telescopic, forum #119): this tests the
        // DISCRETISATION identity of the solved equations, not physical
        // conservation -- the physical residual of the constant-(u, P, T)
        // assumption lives in physical_mass_closure_rel, where it BITES.
        ex.emplace_back("model_closure_" + compNames_[adsIdx_[a]],
                        std::abs(mIn + hold0_[a] - holdup - mOut) / den);
    }
    return ex;
}

std::map<std::string, scalar> FixedBedAdsorber::kpis() const
{
    const std::size_t nAds = adsIdx_.size();
    std::map<std::string, scalar> k;
    if (Dax_ > 0.0) k["Pe"] = u_ * L_ / Dax_;
    if (ergun_)
    {
        k["P_first_cell_Pa"] = pressureCell_(y_, 0);
        k["P_mid_cell_Pa"] = pressureCell_(y_, N_ / 2);
        k["P_last_cell_Pa"] = pressureCell_(y_, N_ - 1);
        k["P_out_boundary_Pa"] = Pout_;
        k["deltaP_first_to_out_Pa"] = pressureCell_(y_, 0) - Pout_;
    }
    // The carrier moles the declared constant-(u, P, T) closure fabricated
    // (= net uptake; announced in the header, NOT discounted anywhere --
    // forum #119: the campaign balance shows it as a real residual).  The
    // relative form is the HONEST physical closure of this phase: fabricated
    // matter over total matter fed -- visibly non-zero until A4's velocity
    // update removes the assumption.
    k["carrier_fabricated_mol"] = carrierFabricated_();
    {
        const scalar fedTot =
            A_ * u_ * cTot_ * std::max(tNow_ - startTime_, scalar(0.0));
        k["physical_mass_closure_rel"] =
            carrierFabricated_() / std::max(fedTot, scalar(1.0e-30));
    }
    for (std::size_t a = 0; a < nAds; ++a)
    {
        const std::string& nm = compNames_[adsIdx_[a]];
        if (cIn_[a] > 0.0)
        {
            if (k_[a] > 0.0 && tStoich_[a] > 0.0)
            {
                k["t_stoichiometric_" + nm] = tStoich_[a];
                k["retention_factor_" + nm] =
                    eps_ + rhoB_ * qStarFeed_(a) / cIn_[a];
            }
            if (tCross5_[a]  >= 0.0) k["t_breakthrough_5pct_" + nm]  = tCross5_[a];
            if (tCross50_[a] >= 0.0) k["t_50_" + nm]                 = tCross50_[a];
            if (tCross95_[a] >= 0.0) k["t_breakthrough_95pct_" + nm] = tCross95_[a];
            k["integral_anchor_" + nm]      = integral_[a];
            k["c_out_over_cin_final_" + nm] =
                y_[(ergun_ ? adsIdx_[a] : a) * N_ + N_ - 1] / cIn_[a];
        }
        // closure + qbar (same expressions as the trajectory columns)
        scalar cs = 0.0, qs = 0.0;
        for (std::size_t j = 0; j < N_; ++j)
        {
            cs += y_[(ergun_ ? adsIdx_[a] : a) * N_ + j];
            qs += y_[qOffset_() + a * N_ + j];
        }
        const scalar holdup = eps_ * A_ * dz_ * cs + rhoB_ * A_ * dz_ * qs;
        const std::size_t fi = ergun_ ? adsIdx_[a] : a;
        const scalar mIn    = y_[inOffset_() + fi];
        const scalar mOut   = y_[outOffset_() + fi];
        k["mass_closure_" + nm] =
            std::abs(mIn + hold0_[a] - holdup - mOut)
            / std::max(mIn + hold0_[a], 1.0e-30);
        k["qbar_" + nm + "_final"] = qs / static_cast<scalar>(N_);
    }
    return k;
}

std::vector<SimulationResult::TimelineEvent>
FixedBedAdsorber::statusEvents() const
{
    std::vector<SimulationResult::TimelineEvent> ev;
    const std::size_t nAds = adsIdx_.size();
    auto add = [&](scalar t, const std::string& nm, const char* lvl)
    {
        if (t < 0.0) return;
        std::ostringstream d;
        d << name_ << ": " << nm << " breakthrough " << lvl
          << " (c_out/c_in) at t = " << std::setprecision(8) << t << " s";
        ev.push_back({ t, "status", "breakthrough", d.str(), "", name_, "" });
    };
    for (std::size_t a = 0; a < nAds; ++a)
    {
        const std::string& nm = compNames_[adsIdx_[a]];
        add(tCross5_[a],  nm, "5%");
        add(tCross50_[a], nm, "50%");
        add(tCross95_[a], nm, "95%");
    }
    return ev;
}

} // namespace Choupo
