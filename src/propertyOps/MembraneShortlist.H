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
    Choupo::MembraneShortlist

Description
    FROM A FUNCTIONAL CLASS TO THE COMMERCIAL ELEMENTS THAT DO IT -- THE
    SHORTLIST (DEV.md 4c C189 slice 5).  NO SCORE, NO RANKING.

        operations
        (
            {
                name    shortlist;
                type    membraneShortlist;
                class   NF_DIVALENT_SELECTIVE;   // a `kind membraneClass`
                solute  MgSO4;                   // the salt the choice is about
                conditions
                {
                    T               298.15 K;
                    P               10 bar;
                    pressureBasis   feedAbsolute;   // | feedGauge (declared, never defaulted)
                    recovery        0.15;           // per element
                    feedMassFraction 2.0e-3;
                    pH              7;              // optional
                }
                operation { ... }   // the film / pressure-drop / polarisation
                                    // blocks and P_permeate, exactly as a
                                    // spiralWoundModule unit writes them
                output { file "shortlist.csv"; }
            }
        );

    THE TWO STEPS.
      (1) HARD FILTERS, on the module record alone: the membrane is of the
          class's type (NF | RO); the record carries ONE rated test of the
          asked solute; its stated observed rejection of every salt the
          class rates AND the record rates lies inside the class's band
          (the solute among them); the declared limits {} hold at the
          student's feed pressure, temperature and (when given) pH.  A limit
          the record does not state is not a filter and prints "n/s".
      (2) RE-RATING.  Each survivor is run with the SAME transport law, film
          and spacer the unit would use -- constantRejection, its R_int
          DERIVED from that record's own rated test by the slice-1 inversion
          -- but at the STUDENT'S conditions, not the sheet's: one element,
          the student's pressure, temperature and feed concentration, the
          feed flow found so the element's recovery is the student's (a
          bracketed solve on the module itself).  Two more hard filters then
          apply, which need that run: the feed flow against feedFlow_max and
          the element's pressure drop against dP_max.

    EVERY CRITERION IS PUBLISHED SIDE BY SIDE (permeate flow, observed
    rejection, permeate concentration, flux, specific pressure, specific
    hydraulic energy, feed flow, pressure drop, and each limit's margin) and
    the candidates are listed in ALPHABETICAL order of their names.  There is
    no score, no weight and no rank: a weighted sum would be a hidden choice
    of what matters, and the choice is the student's.  The ranking code reads
    ONLY the performance fields above; a record's commercial-relation fields
    (`partner`, `dataVerifiedBy`) are never read here -- a source arm of
    check_membrane_shortlist holds that, and a behavioural arm shows the
    output unchanged when they are added.

    WHAT IT IS NOT.  One solute, one element, a constant intrinsic rejection
    taken at the sheet's single test: the numbers are the transport law's
    reading of a data sheet, never a guarantee of the product, and a
    manufacturer's own projection software knows more about its own element.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>

namespace Choupo {

class MembraneShortlist : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict, const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    std::vector<std::string> headline() const override
    { return { "n_candidates", "n_pass", "n_excluded" }; }
    std::string diagnosticUnit(const std::string& key) const override;

private:
    inline static const std::string type_ = "membraneShortlist";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
