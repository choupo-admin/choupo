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
#include <map>
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
              " viscosity model to thermoPhysPropDict, or declare operation.muGas"
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
                    " is not a component of this case (constant/thermoPhysPropDict"
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
                    " a component of this case (constant/thermoPhysPropDict"
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
    //  A5-T1: the adiabatic one-temperature energy balance, DECLARED.
    //  Design record: docs/design/fixed-bed-thermal-a5.md.  Every scope
    //  decision refuses out loud; nothing thermal happens in silence.
    // -----------------------------------------------------------------
    if (opDict->found("energyBalance"))
    {
        const std::string eb = opDict->lookupWord("energyBalance");
        if (eb == "isothermal")
        {
            /* the explicit default -- identical to saying nothing */
        }
        else if (eb == "adiabatic" || eb == "wallCooled")
        {
            if (!ergun_)
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': energyBalance " + eb + " requires flowModel ergun"
                    " -- the constant-(u,P,T) closure pins c_tot = P/(RT)"
                    " BY DECLARATION, and a temperature field would"
                    " contradict the declared constant (A3 stays the"
                    " isothermal teaching model)");
            if (!adaptive_)
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': energyBalance " + eb + " requires timeStepping"
                    " adaptive -- the printed Gershgorin bound covers the"
                    " ISOTHERMAL rows only, and a fixed step validated by"
                    " it would run the energy rows unguarded");
            if (!opDict->found("solidHeatCapacity"))
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': energyBalance " + eb + " needs"
                    " operation.solidHeatCapacity { value; scope; source; }"
                    " -- the solid's cp is DECLARED case data (the kLDF"
                    " pattern; curating a primary-cited cp onto the"
                    " adsorbent's asset record is a separate curation act)");
            auto shc = opDict->subDict("solidHeatCapacity");
            cpS_ = shc->lookupScalar("value", Dims::heatCapacity);
            if (cpS_ <= 0.0)
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': solidHeatCapacity.value must be > 0 J/(kg K)");
            //  A declared teaching value must SAY it is one (the kLDF
            //  presence contract: scope + source travel with the number).
            if (!shc->found("scope") || !shc->found("source"))
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': solidHeatCapacity needs scope and source"
                    " entries -- a declared value states where it came"
                    " from (the kLDF pattern)");
            thermal_ = true;

            //  T2: wall heat exchange -- one-knob discipline (design
            //  section 6): wallCooled REQUIRES its block, adiabatic
            //  REFUSES it (a contradiction), h <= 0 is refused because
            //  `adiabatic` is the way to SAY zero.
            if (eb == "wallCooled")
            {
                if (!opDict->found("wallHeatTransfer"))
                    throw std::runtime_error("fixedBedAdsorber '" + name_
                        + "': energyBalance wallCooled needs"
                        " operation.wallHeatTransfer { h; T_wall; dBed; }"
                        " -- the wall's film coefficient, temperature and"
                        " the DECLARED bed diameter (never derived from"
                        " the cross-section by a silent circle"
                        " assumption)");
                auto wht = opDict->subDict("wallHeatTransfer");
                wallH_  = wht->lookupScalar("h", Dims::heatTransfer_h);
                wallTw_ = wht->lookupScalar("T_wall", Dims::temperature);
                const scalar dBed = wht->lookupScalar("dBed", Dims::length);
                if (wallH_ <= 0.0)
                    throw std::runtime_error("fixedBedAdsorber '" + name_
                        + "': wallHeatTransfer.h must be > 0 -- a zero"
                        " wall is spelled `energyBalance adiabatic;`");
                if (wallTw_ <= 0.0 || dBed <= 0.0)
                    throw std::runtime_error("fixedBedAdsorber '" + name_
                        + "': wallHeatTransfer needs positive T_wall and"
                        " dBed");
                wallAv_ = 4.0 / dBed;
                wallCooled_ = true;
            }
            else if (opDict->found("wallHeatTransfer"))
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': energyBalance adiabatic CONTRADICTS a"
                    " wallHeatTransfer block -- declare `energyBalance"
                    " wallCooled;` to use the wall, or remove the block");
        }
        else
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': energyBalance must be isothermal, adiabatic or"
                " wallCooled -- got '" + eb + "'");
    }
    if (!thermal_ && opDict->found("wallHeatTransfer"))
        throw std::runtime_error("fixedBedAdsorber '" + name_
            + "': wallHeatTransfer is read only by the THERMAL bed --"
            " declare `energyBalance wallCooled;` (flowModel ergun,"
            " docs/design/fixed-bed-thermal-a5.md) or remove the block");
    //  T1.5: the feed starts at the declared T; in thermal mode
    //  `setParameter feed.T` may later move it (the TSA hot purge).
    Tfeed_    = T_;
    cFeedTot_ = cTot_;
    if (thermal_)
        cpgFeed_ = thermo.Cp_ig(T_, yFeed);

    // -----------------------------------------------------------------
    //  Packed state Y (spec section 2.1): c | q | M_in | M_out
    //  (+ T_j per cell in thermal mode, appended after the ledger rows;
    //  + the Q_wall LEDGER STATE in wallCooled mode -- integrated in the
    //  same ODE, never a posterior quadrature).
    // -----------------------------------------------------------------
    const std::size_t nFlow = ergun_ ? n : nAds;
    y_.assign(nFlow * N_ + nAds * N_ + 2 * nFlow
              + (thermal_ ? N_ : 0) + (wallCooled_ ? 1 : 0), 0.0);
    if (thermal_)
        for (std::size_t j = 0; j < N_; ++j)
            y_[tOffset_() + j] = T_;
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

    // ---- A4 energy: the isosteric heat per integrated species, read ONCE
    //      from the same isotherm records the equilibrium runs on.  dH_ads
    //      is a MANDATORY field of every isotherm model (it is what the
    //      van't Hoff b(T) is built from), so there is no missing-datum
    //      branch here: a bed that loaded is a bed whose duty is priceable.
    dHAds_.assign(nAds, 0.0);
    nAds0_.assign(nAds, 0.0);
    for (std::size_t a = 0; a < nAds; ++a)
    {
        dHAds_[a] = ads_->isotherm(compNames_[adsIdx_[a]])->dHAds();
        nAds0_[a] = adsorbedKmol_(a);
    }

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
    if (thermal_)
        for (std::size_t j = 0; j < N_; ++j)
            atol_[tOffset_() + j] = 1.0e-7 * T_;   // K rows, spec-2.5 posture
    if (wallCooled_)
        //  Q_wall ledger row [J]: scale on the full-bed wall duty over the
        //  span at a nominal 10 K approach -- same 1e-6 posture as M_in.
        atol_[qwOffset_()] = std::max(
            1.0e-6 * wallH_ * wallAv_ * A_ * L_ * 10.0
                * std::max(tSpan, 1.0), 1.0e-9);

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
    feedSwitched_.assign(nAds, false);
    pendingAmendments_.clear();
    for (std::size_t a = 0; a < nAds; ++a)
        if (cIn_[a] > 0.0)
        {
            fPrev_[a] = y_[(ergun_ ? adsIdx_[a] : a) * N_ + N_ - 1] / cIn_[a];
            tStoich_[a] = (L_ / u_)
                * (eps_ + rhoB_ * qStarFeed_(a) / cIn_[a]);
        }

    //  A5-T1 frozen pre-run claims (computed UNCONDITIONALLY -- the KPIs
    //  report them at any verbosity, and a T1.5 feed switch must never
    //  silently rewrite them).
    if (thermal_)
    {
        uThAnn_ = u_ * cTot_ * cpgFeed_
            / (eps_ * cTot_ * cpgFeed_ + rhoB_ * cpS_);
        dTadAnn_.assign(nAds, -1.0);
        for (std::size_t a = 0; a < nAds; ++a)
        {
            if (cIn_[a] <= 0.0 || k_[a] <= 0.0) continue;
            dTadAnn_[a] = qStarFeed_(a) * (-dHAds_[a])
                / (cpS_ + eps_ * cTot_ * cpgFeed_ / rhoB_);
        }
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
        if (thermal_)
        {
            //  A5-T1 anchors, printed BEFORE the run (design section 4;
            //  computed unconditionally just above -- frozen claims a
            //  later T1.5 feed switch must never silently rewrite).
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] A5-"
                      << (wallCooled_ ? "T2 WALL-COOLED" : "T1 ADIABATIC")
                      << " energy balance: one T per cell,"
                         " cp_s = " << cpS_ << " J/(kg K) (DECLARED case"
                         " data), feed-gas Cp_ig(T_feed) = " << cpgFeed_
                      << " J/(mol K); adsorbed-phase heat capacity"
                         " neglected (declared).  Pure thermal-wave"
                         " velocity u_th = " << uThAnn_ << " m/s; the bed"
                         " needs L/u_th = " << L_ / uThAnn_ << " s for the"
                         " heat to LEAVE.\n";
            if (wallCooled_)
                std::cout << "  [fixedBedAdsorber '" << name_ << "'] T2"
                             " wall: h = " << wallH_ << " W/(m2 K),"
                             " T_wall = " << wallTw_ << " K, a_w = 4/dBed"
                             " = " << wallAv_ << " 1/m (dBed DECLARED);"
                             " wall NTU = h a_w L/(u c_feed cpg) = "
                          << wallH_ * wallAv_ * L_
                             / (u_ * cFeedTot_ * cpgFeed_)
                          << ".  Removed heat accumulates in the Q_wall"
                             " STATE row of the same ODE (never a"
                             " posterior quadrature); h -> 0 recovers the"
                             " adiabatic bed, large h approaches the"
                             " isothermal one -- the model CONTAINS its"
                             " limits.\n";
            for (std::size_t a = 0; a < nAds; ++a)
            {
                if (dTadAnn_[a] < 0.0) continue;
                const scalar uSh = u_
                    / (eps_ + rhoB_ * qStarFeed_(a) / cIn_[a]);
                std::cout << "  [fixedBedAdsorber '" << name_ << "'] "
                          << compNames_[adsIdx_[a]] << ": adiabatic LIMIT"
                             " DT_ad = q*(-dH_ads)/(cp_s +"
                             " eps c_tot cpg/rho_b) = " << dTadAnn_[a]
                          << " K -- the all-heat-retained BOUND; "
                          << (uThAnn_ < uSh
                              ? "u_th < u_sh: the heat LAGS the isothermal"
                                " front, the coupled plateau sits BELOW"
                                " this bound and the warm bed breaks"
                                " through EARLIER"
                              : "u_th >= u_sh: the heat leads the front")
                          << " (u_sh,isothermal = " << uSh << " m/s)\n";
            }
        }
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
        if (ergun_)
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] energy (A4):"
                         " adsorption duty LEDGERED -- Q = Sum dH_ads*dn_ads"
                         " (exact state difference, isosteric heats from the"
                         " isotherm records), inventory priced gas +"
                         " (gas + dH_ads) adsorbed at the held T\n";
        else
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] energy: the"
                         " adsorption duty is ledgered, but the campaign"
                         " energy claim stays UNAVAILABLE under the"
                         " constant-(u, P, T) closure -- the fabricated"
                         " carrier's enthalpy is a real error of the flow"
                         " model (declare `flowModel ergun` to close it)\n";
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

