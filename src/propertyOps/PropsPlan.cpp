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
\*---------------------------------------------------------------------------*/

#include "propertyOps/PropsPlan.H"

#include "core/RegistryRefusal.H"

#include <filesystem>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <variant>

namespace fs = std::filesystem;

namespace Choupo {
namespace propsPlan {

namespace {

// ---------------------------------------------------------------------------
//  THE TABLE.  One row per registered operation type (PropertyOperation.cpp
//  registerBuiltins), and ONLY the keys that hold a path the op reads or
//  writes -- each one READ off the op's own source, where the op looks the
//  key up (the file named beside each row).  A row with no slots is a
//  statement too: that op reads and writes no file named by a key.
//  bin/curate/check_props_order.py holds every registered type to a row,
//  every `records::refuseStandardsWrite(..., "<key>", ...)` an op's source
//  makes to a write slot of its row, and the GUI's x-choupo writes/data to
//  the rows.
// ---------------------------------------------------------------------------
using T = Traffic;
Slot F (const char* k, const char* def = "") { return { k, T::file,     def, "", false }; }
Slot R (const char* k)                       { return { k, T::record,   "",  "", false }; }
Slot P (const char* k)                       { return { k, T::proposal, "",  "", false }; }
Slot M (const char* k)                       { return { k, T::membraneName, "", "", false }; }

const std::map<std::string, OpSlots>& table()
{
    static const std::map<std::string, OpSlots> t = []
    {
        std::map<std::string, OpSlots> m;
        const std::vector<Slot> outFile { F("output.file") };
        //  ops whose only file is the CSV in `output { file ...; }`
        for (const char* ty : { "activityCoefficients", "electrolyteActivity",
                                "enrtlMixedSolvent", "enrtlMultiSalt",
                                "enthalpyConcentration", "exchange", "gibbsMap",
                                "hansenMixture", "isothermEval", "phaseEnvelope",
                                "phaseSplitScan", "propertyScan1D",
                                "propertyScan2D", "propertyScanBinary",
                                "propertyScanTernary", "psychrometricChart",
                                "purePhaseDiagram", "scalingScan",
                                "solubilityParameter", "speciate",
                                "steamTables" })
            m[ty] = { {}, outFile };
        //  ops that name no file by a key
        for (const char* ty : { "elementalComposition", "exergy",
                                "explainProperty", "hConsistency",
                                "mixingRules", "propertyPoint",
                                "transportBench" })
            m[ty] = {};

        //  DataReconciliation.cpp: network, readings, prior; three CSVs.
        m["dataReconciliation"] = {
            { F("network"), F("readings"), F("prior") },
            { F("output.streams"), F("output.balances"), F("output.covariance") } };
        //  EstimateComponent.cpp: a proposal (`auto` is computed, unchecked).
        m["estimateComponent"] = { {}, { P("output.proposal") } };
        //  FitParameters.cpp + EvidencePartition.cpp + FitParametersMembrane.cpp.
        {
            Slot rec = R("output.record");
            rec.registersName = true;   // FitParametersMembrane registers it
            m["fitParameters"] = {
                { F("dataset"), F("evidence[].dataset"), F("residual.dataset"),
                  M("residual.membrane") },
                { F("output.fit_log"), F("output.parity"), P("output.proposal"),
                  rec } };
        }
        //  FreezingPoint.cpp, PitzerActivity.cpp: `validation { dataset; }`.
        m["freezingPoint"]  = { { F("validation.dataset") }, outFile };
        m["pitzerActivity"] = { { F("validation.dataset") }, outFile };
        //  ReynoldsSweep.H (both benches): `sweep { file ...; }`.
        m["frictionBench"]     = { {}, { F("sweep.file") } };
        m["heatTransferBench"] = { {}, { F("sweep.file") } };
        //  HeatCapacityFit.cpp / VaporPressureFit.cpp via EvidencePartition.
        m["heatCapacityFit"]  = { { F("dataset"), F("evidence[].dataset") }, outFile };
        m["vaporPressureFit"] = { { F("dataset"), F("evidence[].dataset") }, outFile };
        //  Kinetics1D.cpp, VleConsistency.cpp.
        m["kinetics1D"]     = { { F("dataset") }, outFile };
        m["vleConsistency"] = { { F("dataset") }, outFile };
        //  PolarisationIndex.cpp appends `.dat` to a dataset that lacks it.
        {
            Slot ds = F("dataset");
            ds.ensureSuffix = ".dat";
            m["polarisationIndex"] = { { ds }, {} };
        }
        //  PoreTransportBench.cpp: the membrane by name, the profile CSV.
        m["poreTransport"] = { { M("membrane") }, { F("profile") } };
        //  Ppr78Kij.cpp: the group table, and the kij SET record it writes.
        m["ppr78Kij"] = { { F("groupTable") }, { R("output.record") } };
        //  RateLawBench.cpp / ReactionGibbs.cpp read the library by construction.
        m["rateLawBench"]  = { { F("", "constant/reactions") }, {} };
        m["reactionGibbs"] = { { F("", "constant/reactions") }, outFile };
        //  ReactionCurve.cpp: the trajectory (default trajectory.csv), 3 CSVs.
        m["reactionCurve"] = {
            { F("trajectory", "trajectory.csv") },
            { F("output.segments"), F("output.curve"), F("output.tuning") } };
        //  ThielePellet.cpp: three CSVs.
        m["thielePellet"] = { {},
            { F("output.field"), F("output.sweep"), F("output.refinement") } };
        return m;
    }();
    return t;
}

//  The WORD values at a key path (dotted, `a[]` walks a list of dicts).  Only
//  a word is a path; a sub-dict or a list at the key is not one (a key that
//  may also hold inline data, e.g. `readings`, then reads no file).
std::vector<std::string> wordsAt(const DictPtr& d, const std::string& path)
{
    std::vector<DictPtr> cur { d };
    std::vector<std::string> segs;
    {
        std::stringstream ss(path);
        std::string s;
        while (std::getline(ss, s, '.')) segs.push_back(s);
    }
    std::vector<std::string> out;
    for (std::size_t i = 0; i < segs.size(); ++i)
    {
        const bool last = (i + 1 == segs.size());
        std::string k = segs[i];
        const bool list = k.size() > 2 && k.compare(k.size() - 2, 2, "[]") == 0;
        if (list) k.resize(k.size() - 2);
        std::vector<DictPtr> next;
        for (const auto& c : cur)
        {
            if (!c->found(k)) continue;
            const EntryValue& v = c->entryValue(k);
            if (last && !list)
            {
                if (std::holds_alternative<std::string>(v))
                    out.push_back(std::get<std::string>(v));
                continue;
            }
            if (list && std::holds_alternative<std::vector<DictPtr>>(v))
                for (const auto& e : std::get<std::vector<DictPtr>>(v)) next.push_back(e);
            else if (!list && std::holds_alternative<DictPtr>(v))
                next.push_back(std::get<DictPtr>(v));
        }
        cur = std::move(next);
    }
    return out;
}

std::string normal(const std::string& p)
{
    return fs::path(p).lexically_normal().generic_string();
}

struct Use
{
    std::size_t op;
    std::string key;        // the slot's key as the reader sees it
    std::string path;       // normalised path ("" for a by-name read)
    std::string name;       // the record name (membraneName / registersName)
    Traffic     kind;
};

//  The uses of one slot list on one op dict (a deep copy: the check must not
//  mark the op's keys as read, or the unread-key audit after the op would
//  lose its subject).
std::vector<Use> usesOf(std::size_t k, const DictPtr& op,
                        const std::vector<Slot>& slots)
{
    std::vector<Use> out;
    for (const auto& s : slots)
    {
        std::vector<std::string> vals;
        if (s.key.empty()) vals.push_back(s.fallback);
        else
        {
            vals = wordsAt(op, s.key);
            //  The default applies only where the key itself is absent.
            //  (A top-level key: no row declares a default under a block.)
            if (vals.empty() && !s.fallback.empty() && !op->found(s.key))
                vals.push_back(s.fallback);
        }
        for (std::string v : vals)
        {
            if (v.empty()) continue;
            Use u { k, s.key.empty() ? std::string("(by construction)") : s.key,
                    "", "", s.kind };
            if (s.kind == T::membraneName) { u.name = v; out.push_back(u); continue; }
            if (s.kind == T::proposal && v == "auto") continue;   // computed
            if (!s.ensureSuffix.empty()
                && (v.size() < s.ensureSuffix.size()
                    || v.compare(v.size() - s.ensureSuffix.size(),
                                 s.ensureSuffix.size(), s.ensureSuffix) != 0))
                v += s.ensureSuffix;
            u.path = normal(v);
            if (s.registersName)
            {
                const auto dot = s.key.rfind('.');
                const std::string parent = dot == std::string::npos
                                         ? std::string() : s.key.substr(0, dot);
                DictPtr outDict = parent.empty() ? op
                    : (op->found(parent) ? op->subDict(parent) : nullptr);
                u.name = fittedRecordName(outDict, v);
            }
            out.push_back(u);
        }
    }
    return out;
}

std::string label(std::size_t k, const std::vector<std::string>& names,
                  const std::vector<DictPtr>& ops)
{
    return "operation [" + std::to_string(k) + "] '" + names[k] + "' (type "
         + ops[k]->lookupWordOrDefault("type", "?") + ")";
}

} // namespace

const OpSlots* slotsFor(const std::string& opType)
{
    const auto& t = table();
    const auto it = t.find(opType);
    return it == t.end() ? nullptr : &it->second;
}

std::vector<std::string> tabledTypes()
{
    std::vector<std::string> out;
    for (const auto& kv : table()) out.push_back(kv.first);
    return out;
}

std::string fittedRecordName(const DictPtr& outDict, const std::string& recPath)
{
    const std::string stem = fs::path(recPath).stem().string();
    return outDict ? outDict->lookupWordOrDefault("name", stem) : stem;
}

std::vector<std::string> validate(const std::vector<DictPtr>&     ops,
                                  const std::vector<std::string>& names,
                                  const ProcessHalf&              process,
                                  int                             verbosity)
{
    std::vector<std::string> findings;
    std::vector<Use> reads, writes;
    //  key -> run, per op: the `writtenBy` declarations
    std::vector<std::map<std::string, std::string>> declared(ops.size());
    std::size_t untabled = 0;

    for (std::size_t k = 0; k < ops.size(); ++k)
    {
        const std::string type = ops[k]->lookupWordOrDefault("type", "");
        const OpSlots* row = slotsFor(type);

        //  `writtenBy` is read on the op's OWN dict: this check is its reader.
        if (ops[k]->found("writtenBy"))
        {
            const auto wb = ops[k]->subDict("writtenBy");
            for (const auto& key : wb->keys())
            {
                const std::string run = wb->lookupWord(key);
                bool isRead = false;
                if (row)
                    for (const auto& s : row->reads)
                        if (s.key == key && s.kind != T::membraneName) isRead = true;
                if (!isRead)
                {
                    std::vector<std::string> keys;
                    if (row)
                        for (const auto& s : row->reads)
                            if (!s.key.empty() && s.kind != T::membraneName)
                                keys.push_back(s.key);
                    findings.push_back(label(k, names, ops) + " declares `writtenBy { "
                        + key + " " + run + "; }`, but `" + key + "` is not a key this"
                        " operation reads a file through -- a declaration about a"
                        " file nothing reads is a comment.  "
                        + registryRefusal::message("file-reading key", key, keys,
                                                   "Accepted"));
                    continue;
                }
                if (run != PROCESS_RUN)
                {
                    findings.push_back(label(k, names, ops) + ": `writtenBy { " + key
                        + " " + run + "; }` -- "
                        + registryRefusal::message("writing run", run,
                                                   { PROCESS_RUN }, "Accepted")
                        + "  (`process` is the case's own Flowsheet run; a file"
                          " another Properties step writes needs no declaration,"
                          " only that step placed earlier.)");
                    continue;
                }
                if (!process.present)
                {
                    findings.push_back(label(k, names, ops) + " declares that its `"
                        + key + "` is written by the process run, but this case has"
                        " no system/flowsheetDict -- there is no process run to write"
                        " it.  Give the file the case carries without the"
                        " declaration, or add the Flowsheet that writes it.");
                    continue;
                }
                declared[k][key] = run;
            }
        }

        if (!row)
        {
            ++untabled;
            std::cerr << "[order] " << label(k, names, ops) << " is not in the"
                " file-traffic table (src/propertyOps/PropsPlan.cpp): what it reads"
                " and writes is NOT checked against the declared order.\n";
            continue;
        }
        const DictPtr copy = ops[k]->deepCopy();
        for (auto& u : usesOf(k, copy, row->reads))  reads.push_back(u);
        for (auto& u : usesOf(k, copy, row->writes)) writes.push_back(u);
    }

    //  THE RULE: no read of a LATER write.
    for (const auto& r : reads)
        for (const auto& w : writes)
        {
            if (w.op <= r.op) continue;
            const bool same = r.kind == T::membraneName
                            ? (!w.name.empty() && w.name == r.name)
                            : (!r.path.empty() && r.path == w.path);
            if (!same) continue;
            const std::string what = r.kind == T::membraneName
                ? "the membrane record '" + r.name + "' (its `" + r.key + "`)"
                : "'" + r.path + "' (its `" + r.key + "`)";
            findings.push_back(label(r.op, names, ops) + " reads " + what
                + ", which " + label(w.op, names, ops) + " writes LATER (its `"
                + w.key + "` = '" + w.path + "').  Operations run in DECLARED"
                " order and choupoProps never re-sorts them, so the read would"
                " take whatever a PREVIOUS run left on disk, or nothing.  Remedy:"
                " move '" + names[w.op] + "' before '" + names[r.op]
                + "' in `operations ( ... )`.");
        }

    //  A `writtenBy process` input: present, and written by no Properties step.
    std::size_t fromProcess = 0;
    for (const auto& r : reads)
    {
        const auto it = declared[r.op].find(r.key);
        if (it == declared[r.op].end()) continue;
        ++fromProcess;
        for (const auto& w : writes)
            if (w.path == r.path)
                findings.push_back(label(r.op, names, ops) + " declares '" + r.path
                    + "' written by the process run, and " + label(w.op, names, ops)
                    + " writes it too (its `" + w.key + "`) -- one file, two"
                    " writers, and which one the read sees depends on which ran"
                    " last.  Name a different file for one of them.");
        if (!fs::exists(r.path))
            findings.push_back(label(r.op, names, ops) + " reads '" + r.path
                + "' (its `" + r.key + "`), which this case declares is WRITTEN BY"
                " THE PROCESS RUN (`writtenBy { " + r.key + " process; }`), and it"
                " is not there.  Run the Flowsheet (" + process.binary + ") first --"
                " `runCase <case> process`, or `" + process.binary + " <case>` -- then"
                " run the Properties workflow on the same case directory.");
        else if (verbosity >= 2)
            std::cout << "[order] " << label(r.op, names, ops) << " reads '"
                      << r.path << "', written by the process run ("
                      << process.binary << ") -- present.\n";
    }

    if (verbosity >= 2 && findings.empty())
        std::cout << "[order] " << ops.size() << " operation(s) in declared order:"
                  << " " << reads.size() << " file read(s), " << writes.size()
                  << " file write(s)"
                  << (fromProcess ? ", " + std::to_string(fromProcess)
                                    + " from the process run" : std::string())
                  << (untabled ? ", " + std::to_string(untabled)
                                 + " op(s) NOT checked (announced on stderr)" : std::string())
                  << "; no operation reads what a later one writes.\n";
    return findings;
}

} // namespace propsPlan
} // namespace Choupo
