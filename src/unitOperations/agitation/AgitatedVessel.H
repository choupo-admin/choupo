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
    This file is part of Choupo (GPL-3.0-or-later); see LICENSE.
-------------------------------------------------------------------------------
Class
    Choupo::AgitatedVessel

Description
    A STIRRED VESSEL WHOSE SHAFT POWER IS COMPUTED (DEV.md 4c C421 (7), R7 and
    R9-R10; Chhabra & Richardson, Non-Newtonian Flow and Applied Rheology, 2nd ed.,
    Ch. 8).  One liquid stream in, one out, mixed (no reaction, no phase change);
    what it adds to the plant is the POWER the impeller draws and where it goes.

    WHERE POWER LIVES.  The power belongs to the UNIT, not to its sizer: the sizer
    (`stirredTank`, src/postProcessing/sizing) runs AFTER the pass and cannot put
    work into an energy balance.  The unit publishes `W_shaft_kW`, an energy item
    of kind Work (src/result/EnergyItems.H) exactly as a pump does, so the shaft
    work enters the plant-boundary energy balance, and leaves as enthalpy of the
    contents: dissipated as heat in the liquid (`thermalMode adiabatic`: the
    outlet is warmer by W / (F Cp)) or removed by the vessel's jacket
    (`thermalMode isothermal`, the default: T_out = T_in and the duty
    Q_kW = -W_shaft_kW is published, so the first law closes either way).

    WHO OWNS WHAT (R7).  The flow curve is the FLUID's, in the property dictionary
    (transport { liquid { rheology { measured { .. } } } }), Newtonian by absence.
    The Metzner-Otto constant k_s and the power constants are the IMPELLER's, an
    asset record of kind impeller (agitation/Impeller.H).  The shear rate is the
    UNIT's: gamma_avg = k_s N (eq. 8.9, p. 391).  The unit asks the door, form 3
    (`liquidProperty::apparentViscosity`), for mu_app at gamma_avg.

    THE CALCULATION (the book's procedure, p. 392):
        gamma_avg = k_s N
        mu_app    = tau / gamma at gamma_avg   (the door; the flow curve's own domain)
        Re        = rho N D^2 / mu_app                                     (eq. 8.1)
        laminar:  Po Re = K_p, so  P = K_p mu_app N^2 D^3                  (p. 385)
        Po        = P / (rho N^3 D^5)                                      (eq. 8.5)
    valid while Re < Re_cr (the record's end of the laminar line, e.g. eq. 8.24).
    Above it: the record's constant turbulent Po (Table 8.1) when Re >= 6370 Po^-1/3
    (eq. 8.8, Grenville et al.); between the two, the book says no simple relation
    exists and the power is read off a curve (p. 386): REFUSED.

    THE UNCERTAINTY IS PRINTED.  The power carries k_s's stated uncertainty (the
    book: "not uncommon ... +-25-30 %", p. 395) through the flow curve and K_p's
    stated correlation error (+-20 % for eq. 8.7), as an interval, P_low .. P_high.

    REFUSED BY NAME (R9), from the book's own stated limits (p. 395-397):
      * a flow curve with a YIELD STRESS: unyielded regions, so one average shear
        rate has no meaning (the cavern model, eq. 8.12, is not built);
      * a SHEAR-THICKENING curve (n' > 1 at or above gamma_avg): the viscosity is
        highest at the impeller, "the impeller draws enormous power" (p. 396);
      * a VISCOELASTIC fluid (declared in the record): "no satisfactory
        correlations are available" (p. 397);
      * a TIME-DEPENDENT fluid (the door refuses it);
      * a transitional Re, and a laminar relation past its line.

    Dictionary form:

        {
            name        M1;   type  agitatedVessel;   in feed;   outputs ( out );
            operation
            {
                vessel    { D_T 2.2 m; }
                impeller  { record helicalRibbon_Example85;    // an asset record, kind impeller
                            tipSpeed 1.0 m/s;                  // or  N 9.1 rpm;
                            // D 2.095 m;                      // default: D_T / (1 + clearanceRatio)
                          }
                thermalMode isothermal;                        // | adiabatic
                // outsideCorrelationWindow { reason "..."; }  // a hypothesis, said in the run
            }
        }

    KPIs: W_shaft, W_shaft_kW (the Work item), Q_kW (isothermal duty, -W), P_low_W, P_high_W,
    Re, Po, Kp, gamma_avg, mu_app, N, D, tipSpeed, k_s, T_out.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class AgitatedVessel : public UnitOperation
{
public:
    AgitatedVessel() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "agitatedVessel";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
