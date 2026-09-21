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
    choupoSemiContinuous

Description
    The fifth problem class (ruled 2026-09-20, Vitor: "Como e que um aluno
    sabe que choupoCtrl simula um reactor feed and bleed?!  Cria a classe
    semiContinuous!").  The time-integrated flowsheet of unit operations
    connected by streams whose internal states are NON-STATIONARY, WITHOUT
    a control loop: continuous transients (start-up, a disturbance),
    fed-batch, feed & bleed.  Equation form: dY/dt = f(Y, t).

    It is the dynamic driver (src/dynamicDriver/) and nothing else -- the
    same integration choupoCtrl runs, minus the control layer.  A case that
    declares a `controllers (...)` block is REFUSED by name: a control loop
    is choupoCtrl's class.  The capability existed before the name did (a
    dynamicCSTR with a continuous inlet and outlet, chained by the router,
    ran under choupoCtrl with controllers optional); the student could not
    find it because the binary was called Ctrl.

    Usage:  choupoSemiContinuous [case_dir]
\*---------------------------------------------------------------------------*/

#include "dynamicDriver/DynamicDriver.H"

using namespace Choupo;

int main(int argc, char** argv)
{
    //  No control layer: the Controller and Signal factories are NOT
    //  registered here, and the driver refuses a case that would need them.
    static const char* USAGE =
        "Usage: choupoSemiContinuous [options] [case-directory]\n"
        "\n"
        "  Transient flowsheet solver, no control loop (start-up,\n"
        "  disturbance, fed-batch, feed & bleed).  With no case directory\n"
        "  it runs the current directory.  A case with a `controllers`\n"
        "  block belongs to choupoCtrl and is refused here.\n"
        "\n"
        "  --version, -V     print the banner (which carries version and commit)\n"
        "  --help, -h        this text\n";

    DynamicDriverConfig cfg;
    cfg.binaryName   = "choupoSemiContinuous";
    cfg.bannerSuffix = "  semiContinuous";
    cfg.usage        = USAGE;
    cfg.instantTag   = "semiContinuous";
    cfg.controlLoop  = DynamicDriverConfig::ControlLoop::refused;
    return runDynamicDriver(argc, argv, cfg);
}
