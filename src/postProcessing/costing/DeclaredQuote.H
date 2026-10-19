/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::declaredQuote

Description
    A COST THE CASE DECLARES FOR AN ITEM NO CORRELATION PRICES (DEV.md 4c
    C98, Vitor's ruling 2026-10-18: "Sim, preco declarado").  A tablet press,
    a blender, a roller compactor, a coating pan, a GMP building: Choupo has
    no sizer and no cost correlation for any of them and does not invent one,
    so until now they reached the capital as NOTHING -- the apalutamide
    case's FCI was its solvent section alone.  A case may now declare a
    QUOTE per item, in the postDict's `costing {}` block:

        quotes
        (
            { unit tabletPress;          // a flowsheet unit with no sized item
              value    450000;           // in `currency`, money of `year`
              currency EUR;              // EUR | USD (USD x the run's usdToEur)
              year     2026;             // = the costing year: no index;
              // cepci 800;              //   another year: REQUIRED, the index
                                         //   at that year (C x CEPCI_run/cepci)
              basis    installed;        // installed | purchased
              // bareModuleFactor 2.5;   // purchased only, REQUIRED there,
              // bareModuleFactorSource "...";   // with where it comes from
              kind     equipment;        // equipment | facility
              source   "...";            // where the number comes from
              reason   "...";            // why it is this plant's
            }
            { item gmpBuilding; ... kind facility; ... }   // not a unit
        );

    WHAT A QUOTE BECOMES, and every step is printed on the costing table:

        C_p   = value x (CEPCI_run / cepci_quote) x (EUR per quote currency)
        C_BM  = C_p                         basis installed  (the quote IS
                                            the installed cost)
              = bareModuleFactor x C_p      basis purchased  (the CASE's own
                                            installation factor, with its
                                            source -- never one the engine
                                            chose)
        C_TM  = 1.18 x C_BM                 Turton's contingency and fee, the
                                            same 1.18 every correlation row
                                            carries (Turton.cpp), because a
                                            vendor's price carries no PROJECT
                                            contingency

    and in the FCI ladder (EconomicsPass) its C_BM enters SUM C_BM like any
    module's, so `contingencyFee` applies to it; its BASE value (the term the
    `siteFactor` auxiliary-facilities estimate multiplies) is published as
    the factor `C_BM_base`: C_BM for `kind equipment` (a machine drives the
    auxiliaries like any other module) and ZERO for `kind facility` (a
    building IS a facility -- estimating further auxiliary facilities as half
    of it would count buildings twice).

    IDENTITY.  `unit <name>` prices a flowsheet unit that has NO sized item --
    a unit the sizing pass sized, or tried to size and refused, is REFUSED
    (it is costed by its correlation, or its refusal is the finding: a quote
    beside it would price it twice or hide the refusal).  `item <name>`
    prices something that is not a unit (a building); its name may not be a
    flowsheet unit's (declare `unit` then) nor a sized item's.  Exactly one
    of the two.  Two quotes on one name are refused.

    REFUSED BY NAME: a missing or empty `source`/`reason`, a non-positive or
    non-finite value, an unknown `currency`/`basis`/`kind` word, a `cepci`
    missing for a quote of another year (or declared for one of the costing
    year: an unread number is a comment), a `bareModuleFactor` below 1 or
    without its source, or beside `basis installed`.  A quote never defaults
    a word: every one of them changes the capital.

    NOT DONE, said: no quote is checked against anything (a vendor's number
    is the vendor's), and a quote carries no size, so it writes no
    specification sheet and is placed on no plot plan by this.
\*---------------------------------------------------------------------------*/

#pragma once

#include "CostingModel.H"
#include "core/ResultRecords.H"
#include "result/SimulationResult.H"

#include <map>
#include <string>

namespace Choupo {
namespace declaredQuote {

//  The correlation word every quote's cost record carries.
inline const std::string shapeWord = "declared-quote";

//  Every quote the costing dict declares, priced, keyed by the quote's
//  identity (the unit's name or the item's).  Empty when the dict declares
//  no `quotes`.  Throws, by name, on any malformed declaration -- before any
//  number is printed, so a refused quote refuses the costing pass.
std::map<std::string, CostBreakdown>
price(const DictPtr& costingDict, const CostingModel& model,
      const SimulationResult& result);

} // namespace declaredQuote
} // namespace Choupo
