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
    Choupo::Membrane

Description
    A pure-membrane property bundle: identification, transport-model
    coefficients, and rating limits.  Loaded from a single dictionary
    file under `data/standards/membranes/<name>.dat`.

    Choupo's transport model is the classical solution-diffusion
    pair:
        J_w  =  A_w · ( ΔP  -  Δπ )                  [m/s of pure water]
        J_s  =  B_s · (c_membrane  -  c_permeate )  [m/s × kmol/m³ → kmol/(m²·s)]
    where Δπ is the trans-membrane osmotic pressure (Section §X of the
    theory guide).  A_w is a single value per membrane; B_s is keyed
    by solute (the same membrane rejects NaCl, MgSO4 and glucose
    differently).

    Membranes ship with optional pressure / temperature ratings used
    by the unit op for sanity-warnings and by the GUI for plot bounds.

    The Membrane class does NOT know anything about geometry --- that
    lives on the unit op (`SpiralWoundModule`; future
    geometries plug in alongside without changing this class).  A
    given membrane material can be deployed in any geometry.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Membrane
{
public:
    Membrane() = default;

    // Load from a dictionary representing a single membrane.dat file.
    void readFromDict(const DictPtr& dict);

    // ---- Identification ----------------------------------------------------
    const std::string& name()        const { return name_;        }
    const std::string& kind()        const { return kind_;        }  // "RO" | "NF" | "UF"
    const std::string& manufacturer()const { return manufacturer_;}

    // ---- Solution-diffusion transport coefficients ---------------------
    // Pure-water permeability (single value, characteristic of the
    // membrane material at its rated temperature).  Units: m / (s · bar).
    scalar A_w() const { return A_w_; }

    // Per-solute permeability, keyed by component short-name.  Units:
    // m/s (in the solution-diffusion form J_s = B_s · Δc with Δc in
    // kmol/m³).  Returns 0 if the membrane has no data for the named
    // solute --- the unit op then treats that solute as perfectly
    // rejected (J_s = 0) and emits a warning at construction.
    scalar B_s(const std::string& soluteName) const;

    bool hasSolute(const std::string& soluteName) const
    {
        return Bs_.find(soluteName) != Bs_.end();
    }

    const std::map<std::string, scalar>& allBs() const { return Bs_; }

    // ---- Ratings (for sanity-warnings only --- do not affect physics) -----
    scalar P_max_bar()  const { return P_max_;  }    // 0 = unknown
    scalar T_max_K()    const { return T_max_;  }
    scalar pH_min()     const { return pH_min_; }    // 0 = unknown
    scalar pH_max()     const { return pH_max_; }
    scalar MWCO_Da()    const { return MWCO_;   }    // nominal molecular-weight cut-off (NF/UF), Da

    // ---- DSPM-DE charged-pore parameters (optional; absence-tolerant) -----
    //
    // The Donnan-steric pore model with dielectric exclusion (Bowen & Welfoot,
    // CES 57 (2002) 1121) describes the membrane as a bundle of cylindrical
    // pores of radius r_p, of total porosity-over-thickness A_k/Delta_x, carrying
    // a fixed volumetric charge density X_d and a reduced pore-fluid dielectric
    // constant eps_p.  A membrane that carries NONE of these CANNOT select the
    // `DSPM-DE` transport law (the loader refuses loudly); a membrane that carries
    // r_p + (A_k/Delta_x) but not X_d / eps_p selects a STERIC-only DSPM (X_d = 0,
    // eps_p = epsWater(T) -> Born term off).  v1 X_d is a CONSTANT scalar; its real
    // pH- / concentration-dependence is acknowledged in the .dat provenance and the
    // run header (not modelled here -- the honest-limitation credo).
    bool   hasPoreModel() const { return hasPore_; }

    scalar poreRadius_m()         const { return r_p_;   }   // r_p  [m]
    scalar porosityOverThickness()const { return AkdX_;  }   // A_k/Delta_x [1/m]
    scalar chargeDensity_molm3()  const { return X_d_;   }   // X_d  [mol/m^3], SIGNED
    scalar poreDielectric()       const { return eps_p_; }   // eps_p [-]; 0 = absent => Born off
    bool   hasChargeDensity()     const { return hasXd_;    }
    bool   hasPoreDielectric()    const { return eps_p_ > 0.0; }

private:
    std::string name_, kind_, manufacturer_;
    scalar      A_w_     = 0.0;
    std::map<std::string, scalar> Bs_;
    scalar      P_max_   = 0.0;
    scalar      T_max_   = 0.0;
    scalar      pH_min_  = 0.0;
    scalar      pH_max_  = 0.0;
    scalar      MWCO_    = 0.0;

    // DSPM-DE pore tier (raw SI, like the ions.dat radius/D0 precedent).
    bool        hasPore_ = false;
    scalar      r_p_     = 0.0;   // pore radius [m]
    scalar      AkdX_    = 0.0;   // porosity / thickness [1/m]
    bool        hasXd_   = false;
    scalar      X_d_     = 0.0;   // fixed charge density [mol/m^3], signed
    scalar      eps_p_   = 0.0;   // pore dielectric constant [-]; 0 = absent
};

} // namespace Choupo
