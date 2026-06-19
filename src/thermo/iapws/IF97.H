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
Namespace
    Choupo::IF97

Description
    IAPWS Industrial Formulation 1997 for the Thermodynamic Properties of
    Water and Steam -- IAPWS-IF97, as revised in R7-97(2012).  The steam
    tables, from the published closed-form equations: every coefficient is
    transcribed below from the release with its table number cited, and the
    release's own computer-program verification tables are hard-coded in
    verify() -- if a single digit of a coefficient is wrong, verify() says so.

    THIS SLICE implements:

      * Region 1  -- compressed liquid, Gibbs form g(p,T)        (release 5)
      * Region 2  -- superheated vapour, ideal + residual gamma  (release 6)
      * Region 4  -- the saturation line, the explicit quadratic
                     (psat(T) and Tsat(p), release 8)
      * B23       -- the region 2/3 boundary equation            (release 4)

    Region 3 (near-critical, Helmholtz f(rho,T)) and Region 5 (> 1073.15 K)
    are NOT implemented in this slice.  The router pT_region() REFUSES those
    states loudly, naming the input and the valid box -- it never extrapolates
    a region-1/2 equation outside its published validity.

    All functions are PURE (no state); inputs are canonical SI (p [Pa],
    T [K]).  Outputs follow the release's table units, which are how steam
    tables are read: v [m3/kg], h,u [kJ/kg], s,cp,cv [kJ/(kg K)], w [m/s] --
    each Props field documents its unit.

    Integration: deferred -- kernel + bench only in this slice.  Where IF97
    sits among the model factories (Phase / EquationOfState / utilities) is
    an open organisational decision for the founder; nothing outside
    choupoProps' `steamTables` operation calls this namespace yet.

Reference
    IAPWS, "Revised Release on the IAPWS Industrial Formulation 1997 for the
    Thermodynamic Properties of Water and Steam", R7-97(2012), Lucerne,
    August 2007 / 2012.  Equations are public domain; tables cited per block.

SourceFiles
    IF97.cpp
\*---------------------------------------------------------------------------*/

#pragma once

namespace Choupo
{
namespace IF97
{

// --- Reference constants (release section 3, eq. 1) ------------------------
constexpr double Rspec  = 0.461526;     // kJ/(kg K)  specific gas constant
constexpr double Tcrit  = 647.096;      // K          critical temperature
constexpr double pcrit  = 22.064e6;     // Pa         critical pressure
constexpr double rhocrit = 322.0;       // kg/m3      critical density

// --- Validity box of this slice (regions 1, 2 and 4) -----------------------
constexpr double Tmin   = 273.15;       // K
constexpr double Tmax12 = 1073.15;      // K   regions 1/2 ceiling (region 5 above)
constexpr double Tmax1  = 623.15;       // K   region 1 / saturated-line ceiling
constexpr double pmax   = 100.0e6;      // Pa
constexpr double psatTriple = 611.213;  // Pa  psat at 273.15 K (release 8.2)

// Full property set at one (p,T) state.  Units are the release's table
// units (how every steam table is printed), NOT raw SI -- so the published
// verification values can be compared digit for digit.
struct Props
{
    int    region;  // 1 (compressed liquid) or 2 (superheated vapour)
    double v;       // m3/kg        specific volume
    double rho;     // kg/m3        density (= 1/v)
    double h;       // kJ/kg        specific enthalpy
    double u;       // kJ/kg        specific internal energy
    double s;       // kJ/(kg K)    specific entropy
    double cp;      // kJ/(kg K)    isobaric heat capacity
    double cv;      // kJ/(kg K)    isochoric heat capacity
    double w;       // m/s          speed of sound
};

// --- Region 4: the saturation line (explicit quadratic, release eq. 30/31) -
// psat(T) [Pa], valid 273.15 K <= T <= 647.096 K.  Throws outside.
double psat(double T);
// Tsat(p) [K], valid 611.213 Pa <= p <= 22.064 MPa.  Throws outside.
double Tsat(double p);

// --- B23: the region 2/3 boundary (release eq. 5/6) ------------------------
// pB23(T) [Pa] for 623.15 K <= T <= 863.15 K; TB23(p) [K] for the inverse.
double pB23(double T);
double TB23(double p);

// --- Region router ----------------------------------------------------------
// Returns 1 or 2 for states this slice covers; throws std::runtime_error
// with a crystal-clear message (input named + the valid box) for region 3,
// region 5, and anything outside the IF97 box.  Convention on the saturation
// line itself: p == psat(T) routes to region 1 (the liquid side).
int pT_region(double p, double T);

// --- Region evaluators -------------------------------------------------------
// Direct evaluations of the published basic equations -- NO routing, NO
// validity check (the saturation scan legitimately evaluates region 1/2 ON
// the saturation line).  Use props() for routed, validity-checked access.
Props region1(double p, double T);   // release eq. 7, Table 2 coefficients
Props region2(double p, double T);   // release eq. 15-17, Tables 10/11

// Routed access: pT_region() then the matching evaluator.
Props props(double p, double T);

// --- The weapon: self-check against the release verification tables --------
// Evaluates every computer-program verification state published in the
// release (Table 5: region 1; Table 15: region 2; Table 35: psat; Table 36:
// Tsat; eq. 5/6 B23 point) and returns the MAXIMUM RELATIVE DEVIATION over
// all of them.  > 1e-8 means a transcription error in the coefficient
// tables -- fix the digit, never loosen the tolerance.
double verify();

} // namespace IF97
} // namespace Choupo
