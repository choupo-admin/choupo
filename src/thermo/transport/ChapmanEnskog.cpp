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

#include "ChapmanEnskog.H"
#include "NeufeldOmega.H"
#include "core/Advisory.H"
#include "core/Origin.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

scalar ChapmanEnskog::kernel(scalar M, scalar sigma_A, scalar epsK, scalar T)
{
    //  Svehla eq. (1): eta [muP] = 26.693 sqrt(M T) / (sigma^2 Omega(2,2)*),
    //  T* = kT/eps.  1 muP = 1e-7 Pa.s.
    const scalar Tstar = T / epsK;
    const scalar Omega = neufeld::omega22(Tstar);
    const scalar eta_uP = 26.693 * std::sqrt(M * T) / (sigma_A * sigma_A * Omega);
    return eta_uP * 1.0e-7;
}

const ChapmanEnskog::SvehlaAnchor& ChapmanEnskog::svehlaAnchor()
{
    //  Read from the page image of NASA TR R-132, Table III, report page 90
    //  (PDF page 92): the N2 panel's header M = 28.02, sigma = 3.798,
    //  eps/k = 71.4 and its 300 K row, eta x 10^6 = 177.7.
    static const SvehlaAnchor a{ "N2", 28.02, 3.798, 71.4, 300.0, 177.7, 90 };
    return a;
}

std::string ChapmanEnskog::unavailableReason(const Component& c) const
{
    if (c.hasLennardJones()) return "";
    return "no lennardJones {} block on the record -- draft one from Svehla"
           " 1962 with bin/curate/propose_lennard_jones.py (writes to"
           " data/local/lennardJones/), review it, then promote";
}

scalar ChapmanEnskog::viscosityGasPure(const Component& c, scalar T) const
{
    if (!c.hasLennardJones())
        throw std::runtime_error("ChapmanEnskog gas viscosity: component '"
            + c.name() + "' carries no `lennardJones { sigma; epsOverK; }`"
            " block, and this model has no default sigma to fall back on."
            "  Remedy: bin/curate/propose_lennard_jones.py drafts the block"
            " from Svehla (1962) NASA TR R-132 into data/local/lennardJones/"
            " for review; promote it into the record, or declare"
            " `viscosity { model Chung; }`, which needs only Tc/Pc/omega.");

    //  ANNOUNCED, once per component per run: what the two constants ARE.
    //  A fitted pair (Svehla method 1, `measuredFit` -> regressed) and an
    //  estimated one price the gas through the same equation and differ
    //  only here, so this is the one place the difference can be said.
    auto word = [](Origin o) -> std::string
    {
        switch (o)
        {
            case Origin::regressed:  return "FITTED to measured transport data";
            case Origin::literature: return "MEASURED (a reported value)";
            case Origin::estimated:  return "ESTIMATED";
            case Origin::predictive: return "PREDICTED by a model";
            case Origin::assumed:    return "ASSUMED";
            case Origin::placeholder:return "a PLACEHOLDER";
            default:                 return "of UNATTRIBUTED origin";
        }
    };
    const bool soft = c.ljSigmaOrigin() != Origin::regressed
                   || c.ljEpsOverKOrigin() != Origin::regressed;
    AdvisoryLog::instance().add(
        "provenance", soft ? "warning" : "info",
        "ChapmanEnskog gas viscosity, component '" + c.name() + "'",
        "Lennard-Jones sigma is " + word(c.ljSigmaOrigin())
        + (c.ljSigmaMethod().empty() ? "" : " (" + c.ljSigmaMethod() + ")")
        + "; eps/k is " + word(c.ljEpsOverKOrigin())
        + (c.ljEpsOverKMethod().empty() ? "" : " (" + c.ljEpsOverKMethod() + ")")
        + (c.ljSource().empty() ? "; source NOT declared on the block"
                                : "; source: " + c.ljSource())
        + (c.ljLicence().empty() ? "; licence word NOT declared" : ""));

    return kernel(c.MW(), c.ljSigma() * 1.0e10, c.ljEpsOverK(), T);
}

std::string ChapmanEnskog::windowNote(const Component& c, scalar T) const
{
    if (!c.hasLennardJones()) return "";
    const scalar Tstar = T / c.ljEpsOverK();
    if (Tstar < neufeld::TSTAR_LO || Tstar > neufeld::TSTAR_HI)
        return "T* = kT/eps = " + std::to_string(Tstar) + " is outside the"
               " Neufeld fit's stated domain 0.3 <= T* <= 100 -- the"
               " collision integral is extrapolated";
    return "";
}

CorrelationVerify ChapmanEnskog::verify() const
{
    CorrelationVerify v;
    v.kind = "arithmetic";

    //  (i) TRANSCRIPTION of the shared collision-integral fit: Omega(2,2)*
    //  at T* = 1 against the literal its one home carries.  Chung checks the
    //  same literal; if it fails, THIS is the failing anchor and the Svehla
    //  reproduction is not reached.
    const scalar om = neufeld::omega22(1.0);
    const scalar omDev = std::abs(om - neufeld::OMEGA22_AT_ONE) / neufeld::OMEGA22_AT_ONE;
    if (omDev > 1.0e-4)
    {
        v.value_choupo = om;
        v.value_published = neufeld::OMEGA22_AT_ONE;
        v.dev = omDev;
        v.anchor = "Neufeld Omega(2,2)* at T* = 1 against the fit's own "
                   "literal (NeufeldOmega.H): the TRANSCRIPTION of the shared "
                   "collision-integral home is wrong, so the Svehla "
                   "reproduction below was not attempted";
        return v;
    }

    //  (ii) THE SVEHLA REPRODUCTION.  Fed his own M, sigma and eps/k for N2,
    //  the engine must return his printed eta at 300 K (Table III, report
    //  page 90).  His table used the Hirschfelder 1954 Omega tables (report
    //  page 3, "reference 1, pages 1126-1127"); this engine uses the Neufeld
    //  1972 fit -- so the residual is two Omega sources disagreeing, plus his
    //  four-figure printing.  Measured 2026-09-06: the fit reads 0.40 % BELOW
    //  the table at 300 K (0.1-0.8 % across seven gases, 1.8 % for water at
    //  T* = 0.37, near the fit's lower edge).  The tolerance is DECLARED at
    //  1 % and printed beside the row; this is an ARITHMETIC anchor -- his
    //  eta is computed, not measured -- and it checks the constant 26.693,
    //  the unit chain and the shared Omega, nothing about any gas.
    const SvehlaAnchor& a = svehlaAnchor();
    v.value_choupo = kernel(a.M, a.sigma_A, a.epsOverK, a.T_K) * 1.0e7;  // muP
    v.value_published = a.eta_uP_printed;
    v.dev = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.tolerance = SVEHLA_TOLERANCE;
    v.anchor = std::string("Svehla (1962) NASA TR R-132, Table III, report page ")
             + std::to_string(a.reportPage) + ": " + a.molecule + " at "
             + "300 K with HIS M = 28.02, sigma = 3.798 A, eps/k = 71.4 K must "
               "return his printed eta x 10^6 = 177.7 muP.  ARITHMETIC: his "
               "table is COMPUTED from the same eq. (1) over the Hirschfelder "
               "1954 Omega tables; the residual is the Neufeld fit against "
               "those tables plus four-figure printing (0.40 % measured "
               "2026-09-06), so the tolerance is declared at 1 %.  Checks the "
               "constant 26.693, the muP -> Pa.s chain and the shared Omega "
               "home -- nothing about any gas Choupo holds (Omega(2,2)* at "
               "T* = 1 was checked first against its literal)";
    return v;
}

} // namespace Choupo
