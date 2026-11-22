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
    Choupo::BedDispersionCorrelation, Choupo::BedFilmCorrelation,
    Choupo::ldfSeries

Description
    THE FIXED-BED ADSORBER'S TRANSPORT CORRELATIONS, AS SELECTABLE,
    SELF-VERIFYING OBJECTS (DEV.md 4c C450).

    `fixedBedAdsorber` used to take Dax and k_LDF as numbers dropped into the
    dictionary and nothing said where such a number comes from.  The three
    families below answer "what would a correlation say?" on the
    `FrictionFactorCorrelation` pattern: a stated validity window, a dated
    primary citation WITH the page and equation number the coefficients were
    read at, and a `verify()` anchor that says what KIND of anchor it is.

      * axial dispersion   Dax  -- Wakao & Funazkri 1978 (eq 2), Edwards &
                                   Richardson 1968 (eq 17, gas), Chung & Wen
                                   1968 (eq 15/16, liquids), Gunn 1987 (eq 1
                                   with p from eq 3)
      * external film      k_f  -- Wakao & Funazkri 1978 (eq 12), Wilson &
                                   Geankoplis 1966 (eq 8 and 9, liquids)
      * LDF constant       k    -- the series sum of Ruthven 1984 eq (8.41)
                                   (film + macropore + micropore), whose
                                   internal terms carry Glueckauf's 15 (1955,
                                   eqn 3a)

    THE BASIS IS PART OF EVERY NUMBER.  The unit stores Dax on the BED
    (superficial) basis, Dax = eps D_L, with D_L the INTERSTITIAL dispersion
    coefficient the textbook correlations are written for (their velocity is
    the interstitial u = U/eps in Edwards & Richardson and Chung & Wen's N_Pe,
    the superficial U in the Reynolds number).  A D_L pasted into Dax
    overstates the dispersion by 1/eps (C451); every `evaluate` below hands
    back the bed-basis Dax AND the interstitial D_L so the report can show
    both.

    WHAT A CORRELATION IS NOT.  It is not a measurement and not the
    declared value: a declared Dax or k_LDF always wins, and a correlation
    fills a missing one only when the case chooses it, announced as an
    estimate with its window verdict.  A point outside the window still
    ANSWERS (the paper's own authors forbid nothing numerically) and says so
    in `note`.

    EVERY ANCHOR SAYS WHAT IT IS (`BedAnchor::kind`): "printed number" (a
    value the article prints), "cross-check" (two printed forms of one
    result, e.g. Edwards & Richardson eq 17 against their own eq 18),
    "limit" (an asymptote the article states or that follows from the printed
    form) or "arithmetic" (the printed closed form evaluated by hand -- it
    proves the transcription, not the physics, and the report must say so).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

//  The hydrodynamic state one correlation is asked about: packed bed of
//  (equivalent) spheres of diameter dp, voidage eps, SUPERFICIAL velocity U,
//  molecular diffusivity Dm of the transferring species in the carrier, the
//  fluid's kinematic viscosity through Re and Sc.
struct BedContext
{
    scalar Re  = 0.0;   // rho U dp / mu  (superficial U) [-]
    scalar Sc  = 0.0;   // mu / (rho Dm) [-]
    scalar eps = 0.0;   // interparticle voidage [-]
    scalar dp  = 0.0;   // particle diameter [m]
    scalar U   = 0.0;   // superficial velocity [m/s]
    scalar Dm  = 0.0;   // molecular diffusivity [m2/s]
    bool   gasPhase = true;   // the bed's fluid: every window names a phase
};

struct BedAnchor
{
    scalar dev = 0.0;            // abs relative deviation at the anchor
    scalar value = 0.0;          // what the object computed
    scalar published = 0.0;      // what the article prints / states
    std::string kind;            // printed number | cross-check | limit | arithmetic
    std::string anchor;          // the point + where the number comes from
};

struct BedDispersionResult
{
    scalar Dax = 0.0;            // BED (superficial) basis, = eps D_L [m2/s]
    scalar DL  = 0.0;            // interstitial dispersion D_L = Dax/eps [m2/s]
    bool   inWindow = true;
    std::string note;            // "" inside the window; the reasons otherwise
};

struct BedFilmResult
{
    scalar Sh = 0.0;             // k_f dp / Dm [-]
    scalar kf = 0.0;             // external film coefficient [m/s]
    bool   inWindow = true;
    std::string note;
};

class BedDispersionCorrelation
{
public:
    using Factory = std::function<std::unique_ptr<BedDispersionCorrelation>()>;
    virtual ~BedDispersionCorrelation() = default;
    virtual const std::string& type() const = 0;
    virtual const std::string& phase() const = 0;           // gas | liquid
    virtual const std::string& validityWindow() const = 0;  // the authors' own
    virtual const std::string& citation() const = 0;        // with page + equation
    virtual BedDispersionResult evaluate(const BedContext& c) const = 0;
    virtual BedAnchor verify() const = 0;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<BedDispersionCorrelation> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();                         // idempotent
private:
    static std::map<std::string, Factory>& registry();
};

class BedFilmCorrelation
{
public:
    using Factory = std::function<std::unique_ptr<BedFilmCorrelation>()>;
    virtual ~BedFilmCorrelation() = default;
    virtual const std::string& type() const = 0;
    virtual const std::string& phase() const = 0;           // gas | liquid | gas+liquid
    virtual const std::string& validityWindow() const = 0;
    virtual const std::string& citation() const = 0;
    virtual BedFilmResult evaluate(const BedContext& c) const = 0;
    virtual BedAnchor verify() const = 0;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<BedFilmCorrelation> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();                         // idempotent
private:
    static std::map<std::string, Factory>& registry();
};

//  LDF constant from resistances in series -- Ruthven (1984) eq (8.41):
//
//      1/(k K) = Rp/(3 kf) + Rp^2/(15 epsP Dp) + rc^2/(15 K Dc)
//
//  rearranged for k (the dq/dt = k (q* - q) constant the unit integrates;
//  q's basis cancels, so k is the same in mol/kg):
//
//      1/k = K Rp/(3 kf) + K Rp^2/(15 epsP Dp) + rc^2/(15 Dc)
//
//  with K = epsP + (1 - epsP) Kc the dimensionless equilibrium slope of the
//  particle (fluid in the pores plus adsorbed, per particle volume, per
//  fluid concentration).  The "15" of the two internal terms is Glueckauf's
//  (1955, eqn 3a): a single internal resistance reproduces dq/dt =
//  15 D/r^2 (q* - q).  A term whose data are absent (kf, Dp or DcOverRc2
//  equal to zero) is OMITTED and its share is zero; the caller announces
//  which terms were given.
struct LdfSeriesInput
{
    scalar Rp  = 0.0;   // particle radius [m]
    scalar kf  = 0.0;   // external film coefficient [m/s]   (0 -> film term omitted)
    scalar epsP = 0.0;  // particle (macropore) porosity [-]
    scalar Dp  = 0.0;   // effective macropore diffusivity, pore-fluid basis [m2/s] (0 -> omitted)
    scalar DcOverRc2 = 0.0;  // micropore Dc/rc^2 [1/s]       (0 -> omitted)
    scalar K   = 0.0;   // equilibrium slope of the particle [-]
};
struct LdfSeriesResult
{
    scalar k = 0.0;                 // [1/s]
    scalar tFilm = 0.0, tMacro = 0.0, tMicro = 0.0;   // the three terms of 1/k [s]
    scalar shareFilm = 0.0, shareMacro = 0.0, shareMicro = 0.0;  // fractions of 1/k
};
LdfSeriesResult ldfSeries(const LdfSeriesInput& in);
const std::string& ldfSeriesCitation();
const std::string& ldfSeriesWindow();
BedAnchor ldfSeriesVerify();

} // namespace Choupo
