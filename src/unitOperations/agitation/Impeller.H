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
-------------------------------------------------------------------------------
Namespace
    Choupo::agitation

Description
    AN IMPELLER IS AN ASSET RECORD (DEV.md 4c C421 (7), R7; kind `impeller` in the
    flat assets home, data/standards/assets/, or the case's own constant/assets/).

    What an impeller-and-tank assembly contributes to the power of a stirred vessel
    is a fact of the IMPELLER, not of the fluid and not of the unit (R7): the
    Metzner-Otto constant k_s, with its stated uncertainty, and the laminar power
    constant K_p (or the turbulent power number), each with its source.  The
    liquid's flow curve is the fluid's (the property dictionary); the speed and
    the vessel are the unit's.  `agitatedVessel` joins the three.

        name   helicalRibbon_Example85;      kind impeller;      type helicalRibbon;
        provenance { origin literature; citation "..."; basis "..."; }
        geometry                                  // ratios, as the source states them
        {
            Nr 2;  clearanceRatio 0.05;           // (D_T - D)/D
            W_over_D 0.08;  s_over_D 1.0;  H_over_D 1.5;
        }
        shearConstant { ks 30; uncertainty 0.275; source "..."; }   // gamma_avg = ks N (eq. 8.9)
        laminarPower
        {
            Kp correlation;  correlation helicalRibbon87;           // eq. 8.7, window printed
            KpUncertainty 0.20;                                      // the correlation's stated error
            ReCritical { a 183; b -0.3333333; source "eq. 8.24"; }   // Re_cr = a Po^b : the end of the laminar line
        }
        turbulentPower { Po 1.27; source "Table 8.1"; }              // optional, constant Po above Re_cr = 6370 Po^(-1/3)

    `Kp <value>;` states the constant directly instead of `correlation`.  A record
    that gives no end of the laminar line (`ReCritical` or `ReMax`) is refused:
    "laminar power" past its line is a refusal, not a number (R9).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace agitation {

struct ImpellerRecord
{
    std::string name, type, home, citation, basis, origin;
    std::map<std::string, scalar> geometry;
    scalar ks = 0.0, ksUncertainty = 0.0;              // -, relative
    std::string ksSource;
    bool        hasKpValue = false;
    scalar      Kp = 0.0;                              // when stated
    std::string correlation;                           // "" | helicalRibbon87
    scalar      KpUncertainty = 0.0;                   // relative
    bool        hasReCritical = false;
    scalar      ReCritA = 0.0, ReCritB = 0.0;          // Re_cr = a Po^b
    std::string ReCritSource;
    bool        hasReMax = false;
    scalar      ReMax = 0.0;
    bool        hasPoTurbulent = false;
    scalar      PoTurbulent = 0.0;
    std::string PoSource;
};

//  Reads the record `name` from the case's constant/assets/ (any level of the case's
//  geography) first, then data/standards/assets/; refuses a missing one naming the
//  places searched.
ImpellerRecord loadImpeller(const std::string& name);

//  K_p of the record: the stated value, or the correlation at the record's geometry.
//  `outside` receives the words of every geometry ratio outside the correlation's
//  stated data range (empty when inside, or when no correlation is used).
scalar laminarKp(const ImpellerRecord& r, std::vector<std::string>* outside = nullptr);

} // namespace agitation
} // namespace Choupo
