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
    src/applications/choupoProps/wasmEntry.cpp

Description
    JS-callable entry point for the WebAssembly build of choupoProps.
    Same pattern as the other three binaries' wasmEntry.cpp; see
    src/applications/choupoSolve/wasmEntry.cpp for the rationale.
\*---------------------------------------------------------------------------*/

#if defined(__EMSCRIPTEN__)

#include <emscripten/emscripten.h>

int main(int argc, char** argv);

extern "C" {

EMSCRIPTEN_KEEPALIVE
int run_case(const char* caseDir)
{
    char arg0[] = "choupoProps";
    char* dirCopy = const_cast<char*>(caseDir);
    char* argv[] = { arg0, dirCopy, nullptr };
    return main(2, argv);
}

} // extern "C"

#endif // __EMSCRIPTEN__
