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
    Choupo::HeatTransferCorrelation

Description
    Selectable convective heat-transfer-coefficient correlation --- the heat
    twin of MassTransferModel.  Where the membrane mass-transfer model gives
    a Sherwood number Sh = f(Re, Sc) -> k_film, this gives a Nusselt number
    Nu = f(Re, Pr) -> h = Nu lambda / d_h.

    Explicit-factory pattern (like MassTransferModel / EquationOfState): a
    `tubeSide { model <name>; }` / `shellSide { model <name>; }` sub-block of
    the heat-exchanger `operation` picks the concrete correlation.  Built-ins:

        DittusBoelter  --  Nu = 0.023 Re^0.8 Pr^n  (n = 0.4 heating, 0.3
                           cooling); the classic turbulent tube correlation.
        Gnielinski     --  Nu = (f/8)(Re-1000)Pr /
                           [1 + 12.7 sqrt(f/8)(Pr^(2/3)-1)];  the modern,
                           lower-scatter tube correlation (default tube-side).
        Kern           --  Nu = 0.36 Re_s^0.55 Pr^(1/3);  the shell-side
                           (Kern method) correlation (default shell-side).

    The unit op owns the geometry (it computes the velocity u, the hydraulic
    diameter d_h, the crossflow mass flux G_s for the shell) and the fluid
    properties; the correlation is the thin "given the hydraulics, what is
    the Nusselt number / h".  Each correlation also EXPOSES Re, Pr, Nu and a
    validity flag for the glass-box SEE, and carries a verify() pinned to a
    published Nu anchor (wired into the choupoProps heatTransferBench).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

// Local channel hydraulics + fluid properties at one side of the exchanger.
struct HeatTransferContext
{
    scalar u      = 0.0;     // characteristic velocity [m/s]
    scalar d_h    = 0.0;     // hydraulic / equivalent diameter [m]
    scalar lambda = 0.0;     // fluid thermal conductivity [W/(m.K)]
    scalar mu     = 0.0;     // dynamic viscosity [Pa.s]
    scalar rho    = 0.0;     // density [kg/m^3]
    scalar cp     = 0.0;     // MASS-specific heat capacity [J/(kg.K)]
    bool   heating = true;   // is this side being heated? (Dittus-Boelter n)
};

// The glass-box result of one correlation evaluation: the dimensionless
// numbers, the film coefficient, and whether the call was inside the
// correlation's stated validity window.
struct HeatTransferResult
{
    scalar Re = 0.0;
    scalar Pr = 0.0;
    scalar Nu = 0.0;
    scalar h  = 0.0;         // film coefficient [W/(m^2.K)]
    bool   inValidity = true;
    std::string validityNote;   // "" when inside; a WARN string otherwise
};

class HeatTransferCorrelation
{
public:
    using Factory = std::function<std::unique_ptr<HeatTransferCorrelation>()>;

    virtual ~HeatTransferCorrelation() = default;

    virtual const std::string& type() const = 0;

    // The stated validity window, for the SEE block.
    virtual const std::string& validityWindow() const = 0;

    // Read model-specific parameters (none for the built-ins; hook for fits).
    virtual void readParameters(const DictPtr& /*dict*/) {}

    // Evaluate Nu/h at this station, returning the full glass-box result.
    virtual HeatTransferResult evaluate(const HeatTransferContext& c) const = 0;

    // Self-check against a PUBLISHED Nu anchor.  Returns the absolute relative
    // deviation |Nu_choupo - Nu_published| / Nu_published at the anchor point;
    // the bench (choupoProps heatTransferBench) prints it and the anchor's
    // source.  An unwired self-check is itself a no-silent-crutch violation.
    struct VerifyResult
    {
        scalar dev = 0.0;        // abs relative deviation at the anchor
        scalar Nu_choupo = 0.0;
        scalar Nu_published = 0.0;
        std::string anchor;      // human-readable point + source citation
    };
    virtual VerifyResult verify() const = 0;

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<HeatTransferCorrelation> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
