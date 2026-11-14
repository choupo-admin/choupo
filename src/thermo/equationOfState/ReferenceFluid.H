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
    Choupo::helmholtz::ReferenceFluid

Description
    A PURE FLUID DESCRIBED BY A REFERENCE EQUATION OF STATE: the reduced
    Helmholtz energy of HelmholtzEnergy.H, its reducing constants and gas
    constant, and the publication's own CHECK VALUES, all read from ONE
    record, data/standards/parameters/Helmholtz/<equation>.dat (case-local
    constant/parameters/Helmholtz/ first, through records::resolveRecord).

    What it computes, every relation the publication's own (IAPWS R6-95
    Table 3, which every Helmholtz-explicit reference equation shares):

        p   = rho R T (1 + delta ar_d)
        u   = R T tau (a0_t + ar_t)
        h   = R T [1 + tau (a0_t + ar_t) + delta ar_d]
        s   = R [tau (a0_t + ar_t) - a0 - ar]
        g   = R T [1 + a0 + ar + delta ar_d]
        cv  = -R tau^2 (a0_tt + ar_tt)
        cp  = cv + R (1 + delta ar_d - delta tau ar_dt)^2
                    / (1 + 2 delta ar_d + delta^2 ar_dd)
        w^2 = R T [1 + 2 delta ar_d + delta^2 ar_dd
                   - (1 + delta ar_d - delta tau ar_dt)^2 / (tau^2 (a0_tt + ar_tt))]
        ln phi = ar + delta ar_d - ln(1 + delta ar_d)      (fugacity coefficient)

    The equation is EXPLICIT in (rho, T).  Everything else is a root search,
    and both are bracketed and stated:

      * density at (T, p) -- `roots(T, p)` scans the isotherm and returns
        EVERY root with its mechanical stability (dp/drho > 0) and its Gibbs
        energy; `density(T, p)` returns the stable one (lowest g) and says
        which branch it is.  Below T_c a (T, p) off the saturation curve has
        a stable root and possibly a metastable one; the caller is told both.
      * saturation at T (T_triple <= T < T_c) -- by the MAXWELL criterion,
        equal pressure and equal Gibbs energy in the two phases, solved by a
        safeguarded Newton on p inside the bracket the isotherm's own
        SPINODALS give.  No ancillary equation is used, not even as a seed:
        the spinodals bracket the answer, so the kernel needs nothing but
        the equation itself.

    VERIFICATION is the record's: `verify()` evaluates every check value the
    publication prints and compares it AT THE PUBLISHED PRECISION (half a
    unit in the last printed digit).  A record whose own check values are
    not reproduced is REFUSED -- a mistranscribed coefficient is worse than
    no equation.

SourceFiles
    ReferenceFluid.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "HelmholtzEnergy.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {
namespace helmholtz {

// All properties at one (T, rho), per unit MASS (the publications' basis).
struct State
{
    scalar T = 0.0, rho = 0.0;     // [K], [kg/m3]
    scalar delta = 0.0, tau = 0.0;
    scalar p  = 0.0;               // [Pa]
    scalar u  = 0.0, h = 0.0;      // [J/kg]
    scalar s  = 0.0;               // [J/(kg K)]
    scalar g  = 0.0;               // [J/kg]
    scalar cv = 0.0, cp = 0.0;     // [J/(kg K)]
    scalar w  = 0.0;               // [m/s]
    scalar lnPhi = 0.0;            // ln(fugacity coefficient) [-]
    scalar dpdrho = 0.0;           // (dp/drho)_T [Pa m3/kg]
    Derivs a0, ar;                 // the reduced Helmholtz energy itself
};

struct DensityRoot
{
    scalar rho = 0.0;
    bool   mechanicallyStable = false;   // dp/drho > 0
    scalar g = 0.0;                      // [J/kg]
    std::string branch;                  // "vapour" | "liquid" | "supercritical"
};

struct Saturation
{
    scalar T = 0.0, psat = 0.0;          // [K], [Pa]
    scalar rhoL = 0.0, rhoV = 0.0;       // [kg/m3]
    State  liquid, vapour;
    int    iterations = 0;               // Newton steps on p
};

// One check value of the publication, and what the engine made of it.
struct CheckResult
{
    std::string table;      // e.g. "Table 7"
    std::string label;      // e.g. "T = 300 K, rho = 996.556 kg/m3: p"
    scalar published = 0.0;
    scalar computed  = 0.0;
    int    digits    = 0;    // significant digits printed
    scalar relDev    = 0.0;
    //  The row's tolerance and the conditioning it was derived from (C378
    //  pilot review, PC-03, PC-17): max(one unit of the last printed digit,
    //  half a unit times the amplification of a last-bit change in the
    //  evaluation for that row).
    scalar tolerance    = 0.0;
    scalar conditioning = 1.0;
    bool   ok        = false;
};

class ReferenceFluid
{
public:
    // Load (once per process, cached by name) the record of `equation`.
    static const ReferenceFluid& load(const std::string& equation);

