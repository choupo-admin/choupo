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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS ; Required legal notices: see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::propsPlan

Description
    THE ORDER OF A PROPERTIES WORKFLOW IS AN ENGINE FACT (DEV.md 4c C172,
    slice 2; docs/design/one-app-two-homes.md item 4).  The properties
    analogue of `Flowsheet::validateSequentialPlan`.

    choupoProps runs `propsDict.operations ( ... )` IN DECLARED ORDER and
    never re-sorts it.  So an operation that reads a file a LATER operation
    writes reads whatever is on disk from the PREVIOUS run -- a stale record
    or a missing one -- and nothing said so.  `validate()` is run once,
    before the first operation executes, and refuses BY NAME: which
    operation reads which file through which key, which later operation
    writes it through which key, and the remedy (move the writer earlier).
    Declared order stays the order.

    WHAT AN OPERATION READS AND WRITES has ONE home in the engine: the table
    in PropsPlan.cpp, one row per registered operation type, naming the KEYS
    of the op's own dict that hold a path it reads or writes (the key-path
    grammar the GUI's op schemas use in `x-choupo`: dotted, `[]` walks a list
    of dicts) and the engine default a key takes when it is absent.  A
    dependency is NEVER inferred from what a value looks like: a string is a
    path here only because the row says that key holds one.  The GUI's
    `x-choupo.writes` (kinds record / proposal) and `x-choupo.data` (kind
    experiment) are held to this table by bin/curate/check_props_order.py.

    THE PROCESS RUN AS A WRITER.  A case may carry both dicts (C152), and a
    Properties step may analyse what the Flowsheet wrote (ctrl17: the
    reaction curve of a choupoCtrl trajectory).  That step DECLARES it:

        writtenBy { trajectory process; }

    -- the KEY that holds the path, and `process`, the run that writes it.
    The declaration names the key and never repeats the path, so the path
    has one home.  A declared input that is absent REFUSES before the first
    operation runs, naming the remedy (run the Flowsheet first); a declared
    key the op does not read, a word other than `process`, a case with no
    process half, and a file a Properties step also writes each refuse.

    WHAT THIS DOES NOT CHECK, said so a clean run cannot imply it:
      - a path an op COMPUTES rather than reads from a key (`proposal auto`,
        exchange's `<file>_isotherm.csv`, enthalpyConcentration's sidecar);
      - a record read BY NAME through a registry, except a membrane record a
        fitParameters `output.record` registers (the one name a props op
        writes today; the rule that names it is `fittedRecordName` below);
      - what the case's thermo PACKAGE reads: it is assembled before
        operation [0], so it cannot read anything an operation writes and
        is not part of the order;
      - an operation type absent from the table (a case's own code/ op):
        ANNOUNCED, never passed in silence.
\*---------------------------------------------------------------------------*/

#ifndef CHOUPO_PROPS_PLAN_H
#define CHOUPO_PROPS_PLAN_H

#include "core/Dictionary.H"

#include <string>
#include <vector>

namespace Choupo {
namespace propsPlan {

//- What a key's value IS.
enum class Traffic
{
    file,           // a case-relative path read or written as it stands
    record,         // a record written INTO the case (a later step or the
                    // process run reads it); a path
    proposal,       // a draft for data/local/ (a path; `auto` is computed)
    membraneName    // a membrane record's NAME, resolved by the registry
};

//- One key of an op's dict that holds a path (or a record name).
struct Slot
{
    std::string key;            // dotted key path; `a[].b` walks a list
    Traffic     kind;
    std::string fallback;       // the engine default when the key is absent
                                // ("" = none: an absent key reads nothing)
    std::string ensureSuffix;   // appended when the value lacks it (the
                                // op's own resolution rule), "" = none
    bool        registersName = false;  // a written record also answers to
                                        // `fittedRecordName` in a registry
};

struct OpSlots
{
    std::vector<Slot> reads;
    std::vector<Slot> writes;
};

//- The row of an op type, or nullptr when the table has none.
const OpSlots* slotsFor(const std::string& opType);

//- Every op type the table carries a row for.
std::vector<std::string> tabledTypes();

//- THE NAME a fitted membrane record registers under: `output.name`, else
//  the stem of the record path.  One home -- FitParametersMembrane names its
//  record by it, and the order check matches a by-name read against it.
std::string fittedRecordName(const DictPtr& outDict, const std::string& recPath);

//- The run that writes a `writtenBy` input: the only accepted word.
inline constexpr const char* PROCESS_RUN = "process";

//- What validate() needs to know about the case's other half.
struct ProcessHalf
{
    bool        present = false;    // system/flowsheetDict exists
    std::string binary;             // the binary `runCase <case> process` runs
};

//- Validate the declared order.  Returns every finding (empty = valid);
//  prints the one-line `[order]` summary and each `writtenBy` input at
//  verbosity >= 2, and announces an op type the table does not carry.
//  `names` are the ops' display names, index-aligned with `ops`.
std::vector<std::string> validate(const std::vector<DictPtr>&     ops,
                                  const std::vector<std::string>& names,
                                  const ProcessHalf&              process,
                                  int                             verbosity);

} // namespace propsPlan
} // namespace Choupo

#endif
