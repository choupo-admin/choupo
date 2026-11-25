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
    IPTrace.H

Description
    What the interior-point run prints and records (docs/design/interior-point.md
    sec. 3.4; Theory Guide sec:ip-barrier).  One line per iteration with the
    columns below, and one EVENT line for each change of the barrier
    parameter, each inertia correction, each restoration entry and exit:

      it  mu  phi_mu  theta  inf_du  compl  ||dx||  dw  inertia  a_pr  a_du  ls  type  |F|

      mu       barrier parameter of the iteration
      phi_mu   barrier objective f - mu sum ln(slack to each bound)
      theta    infeasibility ||c(x)||_1 (the filter's first axis)
      inf_du   scaled dual infeasibility    ||grad f + A lambda - zL + zU||_inf / s_d
      compl    scaled complementarity       max |slack z - mu| / s_c
      ||dx||   infinity norm of the primal step
      dw       the Hessian regularisation Algorithm IC settled on (0: none)
      inertia  (positive, negative, zero) of the KKT matrix as factored
      a_pr     primal step length of the accepted trial; a_du dual
      ls       number of line-search trials (1 = the full fraction-to-the-
               boundary step was accepted)
      type     phi    accepted with the Armijo condition (the filter is unchanged)
               theta  accepted by the filter margins (the filter gains a corner)
               resto  the iteration left the restoration phase
      |F|      number of corners in the filter

    The same numbers are kept in IPTrace::rows for a test or an EduTool that
    reads the run instead of re-computing it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "solver/ip/SymmetricIndefinite.H"

#include <cstddef>
#include <cstdio>
#include <ostream>
#include <string>
#include <vector>

namespace Choupo::solver
{

struct IPIterationRecord
{
    std::size_t iteration = 0;
    scalar mu = 0.0, phi = 0.0, theta = 0.0, infDu = 0.0, compl_ = 0.0, dxNorm = 0.0;
    scalar dw = 0.0, dc = 0.0;
    Inertia inertia;
    scalar alphaPr = 0.0, alphaDu = 0.0;
    std::size_t lineSearchTrials = 0;
    std::string type = "-";
    std::size_t filterSize = 0;
};

class IPTrace
{
public:
    std::vector<IPIterationRecord> rows;
    std::vector<std::string>       events;

    //- When set, every row and event is also printed here as it happens.
    std::ostream* live = nullptr;

    static std::string headerLine()
    {
        return "  it   mu        phi_mu      theta      inf_du     compl      ||dx||     dw       dc       "
               "inertia       a_pr     a_du    ls  type   |F|";
    }

    static std::string format(const IPIterationRecord& r)
    {
        char buf[320];
        std::snprintf(buf, sizeof buf,
                      "%4zu  %-8.1e  %-10.3e  %-9.2e  %-9.2e  %-9.2e  %-9.2e  %-7.1e  %-7.1e  (%zu,%zu,%zu)%*s  %-7.1e  %-7.1e %3zu  %-6s %3zu",
                      r.iteration, r.mu, r.phi, r.theta, r.infDu, r.compl_, r.dxNorm, r.dw, r.dc,
                      r.inertia.positive, r.inertia.negative, r.inertia.zero, 3, "",
                      r.alphaPr, r.alphaDu, r.lineSearchTrials, r.type.c_str(), r.filterSize);
        return buf;
    }

    void header()
    {
        if (live) *live << headerLine() << '\n';
    }

    void record(const IPIterationRecord& r)
    {
        rows.push_back(r);
        if (live) *live << format(r) << '\n';
    }

    void event(const std::string& text)
    {
        events.push_back(text);
        if (live) *live << "      -- " << text << '\n';
    }
};

} // namespace Choupo::solver
