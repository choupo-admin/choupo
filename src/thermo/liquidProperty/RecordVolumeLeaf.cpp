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

#include "RecordVolumeLeaf.H"

#include "thermo/ThermoPackage.H"

#include <stdexcept>

namespace Choupo {
namespace liquidProperty {

using Route = ThermoPackage::LiquidVolumeRoute;

RecordVolumeLeaf::RecordVolumeLeaf(const Binding& b, int route)
  : DensityLeaf(b), route_(route)
{
    //  The route is a FACT of the record, read by the package's one home
    //  (`liquidVolumeRouteOf`); a leaf built for another route is a wiring
    //  error of the resolver, never a choice.
    if (static_cast<int>(thermo_->liquidVolumeRouteOf(i_)) != route_)
        throw std::logic_error("RecordVolumeLeaf: component '" + comp().name()
            + "' is not on the route " + recordRouteId(route_));
}

std::string RecordVolumeLeaf::id() const
{
    return std::string("recordVolume.") + recordRouteId(route_);
}

scalar RecordVolumeLeaf::molarVolume(scalar T, scalar) const
{
    return thermo_->liquidMolarVolumeOf(i_, T);
}

std::string RecordVolumeLeaf::routeKey() const { return recordRouteId(route_); }

int RecordVolumeLeaf::routeRank() const { return 10 + route_; }

std::string RecordVolumeLeaf::routeWords(const std::vector<std::string>& statedAt) const
{
    return recordRouteWords(route_, statedAt);
}

std::string RecordVolumeLeaf::statedDatum() const
{
    const Route r = static_cast<Route>(route_);
    if ((r == Route::anchoredRackett || r == Route::flatVliq) && comp().hasVliqT())
        return datumOf(comp());
    return "";
}

std::string RecordVolumeLeaf::datum() const
{
    const Route r = static_cast<Route>(route_);
    return (r == Route::anchoredRackett || r == Route::flatVliq) ? datumOf(comp()) : "";
}

std::string RecordVolumeLeaf::origin() const { return recordRouteOrigin(route_); }

} // namespace liquidProperty
} // namespace Choupo
