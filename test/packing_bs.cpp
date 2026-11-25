/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
  Standalone test of unitOperations/distillation/PackingBS (Billet & Schultes
  1999) on fixed states: prints one line per (packing, u_V) with the law's
  results at 17 digits; bin/curate/check_billet_schultes.py compares them with
  bin/curate/billet_schultes_reference.py, a second transcription of the
  paper's equations.  Prints "PACKING_BS_OK" at the end.
  Build (standalone):
      g++ -std=c++17 -Isrc test/packing_bs.cpp \
          src/unitOperations/distillation/PackingBS.cpp -o packing_bs
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "unitOperations/distillation/PackingBS.H"

#include <cstdio>
#include <string>

using namespace Choupo;

int main()
{
    struct Row { const char* name; PackingBS::Geometry g; };
    auto geo = [](scalar a, scalar e, scalar CS, scalar CFl, scalar Ch, scalar CP0, scalar CL, scalar CV)
    {
        PackingBS::Geometry g;
        g.ap = a; g.eps = e; g.CS = CS; g.CFl = CFl; g.Ch = Ch; g.CP0 = CP0; g.CL = CL; g.CV = CV;
        g.colDiameter = 0.5;
        return g;
    };
    const Row rows[] = {
        {"PallRing-metal-25",   geo(223.5, 0.954, 2.627, 2.083, 0.719, 0.957, 1.440, 0.336)},
        {"Raschig-ceramic-25",  geo(190.0, 0.680, 2.454, 1.899, 0.577, 1.329, 1.361, 0.412)},
        {"PallRing-plastic-50", geo(111.1, 0.919, 2.816, 1.757, 0.593, 0.698, 1.239, 0.368)},
    };
    //  (packing, u_V, L/V mass ratio) -- the same list as billet_schultes_reference.py CASES
    struct Case { int row; scalar uV, LV; };
    const Case cases[] = {
        {0, 0.5, 1.0}, {0, 1.0, 1.0}, {0, 1.4, 1.0}, {1, 0.5, 1.0}, {1, 1.0, 1.0}, {1, 1.4, 1.0},
        {0, 1.0, 0.1}, {0, 0.2, 8.0}, {0, 0.7, 8.0}, {2, 1.2, 0.1}, {2, 0.8, 8.0},
    };
    for (const Case& cs : cases)
    {
        const Row& row = rows[cs.row];
        PackingRBF::State s;
        s.rhoG = 3.0; s.rhoL = 680.0; s.muG = 1.0e-5; s.muL = 4.0e-4; s.sigma = 0.0198;
        s.DL = 3.0e-9; s.DG = 4.0e-6; s.lambda = 0.9;
        s.UGs = cs.uV; s.ULs = cs.uV * s.rhoG / s.rhoL * cs.LV;
        const PackingBS::Result r = PackingBS::evaluate(row.g, s);
        if (r.flooded)
        {
            std::printf("%s %g %g FLOODED uS=%.17g uFl=%.17g\n", row.name, cs.uV, cs.LV, r.uVS, r.uVFl);
            continue;
        }
        std::printf("%s %g %g OK uS=%.17g uFl=%.17g hLS=%.17g hL=%.17g ae=%.17g kL=%.17g kG=%.17g"
                    " HG=%.17g HL=%.17g HOG=%.17g dPdry=%.17g dP=%.17g ubar=%.17g aOverA=%.17g\n",
                    row.name, cs.uV, cs.LV, r.uVS, r.uVFl, r.hLS, r.hL, r.ae, r.kL, r.kG, r.HG, r.HL,
                    r.HOG, r.dPdry, r.dP, r.uLeff, r.aPhOverAp);
    }
    std::printf("PACKING_BS_OK\n");
    return 0;
}
