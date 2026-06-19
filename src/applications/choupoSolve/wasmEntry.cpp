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
    src/applications/choupoSolve/wasmEntry.cpp

Description
    JS-callable entry point for the WebAssembly build.

    Emscripten 3.1.6 + MODULARIZE=1 does NOT auto-call main() from the
    factory — INVOKE_RUN is silently a no-op in that mode.  Rather than
    fight the Emscripten code-gen, we expose a plain `run_case`
    function with __attribute__((used)) so the linker keeps it, mark
    it EMSCRIPTEN_KEEPALIVE so the glue exports it, and call it from
    `gui/public/workers/solverWorker.js` after the factory resolves.

    The C++ side just forwards argv = ["choupoSolve", caseDir] to
    the existing main().  Nothing else changes.
\*---------------------------------------------------------------------------*/

#if defined(__EMSCRIPTEN__)

#include <emscripten/emscripten.h>

// Declare main as having C++ linkage so we can call it directly.
int main(int argc, char** argv);

extern "C" {

EMSCRIPTEN_KEEPALIVE
int run_case(const char* caseDir)
{
    char arg0[] = "choupoSolve";
    // Cast away const: main() does not modify argv but the prototype
    // is the historical `char** argv` shape.
    char* dirCopy = const_cast<char*>(caseDir);
    char* argv[] = { arg0, dirCopy, nullptr };
    return main(2, argv);
}

} // extern "C"

#endif // __EMSCRIPTEN__
