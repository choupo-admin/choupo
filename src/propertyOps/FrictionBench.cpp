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
\*---------------------------------------------------------------------------*/

#include "FrictionBench.H"

#include "unitOperations/hydraulics/friction/FrictionFactorCorrelation.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

int FrictionBench::run(const DictPtr& dict,
                       const ThermoPackage& /*thermo*/,
                       int verbosity)
{
    diag_.clear();
    const scalar devTol = dict->lookupScalarOrDefault("deviationTolerance", 0.03);

    FrictionFactorCorrelation::registerBuiltins();   // idempotent

    std::ostringstream os;
    os << "\n========  Friction-factor bench  ========\n"
       << "  Each correlation reproduces its OWN published anchor.  The"
          " deviation is\n  printed beside the citation, because a number"
          " whose source a reader cannot\n  see is a number they cannot"
          " check.\n\n";

    bool allPass = true;
    for (const auto& name : FrictionFactorCorrelation::availableTypes())
    {
        auto corr = FrictionFactorCorrelation::New(name);
        const auto v = corr->verify();
        const bool pass = (v.dev <= devTol);
        allPass = allPass && pass;

        diag_["dev_" + name] = v.dev;

        os << "  " << std::left << std::setw(11) << name
           << "  f = " << std::fixed << std::setprecision(6)
           << std::setw(10) << v.f_choupo
           << "  anchor f = " << std::setw(10) << v.f_published
           << "  dev = " << std::setprecision(4) << (100.0 * v.dev) << " %  "
           << (pass ? "[PASS]" : "[FAIL]") << "\n"
           << "               window:   " << corr->validityWindow() << "\n"
           << "               source:   " << corr->citation() << "\n"
           << "               anchor:   " << v.anchor << "\n\n";
    }
    os << "  deviation tolerance = " << std::setprecision(2)
       << (100.0 * devTol) << " %\n";

    // -----------------------------------------------------------------
    //  THE COMPARISON -- optional, and the half that is pedagogy.
    //
    //  Every correlation is asked the SAME question, and the spread is
    //  REPORTED, never adjudicated.  Which one is right depends on the pipe;
    //  a bench that ranked them would be the silent crutch in a louder voice.
    // -----------------------------------------------------------------
    if (dict->found("compare"))
    {
        auto cmp = dict->subDict("compare");
        FrictionContext c;
        c.Re = cmp->lookupScalar("Re");
        c.relRough = cmp->lookupScalarOrDefault("relRough", 0.0);

        if (c.Re <= 0.0)
            throw std::runtime_error("frictionBench: compare.Re must be"
                " positive -- a Reynolds number of zero is not a flow, and"
                " every correlation here divides by it.");

        os << "\n  ---- the same question, four answers ----\n"
           << "  Re = " << std::scientific << std::setprecision(3) << c.Re
           << "   eps/D = " << c.relRough << "\n\n";

        scalar fmin = 0.0, fmax = 0.0;
        //  TWO SPREADS, AND CONFLATING THEM WOULD BE THE LIE THIS BENCH
        //  EXISTS TO PREVENT.  At a rough-pipe point the full spread is
        //  dominated by whichever correlation is being asked outside its own
        //  window -- so a single headline number reads as "the correlations
        //  disagree by 26 %" when the truth is "three agree within 2 % and
        //  one was misused".  Those are different lessons and both matter.
        scalar wmin = 0.0, wmax = 0.0;
        bool first = true, firstW = true;
        std::size_t nOut = 0;
        for (const auto& name : FrictionFactorCorrelation::availableTypes())
        {
            auto corr = FrictionFactorCorrelation::New(name);
            const auto r = corr->evaluate(c);
            diag_["f_" + name] = r.f;
            if (first) { fmin = fmax = r.f; first = false; }
            fmin = std::min(fmin, r.f);
            fmax = std::max(fmax, r.f);
            if (r.inValidity)
            {
                if (firstW) { wmin = wmax = r.f; firstW = false; }
                wmin = std::min(wmin, r.f);
                wmax = std::max(wmax, r.f);
            }
            else ++nOut;

            os << "  " << std::left << std::setw(11) << name
               << "  f = " << std::fixed << std::setprecision(6) << r.f
               << "   (" << r.regime << ")"
               << (r.inValidity ? "" : "   <-- OUTSIDE ITS WINDOW") << "\n";
            if (!r.inValidity)
                os << "               " << r.validityNote << "\n";
        }

        //  THE SPREAD IS A PUBLISHED NUMBER, so a golden can pin the
        //  DISAGREEMENT itself rather than four separate values -- which is
        //  what the lesson is actually about.
        const scalar spread = (fmin > 0.0) ? (fmax - fmin) / fmin : 0.0;
        const scalar wspread = (wmin > 0.0) ? (wmax - wmin) / wmin : 0.0;
        diag_["f_min"] = fmin;
        diag_["f_max"] = fmax;
        diag_["spread_pct"] = 100.0 * spread;
        diag_["spread_inWindow_pct"] = 100.0 * wspread;
        diag_["n_outside_window"] = scalar(nOut);

        os << "\n  spread over ALL " << FrictionFactorCorrelation::availableTypes().size()
           << " = " << std::fixed << std::setprecision(2)
           << (100.0 * spread) << " %\n";
        if (nOut > 0 && !firstW)
            os << "  spread over the " << (FrictionFactorCorrelation::availableTypes().size() - nOut)
               << " INSIDE their window = " << (100.0 * wspread) << " %\n"
               << "  The difference between those two numbers is not a"
                  " disagreement between\n  correlations -- it is "
               << nOut << " correlation(s) being asked a question they were"
                  " never\n  fitted for.  Read them apart.\n";
        else if (firstW)
            os << "  EVERY correlation is outside its window at this point,"
                  " so there is no\n  in-window spread to report -- and no"
                  " answer here that anybody published.\n";
        os << "  The bench does NOT say which is right: that depends on the"
              " pipe, and\n  ranking them here would hide the choice the"
              " engineer has to make.\n";
    }
    os << "=========================================\n\n";

    if (verbosity >= 1) std::cout << os.str();
    diag_["allPass"] = allPass ? 1.0 : 0.0;

    if (!allPass)
        throw std::runtime_error("frictionBench: a correlation deviates from"
            " its own published anchor beyond the tolerance -- check the"
            " coefficient or the formula, and do not loosen the tolerance"
            " silently.");
    return 0;
}

} // namespace Choupo
