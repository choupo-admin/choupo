/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Description
    See SolidMixture.H.
\*---------------------------------------------------------------------------*/

#include "SolidMixture.H"

#include "core/Advisory.H"

#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace solidMixture {

scalar particleDensity(const ThermoPackage& thermo,
                       const sVector& s,
                       const std::string& unitLabel,
                       int verbosity)
{
    scalar mTot = 0.0, vol = 0.0, rhoOne = 0.0;
    std::size_t nSolids = 0;
    std::string names;
    for (std::size_t i = 0; i < s.size(); ++i)
    {
        if (!(s[i] > 0.0)) continue;
        const Component& c = thermo.comp(i);
        const scalar rp = c.rho_p();
        if (!(rp > 0.0))
            throw std::runtime_error(unitLabel + ": solid '" + c.name()
                + "' has no particle density, and the particle density of the"
                  " solids is needed here (volumes add).  Declare"
                  " `solid { rho_p <kg/m^3>; }` (or, in a unified record,"
                  " `solidPhases.<phase>.crystal { rho_p <kg/m^3>; }`) in the"
                  " component record, or in the case's"
                  " constant/components/" + c.name() + ".  No default density"
                  " is assumed: a density is a material datum and needs a"
                  " source.");
        const scalar mi = s[i] * c.MW();
        mTot += mi;
        vol  += mi / rp;
        rhoOne = rp;
        ++nSolids;
        names += (names.empty() ? "" : ", ") + c.name();
    }
    if (nSolids == 0 || !(mTot > 0.0)) return 0.0;
    if (nSolids == 1) return rhoOne;

    const scalar rho = mTot / vol;
    std::ostringstream rhoTxt;
    rhoTxt << std::fixed << std::setprecision(1) << rho;
    const std::string msg = "the stream carries " + std::to_string(nSolids)
        + " solids (" + names + "): their particle density is the"
          " mass-weighted harmonic mean (volumes additive, ideal mixing) = "
        + rhoTxt.str() + " kg/m3";
    if (AdvisoryLog::instance().add("model", "info", unitLabel, msg)
        && verbosity >= 1)
        std::cout << "  [" << unitLabel << "] " << msg << "\n";
    return rho;
}

void announceDefaultShapeFactor(const Component& c,
                                const std::string& unitLabel,
                                int verbosity)
{
    if (c.kvDeclared()) return;
    const std::string msg = "solid '" + c.name() + "' declares no volume shape"
        " factor k_v: the sphere, k_v = pi/6 = 0.5236, is ASSUMED (V = k_v L^3)."
        "  A shape assumption, not a material datum: declare `k_v` beside"
        " `rho_p` in the record's crystal{} / solid{} block (or the case's"
        " constant/components/" + c.name() + ") to replace it";
    if (AdvisoryLog::instance().add("model", "warning", unitLabel, msg)
        && verbosity >= 1)
        std::cout << "  [" << unitLabel << "] " << msg << "\n";
}

} // namespace solidMixture
} // namespace Choupo
