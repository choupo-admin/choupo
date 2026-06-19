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
    src/applications/choupoSolve/registerUserTypesStub.cpp

Description
    Empty default implementation of the build-time user-types hook.  The
    normal `choupoSolve` binary links THIS file, so `registerUserTypes()`
    does nothing.

    When a case ships its own unit ops under `case/code/`, `bin/buildCode`
    builds a per-case binary that links the case's own.cpp files under
    `code/` (which provide their own `registerUserTypes()`) instead of
    this stub --- so
    the new types are registered at start-up with NO runtime dlopen and
    NO macro self-registration.  The case author owns that code; it never
    enters src/.
\*---------------------------------------------------------------------------*/

// Defined in the global namespace to match the extern declaration in
// main.cpp and to spare the case author any namespace ceremony.
void registerUserTypes() {}
