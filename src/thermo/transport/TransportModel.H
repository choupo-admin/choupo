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
    Choupo::TransportModel

Description
    Abstract base for transport-property correlations (viscosity, and
    later thermal conductivity, diffusivity).  Built-in correlations
    register through `TransportModel::registerModel(name, factory)`, the
    same explicit-factory pattern as ActivityModel / EquationOfState.

    Selected in the thermoPackage:

        transport
        {
            model       Chung;      // low-pressure gas viscosity
        }

    The pure-component methods take a Component so a correlation can read
    Tc / Pc / omega / MW directly; mixture rules live in ThermoPackage
    (e.g. Wilke for gas viscosity).
\*---------------------------------------------------------------------------*/

#pragma once

#include "CorrelationVerify.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Component;   // forward; the.cpp includes the full definition

class TransportModel
{
public:
    virtual ~TransportModel() = default;

    virtual const std::string& modelName() const = 0;

    // ---- What every correlation must state about itself (2026-09-05) ----
    //  The FrictionFactorCorrelation discipline, applied to this family:
    //  WHERE it is valid, in its own authors' words; WHO says so -- the
    //  PRIMARY citation, because a correlation whose source is a comment is
    //  one the reader cannot check; and a self-check against the one thing
    //  about itself that can be verified with no measurement (see
    //  CorrelationVerify.H for the two kinds of anchor).  PURE VIRTUAL on
    //  purpose: a model registered without them does not compile, so the
    //  family cannot grow a member that stays silent about its window.
    virtual const std::string& validityWindow() const = 0;
    virtual const std::string& citation() const = 0;
    virtual CorrelationVerify verify() const = 0;

    //  A COMPUTABLE window verdict at one (component, T), for the bench's
    //  comparison table: "" when the point is inside the window, a note
    //  naming the reason otherwise.  NOT pure: a family member whose window
    //  is text-only (a fitted per-record range) returns "" and the bench
    //  prints its validityWindow() string beside the value instead, so a
    //  blank never reads as "checked and inside".
    virtual std::string windowNote(const Component& /*c*/, scalar /*T_K*/) const
    { return ""; }

    //  WHY THIS MODEL CANNOT PRICE THIS COMPONENT, or "" when it can
    //  (2026-09-06).  A model that needs a record datum some components
    //  lack -- Chapman-Enskog and the lennardJones block -- answers here so
    //  the bench can LIST the component as not evaluable, by reason, instead
    //  of skipping it in silence or aborting the whole comparison.  The hot
    //  path does not consult it: there the model REFUSES by name.  NOT pure:
    //  a model that reads only what every record carries returns "".
    virtual std::string unavailableReason(const Component& /*c*/) const
    { return ""; }

    // Pure-component low-pressure gas viscosity [Pa·s].
    virtual scalar viscosityGasPure(const Component& c, scalar T_K) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<TransportModel>(const DictPtr&)>;

    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<TransportModel> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableModels();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
