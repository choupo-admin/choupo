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
    This file is part of Choupo (GPL-3.0-or-later).  See LICENSE.

Class
    Choupo::PairLookup, Choupo::ComponentLookup

Description
    ONE TOOL CALL, ONE EVIDENCE CARD (DEV.md 4c C227, slice a).  Two props
    operations that answer "what does Choupo have for this pair / this
    compound?" in a FIXED BYTE BUDGET, so a student's assistant spends its
    tokens on the answer and never on reasoning about the catalogue.

        {
            name  p1;  type pairLookup;       components ( ethanol water );
        }
        {
            name  c1;  type componentLookup;  component ethanol;   // or a CAS
        }

    THE HONESTY LADDER (pairLookup) -- the first rung that answers wins, and
    NO rung ever invents a number:

      1. curated    a catalogue pair record exists (data/standards/parameters/
                    <model>/<a>-<b>.dat): the paste-ready `source` entry, the
                    model, the validity span, the reviewStatus, the provenance.
      2. regressed  the record is Choupo's own regression (`fittedInCase`):
                    the same, plus the case that produced it and its verdict.
      3. estimate   both components carry UNIFAC groups: SAID to be a
                    predictive estimate, with the line that selects it and the
                    measured warning (weak for azeotropes / partial
                    miscibility; DEV.md C219).
      4. none       "I do not have this pair", and what the student can bring.
      (the rung "servable from the measurement archive but not fitted" is
       slice (b); the card says it does not exist yet.)

    componentLookup answers from data/standards/components/<name>.dat (a
    name, an alias or a CAS -- resolved by RECORD, never by similarity), then
    from the group-estimate lake (identity + groups only, NEVER values), then
    "I do not have it".

    THE EVIDENCE CARD is a Choupo dictionary (docs/design/the-evidence-card.md):
    fields the records carry today are filled from them; fields the C16 chain
    will add are listed under `announcedAbsent` and never filled.  The same
    text is printed and carried in the result JSON (block `lookupCards`) --
    one source.  It reads the INSTALLATION catalogue (a question about the
    catalogue, so a case with no catalogue refuses by name).
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

//  The fixed answer budget, in bytes of card text.  check_lookup_budget holds
//  every card to it and reads THIS line.
inline constexpr std::size_t kLookupCardBudgetBytes = 2048;

class LookupBase : public PropertyOperation
{
public:
    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    std::map<std::string, std::string> curation() const override
    { return { { "tier", tier_ }, { "caseSeal", caseSeal_ },
               { "releaseDiffers", releaseDiffers_ } }; }
    std::vector<std::string> headline() const override
    { return { "card_bytes", "budget_bytes" }; }
    std::pair<std::string, std::string> resultBlock() const override
    { return { "lookupCards", block_ }; }

protected:
    void publish(const std::string& opName, const std::string& kind,
                 const std::string& tier, const std::string& card,
                 const std::string& provJson, int verbosity);

    std::map<std::string, scalar> diag_;
    std::string                   tier_, caseSeal_, releaseDiffers_;
    std::string                   block_;
};

class PairLookup : public LookupBase
{
public:
    const std::string& type() const override { return type_; }
    int run(const DictPtr& dict, const ThermoPackage& thermo,
            int verbosity) override;
private:
    inline static const std::string type_ = "pairLookup";
};

class ComponentLookup : public LookupBase
{
public:
    const std::string& type() const override { return type_; }
    int run(const DictPtr& dict, const ThermoPackage& thermo,
            int verbosity) override;
private:
    inline static const std::string type_ = "componentLookup";
};

} // namespace Choupo
