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

#include "Banner.H"

#include <iostream>
#include <string>

namespace Choupo {

void printBanner(const char* suffix)
{
    // The runtime banner mirrors the source-file header (the Choupo column-tree),
    // with the build VERSION on the first line.  Raw strings keep the \|/ art
    // literal.  No License block here -- that lives in the file headers.
    const std::string ver = std::string("Choupo  ") + CHOUPO_VERSION + suffix;

    std::cout
        << R"CH(/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | )CH" << ver << "\n"
        << R"CH(      \\|//      H eat-transfer | Open-source, glass-box chemical process simulator
     \\\|///     O perations    | https://choupo.org
      \\|//      U nits         |
       \|/       P roperties    | Copyright (C) 2026 Vítor Geraldes
        |        O ptimization  | Licence: GPL-3.0-or-later
       /|\                      |
\*---------------------------------------------------------------------------*/
)CH" << "\n";
}

} // namespace Choupo
