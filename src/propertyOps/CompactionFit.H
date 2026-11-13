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
    Choupo::CompactionFit

Description
    THE COMPACTION BENCH (DEV.md 4c C195): the three standard powder-
    compaction models fitted to a DECLARED dataset, so a group designing a
    tablet press can take a literature dataset for its formulation's main
    excipient and read the numbers its design needs.  Each model is
    LINEARISED the way its authors wrote it and fitted by ordinary least
    squares on that line -- the same straight line a student would draw by
    hand -- and the op prints the equation, its citation and its validity
    statement before the numbers.

      HECKEL (Heckel 1961a,b)        ln(1/(1 - D)) = K P + A
          D the relative density of the compact, P the compaction pressure.
          Mean yield pressure Py = 1/K.  The LINEAR region is DECLARED by the
          case (`heckel { Pmin; Pmax; }`) and never chosen by the op: the
          curvature at low pressure (particle rearrangement, fragmentation)
          and at high pressure (elastic deformation, D -> 1) is the reason
          the window exists, and choosing it from the residuals would be a
          fit judging itself.  A low Py (well under ~100 MPa) reads as a
          material that deforms PLASTICALLY; a high one as a material that
          FRAGMENTS (brittle).  Also reported: D_A = 1 - exp(-A), the
          densification the line extrapolates to at zero pressure.

      KAWAKITA (Kawakita & Ludde 1970/71)     P/C = P/a + 1/(a b)
          C = (V0 - V)/V0 the engineering volume strain, V0 the initial
          (bulk) volume.  a is the limiting strain (a ~ the initial
          porosity), 1/b a pressure (MPa) related to the yield stress of the
          particles.  C is read from a `C` column, from `V` with the
          declared `initialVolume`, or from the relative density with the
          declared `initialRelativeDensity` (C = 1 - D0/D, mass conserved).
          The pressure window is DECLARED here too.

      RYSHKEWITCH-DUCKWORTH (Ryshkewitch 1953; Duckworth 1953)
                                      sigma_t = sigma_0 exp(-k_b eps)
          eps the porosity of the compact, sigma_t its tensile strength.
          Fitted as ln(sigma_t) = ln(sigma_0) - k_b eps; sigma_0 is the
          strength extrapolated to zero porosity.  sigma_t is read from a
          `sigma_t` column or computed from a diametral crushing force of a
          flat-faced cylinder, sigma_t = 2F/(pi d t) (Fell & Newton 1970).

    ONE HOME FOR THE CURVES (DEV.md 4c C270): the Heckel and
    Ryshkewitch-Duckworth lines this op fits and prints are the functions of
    `CompactionLaws.H`, and the rated tablet press INVERTS the same functions
    (`ratedMachine`, kind tabletPress, `compaction {}`): the constants fitted
    here are the inputs a press check reads, with no second transcription.

    WHAT THE OP DOES NOT DO, said on its output: it fits ONE material.  A
    blend is not an excipient, and NO mixture rule (for Py, sigma_0 or
    k_b) is implemented -- a literature excipient stands in for the blend
    and the case must say so.  It claims no curation maturity (no held-out
    evidence, so no `curation()` verdict); where the case declares the
    values the SOURCE itself reports (`reported {}`), both are printed side
    by side as a cross-check, never as a tuning target.

    A model is fitted when its block is present.  A block whose declared
    window holds no point REFUSES; one holding fewer than (parameters + 2)
    = 4 points REFUSES, both by name: a two-parameter line through three
    points has one residual degree of freedom and an R^2 that says nothing.

    Dictionary form:

        {
            name     mcc;
            type     compactionFit;
            material "Avicel PH-102";
            dataset  "constant/experiments/mcc.dat";   // columns below
            trueDensity 1.59 g/cm3;    // only for a `density` column
            heckel      { Pmin 50 MPa; Pmax 200 MPa; reason "..."; }
            kawakita    { Pmin 10 MPa; Pmax 200 MPa; initialRelativeDensity 0.3; }
            ryshkewitch { dataset "constant/experiments/mcc-tensile.dat"; }
            reported    { Py 90 MPa; source "Table 2"; }
        }

    Dataset columns (unit strings checked, nothing converted): P [MPa];
    one of D [-], porosity [-] or density [g/cm3]; optionally sigma_t [MPa]
    or F [N] with d [mm] and t [mm]; optionally V [cm3] or C [-].  Any block
    may name its own `dataset`, because a paper tabulates in-die pressure
    and tablet strength in different tables.

    Publishes tables `heckel`, `kawakita`, `ryshkewitch` (every row of the
    dataset, the fitted line at it, the residual and an inWindow flag) and
    their default views (the fitted curve from `heckelLine`, `kawakitaLine`,
    `ryshkewitchLine`: 21 points over the fitted points only); diagnostics are each model's parameters, R2,
    n_<model>, the 95 % half-widths, and paper_<key> / dev_<key>_pct where
    a reported value was declared.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class CompactionFit : public PropertyOperation
{
public:
    CompactionFit() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    //  The headline is what THIS run fitted: the models whose blocks the
    //  case declared, never a fixed list covering every path.
    std::vector<std::string> headline() const override
    {
        std::vector<std::string> h;
        for (const char* k : { "heckel_Py_MPa", "kawakita_a", "kawakita_invb_MPa",
                               "ryshkewitch_sigma0_MPa", "ryshkewitch_kb" })
            if (diag_.count(k)) h.push_back(k);
        return h;
    }
    std::string diagnosticUnit(const std::string& key) const override;
    std::vector<PublishedTable> publishedTables() const override { return tables_; }
    std::string defaultViews(const std::string& opName) const override;

private:
    std::string type_ = "compactionFit";
    std::map<std::string, scalar> diag_;
    std::vector<PublishedTable> tables_;
};

} // namespace Choupo
