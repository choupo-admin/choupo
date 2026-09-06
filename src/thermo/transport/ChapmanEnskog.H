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
Class
    Choupo::ChapmanEnskog

Description
    Low-pressure gas viscosity from kinetic theory with the Lennard-Jones
    (12-6) potential -- the Chapman-Enskog first approximation, in the form
    Svehla (1962) states as his equation (1), report page 2:

        eta x 10^6 [micropoise] = 26.693 sqrt(M T) / (sigma^2 Omega(2,2)*)

    M in g/mol, T in K, sigma in angstrom, Omega(2,2)*(T*) the reduced
    collision integral at T* = kT/epsilon, evaluated here from the Neufeld
    (1972) fit in its one home, transport/NeufeldOmega.H.  The same formula
    is Hirschfelder, Curtiss & Bird (1954), Molecular Theory of Gases and
    Liquids, eq. 8.2-18, with the constant 266.93 x 10^-7 in g/(cm s); the
    equation actually READ for this implementation is Svehla's restatement,
    and it is cited by page.

    WHAT IT READS.  The component's `lennardJones { sigma; epsOverK; }`
    block -- sigma and eps/k FITTED to measured viscosities (Svehla's
    method 1) or estimated by one of his other 22 methods, each value
    carrying its own origin word.  A component WITHOUT the block REFUSES by
    name with the curation remedy; there is no default sigma.  Every
    component this model prices is ANNOUNCED once per run with the origin
    of both constants and the source they were read from, so an estimated
    pair never travels as a measured one.

    WHAT IT DOES NOT DO.  Nothing here is compared with a measurement
    Choupo holds -- the catalogue carries no measured viscosity.  The verify
    anchor reproduces Svehla's OWN printed eta (his Table III is computed
    from the same equation with the same constants, using the Hirschfelder
    tables of Omega instead of the Neufeld fit), so the residual it reports
    is two collision-integral sources disagreeing plus his four-figure
    printing -- an ARITHMETIC anchor with a declared tolerance, and its text
    says so.  The window is the Neufeld fit's own 0.3 <= T* <= 100; leaving
    it is announced per component and the integral is extrapolated.

    PRIMARY: Svehla, R. A. (1962), Estimated viscosities and thermal
    conductivities of gases at high temperatures, NASA TR R-132, eq. (1),
    report page 2 (US government work, public domain); Hirschfelder, J. O.,
    Curtiss, C. F. and Bird, R. B. (1954), Molecular Theory of Gases and
    Liquids, eq. 8.2-18 [the theory]; Neufeld, Janzen & Aziz (1972) for the
    collision-integral fit.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

namespace Choupo {

class ChapmanEnskog : public TransportModel
{
public:
    explicit ChapmanEnskog(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    scalar viscosityGasPure(const Component& c, scalar T_K) const override;
    CorrelationVerify verify() const override;
    std::string windowNote(const Component& c, scalar T_K) const override;
    std::string unavailableReason(const Component& c) const override;

    //  THE KERNEL, public and static: Svehla eq. (1) in the paper's own
    //  units on the way in, Pa.s on the way out.  One home for the formula,
    //  reachable by verify(), the bench and the gate without a Component.
    static scalar kernel(scalar M_g_per_mol, scalar sigma_A,
                         scalar epsOverK_K, scalar T_K);        // Pa.s

    //  The Svehla reproduction anchor's inputs, as LITERALS read from the
    //  report: N2 on report page 90 (PDF page 92), M = 28.02, sigma = 3.798,
    //  eps/k = 71.4, T = 300 K, eta x 10^6 = 177.7.  Public so the gate can
    //  recompute the anchor from the same declaration it reads here.
    struct SvehlaAnchor
    {
        const char* molecule; scalar M; scalar sigma_A; scalar epsOverK;
        scalar T_K; scalar eta_uP_printed; int reportPage;
    };
    static const SvehlaAnchor& svehlaAnchor();
    //  Declared, not measured: the tolerance the reproduction anchor claims.
    //  The deviation observed on 2026-09-06 was 0.40 % (the fit below the
    //  table); the claim is 1 %, and the gate recomputes the deviation.
    static constexpr scalar SVEHLA_TOLERANCE = 1.0e-2;

private:
    inline static const std::string name_ = "ChapmanEnskog";
    inline static const std::string window_ =
        "dilute (low-pressure) gas of a NON-POLAR or weakly polar molecule "
        "whose Lennard-Jones sigma and eps/k are on the record; T* = kT/eps "
        "inside the Neufeld fit's stated domain 0.3 <= T* <= 100 (leaving it "
        "is announced per component).  Svehla's own summary (report page 1) "
        "states the potential was chosen for its realism and the "
        "availability of estimation methods, not fitted per property";
    inline static const std::string cite_ =
        "Svehla, R. A. (1962), Estimated viscosities and thermal "
        "conductivities of gases at high temperatures, NASA TR R-132, eq. (1) "
        "report page 2 [equation read; public domain]; Hirschfelder, J. O., "
        "Curtiss, C. F. and Bird, R. B. (1954), Molecular Theory of Gases and "
        "Liquids, eq. 8.2-18 [theory]; collision integral Neufeld, P. D., "
        "Janzen, A. R. and Aziz, R. A. (1972), J. Chem. Phys. 57(3), 1100-1102";
};

} // namespace Choupo
