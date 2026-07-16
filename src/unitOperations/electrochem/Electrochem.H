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
    Choupo::electrochem

Description
    The SHARED, glass-box electrochemistry kernel: the handful of
    textbook relations every electrochemical unit operation (this round:
    electrodialysis; later: electrolysis, fuel cells) draws on, written
    ONCE here so no unit re-derives them.

    Everything is a free function on first-principles constants
    (Constants.H: R, Faraday).  No state, no factory -- these are the
    Nernst / Faraday / Butler-Volmer EQUATIONS themselves, the rung
    below any unit op.

    PRIMARY references (cited per relation in the doc-comments):
      * Nernst equation, Faraday's law of electrolysis -- any electro-
        chemistry text; here following Bard & Faulkner, "Electrochemical
        Methods: Fundamentals and Applications", 2nd ed. (2001), ch. 2.
      * Butler-Volmer kinetics (the UNUSED stub for a future electrolysis
        unit) -- Bard & Faulkner ch. 3; Newman & Thomas-Alyea,
        "Electrochemical Systems", 3rd ed. (2004).

    The ion-transport DATA (limiting diffusivity D0, hydrated radius) the
    electrodialysis unit needs lives in data/standards/species/aqueous.dat
    (per-value provenance: Nightingale 1959 -- PROVENANCE.md).  This header
    adds the refuse-LOUDLY accessors ionRadius() / ionD0() for that tier:
    a run needing an ion without the transport tier errors clearly, never a
    silent zero (the "no silent crutch" credo).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Constants.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // findIon (case-local overlay aware)

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace electrochem {

// ---- fundamental constant --------------------------------------------------
// Faraday's constant [C/mol] = Avogadro x elementary charge.  Kept local to the
// electrochem namespace (the only place that needs it) so Constants.H stays the
// general-thermo set; value is CODATA 2018 (N_A x e), consistent with the R/N_A
// already in Constants.H.
constexpr scalar Faraday = 96485.33212;   // [C/mol]

// ---- Nernst equation -------------------------------------------------------
// Equilibrium membrane / electrode potential of a single ionic species across a
// concentration ratio:
//
//      E = (R T) / (z F) * ln( a_high / a_low )                 [V]
//
// `z` is the ion charge magnitude (z != 0); `a_ratio = a_high / a_low` is the
// dimensionless ACTIVITY ratio across the boundary (use real activities a = g m,
// not bare concentrations); T in kelvin.  For electrodialysis this is the
// per-cell-pair membrane (Donnan + diffusion) potential at zero current.
// Reference: Bard & Faulkner (2001) Eq. 2.1.6; Strathmann, "Ion-Exchange
// Membrane Separation Processes" (2004), Eq. 3.x for the membrane form.
inline scalar nernst(scalar z, scalar a_ratio, scalar T)
{
    if (z == 0.0)
        throw std::runtime_error("electrochem::nernst: ion charge z must be "
            "non-zero (z = 0 has no Nernst potential)");
    if (a_ratio <= 0.0)
        throw std::runtime_error("electrochem::nernst: activity ratio must be "
            "> 0 (got " + std::to_string(a_ratio) + ")");
    return (constant::R * T) / (z * Faraday) * std::log(a_ratio);
}

// ---- Faraday's law of electrolysis -----------------------------------------
// Molar transfer rate of a species driven across a boundary by a current I, at a
// current efficiency (current utilisation) xi:
//
//      n_dot = xi * I / (z F)                                   [mol/s]
//
// `I` is the cell-pair current [A], `z` the ion charge magnitude (z != 0), `xi`
// the dimensionless current efficiency (fraction of the charge that does the
// intended ion transfer; the rest is co-ion leakage, water transport, parasitic
// reaction).  In electrodialysis this is the salt removed PER CELL PAIR per unit
// current; the unit multiplies by the number of cell pairs.
// Reference: Faraday's law; Bard & Faulkner (2001) Eq. 1.3.5.
inline scalar faradayMolarRate(scalar I, scalar z, scalar xi)
{
    if (z == 0.0)
        throw std::runtime_error("electrochem::faradayMolarRate: ion charge z "
            "must be non-zero");
    return xi * I / (z * Faraday);
}

// ---- Butler-Volmer kinetics (DOCUMENTED-BUT-UNUSED STUB) -------------------
// The electrode-kinetics current density as a function of overpotential eta:
//
//      i = i0 * ( exp( alpha_a F eta / (R T) ) - exp( -alpha_c F eta / (R T) ) )
//
// `i0` exchange current density [A/m2]; `alpha_a`, `alpha_c` anodic / cathodic
// transfer coefficients [-]; `eta` overpotential [V]; T [K].  Returns [A/m2].
//
// NOT USED by electrodialysis v1 (whose electrode reactions are lumped into a
// single ANNOUNCED `E_electrodes` term -- no kinetic resolution).  It is placed
// here NOW, fully implemented, so a future electrolysis / fuel-cell unit can add
// real electrode kinetics WITHOUT forking the electrochem kernel (the "organise
// classically, no per-unit hacks" credo).
// Reference: Bard & Faulkner (2001) Eq. 3.4.10 (the Butler-Volmer equation).
inline scalar butlerVolmer(scalar i0, scalar alpha_a, scalar alpha_c,
                           scalar eta, scalar T)
{
    const scalar f = Faraday / (constant::R * T);
    return i0 * (std::exp(alpha_a * f * eta) - std::exp(-alpha_c * f * eta));
}

// ---- ion-transport tier accessors (refuse-LOUDLY) --------------------------
// Read the `radius` [m] / `D0` [m2/s] fields from ions.dat for the named ion
// SPECIES key (e.g. "Na", "Cl").  The catalogue is resolved case-local-first by
// electrolyte::findIon (the standard fractal overlay).  These REFUSE LOUDLY when
// the ion is absent OR lacks the transport tier -- never a silent zero (the run
// would otherwise compute a meaningless conductivity / limiting current).

// Effective (Stokes/hydrated) ion radius [m].
inline scalar ionRadius(const std::string& species)
{
    auto row = electrolyte::findIon(species);
    if (!row)
        throw std::runtime_error("electrochem: ion '" + species + "' has no row "
            "(case-local constant/electrolyte/ions.dat or "
            "data/standards/species/aqueous/) -- an electrochemical run needs an "
            "IONIC species (master ions Na, Cl, K, Ca, Mg, SO4, OH, H).");
    if (!row->found("radius"))
        throw std::runtime_error("electrochem: ion '" + species + "' has no "
            "`radius` in ions.dat -- the ion-transport tier (radius + D0) is "
            "only curated for the eight master ions an electrodialysis run can "
            "transport (Nightingale 1959; see PROVENANCE.md).  Add a `radius` "
            "row (raw SI metres) before using '" + species + "' in an "
            "electrochemical unit.");
    return row->lookupScalar("radius");
}

// Infinite-dilution (Nernst) diffusion coefficient [m2/s], 25 C.
inline scalar ionD0(const std::string& species)
{
    auto row = electrolyte::findIon(species);
    if (!row)
        throw std::runtime_error("electrochem: ion '" + species + "' has no row "
            "(case-local constant/electrolyte/ions.dat or "
            "data/standards/species/aqueous/) -- an electrochemical run needs an "
            "IONIC species (master ions Na, Cl, K, Ca, Mg, SO4, OH, H).");
    if (!row->found("D0"))
        throw std::runtime_error("electrochem: ion '" + species + "' has no "
            "`D0` in ions.dat -- the ion-transport tier (radius + D0) is only "
            "curated for the eight master ions an electrodialysis run can "
            "transport (Nightingale 1959; see PROVENANCE.md).  Add a `D0` row "
            "(m2/s, derived from lambda0 via Nernst-Einstein) before using '"
            + species + "' in an electrochemical unit.");
    return row->lookupScalar("D0");
}

} // namespace electrochem
} // namespace Choupo
