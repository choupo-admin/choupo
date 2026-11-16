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
    _lkpProbe  (a curation probe, not a shipped binary)

Description
  _lkpProbe -- the Lee-Kesler correlation asked WITHOUT a package (a curation
  probe, not a shipped binary).  DEV.md 4c C408 (d).

  `check_lee_kesler_ploecker` uses it to read the correlation at a reduced
  state (T_r, P_r) and an acentric factor on a NAMED ROOT, so a table entry
  that lies in the two-phase region (three roots) is asked on the root the
  table prints, which a package-level call cannot always do.

  Request lines, one per line, on the file given as the first argument:

      BLEND L|V Tr Pr omega
          -> OK Z lnphi h s  Zs lnphis hs ss  Zr lnphir hr sr  Vrs Vrr
             the blend (LK Eq. 2) then the simple and reference fluid's own
             values; h = H^R/(R T), s = S^R/R.
      ROOTS Tr Pr
          -> OK VrL_simple VrV_simple VrL_ref VrV_ref

  Compiled against libchoupo.so by the gate; calls nothing but the two public
  statics of Choupo::LeeKeslerPloecker.
\*---------------------------------------------------------------------------*/

#include "thermo/equationOfState/LeeKeslerPloecker.H"

#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

using namespace Choupo;

int main(int argc, char** argv)
{
    if (argc != 2)
    {
        std::cerr << "usage: _lkpProbe <requestFile>\n";
        return 2;
    }
    std::ifstream in(argv[1]);
    std::ostringstream out;
    out.precision(17);
    std::string line;
    while (std::getline(in, line))
    {
        if (line.empty()) continue;
        std::istringstream ls(line);
        std::string op;
        ls >> op;
        try
        {
            if (op == "BLEND")
            {
                std::string root; scalar Tr = 0, Pr = 0, om = 0;
                ls >> root >> Tr >> Pr >> om;
                const auto b = LeeKeslerPloecker::blend(Tr, Pr, om, root == "L");
                out << "OK " << b.Z << " " << b.lnPhi << " " << b.hOverRT << " " << b.sOverR
                    << " " << b.simple.Z << " " << b.simple.lnPhi << " " << b.simple.hOverRT
                    << " " << b.simple.sOverR
                    << " " << b.reference.Z << " " << b.reference.lnPhi
                    << " " << b.reference.hOverRT << " " << b.reference.sOverR
                    << " " << b.simple.Vr << " " << b.reference.Vr << "\n";
            }
            else if (op == "ROOTS")
            {
                scalar Tr = 0, Pr = 0, a, b, c, d;
                ls >> Tr >> Pr;
                LeeKeslerPloecker::roots(LeeKeslerPloecker::simpleFluid, Tr, Pr, a, b);
                LeeKeslerPloecker::roots(LeeKeslerPloecker::referenceFluid, Tr, Pr, c, d);
                out << "OK " << a << " " << b << " " << c << " " << d << "\n";
            }
            else
                out << "ERR unknown request " << op << "\n";
        }
        catch (const std::exception& e)
        {
            out << "ERR " << e.what() << "\n";
        }
    }
    std::cout << "<<<PROBE\n" << out.str() << "PROBE>>>\n";
    return 0;
}
