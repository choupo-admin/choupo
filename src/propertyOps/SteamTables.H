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
  SteamTables --- water/steam properties from IAPWS-IF97 (R7-97(2012)),
  the kernel under src/thermo/iapws/.  Three modes, exactly ONE per op:

      {
          name   r1_a;
          type   steamTables;
          point  { P 3 MPa; T 300 K; }          // one (p,T) state: prints the
                                                //   full property set + region
          output { file point.csv; }            //   [optional in point mode]
      }
      {
          name   satline;
          type   steamTables;
          saturation { from 0.01 degC; to 350 degC; n 50; }
          output { file saturation.csv; }       // T,psat,v_f,v_g,h_f,h_g,
      }                                         //   s_f,s_g,h_fg
      {
          name   isobar_1bar;
          type   steamTables;
          isobar { P 1 bar; from 20 degC; to 300 degC; n 57; }
          output { file isobar.csv; }           // T,region,v,h,s,cp -- the run
      }                                         //   ANNOUNCES the Tsat crossing

  Units contract: the dicts speak any declared unit (the parser converts to
  canonical SI); the CSVs are canonical SI like every other Choupo CSV
  (psat [Pa], h [J/kg], s [J/(kg K)]); the DIAGNOSTICS speak the release's
  table units (v [m3/kg], h [kJ/kg], s/cp [kJ/(kg K)], w [m/s], psat [MPa])
  so the IAPWS-published verification numbers ARE the golden pins, digit for
  digit.  Every run announces the formulation citation + the result of
  IF97::verify() once, and REFUSES to run on a failed self-check.

  Diagnostics: point -> region, v, h, u, s, cp, cv, w (+ psat_MPa when T is
  on the region-4 range); saturation -> n_points, psat_from_Pa, psat_to_Pa;
  isobar -> n_points (+ Tsat_K when the isobar is subcritical).

  Region 3 / region 5 states are refused loudly by the kernel's router --
  the refusal names the input and the valid box (no silent extrapolation).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class SteamTables : public PropertyOperation
{
public:
    const std::string& type() const override { static const std::string t = "steamTables"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
