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

#include "SaturatedVapour.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "thermo/Component.H"
#include "thermo/equationOfState/EquationOfState.H"

#include <cmath>
#include <functional>
#include <iostream>

namespace Choupo {

namespace {

void announceReference(const EquationOfState& eos)
{
    const std::string key = "saturatedVapourPhi:" + eos.modelName();
    if (!AdvisoryLog::instance().passHas(key)
     && AdvisoryLog::instance().addAnnouncedOnce(key, "thermo", "info",
            "gamma-phi reference fugacity",
            "the pure-liquid reference of every volatile subcritical"
            " component is phi_sat(T) Psat(T) exp(Vliq (P - Psat)/RT),"
            " phi_sat the pure-vapour fugacity coefficient of "
            + eos.modelName() + " at (T, Psat), so the vapour's"
            " non-ideality enters both sides of K."))
        std::cerr << "[thermo] gamma-phi reference fugacity = phi_sat(T) Psat(T)"
                     " exp(Vliq (P - Psat)/RT), phi_sat from " << eos.modelName()
                  << " (a non-ideal vapour is counted on both sides of K;"
                     " subcritical components only)\n";
}

scalar factorOne(const EquationOfState& eos, const Component& c,
                 const std::string& why)
{
    const std::string key = "saturatedVapourPhiOne:" + eos.modelName()
                          + ":" + c.name();
    if (!AdvisoryLog::instance().passHas(key)
     && AdvisoryLog::instance().addAnnouncedOnce(key, "thermo", "warning",
            "phi_sat of " + c.name(),
            "no usable saturated-vapour fugacity coefficient for '"
            + c.name() + "' (" + why + "): the reference fugacity keeps"
            " phi_sat = 1 for this component."))
        std::cerr << "[thermo] phi_sat of '" << c.name() << "' taken as 1: "
                  << why << "\n";
    return 1.0;
}

void poyntingOne(const EquationOfState& eos, const Component& c)
{
    const std::string key = "liquidReferencePoynting:" + eos.modelName()
                          + ":" + c.name();
    if (!AdvisoryLog::instance().passHas(key)
     && AdvisoryLog::instance().addAnnouncedOnce(key, "thermo", "warning",
            "Poynting of " + c.name(),
            "'" + c.name() + "' declares no Vliq, so its Poynting factor is"
            " taken as 1 (phi_sat is kept)."))
        std::cerr << "[thermo] Poynting of '" << c.name() << "' taken as 1:"
                     " no Vliq declared\n";
}

//  T_cap / Tc (measured 2026-11-08, see the commit message).
const scalar capFraction = 0.99;

void holdAnnounce(const EquationOfState& eos, const Component& c,
                  scalar T, scalar Tcap)
{
    const std::string key = "liquidReferenceHeld:" + eos.modelName()
                          + ":" + c.name();
    if (!AdvisoryLog::instance().passHas(key)
     && AdvisoryLog::instance().addAnnouncedOnce(key, "thermo", "info",
            "reference factor of " + c.name() + " held",
            "T = " + std::to_string(T) + " K is above " + std::to_string(Tcap)
            + " K (0.99 Tc of " + c.name() + "): the liquid is hypothetical"
            " there, and phi_sat Poynting is HELD at its value at that"
            " temperature so the reference fugacity is continuous in T."))
        std::cerr << "[thermo] reference factor of '" << c.name()
                  << "' held at its value at " << Tcap << " K (0.99 Tc) for"
                     " T above it (continuity in T)\n";
}

} // namespace

scalar liquidReferenceFactor(const EquationOfState& eos, const Component& c,
                             std::size_t i, std::size_t n,
                             scalar T, scalar P, scalar Psat,
                             const std::function<scalar(scalar)>& psatAt)
{
    announceReference(eos);
    if (!(c.Tc() > 0.0))
        return factorOne(eos, c, "no critical temperature is declared, so"
                                 " whether a saturated vapour exists cannot"
                                 " be told");
    //  CONTINUITY IN T (C239).  Above T_cap = capFraction Tc the component is
    //  a hypothetical liquid; its saturated-vapour coefficient is HELD at the
    //  value it has at T_cap, with the caller's own Psat(T_cap).  The factor
    //  is then continuous in T, so a MESH Newton iterate crossing Tc sees no
    //  jump in the residual (the old rule jumped from ~0.7 to 1 at Tc).
    const scalar Tcap = capFraction * c.Tc();
    if (T > Tcap && psatAt)
    {
        holdAnnounce(eos, c, T, Tcap);
        T = Tcap;
        Psat = psatAt(Tcap);
    }
    else if (!(T < c.Tc()))
        return factorOne(eos, c, "T = " + std::to_string(T) + " K is at or"
                                 " above its Tc = " + std::to_string(c.Tc())
                                 + " K and no saturation curve is supplied");
    if (!(T > 0.0) || !(Psat > 0.0) || !std::isfinite(Psat))
        return factorOne(eos, c, "its saturation pressure is not a finite"
                                 " positive number at the trial T");
    sVector e(n, 0.0);
    e[i] = 1.0;
    scalar v = 0.0;
    try { v = eos.phi(T, Psat, e)[i]; }
    catch (const std::exception& ex)
    { return factorOne(eos, c, std::string("the EoS refused: ") + ex.what()); }
    if (!(v > 0.0) || !std::isfinite(v))
        return factorOne(eos, c, "the EoS returned a non-finite coefficient");
    if (!(c.Vliq() > 0.0))
    {
        poyntingOne(eos, c);
        return v;
    }
    //  The constant-volume Poynting form reads the record's datum as stored,
    //  at whatever `VliqT` it belongs to (C378): at the system temperature a
    //  25 C volume is no better a constant, and a cryogen has none.
    return v * std::exp(c.Vliq() * (P - Psat) / (constant::R * T));
}

} // namespace Choupo
