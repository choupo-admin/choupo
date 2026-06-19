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
Class
    Choupo::PhaseChanger   (aliases: boiler, condenser)

Description
    The DOME-CROSSING phase-change unit.  One stream in, one (two-phase-aware)
    stream out, the heat duty Q a RESULT.  Where a `heater` is sensible-only
    (it must NOT cross the saturation line), a phaseChanger is built to land
    ANYWHERE on the (T, vf) surface -- subcooled liquid, anywhere inside the
    dome (0 < vf < 1), or superheated vapour.

        Streams IN  ->  (one outlet coordinate)  ->  Streams OUT  (+ Q result)

    -- ONE outlet coordinate (degrees of freedom) -----------------------------

    P is HELD from the inlet by default (or set `P` explicitly).  Then pick
    EXACTLY ONE of:

        Q           <val> kW;     duty mode -- T_out, vf_out are results
        outletState <word>;       saturatedVapour | saturatedLiquid
                                   | subcooledLiquid | superheatedVapour
                                   (the last two need a companion subcool /
                                    superheat delta)
        outletQuality <0..1>;     target vapour fraction (partial condenser)
        superheat   <K>;          T = Tsat(P) + dK  (vapour side)
        subcool     <K>;          T = Tsat(P) - dK  (liquid side)
        outletT     <val>;        enthalpy at that T

    Q is ALWAYS reported, labelled "DUTY (result)".  The state / quality /
    superheat / subcool / outletT specs are a BUILT-IN SELF-TARGET: the unit
    solves Q to hit its OWN declared outlet -- no outerDict, no variables{}.
    It ANNOUNCES the inverse solve in its report (no-silent-crutch by
    announcement).

    boiler / condenser are ALIASES of the same class; the DIRECTION (boiling
    vs condensing) is emergent from the converged vf and the sign of Q, and is
    labelled in the report -- not a separate model.

    -- Both backends ---------------------------------------------------------

    The solve wraps the EXISTING machinery: IsothermalFlash::solveCore for the
    (vf, x, y) split and ThermoPackage::H_stream for the dome-aware enthalpy
    (h = (1-x)h_f + x h_g on the saturation line, for BOTH the generic
    cubic-EoS+Antoine route AND the pure-fluid IF97 route -- the dispatch is
    automatic inside the thermo).  Saturation comes from the IF97 kernel's
    Tsat(P) for the pure-fluid route, and from the dominant component's
    vapour-pressure curve otherwise.

SourceFiles
    PhaseChanger.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <string>
#include <vector>

namespace Choupo {

class PhaseChanger : public UnitOperation
{
public:
    PhaseChanger() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

private:
    // The `model geometry;` resolution: a film-condensation HTC drives the
    // duty from the surface geometry + a coolant (the wall-T inner iteration),
    // instead of one of the six outlet-coordinate specs.  v1 = FILM
    // CONDENSATION only (boiling errors loudly).
    int solveGeometry(const DictPtr& operDict,
                      const ThermoPackage& thermo,
                      int verbosity,
                      scalar F, scalar T_in, scalar P_in, scalar P_out,
                      const sVector& z);

    // The `model geometry;` BOILING branch: a Rohsenow nucleate-boiling flux
    // (with a student-supplied surface-fluid C_sf + citation) drives the duty
    // from the surface geometry + a heating medium, with the Zuber CHF as the
    // hard burnout ceiling.  Honesty-as-structure: the nucleate flux is
    // +/-100% (it carries a [q/2,2q] band) and a design above CHF is REFUSED.
    int solveBoilingGeometry(const DictPtr& operDict,
                             const ThermoPackage& thermo,
                             int verbosity,
                             scalar F, scalar T_in, scalar P_in, scalar P_out,
                             const sVector& z);

    inline static const std::string type_ = "phaseChanger";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
