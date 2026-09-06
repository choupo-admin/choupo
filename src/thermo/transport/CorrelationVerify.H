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
    Choupo::CorrelationVerify

Description
    THE RESULT OF A TRANSPORT CORRELATION PROVING ITSELF -- one struct for
    the five transport families (gas viscosity, gas conductivity, gas
    diffusivity, liquid viscosity, liquid conductivity), on the
    FrictionFactorCorrelation::VerifyResult precedent (2026-08-25).

    Every registered transport model answers three questions the friction
    and Nusselt families already answer: WHERE is it valid
    (`validityWindow()`), WHO says so (`citation()`), and DOES IT REPRODUCE
    the one thing about itself that can be checked without a measurement
    (`verify()`).  This header carries the third answer.

    WHAT AN ANCHOR IS HERE, said plainly so a 0.000 % deviation is never read
    as a validation.  The transport catalogue holds NO measured viscosities,
    conductivities or diffusivities, so no anchor below is a datum.  Each is
    one of two kinds, and `kind` says which:

      * "theory"     -- an identity kinetic theory or the correlation's own
                        author supplies: Eucken on a monatomic gas MUST give
                        lambda = (15/4) R mu / M; Wilke's phi_ii MUST be 1.
                        A wrong constant fails here.
      * "arithmetic" -- the correlation's own closed form at a stated point
                        (Blasius's kind).  This checks the transcription and
                        the units, and NOTHING about the physics.

    A model whose anchor is arithmetic says so in its `anchor` string; the
    bench prints the string beside the citation so the reader can tell the
    two kinds apart on the same line.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

struct CorrelationVerify
{
    scalar dev = 0.0;               // abs relative deviation at the anchor
    scalar value_choupo = 0.0;      // what the correlation returned
    scalar value_published = 0.0;   // what it had to return
    std::string anchor;             // the point + where the number comes from
    std::string kind;               // "theory" | "arithmetic"
    //  The tolerance THIS anchor claims (relative).  0 means "the bench's
    //  default" (1e-4: an identity or a six-figure literal).  An anchor that
    //  reproduces a PUBLISHED TABLE rather than its own closed form -- the
    //  Chapman-Enskog model against Svehla's printed viscosity, where the
    //  residual is two collision-integral sources disagreeing -- declares a
    //  looser one here and the bench prints it beside the row, so a reader
    //  sees that the tolerance was DECLARED and not quietly loosened.
    scalar tolerance = 0.0;
};

} // namespace Choupo
