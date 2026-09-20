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
File
    src/dynamicDriver/DynamicDriver.H

Description
    The dynamic driver: ONE home for the time-integrated flowsheet of
    dynamic unit operations (0/ seeding, unit construction, the forward
    router, the fixed-RK4 and adaptive-Rosenbrock time loops, the
    accepted-step balance ledger, the trajectory and instant writers, the
    RTD / frequency-response accumulators, the end-of-run caveat block, the
    result emission and the outerDict functor).  Two application classes
    run it, and the difference between them is DECLARED here, not inferred
    anywhere inside the driver:

        choupoCtrl            driver + the CONTROL layer  (src/control/)
        choupoSemiContinuous  driver alone -- no control loop

    Sits in the band of outerDriver / postProcessing / reporting
    (module-boundaries.md §1): it reads unitOperations/dynamic, control, io,
    result and outerDriver, and nothing in the runtime reads it back --
    only an application's main does.

    Extracted verbatim from choupoCtrl/main.cpp, 2026-09-20; record in
    docs/design/a-class-a-student-can-name.md.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo
{

//  What ONE application tells the driver about itself.  Every field is a
//  NAME or a TEXT the driver prints or stamps -- never a switch on physics:
//  the driver's arithmetic is the same under every application that runs it.
struct DynamicDriverConfig
{
    //  The binary's own name: prefixes every refusal the driver raises
    //  ("choupoCtrl routing: ..."), and is the default `application` word
    //  echoed in the run header when a controlDict declares none.
    std::string binaryName;

    //  The banner suffix printBanner() pads into the box ("  ctrl").
    std::string bannerSuffix;

    //  The binary's one-screen --help text (Banner.H owns the version, the
    //  application owns what it does).
    const char* usage = "";

    //  The `application` word SolutionWriter stamps on every real-time
    //  instant directory it writes under solutionControl { write true; }.
    std::string instantTag;
};

//  Run one application over a case directory: argv handling, registration
//  of every model family the dynamic units construct, the load phase, the
//  campaign functor and (when system/outerDict is present) the outer driver
//  around it.  Returns the process exit code: 0 converged, 1 not, 2 on a
//  refusal (printed to stderr as `ERROR: ...`).
int runDynamicDriver(int argc, char** argv, const DynamicDriverConfig& cfg);

} // namespace Choupo
