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
Classes
    Choupo::SelectionFunction   (selectable: austin, herbstFuerstenau,
                                 vogelPeukert)
    Choupo::BreakageFunction    (selectable: austin)
    Choupo::BondEnergy          (Bond's third theory, the energy cross-check)

Description
    THE TWO HALVES OF A GRINDING RATE LAW, AS SELECTABLE OBJECTS.

    Austin (1971) wrote every published grinding model of the previous
    thirty years as ONE first-order population balance on size classes
    (his eq. 37):

        dw_i/dt = - S_i w_i + SUM_{j>i} b_ij S_j w_j

    with two material functions: the SELECTION function S_i (the specific
    rate at which class i breaks, 1/time) and the BREAKAGE function b_ij
    (where the fragments of class j land).  These classes hold exactly those
    two, each a correlation object with a validity window, a citation and a
    `verify()` anchor -- the 2026-08-25 rule (`docs/design/correlations-as-
    objects.md`), applied to comminution.  The population balance itself is
    the unit's (`Mill`), because it is the same for every pair.

    THE EXTENT, NOT THE RATE, CROSSES THE INTERFACE.  A selection function
    returns kappa_i, the dimensionless breakage extent of class i over one
    pass through the mill:

        rate models (austin, vogelPeukert):   kappa_i = S_i tau
        herbstFuerstenau (energy-specific):   kappa_i = S_i^E E

    where tau is the mean residence time and E = P/W the net specific energy
    (Herbst & Fuerstenau 1980, eq. 10: S_i = S_i^E P/H, so S_i tau =
    S_i^E P/W).  That one substitution is the whole of the energy-specific
    scale-up, and it is why the Herbst-Fuerstenau model needs no residence
    time: the same specific energy gives the same product in any mill.

    A model's window is CHECKED where it can be (the Vogel-Peukert law below
    its threshold energy gives zero, said; the Austin breakage form must be
    a monotone cumulative, refused otherwise).  None of these is held to a
    measured mill here; the anchors are what kind they are, and say so.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

//  What a selection function may read about the pass through the mill.
struct MillContext
{
    scalar tau = 0.0;   // mean residence time [s] (0 when not declared)
    scalar E   = 0.0;   // net specific energy  [J/kg] (W_shaft / solids mass flow)
};

//  A verify() anchor: the number Choupo computes beside the number printed in
//  the primary, the relative deviation, and WHAT KIND of anchor it is
//  (`worked example`, `identity`, `arithmetic`) -- the transport rule of
//  2026-09-05: a 0.000 % on an identity proves a transcription, never a
//  physics.
struct MillAnchor
{
    scalar choupo = 0.0;
    scalar published = 0.0;
    scalar dev = 0.0;
    std::string kind;
    std::string where;
};

// ===========================================================================
class SelectionFunction
{
public:
    using Factory = std::function<std::unique_ptr<SelectionFunction>()>;

    virtual ~SelectionFunction() = default;

    virtual const std::string& type() const = 0;
    virtual const std::string& citation() const = 0;
    virtual const std::string& validityWindow() const = 0;

    //  "time" (the extent is S tau) or "energy" (the extent is S^E E):
    //  says which of tau and E the unit must supply.
    virtual std::string basis() const = 0;

    virtual void readParameters(const DictPtr& selection) = 0;

    //  kappa_i for each class representative size x_i [m].  The pan's
    //  extent is set to zero by the caller, not here.
    virtual std::vector<scalar> extent(const std::vector<scalar>& x,
                                       const MillContext& c) const = 0;

    //  One line for the run log: the law with its parameters.
    virtual std::string describe() const = 0;

    virtual MillAnchor verify() const = 0;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<SelectionFunction> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

// ===========================================================================
class BreakageFunction
{
public:
    using Factory = std::function<std::unique_ptr<BreakageFunction>()>;

    virtual ~BreakageFunction() = default;

    virtual const std::string& type() const = 0;
    virtual const std::string& citation() const = 0;
    virtual const std::string& validityWindow() const = 0;

    virtual void readParameters(const DictPtr& breakage) = 0;

    //  The CUMULATIVE breakage function B(u): the mass fraction of the
    //  fragments of a parent of size y that lies below x, u = x/y in [0, 1],
    //  normalised (B(0) = 0, B(1) = 1) -- Austin 1971 p. 2.
    virtual scalar B(scalar u) const = 0;

    virtual std::string describe() const = 0;

    virtual MillAnchor verify() const = 0;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<BreakageFunction> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

// ===========================================================================
//  BOND'S THIRD THEORY (Bond 1952, as given by Wills & Napier-Munn 2006,
//  eq. 5.2, p. 111; King 2001, eq. 5.167, p. 202):
//
//      W = 10 Wi ( 1/sqrt(P80) - 1/sqrt(F80) )      [kWh/short ton, P80, F80 in um]
//
//  Wi is the work index: by definition the energy to reduce the material
//  from an infinite size to 80 % passing 100 um.  A CROSS-CHECK, never the
//  mill's answer: it predicts one number (the energy for a change of d80)
//  and nothing about the distribution.
struct BondEnergy
{
    static const std::string& citation();
    static const std::string& validityWindow();

    //  Specific energy [J/kg] for a work index Wi [J/kg, i.e. already
    //  converted from kWh/short ton] and the 80 %-passing sizes [m].
    static scalar specificEnergy(scalar Wi, scalar F80, scalar P80);

    static MillAnchor verify();
};

} // namespace Choupo