std::size_t FixedBedAdsorber::tOffset_() const
{
    return outOffset_() + (ergun_ ? compNames_.size() : adsIdx_.size());
}

std::size_t FixedBedAdsorber::qwOffset_() const
{
    return tOffset_() + N_;   // after the T rows (wallCooled only)
}

scalar FixedBedAdsorber::cellT_(const sVector& y, std::size_t j) const
{
    //  Isothermal: the declared constant.  Thermal (A5-T1): the cell's own
    //  state row, floored at 1 K so a transient undershoot can never feed
    //  the ideal-gas law a non-physical temperature.
    return thermal_ ? std::max(y[tOffset_() + j], scalar(1.0)) : T_;
}

scalar FixedBedAdsorber::cpgCell_(const sVector& y, std::size_t j) const
{
    //  Mixture ideal-gas Cp [J/(mol K)] of the cell's gas, from the
    //  components' OWN declared idealGasHeatCapacity models -- no new
    //  datum enters with the energy balance.
    sVector yMix(compNames_.size(), 0.0);
    scalar cSum = 0.0;
    for (std::size_t i = 0; i < compNames_.size(); ++i)
    {
        yMix[i] = std::max(y[i * N_ + j], scalar(0.0));
        cSum += yMix[i];
    }
    if (cSum <= 0.0) return cpgFeed_;
    for (scalar& v : yMix) v /= cSum;
    return thermo_->Cp_ig(cellT_(y, j), yMix);
}

