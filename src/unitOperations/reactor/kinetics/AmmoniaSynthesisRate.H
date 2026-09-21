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
    Choupo::DysonSimon1968

Description
    THE AMMONIA SYNTHESIS RATE, AS A CITED OBJECT WITH A WINDOW AND AN ANCHOR.

    D. C. Dyson and J. M. Simon, "A kinetic expression with diffusion
    correction for ammonia synthesis on industrial catalyst", Ind. Eng. Chem.
    Fundam. 7 (1968) 605-610.  Equations 2, 6-8, 18, 19, 39 and 40, with the
    Table I constants.

    WHY IT IS AN OBJECT AND NOT A FUNCTION.  This project has already decided
    twice that a correlation is a thing with a declared validity window, a
    `citation()` a reader can check, and a `verify()` anchor it must reproduce
    -- once for the Nusselt family, once for the Darcy friction factor, and
    again for the five transport families.  A rate law is the same kind of
    object and deserves the same treatment: it was fitted, to somebody's data,
    over a stated range, and outside that range it answers anyway.

    WHY IT IS *NOT* A FACTORY FAMILY, said rather than left to be discovered.
    There is exactly one ammonia rate law in this tree.  A registry with one
    entry is a taxonomy with no second member, which is machinery this project
    declines to build before it is needed; the day a second arrives (Temkin-
    Pyzhev is the obvious one, and this expression is a modification of it),
    the three members below are already the base class's interface and the
    refactor is mechanical.

    ============================ A SYMBOL COLLISION ==========================
    READ THIS BEFORE USING xi OR eta ANYWHERE NEAR A REACTOR.

      * Dyson and Simon write  xi   for the EFFECTIVENESS FACTOR (Eq 39/40)
        and                    eta  for the CONVERSION OF NITROGEN.
      * `src/unitOperations/reactor/CatalystPellet.H` -- and most of the
        chemical-reaction-engineering literature -- writes
                               eta  for the EFFECTIVENESS FACTOR.

    The same two letters, swapped.  This file keeps the PAPER's convention
    because every number in it is read off the paper's own equations, and it
    says so at every surface that prints either letter.  A reader who carries
    `eta` across from CatalystPellet will read a conversion as an
    effectiveness factor and size a bed several-fold wrong, silently.
    ==========================================================================

    WHAT THIS DOES NOT DO, and it is deliberate: NOTHING HERE IS WIRED INTO A
    REACTOR.  The four reactors that read `catalystLoading` still evaluate
    their rate at bulk conditions and still ANNOUNCE that they are taking the
    effectiveness factor as 1 (the 2026-08-18 pellet slice).  That
    announcement's meaning is unchanged by this file: it is still true, still
    printed, and still says what it always said.  Wiring this expression into
    a bed is NEW PHYSICS with a catalyst volume, a pressure drop and an axial
    integration behind it, and it is not this slice.  The BENCH is the wire --
    exactly as it is for the friction and transport families, and for the same
    reason: an unwired self-check is a no-silent-crutch violation.

    UNITS, AND THERE ARE TWO SYSTEMS IN ONE PAPER.
      * Equation 19 returns KILOGRAM-MOLES of ammonia per CUBIC METRE of
        catalyst bed per HOUR.  That is what `rate_kmolNH3_per_m3bed_h` is.
      * Figures 2 and 3 label their rate contours in POUND-MOLES per CUBIC
        FOOT per hour.  `toLbmolPerFt3h()` exists so that a comparison with
        those figures converts and SAYS it converted; it is not the working
        unit anywhere.
      * Equations 6, 7 and 8 take T in KELVIN and P in ATMOSPHERES, and Eq 2
        and Eq 39 take T in KELVIN.  The context below is therefore in atm,
        not pascal, and the conversion happens at the caller's edge where it
        is visible.

    WHAT EQUATION 40 DOES NOT INCLUDE, AND THE AUTHORS SAY SO.  There is no
    correction in it for the effect of particle size on REDUCTION, on
    POISONING or on catalyst AGEING.  A bed sized from this expression is a
    FRESH, CLEAN, FULLY REDUCED bed.  That sentence is carried on the result
    (`freshCatalystCaveat`) rather than left in this comment, because it has
    to travel to wherever a size is eventually published, and a comment does
    not travel.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

//  The gas one evaluation is asked about.  Mole fractions of the BULK gas;
//  the diffusion correction is Eq 39's business, not the caller's.
struct AmmoniaRateContext
{
    scalar T_K       = 0.0;    // kelvin
    scalar P_atm     = 0.0;    // ATMOSPHERES -- the paper's unit (see above)
    scalar x_N2      = 0.0;
    scalar x_H2      = 0.0;
    scalar x_NH3     = 0.0;
    scalar x_inert   = 0.0;

