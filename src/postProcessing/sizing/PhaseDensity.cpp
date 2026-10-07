/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "PhaseDensity.H"
#include "core/Advisory.H"
#include "thermo/PricedDensity.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace phaseDensity {

namespace {

//  A vapour fraction this close to 0 or 1 IS that phase: the flash writes
//  its single-phase outlets at exactly 0 and 1, and a resolved stream lands
//  within round-off of them.
constexpr scalar phaseTol = 1.0e-9;


} // anonymous namespace

Reading of(const SimulationResult& result,
           const std::string&      stream,
           const std::string&      who)
{
    if (!result.thermoForPost)
        throw std::runtime_error(who + ": needs the density of stream '"
            + stream + "', and this run carries no thermophysical package"
              " for its post-processing passes (only choupoSolve attaches"
              " one).  Nothing here is sized or counted on a guessed"
              " density.");

    auto sit = result.streams.find(stream);
    if (sit == result.streams.end())
    {
        std::string have;
        for (const auto& [nm, s] : result.streams)
        { (void) s; have += (have.empty() ? "" : " ") + nm; }
        throw std::runtime_error(who + ": stream '" + stream + "' is not in"
            " the solved flowsheet.\n  Streams it carries: " + have);
    }
    const ProcessStream& s = sit->second;

    for (scalar si : s.s)
        if (si > 0.0)
            throw std::runtime_error(who + ": stream '" + stream + "' carries"
                " SOLIDS, and no phase density here prices a crystal --"
                " name a stream that carries one fluid phase only.");

    std::string phase;
    if (s.vf <= phaseTol)            phase = "liquid";
    else if (s.vf >= 1.0 - phaseTol) phase = "vapour";
    else
    {
        char b[64];
        std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(s.vf));
        throw std::runtime_error(who + ": stream '" + stream + "' is"
            " TWO-PHASE (vapour fraction " + b + "), and the density of a"
            " two-phase stream is not one number.\n  Name the stream that"
            " carries each phase on its own -- a flash drum's vapour and"
            " liquid outlets are exactly that.");
    }

    std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
    if (!pkg)
        throw std::runtime_error(who + ": the thermophysical package could"
            " not be built for post-processing -- no density is available.");
    const ThermoPackage& tp = *pkg;

    const std::size_t N = tp.n();
    if (s.z.size() != N)
        throw std::runtime_error(who + ": stream '" + stream + "' carries "
            + std::to_string(s.z.size()) + " mole fractions and the package "
            + std::to_string(N) + " components.");

    Reading r;
    r.phase = phase;
    r.T     = s.T;
    r.P     = s.P;

    //  Mass fractions and the stream's mass flow, from the package's own
    //  molar masses -- the same numbers the rest of the run prices with.
    scalar mw = 0.0;
    for (std::size_t i = 0; i < N; ++i) mw += s.z[i] * tp.comp(i).MW();
    if (!(mw > 0.0))
        throw std::runtime_error(who + ": stream '" + stream + "' has no"
            " material (zero mean molar mass).");
    for (std::size_t i = 0; i < N; ++i)
        if (s.z[i] > 0.0)
            r.massFraction[tp.comp(i).name()] = s.z[i] * tp.comp(i).MW() / mw;
    r.massFlow = s.F * mw;                               // kmol/s x kg/kmol

    //  WHICH COMPONENTS THE DENSITY IS ASKED OVER: the ONE home
    //  (`thermo/PricedDensity`), the selection `storageTank` makes too.
    const DensityPhase ph = phase == "liquid" ? DensityPhase::Liquid
                                              : DensityPhase::Vapour;
    const pricedDensity::Selection sel =
        pricedDensity::select(tp, s.T, s.P, s.z, ph);
    if (!(sel.keptFraction > 0.0))
        throw std::runtime_error(who + ": no component of stream '" + stream
            + "' has a " + phase + " density at its own state, so neither a"
              " volume nor a mass can be formed from it.");
    r.unpricedMoleFraction = sel.droppedFraction;
    const std::string excluded = sel.dropped;
    r.rho = tp.density(s.T, s.P, sel.zPriced, ph);
    if (!std::isfinite(r.rho) || !(r.rho > 0.0))
        throw std::runtime_error(who + ": the package returned no usable"
            " density for stream '" + stream + "'.");

    //  ANNOUNCED ONCE PER (item, stream): the density is an input to a size
    //  or a mass a reader will defend, so the number and the state it was
    //  taken at are said beside it.  The package has already said which of
    //  its own routes it took.
    {
        char b[320];
        std::snprintf(b, sizeof(b),
            "  [density] %s: stream '%s' is %s at %.2f K, %.6g bar -> rho ="
            " %.2f kg/m3 (the case's thermophysical package)\n",
            who.c_str(), stream.c_str(), phase.c_str(),
            static_cast<double>(s.T), static_cast<double>(s.P * 1.0e-5),
            static_cast<double>(r.rho));
        std::cout << b;
    }
    if (!excluded.empty())
    {
        char b[64];
        std::snprintf(b, sizeof(b), "%.3g",
                      static_cast<double>(r.unpricedMoleFraction));
        const std::string m = "the " + phase + " of stream '" + stream
            + "' carries " + std::string(b) + " mole fraction of " + excluded
            + ", which the package cannot price alone at this state (a"
              " dissolved supercritical gas has no liquid molar volume): the"
              " density is taken over the other components, renormalised, and"
              " the MASS still counts every component";
        if (AdvisoryLog::instance().add("density", "info", who, m))
            std::cout << "  [density] " << who << ": " << m << "\n";
    }
    return r;
}

} // namespace phaseDensity
} // namespace Choupo