scalar FixedBedAdsorber::pressureCell_(const sVector& y, std::size_t j) const
{
    scalar c = 0.0;
    for (std::size_t i = 0; i < compNames_.size(); ++i)
        c += std::max(y[i * N_ + j], scalar(0.0));
    return constant::R * cellT_(y, j) * c;
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
        // A5-T1: p_i and the isotherm are evaluated at the CELL's own T --
        // the van't Hoff machinery the records already carry, now fed the
        // local temperature instead of the declared constant.
        for (std::size_t j = 0; j < N_; ++j)
        {
            const scalar Tj = cellT_(y, j);
            for (std::size_t i = 0; i < n; ++i)
                pMap_[compNames_[i]] = std::max(y[i * N_ + j], scalar(0.0))
                                     * constant::R * Tj;
            for (std::size_t a = 0; a < nAds; ++a)
                if (k_[a] > 0.0)
                {
                    const scalar qs = ads_->loading(
                        compNames_[adsIdx_[a]], pMap_, Tj);
                    dy[qOff + a * N_ + j] = k_[a]
                        * (qs - y[qOff + a * N_ + j]);
                }
        }

        std::vector<sVector> flux(n, sVector(N_ + 1, 0.0));
        sVector uface(N_ + 1, 0.0);
        for (std::size_t i = 0; i < n; ++i)
            flux[i][0] = u_ * cInAll_[i]; // imposed Danckwerts inlet flux
        uface[0] = u_;

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
            uface[f] = uf;
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
        uface[N_] = uOut;
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

        // -------------------------------------------------------------
        //  A5-T1 energy rows: adiabatic one-temperature balance per cell,
        //
        //    [eps c_tot cpg + rho_b cp_s] dT/dt =
        //        upwind advected enthalpy  +  rho_b Sum(-dH_i) dq_i/dt
        //
        //  Temperature (non-conservative) form with upwind faces -- the
        //  advecting velocities are THE SAME Ergun face velocities the
        //  species fluxes just used, so heat and matter travel together.
        //  Feed enters at the declared T_ with the feed's own Cp.
        // -------------------------------------------------------------
        if (thermal_)
        {
            const std::size_t tOff = tOffset_();
            for (std::size_t j = 0; j < N_; ++j)
            {
                const scalar Tj  = cellT_(y, j);
                scalar ctotJ = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                    ctotJ += std::max(y[i * N_ + j], scalar(0.0));
                const scalar cpgJ  = cpgCell_(y, j);
                //  GENERAL (P-swing-ready) form, derived in the design note
                //  §9: a FIXED-VOLUME cell whose pressure moves must account
                //  on internal energy, u_g = h_g - RT.  Collecting the
                //  implicit dP/dt (P_j = R T_j c_tot,j) gives cv = cp - R in
                //  the gas accumulation PLUS an explicit expansion source
                //  eps R T dc_tot/dt -- fully explicit, dc_tot/dt being the
                //  sum of the species rows this evaluation just computed.
                //  At pinned P the source is ~0 and cv-vs-cp moves the gas
                //  accumulation by ~R/cp, three orders under rho_b cp_s --
                //  the widening that lets a depressurising cell COOL.
                const scalar cvgJ  = cpgJ - constant::R;
                const scalar denom = eps_ * ctotJ * cvgJ + rhoB_ * cpS_;

                scalar adv = 0.0;                       // J/(m3 s)
                const scalar uIn = uface[j];
                if (uIn > 0.0)
                {
                    //  T1.5: the feed face advects at the CURRENT feed
                    //  temperature and concentration (the hot purge).
                    const bool feedFace = (j == 0);
                    const scalar Tup  = feedFace ? Tfeed_
                                                 : cellT_(y, j - 1);
                    scalar cup = cFeedTot_;
                    if (!feedFace)
                    {
                        cup = 0.0;
                        for (std::size_t i = 0; i < n; ++i)
                            cup += std::max(y[i * N_ + (j - 1)], scalar(0.0));
                    }
                    const scalar cpup = feedFace ? cpgFeed_
                                                 : cpgCell_(y, j - 1);
                    adv += uIn * cup * cpup * (Tup - Tj) / dz_;
                }
                const scalar uEx = uface[j + 1];
                if (uEx < 0.0)   // backflow through the downstream face
                {
                    //  Same boundary convention as the species flux: the
                    //  downstream reservoir re-enters at feed conditions.
                    const scalar Tdn  = (j + 1 < N_) ? cellT_(y, j + 1)
                                                     : Tfeed_;
                    scalar cdn = cFeedTot_;
                    scalar cpdn = cpgFeed_;
                    if (j + 1 < N_)
                    {
                        cdn = 0.0;
                        for (std::size_t i = 0; i < n; ++i)
                            cdn += std::max(y[i * N_ + (j + 1)], scalar(0.0));
                        cpdn = cpgCell_(y, j + 1);
                    }
                    adv += (-uEx) * cdn * cpdn * (Tdn - Tj) / dz_;
                }

                scalar src = 0.0;                        // J/(m3 s)
                for (std::size_t a = 0; a < nAds; ++a)
                    src += (-dHAds_[a]) * dy[qOff + a * N_ + j];
                src *= rhoB_;

                //  T2: the wall term -h a_w (T_j - T_wall), and the SAME
                //  heat accumulating in the Q_wall ledger state (one ODE,
                //  telescopic -- the M_in/M_out pattern).
                scalar wall = 0.0;                       // J/(m3 s)
                if (wallCooled_)
                {
                    wall = wallH_ * wallAv_ * (Tj - wallTw_);
                    dy[qwOffset_()] += wall * A_ * dz_;  // W
                }

                //  The expansion-work source of the same derivation (see the
                //  cv comment above): eps R T dc_tot/dt, J/(m3 s).
                scalar dctot = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                    dctot += dy[i * N_ + j];
                const scalar expand = eps_ * constant::R * Tj * dctot;

                dy[tOff + j] = (adv + src - wall + expand) / denom;
            }
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
        if (thermal_)
        {
            scalar tAvg = 0.0;
            for (std::size_t j = 0; j < N_; ++j) tAvg += cellT_(y_, j);
            state_.T = tAvg / static_cast<scalar>(N_);   // vessel readout
        }
        else
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
        //  A switched feed changes the sampler's reference basis: the
        //  crossings/integral stay FROZEN at their pre-switch values (they
        //  describe the first feed step, which is well-defined); the
        //  desorption wave itself lives on in c_out/y_out.
        if (cIn_[a] <= 0.0 || feedSwitched_[a]) continue;
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
    if (thermal_) f << " T";
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
        if (thermal_) f << " " << cellT_(y_, j);
        f << "\n";
    }
}

