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
Application
    choupoCtrl

Description
    Dynamic continuous simulation WITH the control layer (the third problem
    class).  Equation form: dY/dt = f(Y, u, t) with control u(t) supplied by
    Controller objects that read measurements off the process and write
    back to manipulated variables.

    The integration itself -- the units, the router, the time loop, the
    ledger, the writers, the result -- is the dynamic driver
    (src/dynamicDriver/), shared with choupoSemiContinuous, which runs the
    same driver with NO control loop.  What this main adds is exactly the
    control layer: it registers the Controller and Signal factories the
    driver will construct from a case's `controllers (...)` block.

    Usage:  choupoCtrl [case_dir]
\*---------------------------------------------------------------------------*/

#include "control/Controller.H"
#include "control/signal/Signal.H"
#include "dynamicDriver/DynamicDriver.H"

using namespace Choupo;

int main(int argc, char** argv)
{
    //  THE CONTROL LAYER -- the one thing this application owns.  Registered
    //  here, explicitly, before the driver runs (the factory contract: no
    //  auto-registration anywhere).  The driver itself registers every other
    //  model family; a binary without a control loop never registers these.
    Signal    ::registerBuiltins();   // forcing-function vocabulary
    Controller::registerBuiltins();

    static const char* USAGE =
        "Usage: choupoCtrl [options] [case-directory]\n"
        "\n"
        "  Dynamic continuous solver with control loops.  With no case\n"
        "  directory it runs the current directory.\n"
        "\n"
        "  --version, -V     print the banner (which carries version and commit)\n"
        "  --help, -h        this text\n";

    DynamicDriverConfig cfg;
    cfg.binaryName   = "choupoCtrl";
    cfg.bannerSuffix = "  ctrl";
    cfg.usage        = USAGE;
    cfg.instantTag   = "ctrl";
    return runDynamicDriver(argc, argv, cfg);
}
