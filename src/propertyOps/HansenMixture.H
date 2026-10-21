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
    Choupo::HansenMixture

Description
    Which solvent, or which solvent mixture, for a given substance: the Hansen
    distance of DECLARED solvents -- pure, or blended two at a time along a
    composition sweep -- from a DECLARED target (DEV.md 4c C128, 2026-10-21).

        delta_k,mix = sum_i phi_i delta_k,i             k = D, P, H
        Ra^2        = 4 (dD - dD,t)^2 + (dP - dP,t)^2 + (dH - dH,t)^2
        RED         = Ra / R0                            only where R0 is declared

    The first line is the usual volume-fraction rule for a mixed solvent; the
    second is Hansen's distance with the factor 4 on the dispersion term, as
    the 1967 thesis writes it (Eq. 8.2: "the unit distance for dD is taken as
    twice that for dP and dH"); the third is the relative energy difference,
    inside the solute's solubility sphere when below 1.

    A SEPARATE OP, NOT A MODE OF `solubilityParameter`.  That op prices every
    component of the case on its own, from the latent heat and the molar
    volume, and audits a declared triple against that derivation.  This one
    takes a TARGET, a list of SOLVENTS, a composition with a declared basis,
    a temperature and a phase check, and publishes one row per composition.
    Two grammars and two outputs under one `type` word would be one op with
    two unrelated questions; the Teas fractions they share are three lines.

    WHAT IS STATED ON EVERY RUN, because each is an approximation a reader
    must be able to see:

      * THE MIXTURE RULE is a volume-fraction average.  It assumes the two
        solvents keep their own cohesive-energy split when mixed and that the
        mixture's volume is the sum of the parts (no excess volume) -- a rule
        of thumb Hansen used and verified on mixtures of non-solvents, never
        a theorem.
      * THE BASIS.  A composition is declared in `volume`, `mass` or `mole`;
        mass and mole are converted to volume fractions through each
        solvent's record `Vliq` and `MW`, and the conversion is printed per
        point.  `Vliq` is the record's 25 C value: the conversion carries
        that approximation too.
      * THE TEMPERATURE IS NOT DECORATIVE (adjustment 4 of C128).  Every
        `hansen {}` block carries its reference `Tref`; the run states it and
        states that the parameters are HELD CONSTANT at it -- no correction
        exists in this engine -- so the declared `T` serves the phase check
        alone.  A `T` away from `Tref` is announced into the caveat block.
      * THE PHASE CHECK, three outcomes, each a published WORD per point:
            homogeneous   the case's activity model finds the solvent pair
                          stable as ONE liquid at that composition (Michelsen
                          tangent-plane distance, `solver::michelsenTPD` --
                          the same test the flash's `phaseSet auto` runs);
                          the mixture rule applies, with the assumptions above;
            twoPhase      the model finds a second liquid.  The op REFUSES to
                          represent the pair as one homogeneous solvent
                          there: no averaged triple, no Ra and no RED are
                          published for the point, and the run says that a
                          two-phase pair is not useless (it may serve an
                          extraction) -- only that it is not one solvent;
            notVerified   nothing in the case can decide: the liquid is
                          `ideal` (gamma = 1 has no excess Gibbs energy and
                          can never demix, so its "stable" would be said of
                          every pair), or the pair's parameters were
                          substituted by the authorised ideal default.  The
                          mixture rule is applied and the point is marked as
                          unverified.
        A pure solvent carries the word `pure` -- one component, nothing to
        split.  The check asks the FIRST declared liquid phase's gamma(T, x),
        which is a fact about the model and not about any flash's phase set.
      * AFFINITY IS NOT SOLUBILITY.  Ra is a compatibility indicator in the
        Hansen approach -- a distance in a parameter space fitted to
        dissolves / does-not-dissolve observations.  No concentration (g/L)
        comes out of it, and the op says so rather than letting a small Ra
        read as a saturation.

    WHAT IT REFUSES, each by name: no `target`; a target record with no
    `hansen {}` block; a `hansen {}` block with no `Tref` (refused by the one
    reader, `Component::readHansenBlock`); fewer than one solvent; a solvent
    not in the case's thermophysical system; a solvent with no `hansen {}`,
    no `Vliq`, or (mass basis) no `MW`; a `composition {}` with other than
    exactly two solvents (a sweep is a LINE between two solvents -- three make
    a triangle this op does not draw); a basis word it does not know; fewer
    than two sweep points.

    OUTPUT, published implies pinned: one CSV row per point (the `csv`
    golden kind reads any cell) carrying the composition in the declared
    basis and as volume fractions, the mixed triple, the Teas fractions
    (fd/fp/fh, so a GUI draws the triangle and computes nothing), Ra, RED
    where defined, the phase word and the TPD tm; diagnostics for the
    minimum (`Ra_min_MPa05`, `s_at_min`, `RED_min`), the pure ends
    (`Ra_pure_<solvent>`) and the phase-word counts; and the top-level
    result block `hansenMixtures`, which mirrors the rows as structure with
    the target, the solvents, their sources' reference temperature, the
    basis, the assumptions and the phase-check verdict.

    A SCREEN IS THE SWEEP WITHOUT A COMPOSITION BLOCK: `solvents ( ... )`
    with no `composition {}` evaluates each declared solvent pure, one row
    each, which is how a target is confronted with a published table of
    dissolution observations (solvent03).

SourceFiles
    HansenMixture.cpp

\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class HansenMixture : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    std::vector<std::string> headline() const override { return head_; }
    std::pair<std::string, std::string> resultBlock() const override
    { return { "hansenMixtures", block_ }; }

private:
    std::string type_ = "hansenMixture";
    std::map<std::string, scalar> diag_;
    std::vector<std::string> head_;
    std::string block_;
};

} // namespace Choupo