sVector FixedBedAdsorber::cycleState() const
{
    //  c rows + q rows + (thermal) T rows -- everything up to the ledger
    //  block.  inOffset_() is exactly where the accumulators begin, so the
    //  cut is the layout's own boundary and cannot drift from it.
    sVector s(y_.begin(), y_.begin() + static_cast<long>(inOffset_()));
    if (thermal_)
        for (std::size_t j = 0; j < N_; ++j)
            s.push_back(cellT_(y_, j));
    return s;
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
            //  Remaining commitment at the CURRENT feed over the remaining
            //  window.  For a constant feed this equals total - M_in exactly
            //  (M_in = A u c_in (t - start), telescopic); under an A5 feed
            //  switch it stays the REAL remaining matter -- the switch-time
            //  jump is ledgered as a feedAmendment record, never phantom
            //  inventory.
            const scalar feedRemaining =
                A_ * u_ * cInAll_[i] * (endTime_ - tNow_);
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
        //  Same switch-safe form as the carrier below: the CURRENT feed
        //  over the remaining window (== total - M_in for a constant feed,
        //  since M_in = A u c_in (t - start) exactly; an A5 switch's jump
        //  in the commitment is ledgered as a feedAmendment record).
        const scalar feedRemaining =
            A_ * u_ * cIn_[a] * (endTime_ - tNow_);
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
    out.vf = 1.0;   // the raffinate is a GAS -- priced on the gas leg

    if (ergun_)
    {
        out.P = Pout_;
        //  A5-T1: the raffinate leaves at the OUTLET CELL's current T --
        //  the per-step package then carries the thermal wave's enthalpy
        //  into the material ledger exactly as the ctrl campaign does
        //  (a single end-T stamped on all packages was the #99-P0 sin).
        if (thermal_) out.T = cellT_(y_, N_ - 1);
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

// -----------------------------------------------------------------------
//  A4 energy (roadmap #7, first half): the adsorption duty and the priced
//  open-boundary inventory.
//
//  The bed is isothermal by declaration, so the whole energy story is the
//  crystalliser's, one phase over: taking up dn moles releases the isosteric
//  heat, and the environment must remove it to hold T.  The adsorbed
//  inventory n_ads,i = rho_b*A*dz*Sum_cells q_ij is PURE STATE, so the duty
//  is an exact state difference (the batch-ledger doctrine: never a
//  quadrature), and dH_ads comes from the SAME isotherm record whose van't
//  Hoff b(T) already consumes it -- one datum, two readers, no second home.
// -----------------------------------------------------------------------
scalar FixedBedAdsorber::adsorbedKmol_(std::size_t a) const
{
    scalar qs = 0.0;
    for (std::size_t j = 0; j < N_; ++j)
        qs += y_[qOffset_() + a * N_ + j];
    return rhoB_ * A_ * dz_ * qs / 1000.0;                 // mol -> kmol
}

std::vector<SimulationResult::EnergyRecord>
FixedBedAdsorber::energyRecords(scalar tEnd)
{
    //  T2 wallCooled: the removed heat is a STATE ROW of the same ODE --
    //  the record READS it (heat ADDED to the bed is negative when the
    //  wall cools), never re-integrates anything.
    if (wallCooled_)
    {
        SimulationResult::EnergyRecord er;
        er.tStart      = startTime_;
        er.tEnd        = tEnd;
        er.unit        = name_;
        er.kind        = "wallHeat";
        er.T_service_K = wallTw_;
        er.E_kJ        = -y_[qwOffset_()] / 1000.0;   // J -> kJ
        er.E_valid     = true;
        er.basis       = "wall-cooled bed: Q_wall = INT Sum_j h a_w"
                         " (T_j - T_wall) A dz dt, integrated as a state"
                         " row of the SAME ODE (the M_in/M_out ledger"
                         " pattern) -- E is the heat ADDED to the bed";
        return { er };
    }
    //  A5-T1 adiabatic: NOTHING is exchanged with the environment -- the
    //  isosteric heat stays in the bed as the thermal wave, priced by
    //  vesselEnthalpy's per-cell sensible terms, and an "adsorption duty"
    //  record here would double-count it.  No record is the honest ledger.
    if (thermal_) return {};

    scalar E = 0.0;                                        // kJ, heat ADDED
    for (std::size_t a = 0; a < adsIdx_.size(); ++a)
        E += dHAds_[a] * (adsorbedKmol_(a) - nAds0_[a]);   // J/mol * kmol

    SimulationResult::EnergyRecord er;
    er.tStart      = startTime_;
    er.tEnd        = tEnd;
    er.unit        = name_;
    er.kind        = "adsorption";
    er.T_service_K = T_;   // isothermal: the coolant serves at the held T
    er.E_kJ        = E;    // dH_ads < 0: adsorbing RELEASES heat, so the
                           // heat ADDED to hold T is negative
    er.E_valid     = true;
    er.basis       = "isothermal fixed bed: Q = Sum_i dH_ads,i * dn_ads,i,"
                     " n_ads = rho_b*A*Sum_cells(q_i*dz) (exact state"
                     " difference); dH_ads isosteric, from the adsorbent's"
                     " own isotherm records (the van't Hoff datum)";
    return { er };
}

scalar FixedBedAdsorber::vesselEnthalpy(bool& ok, std::string& why) const
{
    //  The A3 constant-(u, P, T) closure FABRICATES carrier at the net
    //  uptake rate (declaredMaterialResidual).  Matter and its enthalpy
    //  cannot be made to close by pricing harder -- the error is the flow
    //  model's, and the honest verdict is the named refusal until the case
    //  declares the A4 velocity update.
    if (!ergun_)
    {
        ok  = false;
        why = "the declared constant-(u,P,T) closure fabricates carrier at"
              " the net uptake rate, so the inventory's enthalpy differs"
              " from real matter by construction -- declare `flowModel"
              " ergun` (A4) for a physically conserved bed";
        return 0.0;
    }

    //  Ergun mode: everything in the open-boundary inventory is either GAS
    //  at the held (T, P) or ADSORBED at h_gas + dH_ads (the isosteric
    //  convention: the differential heat is the whole phase distinction this
    //  slice carries).  Isothermal: one T prices everything.  A5-T1
    //  thermal: each CELL's gas is priced at its own T, the remaining feed
    //  commitment at the feed's declared T, and the SOLID carries its
    //  sensible term rho_b*A*dz*cp_s*(T_j - T_ref) with T_ref = the
    //  declared initial T (a constant reference -- it cancels in every
    //  campaign difference; at t = 0 the term is exactly 0).
    ok = true;
    scalar H = 0.0;
    for (std::size_t i = 0; i < compNames_.size(); ++i)
        if (!thermo_->hasEnthalpyDatum(i))
        {
            ok  = false;
            why = "no elements-datum enthalpy for gas '" + compNames_[i]
                + "' (needs standardThermochemistry)";
            return 0.0;
        }

    if (!thermal_)
    {
        const sVector inv = materialInventory();           // kmol, ALL matter
        for (std::size_t i = 0; i < compNames_.size(); ++i)
        {
            if (inv[i] == 0.0) continue;
            H += inv[i] * thermo_->speciesPhaseEnthalpy(
                     i, T_, P_, "gas",
                     ThermoPackage::ReferenceContext::StandardPhase);   // kJ
        }
    }
    else
    {
        //  Per-cell hold-up at the cell's own T: the gas, the ADSORBED
        //  moles' gas-reference base term (their dH_ads shift is the
        //  global sum below, unchanged), and the solid's sensible term.
        for (std::size_t j = 0; j < N_; ++j)
        {
            const scalar Tj = cellT_(y_, j);
            for (std::size_t i = 0; i < compNames_.size(); ++i)
            {
                const scalar kmol =
                    eps_ * A_ * dz_
                    * std::max(y_[i * N_ + j], scalar(0.0)) / 1000.0;
                if (kmol == 0.0) continue;
                H += kmol * thermo_->speciesPhaseEnthalpy(
                         i, Tj, P_, "gas",
                         ThermoPackage::ReferenceContext::StandardPhase);
            }
            for (std::size_t a = 0; a < adsIdx_.size(); ++a)
            {
                const scalar kmolAds = rhoB_ * A_ * dz_
                    * y_[qOffset_() + a * N_ + j] / 1000.0;
                if (kmolAds == 0.0) continue;
                H += kmolAds * thermo_->speciesPhaseEnthalpy(
                         adsIdx_[a], Tj, P_, "gas",
                         ThermoPackage::ReferenceContext::StandardPhase);
            }
            H += rhoB_ * A_ * dz_ * cpS_ * (Tj - T_) / 1000.0;   // kJ, solid
        }
        //  The remaining feed commitment enters at the CURRENT feed T
        //  (T1.5: a hot purge re-declares both the matter and its
        //  enthalpy; the switch-time jump is ledgered as amendments).
        for (std::size_t i = 0; i < compNames_.size(); ++i)
        {
            const scalar kmol =
                A_ * u_ * cInAll_[i] * std::max(endTime_ - tNow_, scalar(0.0))
                / 1000.0;
            if (kmol == 0.0) continue;
            H += kmol * thermo_->speciesPhaseEnthalpy(
                     i, Tfeed_, P_, "gas",
                     ThermoPackage::ReferenceContext::StandardPhase);
        }
    }
    //  The adsorbed share of that inventory sits h = h_gas + dH_ads below
    //  the gas it came from (dH_ads < 0).
    for (std::size_t a = 0; a < adsIdx_.size(); ++a)
        H += dHAds_[a] * adsorbedKmol_(a);                 // kJ
    return H;
}

std::string FixedBedAdsorber::energyLedgerGap() const
{
    //  Ergun (A4-flow) mode: the duty is ledgered above and the vessel
    //  prices -- nothing withheld.  The A3 closure keeps a NAMED gap for
    //  the same reason vesselEnthalpy refuses there: the fabricated carrier
    //  makes the physical energy balance wrong by construction, and a
    //  verdict on it would be decorative.
    if (ergun_) return "";
    return "constant-(u,P,T) closure: fabricated carrier (see"
           " declaredMaterialResidual) makes the physical energy balance"
           " unclaimable -- declare `flowModel ergun` (A4) to close it";
}

void FixedBedAdsorber::chargeFrom(const BatchState& /*src*/)
{
    throw std::runtime_error("fixedBedAdsorber '" + name_ + "': recipe"
        " transfer INTO a fixed bed is refused -- the bed is a flow-through"
        " unit fed by its declared feed{}; to CHANGE that feed use the A5"
        " isothermal feed switch (recipe setParameter, key"
        " feed.<component>, value = new feed mole fraction)");
}

BatchState FixedBedAdsorber::dischargeAll()
{
    throw std::runtime_error("fixedBedAdsorber '" + name_ + "': recipe"
        " transfer OUT of a fixed bed is refused -- the raffinate already"
        " leaves continuously (route it with dischargeTo); emptying a bed"
        " (blowdown) is a pressure-swing step this isothermal constant-P"
        " slice does not carry");
}

BatchState FixedBedAdsorber::discharge(scalar /*fraction*/)
{
    return dischargeAll();   // same named refusal
}

// -----------------------------------------------------------------------
//  A5, first step: the ISOTHERMAL feed switch (concentration-swing
//  regeneration).  `feed.<component>` re-declares that species' feed mole
//  fraction -- the SAME quantity the author declared in
//  feed{molarComposition{}} -- so a loaded bed can be purged with clean
//  carrier without leaving the physics this slice actually solves.  The
//  swings that change a DECLARED CONSTANT of the model (T, u, P) refuse
//  by name: each needs an equation this unit does not carry.
//
//  Every switch AMENDS the declared feed commitment: the campaign datum
//  owned A*u*c_in*(endTime - t) of future feed at the old composition and
//  owns a different amount at the new one.  That difference is real
//  declared matter crossing the campaign boundary at the switch instant,
//  and it leaves here as priced DatumAmendment packages the driver
//  ledgers (kind `feedAmendment`) -- the balance reads a record, never a
//  jump.  Under the A3 constant-(u, P, T) closure the carrier follows by
//  difference (c_tot is pinned), so its counter-amendment ships too.
// -----------------------------------------------------------------------
void FixedBedAdsorber::setOperationParameter(const std::string& key,
                                             scalar value)
{
    if (key == "T" || key == "T_setpoint")
        throw std::runtime_error("fixedBedAdsorber '" + name_ + "': the"
            " BED temperature cannot be set -- it is a DECLARED CONSTANT"
            " of the isothermal slice and a computed STATE of the"
            " adiabatic one (A5-T1); the control that exists is the FEED"
            " (feed.<component>, and feed.T in thermal mode)");
    if (key == "feed.T")
    {
        if (!thermal_)
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': feed.T is refused here -- T is a DECLARED CONSTANT"
                " of this isothermal slice, and a thermal-swing (TSA)"
                " step needs the non-isothermal bed energy balance:"
                " declare `energyBalance adiabatic;` (A5-T1, flowModel"
                " ergun) and feed.T becomes the hot-purge control");
        if (value <= 0.0)
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': feed.T must be a positive absolute temperature");
        if (value == Tfeed_) return;    // no-op re-declaration

        //  T1.5, the TSA hot purge.  A feed at a NEW temperature is a
        //  re-declaration of the WHOLE remaining commitment: at the
        //  pinned feed pressure the total concentration moves to
        //  P/(R T_new) (composition preserved), and even unchanged
        //  matter changes ENTHALPY.  So the ledger takes the honest
        //  full form -- RETIRE the old commitment (one OUT package, all
        //  species, at T_old) and DECLARE the new one (one IN package
        //  at T_new); the repricing rides in the packages' own T.
        const scalar Told    = Tfeed_;
        const scalar horizon = std::max(endTime_ - tNow_, 0.0);
        const std::size_t n  = compNames_.size();

        DatumAmendment outAm, inAm;
        outAm.into = false;  outAm.pkg.n.assign(n, 0.0);
        outAm.pkg.T = Told;  outAm.pkg.P = P_;  outAm.pkg.vf = 1.0;
        inAm.into  = true;   inAm.pkg.n.assign(n, 0.0);
        inAm.pkg.T = value;  inAm.pkg.P = P_;   inAm.pkg.vf = 1.0;

        //  Ideal gas at the pinned feed P: every declared feed
        //  concentration scales by T_old/T_new (composition preserved,
        //  a clean-purge deficit preserved too -- cFeedTot_ is always
        //  the ACTUAL Sum of cInAll_, never a nominal).
        sVector yComp(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
            outAm.pkg.n[i] = A_ * u_ * cInAll_[i] * horizon / 1000.0;
        Tfeed_ = value;
        cFeedTot_ = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            cInAll_[i] *= Told / Tfeed_;
            cFeedTot_  += cInAll_[i];
            inAm.pkg.n[i] = A_ * u_ * cInAll_[i] * horizon / 1000.0;
        }
        for (std::size_t i = 0; i < n; ++i)
            yComp[i] = (cFeedTot_ > 0.0) ? cInAll_[i] / cFeedTot_ : 0.0;
        for (std::size_t a = 0; a < adsIdx_.size(); ++a)
        {
            cIn_[a] = cInAll_[adsIdx_[a]];
            //  Every integrated species' c_in just moved (same y, new
            //  c_tot): the sampler's reference basis is gone for all.
            feedSwitched_[a] = true;
        }
        cpgFeed_ = thermo_->Cp_ig(Tfeed_, yComp);

        {
            std::ostringstream w;
            w << "hot-purge feed switch on '" << name_ << "': T_feed "
              << Told << " -> " << Tfeed_ << " K at pinned P (c_feed,tot "
              << (cFeedTot_ * Tfeed_ / Told) << " -> " << cFeedTot_
              << " mol/m3, composition preserved), commitment re-declared"
                 " over the remaining " << horizon << " s";
            outAm.why = w.str() + " (old commitment retired)";
            inAm.why  = w.str() + " (new commitment declared)";
        }
        if (outAm.pkg.totalMoles() > 0.0)
            pendingAmendments_.push_back(std::move(outAm));
        if (inAm.pkg.totalMoles() > 0.0)
            pendingAmendments_.push_back(std::move(inAm));

        if (verbosity_ >= 2)
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] T1.5"
                         " HOT-PURGE feed switch: T_feed " << Told
                      << " -> " << Tfeed_ << " K; c_feed,tot -> "
                      << cFeedTot_ << " mol/m3 (P pinned, composition"
                         " preserved), feed Cp_ig -> " << cpgFeed_
                      << " J/(mol K).  The WHOLE remaining commitment is"
                         " re-declared (OUT at " << Told << " K, IN at "
                      << Tfeed_ << " K -- ledgered feedAmendment"
                         " records); breakthrough crossings/integral"
                         " FROZEN for every integrated species.\n";
        return;
    }
    if (key == "u")
        throw std::runtime_error("fixedBedAdsorber '" + name_ + "': u is a"
            " DECLARED CONSTANT -- a flow transient re-poses the momentum"
            " problem (transient Ergun), which this unit does not carry");
    if (key == "P")
        throw std::runtime_error("fixedBedAdsorber '" + name_ + "': P is a"
            " DECLARED CONSTANT -- a pressure-swing (PSA) step (blowdown /"
            " repressurisation) needs a transient total concentration,"
            " which this unit does not carry");

    if (key.rfind("feed.", 0) == 0)
    {
        const std::string comp = key.substr(5);
        auto it = std::find(compNames_.begin(), compNames_.end(), comp);
        if (it == compNames_.end())
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': feed switch names '" + comp + "', which is not a"
                " component of this case");
        if (value < 0.0 || value > 1.0)
            throw std::runtime_error("fixedBedAdsorber '" + name_
                + "': feed." + comp + " is a feed MOLE FRACTION -- got "
                + std::to_string(value) + ", need 0 <= y <= 1");
        const std::size_t ci =
            static_cast<std::size_t>(it - compNames_.begin());

        const scalar horizon = std::max(endTime_ - tNow_, 0.0);
        auto amend = [&](std::size_t cj, scalar dc, const std::string& why)
        {
            const scalar dKmol = A_ * u_ * std::abs(dc) * horizon / 1000.0;
            if (dKmol <= 0.0) return;
            DatumAmendment am;
            am.into = (dc > 0.0);
            am.pkg.n.assign(compNames_.size(), 0.0);
            am.pkg.n[cj] = dKmol;
            am.pkg.T  = T_;
            am.pkg.P  = P_;
            am.pkg.V  = 0.0;
            am.pkg.vf = 1.0;   // the commitment is FEED GAS
            am.why    = why;
            pendingAmendments_.push_back(std::move(am));
        };
        auto sayWhy = [&](const std::string& nm, scalar cOld, scalar cNew)
        {
            std::ostringstream os;
            os << "feed switch on '" << name_ << "': " << nm << " c_in "
               << cOld << " -> " << cNew << " mol/m3 over the remaining "
               << horizon << " s";
            return os.str();
        };

        if (!ergun_)
        {
            //  A3 constant-(u, P, T): the carrier closes by difference from
            //  the pinned c_tot -- it is DERIVED, so it cannot be set.
            if (ci == carrierIdx_)
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': '" + comp + "' is the by-difference CARRIER of"
                    " the constant-(u,P,T) closure -- set the adsorbing"
                    " species' feed fractions; the carrier follows");
            auto ait = std::find(adsIdx_.begin(), adsIdx_.end(), ci);
            if (ait == adsIdx_.end())
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': '" + comp + "' is not an integrated species of"
                    " this bed -- only isotherm-carrying (or declared"
                    " transport-only) species have a switchable feed");
            const std::size_t a =
                static_cast<std::size_t>(ait - adsIdx_.begin());

            const scalar cOld = cIn_[a];
            const scalar cNew = value * cTot_;
            scalar sumNew = 0.0;
            for (std::size_t b = 0; b < adsIdx_.size(); ++b)
                sumNew += (b == a) ? cNew : cIn_[b];
            if (sumNew > cTot_ * (1.0 + 1.0e-12))
                throw std::runtime_error("fixedBedAdsorber '" + name_
                    + "': feed." + comp + " = " + std::to_string(value)
                    + " drives the integrated feed fractions above 1 -- the"
                    " by-difference carrier would go negative");
            if (cNew == cOld) return;   // a no-op re-declaration: nothing
                                        //   amends, nothing freezes

            const scalar carOld = cInCarrier_;
            cIn_[a]        = cNew;
            cInAll_[ci]    = cNew;
            cInCarrier_    = cTot_ - sumNew;
            cInAll_[carrierIdx_] = cInCarrier_;

            amend(ci, cNew - cOld, sayWhy(comp, cOld, cNew));
            amend(carrierIdx_, cInCarrier_ - carOld,
                  sayWhy(compNames_[carrierIdx_], carOld, cInCarrier_)
                  + " (carrier, by difference)");
            feedSwitched_[a] = true;

            if (verbosity_ >= 2)
                std::cout << "  [fixedBedAdsorber '" << name_ << "'] A5 feed"
                             " switch: " << comp << " y_feed -> " << value
                          << " (c_in " << cOld << " -> " << cNew
                          << " mol/m3); carrier '"
                          << compNames_[carrierIdx_]
                          << "' follows by difference (" << carOld << " -> "
                          << cInCarrier_ << " mol/m3).  Feed commitment"
                             " amended over the remaining " << horizon
                          << " s (ledgered as feedAmendment records);"
                             " breakthrough crossings/integral for " << comp
                          << " FROZEN at their pre-switch values.\n";
            return;
        }

        //  Ergun (A4-flow): every species is integrated, no difference
        //  closure -- the named species amends alone.  The new fraction
        //  reads against the NOMINAL feed total at the CURRENT feed T
        //  (T1.5: a hot purge lowered it), and cFeedTot_ stays the ACTUAL
        //  sum the energy faces advect.
        const scalar cOld = cInAll_[ci];
        const scalar cNew = value * P_ / (constant::R * Tfeed_);
        if (cNew == cOld) return;
        cInAll_[ci] = cNew;
        cFeedTot_  += cNew - cOld;
        auto ait = std::find(adsIdx_.begin(), adsIdx_.end(), ci);
        if (ait != adsIdx_.end())
        {
            const std::size_t a =
                static_cast<std::size_t>(ait - adsIdx_.begin());
            cIn_[a] = cNew;
            feedSwitched_[a] = true;
        }
        if (thermal_ && cFeedTot_ > 0.0)
        {
            //  The feed's mixture Cp follows its new composition.
            sVector yComp(compNames_.size(), 0.0);
            for (std::size_t i = 0; i < compNames_.size(); ++i)
                yComp[i] = cInAll_[i] / cFeedTot_;
            cpgFeed_ = thermo_->Cp_ig(Tfeed_, yComp);
        }
        amend(ci, cNew - cOld, sayWhy(comp, cOld, cNew));
        if (verbosity_ >= 2)
            std::cout << "  [fixedBedAdsorber '" << name_ << "'] A5 feed"
                         " switch: " << comp << " y_feed -> " << value
                      << " (c_in " << cOld << " -> " << cNew
                      << " mol/m3, no difference closure in ergun mode)."
                         "  Feed commitment amended over the remaining "
                      << horizon << " s (ledgered as feedAmendment"
                         " records); breakthrough crossings/integral"
                         " FROZEN where the species is integrated.\n";
        return;
    }

    BatchUnitOperation::setOperationParameter(key, value);
}

