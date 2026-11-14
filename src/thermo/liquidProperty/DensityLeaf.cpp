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

#include "DensityLeaf.H"

#include "thermo/PropertyDomainError.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <cstdio>
#include <limits>
#include <set>
#include <stdexcept>

namespace Choupo {
namespace liquidProperty {

DensityLeaf::DensityLeaf(const Binding& b)
  : thermo_(b.thermo)
{
    if (!thermo_ || b.set.size() != 1)
        throw std::logic_error("DensityLeaf: a leaf is bound to exactly one"
                               " component of a package");
    i_ = b.set.front();
}

const Component& DensityLeaf::comp() const { return thermo_->comp(i_); }

DensityAnswer DensityLeaf::evaluate(scalar T, scalar P, const sVector&) const
{
    DensityAnswer a;
    a.v = molarVolume(T, P);
    const scalar Mi = comp().MW() / 1000.0;                    // kg/mol
    a.rho = (a.v > 0.0) ? Mi / a.v : std::numeric_limits<scalar>::quiet_NaN();
    a.methodId = id();
    const std::string d = statedDatum();
    a.label = "property kernel: " + routeWords(d.empty() ? std::vector<std::string>{}
                                                        : std::vector<std::string>{ d });
    a.leaves.push_back({ comp().name(), id(), 1.0 });
    a.pressureApplied   = pressureApplied();
    a.quality.origin    = origin();
    a.quality.domain    = "not declared";
    a.quality.evidence  = evidence();
    return a;
}

// ---------------------------------------------------------------------------
//  The record-volume routes' words (moved here from the slice-0 door, where
//  they described `ThermoPackage::density`; the door now reads them here).
// ---------------------------------------------------------------------------
using Route = ThermoPackage::LiquidVolumeRoute;

const char* recordRouteId(int route)
{
    switch (static_cast<Route>(route))
    {
        case Route::anchoredRackett: return "anchoredRackett";
        case Route::flatVliq:        return "flatVliq";
        case Route::bareRackett:     return "bareRackett";
        case Route::none:            return "none";
    }
    return "?";
}

std::string datumOf(const Component& c)
{
    if (!c.hasVliqT()) return c.name() + " at 25 C";
    char b[32];
    std::snprintf(b, sizeof b, "%.6g K", c.VliqT());
    return c.name() + " at " + b;
}

//  THE ONE HOME of a liquid-volume route's words, fed by the route and by
//  the temperature each component's `Vliq` belongs to (C378).  `statedAt`
//  names the components on the route whose record states `VliqT` ("CH4 at
//  111.66 K"); empty, the words are the 25 C ones, byte for byte.  One stated
//  temperature replaces "25 C"; several are named with their components.
std::string recordRouteWords(int route, const std::vector<std::string>& statedAt)
{
    const Route r = static_cast<Route>(route);
    std::string where = "25 C molar volume";
    if (!statedAt.empty() && (r == Route::anchoredRackett || r == Route::flatVliq))
    {
        std::set<std::string> temps;
        for (const auto& w : statedAt) temps.insert(w.substr(w.find(" at ") + 4));
        if (temps.size() == 1) where = "molar volume at " + *temps.begin();
        else
        {
            where = "molar volume at its datum temperature (";
            for (std::size_t k = 0; k < statedAt.size(); ++k)
                where += (k ? ", " : "") + statedAt[k];
            where += ")";
        }
    }
    switch (r)
    {
        case Route::anchoredRackett: return "each component's " + where + " scaled to temperature by Rackett";
        case Route::flatVliq:        return "each component's " + where + ", with no temperature effect (its record has no critical constants)";
        case Route::bareRackett:     return "an estimate by Rackett from the critical constants (no measured volume in the record)";
        case Route::none:            return "no route";
    }
    return "?";
}

const char* recordRouteOrigin(int route)
{
    switch (static_cast<Route>(route))
    {
        case Route::anchoredRackett: return "literature";   // the level; Rackett gives the shape
        case Route::flatVliq:        return "literature";
        case Route::bareRackett:     return "estimated";
        case Route::none:            return "";
    }
    return "";
}

} // namespace liquidProperty
} // namespace Choupo
