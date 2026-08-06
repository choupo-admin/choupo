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
    Choupo::SizeDistribution

Description
    A particle (or droplet) size distribution, as a MODEL rather than a table.

    WHY THIS EXISTS, and why it is shaped like this.  Until 2026-08-06 a size
    distribution in Choupo was

        struct ParticleSizeDistribution { vector<scalar> diameter, massFrac; };

    -- two vectors, no moments, no continuous form.  It was the ONLY physical
    model in the tree that was a bare struct instead of a registered
    polymorphic class: `ActivityModel`, `EquationOfState`, `HeatCapacityModel`
    and `VaporPressureModel` are all abstract bases with an explicit factory
    selected by a dict.  The particle side was the odd one out.

    Three things followed from that, and all three are real:

      * a CONTINUOUS law -- Rosin-Rammler, log-normal -- had nowhere to live,
        so a case author had to discretise it by hand.  The MODEL ended up in
        the input file instead of in a class, which inverts this project's
        whole doctrine;
      * no moment existed anywhere.  d32, d50, m0..m3 are the working
        vocabulary of particle technology and the corpus computed none of
        them.  (`SprayDryer` has a `d32`, but it is an ATOMISATION
        correlation -- a droplet-generation result, not a moment of a
        distribution.  Same name, different quantity.);
      * population balance -- MSMPR, the McCabe delta-L law, the classical
        crystalliser theory -- is moment dynamics, and cannot be written on a
        fixed bin vector.

    THE SHAPE IS OPENFOAM'S, deliberately.  `src/OpenFOAM/distributions/`
    carries a runtime-selectable family (RosinRammler, normal, exponential,
    tabulatedCumulative, tabulatedDensity, and an `unintegrable` base for
    those with no closed-form integral) in which the TABULAR forms are
    subclasses beside the analytical ones rather than the representation
    itself.  Choupo had that inverted.

    OpenFOAM also settles WHERE this belongs: its distributions live in
    `src/OpenFOAM/` -- the core library -- not in `thermophysicalModels`.  A
    distribution is generic mathematics that physics happens to use, so it
    sits at the bottom where every band can read it.

    THE MOMENT BASIS IS THE POINT, and it is the deepest thing borrowed here.
    OpenFOAM's base carries two exponents:

        Q_        the moment order the distribution is DECLARED in
        sampleQ_  the order the CONSUMER wants
        q()       = sampleQ_ - Q_, the conversion

    A distribution knows which basis it is expressed in and converts to the
    basis asked for.  That is the classical d10 / d32 / d43 bookkeeping --
    number versus surface versus volume weighting -- made structural instead
    of left to each consumer to get right.  A sieve analysis is mass-based
    (Q = 3); a microscope count is number-based (Q = 0); the Sauter mean is
    the ratio of the third to the second moment of the NUMBER density.  Most
    reported particle-size errors are a confusion between those, and the only
    defence is to make the engine carry the basis with the numbers.

    It is also, structurally, the SAME problem as the thermodynamic standard
    state: a quantity is expressed in one basis, a consumer needs another, and
    the conversion must be an object rather than an assumption.  OpenFOAM
    solves it twice, the same way, in two unrelated domains --
    `docs/design/theory-in-class-structure-study.md`.

    WHAT THIS SLICE DOES NOT DO.  `ProcessStream` still carries the tabular
    `ParticleSizeDistribution` by value; making the stream hold a polymorphic
    distribution needs clone semantics on every stream copy and is a separate,
    wider change.  A model here can DISCRETISE itself into that struct
    (`toTabular`), so a case may now declare a continuous law and the engine
    turns it into the bins the existing unit operations already consume.
    Nothing a consumer sees changes, and no golden moves.
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

//  Moment orders, named.  A bare integer 3 in a call site is unreadable and
//  a wrong one is invisible; these are the four that occur in practice.
namespace momentBasis
{
    constexpr int number = 0;
    constexpr int length = 1;
    constexpr int area   = 2;
    constexpr int volume = 3;   //  == mass for constant density
}

class SizeDistribution
{
public:

    using Factory =
        std::function<std::unique_ptr<SizeDistribution>(const DictPtr&)>;

    //  EXPLICIT registration, per project doctrine: no macro self-registration
    //  and no static-init order fiasco.  `registerBuiltins()` is called from
    //  main, where a student can read what exists.
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<SizeDistribution> New(const DictPtr& d);
    static void registerBuiltins();
    static std::vector<std::string> availableTypes();

    virtual ~SizeDistribution() = default;

    virtual std::string type() const = 0;

    //  The basis the distribution's own density is expressed in.
    int declaredBasis() const { return Q_; }

    //  Density and cumulative, IN THE DECLARED BASIS.
    virtual scalar pdf(scalar d) const = 0;
    virtual scalar cdf(scalar d) const = 0;

    virtual scalar dMin() const = 0;
    virtual scalar dMax() const = 0;

    //  ---- Derived, and derived ONCE ------------------------------------
    //
    //  The k-th moment expressed in `basis`.  With the density declared in
    //  basis Q, the density in basis S is proportional to d^(S-Q) f_Q(d), so
    //
    //      m_k^(S) = INT d^(k+S-Q) f_Q dd  /  INT d^(S-Q) f_Q dd
    //
    //  which is the whole of the d10/d32/d43 bookkeeping in one place.  A
    //  subclass with closed-form moments overrides `rawMoment`; the default
    //  integrates numerically, so a distribution without an analytic integral
    //  still answers (OpenFOAM's `unintegrable` idea, without the ceremony).
    scalar moment(int k, int basis) const;

    //  Sauter mean diameter, d32 = m3/m2 of the NUMBER density.  The single
    //  most-used average in mass transfer and in gas-solid separation, and
    //  the one most often computed in the wrong basis.
    scalar d32() const;

    //  The diameter below which fraction `p` (0..1) of the distribution lies,
    //  measured in `basis`.  d50 in the volume basis is the median by mass.
    scalar dPercentile(scalar p, int basis) const;

    //  Discretise onto `nBins` logarithmically spaced bins between dMin and
    //  dMax, MASS-weighted -- the form `ParticleSizeDistribution` holds and
    //  every existing consumer reads.  This is the bridge that lets a case
    //  declare a continuous law today without touching a unit operation.
    void toTabular(int nBins,
                   std::vector<scalar>& diameter,
                   std::vector<scalar>& massFrac) const;

protected:

    explicit SizeDistribution(int declaredBasis) : Q_(declaredBasis) {}

    //  INT d^n f_Q(d) dd over the support, in the declared basis.  Override
    //  where a closed form exists; the base integrates.
    virtual scalar rawMoment(int n) const;

    int Q_;

private:

    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