std::vector<BatchUnitOperation::DatumAmendment>
FixedBedAdsorber::takeDatumAmendments()
{
    std::vector<DatumAmendment> out;
    out.swap(pendingAmendments_);
    return out;
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
    if (thermal_)
    {
        scalar tMax = 0.0;
        for (std::size_t j = 0; j < N_; ++j)
            tMax = std::max(tMax, cellT_(y_, j));
        ex.emplace_back("T_out", cellT_(y_, N_ - 1));
        ex.emplace_back("T_max", tMax);
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
    if (thermal_)
    {
        //  The A5-T1 verdict trio: where the outlet T ended, how hot the
        //  bed got, and the pre-run equilibrium-theory anchors the run
        //  had to respect -- FROZEN claims (stored at initialise; a T1.5
        //  feed switch must not silently rewrite what was announced).
        scalar tMax = 0.0;
        for (std::size_t j = 0; j < N_; ++j)
            tMax = std::max(tMax, cellT_(y_, j));
        k["T_out_final_K"] = cellT_(y_, N_ - 1);
        k["T_max_final_K"] = tMax;
        k["u_thermal_wave_m_s"] = uThAnn_;
        if (wallCooled_)
            k["Q_wall_removed_kJ"] = y_[qwOffset_()] / 1000.0;
        for (std::size_t a = 0; a < nAds; ++a)
            if (a < dTadAnn_.size() && dTadAnn_[a] >= 0.0)
                k["dT_adiabatic_" + compNames_[adsIdx_[a]] + "_K"] =
                    dTadAnn_[a];
    }
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
        //  Two families (A5): FROZEN claims describe the first feed step
        //  and survive a feed switch (crossings, integral, the pre-run
        //  t_st); LIVE feed-referenced diagnostics need the CURRENT feed
        //  as their basis and retire the moment it is switched.
        const bool liveFeed = (cIn_[a] > 0.0 && !feedSwitched_[a]);
        if (liveFeed && k_[a] > 0.0 && tStoich_[a] > 0.0)
            k["retention_factor_" + nm] =
                eps_ + rhoB_ * qStarFeed_(a) / cIn_[a];
        if (k_[a] > 0.0 && tStoich_[a] > 0.0)
            k["t_stoichiometric_" + nm] = tStoich_[a];
        if (tCross5_[a]  >= 0.0) k["t_breakthrough_5pct_" + nm]  = tCross5_[a];
        if (tCross50_[a] >= 0.0) k["t_50_" + nm]                 = tCross50_[a];
        if (tCross95_[a] >= 0.0) k["t_breakthrough_95pct_" + nm] = tCross95_[a];
        if (cIn_[a] > 0.0 || feedSwitched_[a])
            k["integral_anchor_" + nm] = integral_[a];
        if (liveFeed)
            k["c_out_over_cin_final_" + nm] =
                y_[(ergun_ ? adsIdx_[a] : a) * N_ + N_ - 1] / cIn_[a];
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
