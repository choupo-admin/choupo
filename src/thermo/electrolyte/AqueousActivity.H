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
    Choupo::electrolyte::AqueousActivity

Description
    Abstract base for an AQUEOUS-PHASE, PER-ION activity-coefficient model on a
    MOLALITY basis -- the currency the SpeciationSolver's mass-action network
    speaks (gamma_i m_i = a_i, with i an ion / dissolved complex referenced to
    the infinite-dilution-in-water state).

    WHY A NEW BASE (and not Choupo::ActivityModel) -----------------------------
    The settled property contract forbids a "parallel I* taxonomy", i.e. a
    DUPLICATE of an existing hierarchy.  This is NOT a duplicate: it is the
    FIRST interface of its kind in Choupo.  The molecular `ActivityModel`
    (src/thermo/activityCoefficient/) is a mole-fraction, SYMMETRIC-frame,
    per-component model -- gamma_i(T, x) on the Lewis-Randall reference with
    pure-liquid standard states.  An aqueous electrolyte gamma is a DIFFERENT
    object: molality currency, an UNSYMMETRIC (infinite-dilution-in-water)
    reference, charged species, and (for Pitzer/eNRTL) a gamma that depends on
    the FULL composition through ionic strength and specific-ion interaction --
    not on a single mole-fraction vector.  The two cannot share a signature
    without lying about one of them, so `ActivityModel` is left untouched and
    this sibling base is introduced for the aqueous per-ion currency.

    THE INTERFACE SHAPE (settled design) ---------------------------------------
    `evaluate(IonState, T)` is handed the WHOLE frozen state of one
    gamma-fixed-point pass:
      * the full molality vector + matching charges of every aqueous species,
      * the ionic strength I [mol/kg] computed from them,
      * the temperature T [K].
    Davies needs only (z, I, T) and ignores the rest; PitzerHMW (slice S2) will
    need the FULL molality vector and charges (its ln gamma_i is a double sum
    over ALL species, not a function of I alone).  Passing the whole state now
    means S2 adds a builtin with ZERO interface churn.

    `evaluate` returns an `ActivityResult` that carries, frozen for the pass:
      * `A`        -- the Debye-Huckel slope at T (echoed into the report;
                      Davies' log10-base A, 0.51 at 25 C),
      * `gamma(z)` -- gamma for an ion of charge z (the per-ion accessor the
                      SpeciationSolver calls for each master / complex / H+;
                      Davies is a pure function of |z|, I, A so a charge-keyed
                      accessor reproduces today's per-species call EXACTLY).
                      The accessor returns the activity COEFFICIENT itself (not
                      its log) computed by the SAME expression as the inline
                      Davies it replaces -- so the byte-for-byte values the
                      solver feeds into log/multiply downstream are unchanged.
    S2 (LANDED): Pitzer gamma is species-SPECIFIC (not a function of charge
    alone).  `IonState` now carries per-species identity (`name`, parallel to
    molality/charge) and `ActivityResult` gains an OPTIONAL per-IDENTITY
    accessor `gammaNamed(name, z)` alongside `gamma(z)`; the Davies builtin
    leaves `gammaNamed` null and keeps the charge-only form, so the solver falls
    back to `gamma(z)` everywhere for Davies and that path stays byte-identical.
    PitzerHMW (builtin "pitzer") fills `name`/`gammaNamed`; the solver prefers
    the named accessor whenever it is set.

    The water activity: ln a_w = -(M_w/1000) phi sum_i m_i.  The osmotic
    coefficient phi is the solvent's non-ideality -- it is NOT 1 in a real brine
    (a_w < x_w; this is the osmotic pressure).  A model that can supply phi fills
    `ActivityResult::osmotic`; PitzerHMW returns the rigorous HMW osmotic sum on
    the SAME virial parameters as its gammas, so a_w is Pitzer-consistent (the
    gypsum a_w^2 leg, the boiling-point elevation, the osmotic pressure all use
    it).  When `osmotic` is null (Davies), the solver keeps phi = 1 (the dilute
    approximation, consistent with Davies being indicative beyond I ~ 0.5).
\*---------------------------------------------------------------------------*/

#pragma once

#include <functional>
#include <iosfwd>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

// The frozen state of one gamma-fixed-point pass handed to an activity model.
// Davies reads only {I, T}; PitzerHMW (S2) reads the full {name, molality,
// charge} vectors as well.  `name`, `molality` and `charge` are parallel arrays
// over the aqueous species in the pass (masters + H + complexes), EXCLUDING any
// species not in the aqueous phase (e.g. the exchange site X-, which the solver
// keeps out of I / a_w by construction).
//
// `name` is the per-species identity (e.g. "Na", "Cl", "H", "CaCO3aq").  Davies
// ignores it (gamma is a pure function of |z|, I); Pitzer NEEDS it -- ln gamma_i
// is a double sum over EVERY other ion, keyed by the (cation,anion) pair params
// in pairs.dat, so the model must know WHICH ions are present, not just their
// charges.  S1 left `name` empty (Davies-only); S2 fills it.
struct IonState
{
    std::vector<std::string> name;  // species identity (parallel to molality)
    std::vector<double> molality;   // m_i [mol/kg water]
    std::vector<double> charge;     // z_i (parallel to molality)
    double              I = 0.0;    // ionic strength [mol/kg] (solver-computed)
    double              T = 298.15; // [K]
};

// The model's output for the pass: the Debye-Huckel slope echoed into the
// report plus the per-ion gamma accessors the mass-action network calls.
//
//   gamma(z)            -- gamma for an ion of charge z (the ONLY accessor
//                          Davies needs; a pure function of |z|, I, A).
//   gammaNamed(name, z) -- OPTIONAL per-IDENTITY gamma (Pitzer).  When a model
//                          sets it, the solver PREFERS it for every species it
//                          can name (masters, H, complexes), passing the charge
//                          as the fallback the implementation uses for a species
//                          whose name is absent from its parameter set.  When it
//                          is null (Davies), the solver falls back to gamma(z)
//                          EVERYWHERE -- so the Davies path is byte-identical to
//                          the charge-only form it had before this field existed.
struct ActivityResult
{
    double A = 0.51;                        // Debye-Huckel slope at T (log10 base)
    std::function<double(double z)> gamma;  // gamma_i for an ion of charge z
    std::function<double(const std::string& name, double z)> gammaNamed; // optional (Pitzer)
    // OPTIONAL osmotic coefficient phi for the frozen pass (the solvent's non-
    // ideality).  When a model sets it, the solver computes the water activity
    // as  a_w = exp(-M_w/1000 * phi * sum_i m_i)  instead of the phi = 1 dilute
    // approximation.  PitzerHMW fills it (the rigorous HMW osmotic sum on the
    // SAME parameters as the gammas); Davies leaves it null -> the solver keeps
    // phi = 1 (consistent with Davies being a dilute/indicative model).
    std::function<double()> osmotic;
};

class AqueousActivity
{
public:
    virtual ~AqueousActivity() = default;

    // The activity model's registered name (e.g. "davies").
    virtual const std::string& modelName() const = 0;

    // Freeze the per-ion activity coefficients for the current pass state.
    virtual ActivityResult evaluate(const IonState& st, double T) const = 0;

    // OPTIONAL glass-box parameter dump: print, ONCE per solve at verbosity >= 3,
    // exactly which model parameters are ACTIVE for the present ion set, so the
    // student SEES the parameter set in play (not a black box).  Default no-op
    // (Davies has only A; nothing to enumerate).  PitzerHMW overrides it to list
    // the live beta/Cphi binaries, the theta/psi ternaries, and the lambda/zeta
    // neutral terms.  Takes the same frozen IonState the gammas were built from.
    virtual void announceParameters(const IonState& /*st*/,
                                    std::ostream& /*os*/) const {}

    // ---- explicit factory (the settled Choupo pattern; NO auto-registration) -
    using Factory = std::function<std::unique_ptr<AqueousActivity>()>;

    static void registerType(const std::string& name, Factory f);

    // Build a model by name; throws listing the available names on an unknown
    // one (only "davies" is registered in S1).
    static std::unique_ptr<AqueousActivity> New(const std::string& name);

    // The names currently registered (for the unknown-name refusal message).
    static std::vector<std::string> availableTypes();

    // Register the builtins (S1: Davies only).  Called EXPLICITLY in main.cpp,
    // mirroring every other Choupo registry -- no static-init magic.
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace electrolyte
} // namespace Choupo
