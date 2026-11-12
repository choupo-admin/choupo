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
    Choupo::liquidProperty

Description
    THE ONE DOOR to a liquid property (DEV.md 4c C378, rule 1; slice 0 of
    docs/design/thermophysical-slice0-plan.md, section 3).

    A consumer asks for ONE property (density, viscosity, surface tension)
    of ONE liquid at a state (T, P, the liquid's own mole fractions) and
    receives the value AND the method that produced it:

        const auto r = liquidProperty::evaluate(thermo, Property::density,
                                                T, P, x, {"pump", name()});
        const scalar rho = r.value;   // r.label says which method

    IN SLICE 0 THE DOOR IS A WRAPPER: the value is the package's own
    `density` / `viscosityLiquid` / `surfaceTension`, the same double, and a
    refusal is the package's own (a PropertyDomainError whose what() is the
    message the engine printed before).  What the door ADDS is the
    description -- read from the decision the package takes, never written
    beside it -- and, when a consumer is named, the record of the use
    (core/PropertySourceLog.H), which the run prints and publishes.

    Quality is three statements on the catalogue's existing words
    (docs/design/provenance-semantics-five-axes.md): where the value comes
    from (`origin`, `provenance`), whether the state is inside a declared
    domain (`domain`), and the quantitative evidence or "not quantified".
    Diffusivity has no request here yet: which solute in which medium is
    decided at its own slice (TR-13).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace liquidProperty {

enum class Property { density, viscosity, surfaceTension };

//  The word the tables and the result use: liquidDensity, liquidViscosity,
//  surfaceTension.
const char* name(Property p);

struct Consumer
{
    std::string type;    // a unit type, or a sizing item ("sizing.storage")
    std::string unit;    // its name in the case
};

struct Leaf
{
    std::string component;
    std::string methodId;
    scalar      share = 0.0;     // mole fraction in the request
};

struct Quality
{
    std::string origin;          // Origin.H word: literature | regressed | predictive | estimated
    std::string provenance;      // the record or publication the datum came from
    std::string domain;          // "not declared" in slice 0 unless the method states one
    std::string evidence;        // a stated uncertainty, or "not quantified"
};

struct Result
{
    scalar            value = 0.0;
    std::string       methodId;          // stable word
    std::string       label;             // generated from the route that ran
    std::vector<Leaf> leaves;            // one per component, for a composite method
    bool              pressureApplied = false;
    Quality           quality;
};

//  Evaluate through the package.  `who` (when given) records the use;
//  `leftOut` names components the CALLER left out of `x` (pricedDensity).
Result evaluate(const ThermoPackage& thermo, Property p, scalar T_K, scalar P_Pa,
                const sVector& x, const Consumer* who = nullptr,
                const std::string& leftOut = "");

inline Result evaluate(const ThermoPackage& thermo, Property p, scalar T_K,
                       scalar P_Pa, const sVector& x, const Consumer& who,
                       const std::string& leftOut = "")
{
    return evaluate(thermo, p, T_K, P_Pa, x, &who, leftOut);
}

} // namespace liquidProperty
} // namespace Choupo
