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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  PumpSelection -- the two levels of choosing a centrifugal pump (DEV.md 4c
  C441), as plain functions so a student reads each correlation on its own.

  Source for every number: Gulich, Centrifugal Pumps, 4th ed., Springer 2020.
  Each function names its equation and PAGE.  Standards (Hydraulic Institute,
  API 610 / ISO 13709, ISO 9906) are cited for what they rule only; this
  file carries none of their numbers.

  LEVEL 1, THE GENERIC PUMP: from the duty (Q, H) and the speed n --
      nq    specific speed            Table 3.4, Eq. (T3.4.15), p. 154
      eta   efficiency to expect      Table 3.9, Eq. (T3.9.1), p. 163, and its
                                      uncertainty Eq. (T3.9.10)
      NPSH3 from the suction specific speed   Eq. (6.7), p. 320, with the
                                      class values of Table D6.1, p. 320
      NPSHA available                 Table 2.2, Eq. (T2.2.8), p. 52
      margin                          Table 6.2, p. 379
      POR                             Sect. 10.9, p. 806
  Every one is an ESTIMATE, printed as such.

  LEVEL 2, THE REAL PUMP: the maker's curve (H, eta, NPSHr against Q) is a
  record of the case, constant/experiments/<name>.dat, `property pumpCurve`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {
namespace pumpSelection {

//- The standard gravity the engine uses.
constexpr scalar g = 9.80665;

//- Eq. (T3.4.15), Table 3.4, p. 154: nq = n sqrt(Q/fq) / H^0.75, n in rpm,
//  Q in m3/s, H in m, at the BEP, per stage.  fq = 1 (single entry).
scalar specificSpeed(scalar n_rpm, scalar Q_m3s, scalar H_m);

//- The window of Eq. (T3.9.1): single-stage radial pump, Q >= 0.005 m3/s
//  (Table 3.9 header, p. 163) and nq between 10 and 100 (Fig. 3.26 spans
//  10-100, the table lists "<= 100").  Returns "" when inside, else the
//  sentence the caller refuses with.
std::string efficiencyWindowRefusal(scalar Q_m3s, scalar nq);

//- Eq. (T3.9.1), Table 3.9, p. 163 (log = log10):
//    eta_opt = 1 - 0.095 (QRef/Q)^m - 0.3 {0.35 - log(nq/23)}^2 (QRef/Q)^0.05
//    m = 0.1 a (QRef/Q)^0.15 (45/nq)^0.06,  QRef = 1 m3/s,
//    a = 1 (Q <= 1 m3/s), 0.5 (Q > 1 m3/s)
scalar etaOptimum(scalar Q_m3s, scalar nq);

//- Eq. (T3.9.10), p. 163: the uncertainty of eta, +- 0.2 (1 - eta_opt).
scalar etaUncertainty(scalar etaOpt);

//- Table D6.1, p. 320: the range of the suction specific speed nss
//  [rpm, m3/s, m] of an impeller class (the printed limits).  An unknown
//  class throws, listing the known ones.
void suctionSpecificSpeedClass(const std::string& cls, scalar& lo, scalar& hi,
                               std::string& rowText);

//- Eq. (6.7), p. 320, inverted: nss = n sqrt(Q/fq) / NPSH3^0.75, at the BEP.
scalar npsh3FromNss(scalar n_rpm, scalar Q_bep_m3s, scalar nss);

//- Table 2.2, Eq. (T2.2.8), p. 52:
//    NPSHA = (p_e,abs - p_v)/(rho g) + z_e + c_e^2/(2 g) - H_v,s
scalar npshAvailable(scalar p_abs, scalar p_v, scalar rho, scalar z_e,
                     scalar c_e, scalar Hv_s);

//- Table 6.2 minimum, p. 379: NPSHA >= max(1.25 NPSH3, NPSH3 + 0.6 m).
scalar npshaMinimum(scalar npsh3);

//- The preferred operation range of Sect. 10.9, p. 806: a contract example
//  is 0.85 < q* < 1.1, q* = Q/Qopt.
constexpr scalar porLowDefault  = 0.85;
constexpr scalar porHighDefault = 1.10;

//- LEVEL 2: the manufacturer's curve, read from the case's own record.
struct Curve
{
    std::string name, where, citation, kind, basis, fluid;
    scalar      speed_rpm = 0.0;            // the speed the curve was taken at
    std::vector<scalar> Q, H, eta, NPSHr;   // SI, Q strictly increasing
    struct At { scalar H, eta, NPSHr; };
    //- Piecewise-linear value of each column at Q, or throws naming the
    //  curve and its range when Q lies outside [Q.front(), Q.back()].
    At at(scalar Q_m3s, const std::string& who) const;
};
Curve readCurve(const std::string& name, const std::string& citedBy);

} // namespace pumpSelection
} // namespace Choupo
