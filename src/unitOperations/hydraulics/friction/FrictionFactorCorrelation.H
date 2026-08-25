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
    Choupo::FrictionFactorCorrelation

Description
    THE DARCY FRICTION FACTOR, AS A SELECTABLE, SELF-VERIFYING OBJECT.

    This is the heat correlation's hydraulic twin, and it exists because the
    pattern had been built ONCE and applied to ONE family.  Choupo already
    computed Blasius, Haaland, Colebrook-White and Churchill -- correctly,
    with their citations in comments -- as free functions inside `Pipe.cpp`.
    A student could not name them, could not evaluate one without building a
    pipe around it, could not see where each stops being valid, and had no
    way to learn that they DISAGREE.

    `HeatTransferCorrelation` had already solved all of that for Nusselt:
    a declared validity window, a `verify()` pinned to a published anchor,
    and a bench that runs every registered correlation and prints the
    deviation WITH its source.  Nothing here is new architecture.  What is
    new is that a second family gets it.

    THE DISAGREEMENT IS THE LESSON, and it is the reason a catalogue of
    correlations is worth building at all.  Four expressions answer the same
    question -- what is f at this Re and this roughness? -- and they do not
    agree:

      * Blasius (1913) is a smooth-pipe power law with NO roughness term at
        all.  Ask it about a rough pipe and it answers anyway, confidently,
        and it is simply wrong; its window is the whole content of that
        warning.
      * Colebrook-White (1939) is the implicit classical reference the Moody
        chart is drawn from.  It is what the others approximate.
      * Haaland (1983) is an explicit fit to Colebrook, published as being
        within about 2 % of it.
      * Churchill (1977) is a single expression covering laminar, transition
        AND turbulent flow, so it is the only one of the four that answers at
        all below Re = 2300.

    A simulator that picks one and says nothing teaches that f is a fact.  It
    is a correlation, and which one you chose is part of your answer.

    EACH CORRELATION STATES ITS OWN WINDOW AND IS ASKED TO PROVE ITSELF.  The
    `verify()` anchor is a point taken from a published source, not from
    Choupo; `frictionBench` (choupoProps) runs them all and prints the
    deviation beside the citation.  An unwired self-check is itself a
    no-silent-crutch violation -- the bench is the wire, exactly as it is for
    the Nusselt family.

    WHAT THIS IS NOT.  It is not a new physics decision: `Pipe` computes the
    same numbers it computed before, through the factory instead of an
    if-chain, and its goldens do not move.  The unit op still owns the
    hydraulics (velocity, diameter, roughness, Reynolds); the correlation is
    the thin "given Re and eps/D, what is f".
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

//  The hydraulic state one correlation is asked about.  Two numbers, because
//  that is genuinely all the Darcy factor depends on for a circular duct --
//  and saying so is part of the lesson.
struct FrictionContext
{
    scalar Re       = 0.0;   // Reynolds number [-]
    scalar relRough = 0.0;   // relative roughness eps/D [-]
};

//  The glass-box result: the factor, and whether the question was inside the
//  window the correlation's own authors stated.
struct FrictionResult
{
    scalar f = 0.0;              // Darcy friction factor [-]
    bool   inValidity = true;
    std::string validityNote;    // "" when inside; a WARN string otherwise
    std::string regime;          // "laminar" | "transition" | "turbulent"
};

class FrictionFactorCorrelation
{
public:
    using Factory = std::function<std::unique_ptr<FrictionFactorCorrelation>()>;

    virtual ~FrictionFactorCorrelation() = default;

    virtual const std::string& type() const = 0;

    //  The window its OWN authors stated, in words, for the report.
    virtual const std::string& validityWindow() const = 0;

    //  The primary citation.  A correlation whose source is a comment is a
    //  correlation the reader cannot check -- the 2026-08-05 rule, applied
    //  to a formula instead of a datum.
    virtual const std::string& citation() const = 0;

    virtual FrictionResult evaluate(const FrictionContext& c) const = 0;

    //  Self-check against a PUBLISHED f anchor.
    struct VerifyResult
    {
        scalar dev = 0.0;          // abs relative deviation at the anchor
        scalar f_choupo = 0.0;
        scalar f_published = 0.0;
        std::string anchor;        // the point + where the number comes from
    };
    virtual VerifyResult verify() const = 0;

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<FrictionFactorCorrelation> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