    const std::string& equation() const { return equation_; }
    const std::string& fluid()    const { return fluid_; }
    const std::string& citation() const { return citation_; }
    const std::string& url()      const { return url_; }
    const std::string& recordPath() const { return path_; }
    const std::string& uncertainty() const { return uncertainty_; }
    scalar Tc() const { return Tc_; }
    scalar rhoc() const { return rhoc_; }
    scalar R() const { return R_; }
    scalar Ttriple() const { return Ttriple_; }
    scalar Tmin() const { return Tmin_; }
    scalar Tmax() const { return Tmax_; }
    scalar pMax() const { return pMax_; }
    const ReducedHelmholtz& alpha() const { return alpha_; }

    State   at(scalar T, scalar rho) const;
    // `unstableCrossings` (out, optional): below T_c, how many times the
    // equation crosses p between the spinodals -- not states, counted.
    std::vector<DensityRoot> roots(scalar T, scalar p,
                                   int* unstableCrossings = nullptr) const;
    // The stable root.  `branch` (out) names it: "liquid", "vapour",
    // "supercritical".
    scalar  density(scalar T, scalar p, std::string* branch = nullptr) const;
    // A named branch (refused by name when that branch has no root at (T,p)).
    scalar  densityOnBranch(scalar T, scalar p, bool liquid) const;
    Saturation saturation(scalar T) const;
    // Second and third virial coefficients [m3/kg], [m6/kg2] at T.
    scalar  B(scalar T) const;
    scalar  C(scalar T) const;

    // Every check value of the record, evaluated.
    std::vector<CheckResult> verify() const;
    // Worst relative deviation over the check values (the PureFluidModel
    // self-check number).
    scalar worstRelativeDeviation() const;

    // The (T, p) window the publication validates, as one sentence.
    std::string windowSentence() const;
    // Announce (stderr + AdvisoryLog) when (T, p) is outside the window --
    // the publication's own statement on extrapolation is part of the text.
    void announceIfOutside(scalar T, scalar p) const;

private:
    void read(const std::string& equation);
    scalar pressure(scalar T, scalar delta) const;
    scalar dpdDelta(scalar T, scalar delta) const;
    // Root of p(T, delta) = p on a MONOTONE branch [dlo, dhi].
    scalar rootOn(scalar T, scalar p, scalar dlo, scalar dhi) const;
    void spinodals(scalar T, scalar& dV, scalar& dL) const;
    scalar branchRoot(scalar T, scalar p, bool liquid, scalar dV, scalar dL) const;

    std::string equation_, fluid_, citation_, url_, path_, uncertainty_;
    std::string extrapolation_;
    scalar Tc_ = 0.0, rhoc_ = 0.0, R_ = 0.0, Ttriple_ = 0.0;
    scalar Tmin_ = 0.0, Tmax_ = 0.0, pMax_ = 0.0;
    ReducedHelmholtz alpha_;
    DictPtr checks_;
    mutable std::map<scalar, Saturation> satCache_;
    mutable std::map<scalar, std::pair<scalar, scalar>> spinCache_;
};

} // namespace helmholtz
} // namespace Choupo
