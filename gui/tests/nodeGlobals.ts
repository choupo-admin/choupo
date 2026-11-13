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
\*---------------------------------------------------------------------------*/

/*  Globals the browser has and Node 18 lacks, for the test runner only.
 *
 *  `File` is a global from Node 20; Node 18 (the 2026 laptop's runtime,
 *  18.19.1) carries the same class in `node:buffer` but not on `globalThis`,
 *  so every test that builds a File threw "File is not defined" there while
 *  passing in CI.  Installed only when absent: on Node 20+ this does nothing.
 */
import { File as NodeFile } from "node:buffer";

if (typeof (globalThis as { File?: unknown }).File === "undefined")
  Object.assign(globalThis, { File: NodeFile });
