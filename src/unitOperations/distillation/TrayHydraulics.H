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
    Choupo::TrayHydraulics

    SIEVE-TRAY hydraulics, evaluated stage by stage AFTER the column has
    converged.  A converged MESH solution says WHAT separates.  It says nothing
    about whether the trays that do the separating can physically pass the
    traffic -- and a column that floods separates nothing at all.  This is the
    check that stands between a converged simulation and a column you could
    build.

    The stage equations never see any of this: hydraulics is a RATING pass on a
    converged profile, not a coupled unknown.  That is the honest scope.  (A
    column whose pressure drop shifts its own stage temperatures needs the
    pressure profile fed back into the MESH -- deliberately not done here.)

    TWO MODES, the same equations run in opposite directions -- as with the
    spray dryer:

      * `diameter` given   -> RATING.  How close to flood is each tray?
      * `diameter` absent  -> DESIGN.  What diameter keeps every tray at or
                              below `floodFraction` of its flood velocity?
                              (The widest tray sets the column.)

    THE CORRELATIONS, and their provenance.  Every constant below is
    transcribed from a named source; nothing is fitted here.

    Flooding -- Souders & Brown's form with Fair's capacity parameter:

        u_flood = C_SB . (sigma/20)^0.2 . sqrt( (rho_L - rho_V) / rho_V )

    on the NET area (tower area less one downcomer), with sigma in dyn/cm and
    the 20 dyn/cm baseline.  C_SB is a function of the flow parameter
    F_LV = (L/V) sqrt(rho_V/rho_L) (mass flows) and the tray spacing.  Fair
    published it as a CHART, so we use the algebraic representation of Lygeros
    & Magoulas:

        C_SB = 0.0105 + 8.127e-4 . TS^0.755 . exp(-1.463 . F_LV^0.842)   [m/s]

    with TS the tray spacing in mm.  This fit is KNOWN to misbehave at small
    F_LV (its slope turns the wrong way below F_LV ~ 0.03), so the pass says so
    out loud rather than quietly reporting a number it does not believe.

    Pressure drop -- as heads of clear liquid (mm), Sinnott's lineage, which
    folds aeration into a residual head rather than into a charted aeration
    factor:

        h_t   = h_d + (h_w + h_ow) + h_r                     total head
        h_d   = 51 (u_h / C_o)^2 (rho_V / rho_L)             dry tray, orifice
        h_ow  = 750 ( L_w / (rho_L l_w) )^{2/3}              Francis weir crest
        h_r   = 12.5e3 / rho_L                               residual

    Downcomer backup, and the flood criterion that closes the loop:

        h_dc  = 166 ( L_wd / (rho_L A_m) )^2                 loss under the apron
        h_b   = (h_w + h_ow) + h_t + h_dc
        h_b   <  0.5 (tray spacing + weir height)

    Weeping, OPTIONAL because its constant is a chart:

        u_h,min = ( K2 - 0.90 (25.4 - d_h) ) / sqrt(rho_V)

    K2 is read off a plot against (h_w + h_ow).  Choupo will not invent it: give
    `K2` and the weep check runs; leave it out and the pass says the check was
    not performed.  The orifice coefficient C_o is a chart too (against
    A_h/A_p and plate-thickness/hole-diameter) -- it is a declared input with an
    announced default, never a silent constant.

    Primary sources:
      Souders, M. & Brown, G.G., Ind. Eng. Chem. 26 (1934) 98.
      Fair, J.R., "How to predict sieve tray entrainment and flooding",
        Petro/Chem Engineer 33(10) (1961) 45.
      Lygeros, A.I. & Magoulas, K.G., Hydrocarbon Processing 65(12) (1986) 43.
      Liebson, I., Kelley, R.E. & Bullington, L.A., Petroleum Refiner 36 (1957)
        [the C_o chart].
      Sinnott, R.K., Coulson & Richardson's Chemical Engineering, Vol. 6,
        Chemical Engineering Design [h_d, h_ow, h_r, h_dc, h_b, u_h,min].

    THE LIQUID DENSITY, AND A LIQUID THAT CARRIES A SUPERCRITICAL COMPONENT
    (2026-10-17, DEV.md 4c C79).  A tray liquid may carry a trace of a
    component above its critical temperature -- CO and dimethyl ether in the
    lights column of `aceticAcid02_plant`, at 403 K and 1.5 bar.  Such a
    component has no saturated-liquid molar volume: the Rackett closure takes
    (1 - T/Tc)^(2/7) of a negative number and returns NaN, and the
    mole-weighted mixture that `ThermoPackage::density` builds is NaN with
    it.  Before this date that NaN went through every head unseen: in DESIGN
    mode the required diameter came out NaN, `std::max(0, NaN)` kept 0, and
    the pass refused with "two downcomers leave no active area" about a
    column whose downcomers were 12 % of nothing; in RATING mode it printed
    "0.0 % of flood ... dP -nan" at exit 0.
    The density now comes from ONE door, `liquidDensity` below, which does
    not compute a density of its own: it asks `thermo/PricedDensity` (the
    one home of WHICH components a phase density can be asked over, the
    valve's and the storage tank's choice too) and then asks the package
    the same question over the components it can price, renormalised.  The
    MASS traffic still counts every component.  What was left out travels
    in the Result, so the caller announces it once with the unit's name.
    When nothing is left out the question is asked of the composition itself,
    so a column without such a component is unchanged to the bit.
    And every hydraulic number is REQUIRED to be finite: one that is not
    refuses by name, naming the tray and the quantity, rather than printing.

    NOT implemented, deliberately: the Kister & Haas (1990) entrainment-flood
    correlation.  It is the better-grounded model and it IS algebraic, but two
    of its constants could not be checked against a primary source, and a
    teaching tool does not ship numbers it has not read.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo
{

class ThermoPackage;

class TrayHydraulics
{
public:

    // Tray geometry + the two charted constants, all declared.
    struct Geometry
    {
        scalar diameter      = 0.0;      // m; 0 => DESIGN the diameter
        scalar traySpacing   = 0.50;     // m
        scalar weirHeight    = 0.050;    // m
        scalar holeDiameter  = 5.0e-3;   // m
        scalar holeAreaFrac  = 0.10;     // A_h / A_active
        scalar downcomerFrac = 0.12;     // A_d / A_tower
        scalar weirLengthFrac= 0.77;     // l_w / D  (goes with A_d/A_T = 0.12)
        scalar orificeCoeff  = 0.84;     // C_o -- Liebson chart; declared
        scalar floodFraction = 0.80;     // design target
        scalar K2            = 0.0;      // weep chart; 0 => no weep check
        scalar sigma         = 0.0;      // N/m; 0 => ask the thermo package
    };

    // One tray's verdict.
    struct Stage
    {
        std::size_t index = 0;           // 1-based stage number
        scalar F_LV = 0.0, C_SB = 0.0;
        scalar rhoL = 0.0, rhoV = 0.0, sigma = 0.0;
        scalar uFlood = 0.0, uVapour = 0.0, floodApproach = 0.0;
        scalar diameterRequired = 0.0;   // m, design mode
        scalar h_d = 0.0, h_ow = 0.0, h_r = 0.0, h_t = 0.0;   // mm liquid
        scalar h_dc = 0.0, h_b = 0.0, h_bMax = 0.0;           // mm liquid
        scalar dP = 0.0;                 // Pa
        scalar u_h = 0.0, u_hMin = 0.0;  // m/s
        scalar tResidence = 0.0;         // s, downcomer
        bool   weeps = false, downcomerFloods = false;
    };

    struct Result
    {
        std::vector<Stage> stages;
        scalar diameter        = 0.0;    // m (given, or designed)

        //  THE TWO SECTIONS, SIZED SEPARATELY (2026-09-07).  `diameter` above
        //  is the widest tray in the WHOLE column; these are the widest tray
        //  ABOVE the feed and the widest tray AT OR BELOW it.  They need no
        //  new physics -- `Stage::diameterRequired` already exists per tray
        //  and only the global maximum used to survive.
        //
        //  WHY THEY DIFFER, and it is worth a student's attention: the
        //  flooding diameter follows the VAPOUR VOLUMETRIC flow, and the two
        //  sections differ in temperature, pressure, vapour molar mass and
        //  usually in the vapour molar flow itself.
        //
        //  WHETHER TO BUILD TWO DIAMETERS IS AN ECONOMIC QUESTION, NOT A
        //  THERMODYNAMIC ONE, and this pass does not answer it: it reports
        //  both and the ratio.  Below roughly 15-20 % difference the extra
        //  transition cone, its fabrication and its inspection cost more than
        //  the plate a swage saves, so the tower is built straight at the
        //  larger diameter.
        //
        //  Zero when the column has no tray in that section (both are zero
        //  when no feed stage was supplied).
        scalar diameterRectifying = 0.0; // m, widest tray above the feed
        scalar diameterStripping  = 0.0; // m, widest tray at or below the feed
        std::size_t feedStage     = 0;   // 1-based, as the stage indices are
        scalar floodApproachMax= 0.0;
        std::size_t floodStage = 0;
        scalar dPColumn        = 0.0;    // Pa
        scalar backupMax       = 0.0;    // mm liquid
        std::size_t nWeeping   = 0;
        std::size_t nDcFlood   = 0;
        bool   designed        = false;
        bool   lowFlowParam    = false;  // F_LV < 0.03 somewhere: fit unreliable
        bool   weepChecked     = false;

        //  THE COMPONENTS THE TRAY LIQUID DENSITY LEFT OUT (C79): the union
        //  of their names over every tray, ", "-separated, and the largest
        //  mole fraction of the liquid they made up on any one tray.  Empty
        //  and zero on every column whose liquid the package prices whole.
        std::string liquidDensityDropped;
        scalar      liquidDensityDroppedMax = 0.0;
    };

    //  A liquid density as the hydraulics ask for it (see the header): the
    //  package's own density over the components `pricedDensity::select`
    //  keeps, and what it left out.  Throws by name when no component of the
    //  liquid can be priced.
    struct LiquidDensity
    {
        scalar      rho             = 0.0;   // kg/m3
        scalar      droppedFraction = 0.0;   // mole fraction left out
        std::string dropped;                 // their names, ", "-separated
    };
    static LiquidDensity liquidDensity(const ThermoPackage& thermo,
                                       scalar T, scalar P, const sVector& x);

    //  Merge one reading's left-out components into a running union
    //  (names, largest fraction) -- the one place the union is formed.
    static void noteDropped(const LiquidDensity& d, std::string& names,
                            scalar& maxFraction);

    static Geometry readGeometry(const DictPtr& hyd);

    // T[j], x[j], y[j] per stage; V[j], L[j] in kmol/s.  Stage 0 is the
    // condenser and stage N-1 the reboiler: neither is a tray, both are skipped.
    //  `feedStage` is 1-based on the SAME indexing as `Stage::index`, and
    //  is what splits the rectifying section from the stripping one.  Pass 0
    //  when the caller has no single feed stage to name: the section
    //  diameters are then left at zero rather than guessed from where the
    //  traffic happens to step, which would be reading a declaration out of a
    //  profile.
    static Result evaluate(const ThermoPackage&         thermo,
                           scalar                       P,
                           const std::vector<scalar>&   T,
                           const std::vector<sVector>&  x,
                           const std::vector<sVector>&  y,
                           const std::vector<scalar>&   V,
                           const std::vector<scalar>&   L,
                           const Geometry&              geo,
                           std::size_t                  feedStage);

    static void report(const Result& r, const Geometry& geo, int verbosity);
};

} // namespace Choupo
