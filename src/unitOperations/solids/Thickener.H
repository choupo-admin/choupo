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
    Choupo::Thickener

Description
    A CONTINUOUS GRAVITY THICKENER SIZED FROM ONE BATCH SETTLING TEST
    (DEV.md 4c C361 slice 4; docs/design/c361-solids-processing.md section 8).

    THE DATA: the case declares the test -- its initial solids concentration
    C_0 [kg/m3 of slurry] and the interface (mudline) height H at a series of
    times, starting at t = 0, H = H_0.  The curve must fall monotonically;
    it is the student's measurement and is drawn as given.

    KYNCH'S CONSTRUCTION (Kynch 1952; as Talmage & Fitch 1955 eqs. 4-6, pp.
    38-39 and Wills & Napier-Munn 2006 eq. 15.4, p. 387 print it): the
    tangent to the curve at (t, H) meets the height axis at H_i; the layer
    then at the interface has the concentration C = C_0 H_0 / H_i and
    settles at v = -dH/dt, the tangent's slope.  The slope at a point is the
    derivative of the parabola through that point and its two neighbours
    (the numerical choice, stated; a student draws it by eye).

    Two models, both from that one curve:

      talmageFitch  (Talmage & Fitch 1955 eqs. 7-10 and steps 1-5, p. 39;
                    Wills eq. 15.6, p. 387; Perry 9th ed. eq. 18-54, p.
                    18-64): the underflow line H_u = C_0 H_0 / C_u; the
                    tangent at the COMPRESSION POINT (declared,
                    `compressionTime`: Perry says every way of picking it is
                    empirical, so the student picks it and the unit draws
                    it) meets H_u at t_u; the area is
                        A = W t_u / (C_0 H_0).
                    When H_u lies ABOVE the compression point, t_u is where
                    the curve itself crosses H_u (Talmage & Fitch p. 39).
      coeClevenger  (Coe & Clevenger 1916 as Wills eq. 15.5, p. 387 prints
                    it, with the (C, v) pairs taken from the single curve by
                    Kynch's construction, as Wills p. 387 says may be done):
                        A = max over C < C_u of  W (1/C - 1/C_u) / v(C).

    W is the solids mass flow [kg/s].  Both areas are always published; the
    `model` says which one sizes the unit.  The unit area [m2 per t/d] is
    A / W in those units.

    THE STREAMS: an ideal thickener -- every solid leaves in the underflow
    at the target concentration C_u; its liquid is (1 - C_u/rho_s) rho_l /
    C_u per kg of solids (rho_s the particle density, rho_l the package's
    liquid density); the overflow is the rest of the liquid, clarified.
    The liquid splits by one fraction, componentwise, and the overflow is
    the DIFFERENCE, so the balance closes to the last bit (printed).  No
    work, no heat: both products leave at the feed's T and P.

    REFUSED, by name: a feed with no solids or no liquid; a test that does
    not start at t = 0, whose times do not increase or whose heights rise; a
    target underflow at or below C_0 or above what the test reached
    (H_u below the last height measured); C_u at or above the solid's own
    density; a compression time outside the test; an underflow that would
    need more liquid than the feed brings.  ANNOUNCED: a test run at a
    concentration other than the feed's (Talmage & Fitch p. 40 ask for the
    expected feed concentration).

    Inputs ( feed );   outputs ( underflow overflow );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Thickener : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    std::string                   type_ = "thickener";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
