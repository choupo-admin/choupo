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
    This file is part of Choupo (GPL-3.0-or-later).  See ExtractionShortcutOp.H.
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */

#include "ExtractionShortcutOp.H"
#include "unitOperations/separation/ExtractionShortcut.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int ExtractionShortcutOp::run(const DictPtr& dict, const ThermoPackage&, int verbosity)
{
    namespace xs = extractionShortcut;
    auto in = dict->subDict("inputs");
    const scalar Xf = in->lookupScalar("Xf");
    const scalar Xr = in->lookupScalar("Xr");
    const scalar Ys = in->lookupScalar("Ys");
    const scalar K  = in->lookupScalar("K");

    const bool haveE = in->found("extractionFactor");
    const bool haveSlopes = in->found("slopes");
    if (haveE == haveSlopes)
        throw std::runtime_error("extractionShortcut: declare EXACTLY ONE of "
            "`extractionFactor` and `slopes { m1 mr S F }` in `inputs`");
    scalar E = 0.0;
    if (haveE) E = in->lookupScalar("extractionFactor");
    else
    {
        auto sl = in->subDict("slopes");
        E = std::sqrt(sl->lookupScalar("m1") * sl->lookupScalar("mr"))
            * sl->lookupScalar("S") / sl->lookupScalar("F");
    }

    scalar Xfe = Xf, Yse = Ys;
    if (dict->found("pseudoSolute"))
    {
        auto p = dict->subDict("pseudoSolute");
        const scalar S = p->lookupScalar("S"), Eo = p->lookupScalar("E");
        const scalar F = p->lookupScalar("F"), R = p->lookupScalar("R");
        const scalar Ye = p->lookupScalar("Ye");
        Xfe = xs::pseudoFeed(Xf, S, Eo, F, Ye);
        Yse = xs::pseudoSolvent(Ys, F, R, S, Xr);
        diag_["XfB"] = Xfe;
        diag_["YsB"] = Yse;
    }

    const scalar N = xs::stages(Xfe, Xr, Yse, K, E);
    if (std::isnan(N))
        throw std::runtime_error("extractionShortcut: no finite stage count for these "
            "inputs (E <= 0, or Xr not above Ys/K)");
    diag_["N"] = N;
    diag_["E"] = E;
    diag_["fractionTaken"]    = xs::fractionTaken(N, E);
    diag_["fractionRequired"] = (Xfe - Xr) / (Xfe - Yse / K);
    diag_["N_or"] = xs::transferUnits(N, E);
    if (dict->found("pseudoSolute")) diag_["N_caseB"] = N;

    if (verbosity >= 2)
        std::cout << "\n=====================  extractionShortcut  ==========================\n"
                  << std::fixed << std::setprecision(5)
                  << "  Xf = " << Xfe << "  Xr = " << Xr << "  Ys = " << Yse << "  K = " << K
                  << "  E = " << E << "\n"
                  << "  N (Eq. 15-43)             = " << N << " theoretical stages\n"
                  << "  fraction taken (Treybal)  = " << diag_["fractionTaken"]
                  << "   vs (Xf-Xr)/(Xf-Ys/K) = " << diag_["fractionRequired"] << "\n"
                  << "  N_or = N ln E/(1-1/E)     = " << diag_["N_or"] << " transfer units\n"
                  << "  A CHECK on a straight equilibrium line, not a design.\n"
                  << "=====================================================================\n";
    return 0;
}

} // namespace Choupo
