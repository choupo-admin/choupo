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
    //  With the window the refusing law answers in (C398 review).
    PropertyDomainTrial(PropertyDomainError::Kind k, const std::string& message,
                        std::string remedyText, double lo, double hi)
      : InfeasibleTrial(message, lo, hi), kind(k), remedy(std::move(remedyText)) {}

    PropertyDomainError::Kind kind;
    std::string               remedy;
};

//  A RECORD LAW'S HARD WINDOW REFUSING A STATE NO SEARCH INVENTED (C398
//  review row CV-19): an inlet, a 0/ stream, an operation's fixed T, a
//  converged answer read back.  Outside every trial frame (core/Advisory.H)
//  the refusal is this type, which no solver rejects and no enthalpy fallback
//  turns into a degraded datum; inside a trial frame it is a
//  PropertyDomainTrial, which a solver may reject.
struct HardWindowRefusal : public PropertyDomainError
{
    HardWindowRefusal(const std::string& message, std::string remedyText)
      : PropertyDomainError(Kind::outsideHardDomain, message, std::move(remedyText)) {}
};

} // namespace Choupo