    //  The particle the bed is packed with, in MILLIMETRES.  There is no
    //  default: a default particle size is an invented parameter, and which
    //  branch of Eq 39/40 applies depends entirely on this number.  Zero
    //  means NOT DECLARED, and the effectiveness factor then refuses.
    scalar particleDiameter_mm = 0.0;
};

struct AmmoniaRateResult
{
    scalar Ka          = 0.0;   // Eq 2, atm^-1, Gillespie & Beattie (1930)
    scalar gamma_N2    = 0.0;   // Eq 7
    scalar gamma_H2    = 0.0;   // Eq 6
    scalar gamma_NH3   = 0.0;   // Eq 8
    scalar a_N2        = 0.0;   // Eqs 3-5, a_i = x_i gamma_i P
    scalar a_H2        = 0.0;
    scalar a_NH3       = 0.0;

    scalar forwardTerm = 0.0;   // Ka^2 a1 a2^1.5 / a3
    scalar reverseTerm = 0.0;   // a3 / a2^1.5
    scalar k           = 0.0;   // Eq 18
    scalar rateIntrinsic_kmolNH3_per_m3bed_h = 0.0;   // Eq 19 (V_3)

    //  THE PAPER'S eta: the conversion of NITROGEN, measured from the
    //  reference mixture (3:1 H2/N2 with 12.7 % inerts) at which eta = 0.
    //  NOT an effectiveness factor -- see the symbol-collision block above.
    scalar eta_N2conversion = 0.0;

    //  THE PAPER'S xi: the EFFECTIVENESS FACTOR, Eq 39.
    scalar xi = 1.0;
    std::string xiRoute;        // in words, where this xi came from

    scalar rate_kmolNH3_per_m3bed_h = 0.0;            // Eq 40 = V_3 * xi

    bool   xiAvailable = false; // false => xi was REFUSED; see xiRoute
    std::vector<std::string> announcements;

    //  Travels with the answer, because it has to reach wherever a size is
    //  published and a comment in a header does not travel.
    static const std::string& freshCatalystCaveat();
};

class DysonSimon1968
{
public:
    //  The three members every correlation in this tree carries.
    static const std::string& type();
    static const std::string& citation();
    static const std::string& validityWindow();

    //  Eq 2 alone -- the equilibrium constant, atm^-1, T in kelvin.
    static scalar equilibriumConstant(scalar T_K);

    //  Eqs 6, 7, 8 -- fugacity coefficients, T in kelvin, P in atmospheres.
    static scalar gammaH2 (scalar T_K, scalar P_atm);
    static scalar gammaN2 (scalar T_K, scalar P_atm);
    static scalar gammaNH3(scalar T_K, scalar P_atm);

    //  Eq 39 alone, at one of the THREE TABULATED pressures.  Throws, by
    //  name, if P is not one of 150, 225 or 300 atm: Table I has no form in
    //  pressure, only three columns of it.
    static scalar effectivenessAtTabulatedP(scalar P_atm, scalar T_K, scalar eta);

    //  Eqs 2-8, 18, 19, 39, 40 together.
    static AmmoniaRateResult evaluate(const AmmoniaRateContext& c);

    //  The reference mixture Eq 39's eta is measured on: 3:1 H2/N2 with
    //  12.7 % inerts at eta = 0.  Returns the mole fractions at conversion
    //  eta, and is how a bench walks along the paper's own abscissa.
    static AmmoniaRateContext referenceMixture(scalar eta, scalar T_K, scalar P_atm);

    //  The paper's figures are in lb-mol/ft^3/h and Eq 19 is in
    //  kg-mol/m^3/h.  Converting is a deliberate act with a name.
    static scalar toLbmolPerFt3h(scalar kmol_per_m3_h);

    //  ---- The self-check ----
    //
    //  NOTHING HERE IS MEASURED BY US.  Each anchor states its KIND:
    //    "theory"     -- an identity the expression must satisfy, and which
    //                    no transcription error can accidentally produce;
    //    "arithmetic" -- the closed form evaluated at a stated point against
    //                    a literal.  It proves a TRANSCRIPTION, never a
    //                    physics (the 2026-09-05 transport rule).
    struct Anchor
    {
        std::string name;
        std::string kind;        // "theory" | "arithmetic"
        std::string statement;   // what it proves, in words
        scalar computed   = 0.0;
        scalar expected   = 0.0;
        scalar tolerance  = 0.0; // absolute, on |computed - expected|
        bool   pass       = false;
    };
    static std::vector<Anchor> verify();
};

} // namespace Choupo
