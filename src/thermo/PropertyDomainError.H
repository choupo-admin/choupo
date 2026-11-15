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
Class
    Choupo::PropertyDomainError

Description
    A LIQUID-PROPERTY ROUTE THAT CANNOT ANSWER, AND WHY (DEV.md 4c C378 rule
    7-8; docs/design/thermophysical-slice0-plan.md section 3).  Three kinds:

        outsideHardDomain  the state is outside what the method can describe
                           (a component above its critical temperature for a
                           saturated-liquid volume);
        invalidState       the state itself is not a state (an empty or
                           non-finite composition, a non-finite volume);
        missingDatum       a datum or a model the route needs is absent.

    IT DERIVES FROM std::runtime_error AND what() IS THE MESSAGE THE ENGINE
    PRINTED BEFORE SLICE 0, byte for byte: every `catch` in the tree catches
    it exactly as it caught the runtime_error it replaced.  It deliberately
    does NOT derive from InfeasibleTrial (core/InfeasibleTrial.H): a solver
    that catches that type rejects the step instead of failing, which would
    change behaviour.  Letting a solver reject a step on an outside-the-
    domain trial is the pilot's decision, not slice 0's.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/InfeasibleTrial.H"

#include <stdexcept>
#include <string>
#include <utility>

namespace Choupo {

struct PropertyDomainError : public std::runtime_error
{
    enum class Kind { outsideHardDomain, invalidState, missingDatum };

    PropertyDomainError(Kind k, const std::string& message, std::string remedyText = "")
      : std::runtime_error(message), kind(k), remedy(std::move(remedyText)) {}

    Kind        kind;
    std::string remedy;   // what would let the route answer; "" for an invalid state
    //  THE ONE REFUSAL A MIXTURE MAY DO WITHOUT (C398 review row TG-18): a
    //  component asked for a pure-LIQUID volume at or above its critical
    //  temperature -- a gas dissolved in the liquid.  pricedDensity::select
    //  drops it and the caller publishes the dropped fraction; every other
    //  hard refusal of a pure liquid propagates.  Set only where that is the
    //  reason (ThermoPackage's Rackett branch, the pure-fluid leaf's Tc test).
    bool aboveCriticalTemperature = false;

    PropertyDomainError& markedAboveCriticalTemperature()
    { aboveCriticalTemperature = true; return *this; }

    static const char* kindName(Kind k)
    {
        switch (k)
        {
            case Kind::outsideHardDomain: return "outsideHardDomain";
            case Kind::invalidState:      return "invalidState";
            case Kind::missingDatum:      return "missingDatum";
        }
        return "?";
    }
};

//  THE SAME REFUSAL, AS A REJECTABLE TRIAL (DEV.md 4c C378 pilot; the
//  density pilot plan, section 7).  The pilot's entry,
//  liquidProperty::density, throws this for a state outside a hard domain or
//  not a state: it derives from InfeasibleTrial, so a solver that can reject
//  a step (Wegstein's extrapolation, a Newton line search on tears, the 1-D
//  safeguarded Newton) rejects it and tries another; a seed, a converged or a
//  final state reaches main's handler and fails the run with this message and
//  its remedy.  The slice-0 wrapper keeps throwing PropertyDomainError, so no
//  existing consumer changes behaviour.
struct PropertyDomainTrial : public InfeasibleTrial
{
    PropertyDomainTrial(PropertyDomainError::Kind k, const std::string& message,
                        std::string remedyText = "")
      : InfeasibleTrial(message), kind(k), remedy(std::move(remedyText)) {}

    PropertyDomainError::Kind kind;
    std::string               remedy;
};

//  A HARD REFUSAL IS NEVER TURNED INTO A NUMBER (DEV.md 4c C398 slice (c),
//  review row TG-01).  Called FIRST inside a `catch (...)` /
//  `catch (const std::exception&)` handler on a property path: when the
//  exception being handled is a PropertyDomainError of kind outsideHardDomain
//  -- a table asked outside its points, a density route outside its hard
//  domain -- it is rethrown, unchanged, so no fallback, default, skipped term
//  or "trial refused" branch can publish a number in its place; any other
//  exception returns here and the handler goes on as before.  missingDatum and
//  invalidState keep the behaviour the struct above guarantees (every catch
//  catches them as it caught the runtime_error they replaced): those
//  fallbacks are announced debts the property layout turns into refusals in
//  its own, later slices.  Only call it while an exception is being handled.
inline void rethrowHardRefusal()
{
    try { throw; }
    catch (const PropertyDomainError& e)
    {
        if (e.kind == PropertyDomainError::Kind::outsideHardDomain) throw;
    }
    catch (...) {}
}

} // namespace Choupo
