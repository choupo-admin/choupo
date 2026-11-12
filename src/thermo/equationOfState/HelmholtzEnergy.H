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
    Choupo::helmholtz::ReducedHelmholtz

Description
    THE KERNEL OF A REFERENCE (MULTIPARAMETER) EQUATION OF STATE.

    A reference equation of state is ONE function: the Helmholtz energy of
    the pure fluid as a function of density and temperature, written in
    reduced form

        alpha(delta, tau) = f(rho, T) / (R T) = alpha0(delta, tau) + alphar(delta, tau)

        delta = rho / rho_c          (reduced density)
        tau   = T_c / T              (inverse reduced temperature)

    alpha0 is the IDEAL-GAS part (it carries the ideal-gas heat capacity and
    the zeros of energy and entropy); alphar is the RESIDUAL part, a sum of
    empirical terms fitted to measurements.  Every thermodynamic property
    is a combination of alpha and its partial derivatives -- pressure,
    enthalpy, entropy, heat capacities, speed of sound, the fugacity
    coefficient -- so the whole equation of state is THIS FILE plus a list
    of coefficients.  The coefficients are DATA: they live in a record
    (data/standards/parameters/Helmholtz/<equation>.dat), read from the
    equation's primary publication, never in this source.

    Each term returns the six quantities every property needs:

        a     = alpha
        a_d   = d alpha / d delta          (tau held)
        a_dd  = d2 alpha / d delta2
        a_t   = d alpha / d tau            (delta held)
        a_tt  = d2 alpha / d tau2
        a_dt  = d2 alpha / d delta d tau

    THE TERM TYPES (each documented with its equation at its definition in
    HelmholtzEnergy.cpp):

      ideal part
        logDelta        ln(delta)                                (always)
        lead            a1 + a2 tau
        logTau          a3 ln(tau)
        power           n tau^t
        planckEinstein  n ln(1 - exp(-gamma tau))
      residual part
        power           n delta^d tau^t
        exponential     n delta^d tau^t exp(-delta^c)
        gaussian        n delta^d tau^t exp(-alpha (delta-eps)^2 - beta (tau-gamma)^2)
        nonAnalytic     n Delta^b delta psi            (the critical-region
                        terms of IAPWS-95; Delta, theta, psi in the .cpp)

    The derivatives are ANALYTIC (hand-derived, one block per term type);
    no finite difference is taken anywhere in the kernel.  The gate
    bin/curate/check_reference_eos.py re-derives every term in an
    independent Python implementation and holds both to the publication's
    own check values.

SourceFiles
    HelmholtzEnergy.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {
namespace helmholtz {

// alpha and its five partial derivatives at one (delta, tau).
struct Derivs
{
    scalar a    = 0.0;
    scalar a_d  = 0.0;
    scalar a_dd = 0.0;
    scalar a_t  = 0.0;
    scalar a_tt = 0.0;
    scalar a_dt = 0.0;

    Derivs& operator+=(const Derivs& o)
    {
        a += o.a; a_d += o.a_d; a_dd += o.a_dd;
        a_t += o.a_t; a_tt += o.a_tt; a_dt += o.a_dt;
        return *this;
    }
};

// One GROUP of terms of one type (e.g. the 44 exponential terms of
// IAPWS-95).  The parameter columns are the publication's table columns;
// a column a type does not use stays empty.
struct TermGroup
{
    std::string type;                 // "power", "exponential", ...
    bool        ideal = false;        // part of alpha0 (else alphar)
    std::vector<scalar> n, d, t, c;   // coefficient + exponents
    // gaussian: alpha, beta, gamma, epsilon;  planckEinstein: gamma
    std::vector<scalar> alpha, beta, gamma, epsilon;
    // nonAnalytic: a, b, B, C, D, A (beta shared with the gaussian column)
    std::vector<scalar> na, nb, nB, nC, nD, nA;

    std::size_t size() const { return n.size(); }

    // Contribution of term k of this group at (delta, tau).
    Derivs term(std::size_t k, scalar delta, scalar tau) const;
    // Sum over the group.
    Derivs sum(scalar delta, scalar tau) const;
};

// The whole reduced Helmholtz energy: the ideal groups + the residual groups.
class ReducedHelmholtz
{
public:
    // Read the `ideal {}` and `residual {}` blocks of a record.  Every group
    // REQUIRES its full set of columns, all of one length; an unknown group
    // name is REFUSED by name (a typo must not drop a term silently).
    void read(const DictPtr& ideal, const DictPtr& residual,
              const std::string& recordPath);

    Derivs ideal   (scalar delta, scalar tau) const;   // alpha0 (incl. ln delta)
    Derivs residual(scalar delta, scalar tau) const;   // alphar

    const std::vector<TermGroup>& groups() const { return groups_; }
    std::size_t nResidualTerms() const;

private:
    std::vector<TermGroup> groups_;
};

} // namespace helmholtz
} // namespace Choupo
