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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  loadSalt(cation, anion) -- the ONE place that turns a pair of ion NAMES into a
  configured single-salt Pitzer kernel, reading the curated catalogue
  (species/aqueous.dat + parameters/Pitzer/pairs/).  Charges come from
  the species record;
  the salt stoichiometry is DERIVED from electroneutrality (Ca + Cl -> CaCl2).

  Single source of the catalogue-loading + stoichiometry logic, shared by every
  choupoProps op that consumes the electrolyte model (pitzerActivity,
  crystallizer, singleEffectEvaporator) -- so the Pitzer math is never duplicated
  per op (the forum's "single-source-of-math" rule).
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/Database.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/electrolyte/PitzerSingleSalt.H"
#include "thermo/electrolyte/ENRTLSingleSalt.H"
#include "core/Advisory.H"
#include "core/Dictionary.H"

#include <cstdlib>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

namespace fs = std::filesystem;

// ---- Case-local overlay for the electrolyte catalogue -------------------
//  EXACTLY like the component overlay (Database): the NEAREST
//  `constant/electrolyte/<file>` walking UP from the cwd OVERRIDES the standard
//  `standards/electrolyte/<file>` -- so a case that copies the ion/pair/tau
//  entries it uses into `constant/electrolyte/` is FULLY self-contained (every
//  parameter the solver reads lives in the case), while the standard catalogue
//  fills any entry the case did not localise (per-ENTRY merge, case wins).
inline fs::path caseElectrolytePath(const std::string& file)
{
    fs::path p = fs::current_path();
    for (int up = 0; up < 6; ++up)
    {
        fs::path cand = p / "constant" / "electrolyte" / file;
        if (fs::exists(cand)) return cand;
        if (!p.has_parent_path()) break;
        p = p.parent_path();
    }
    return {};
}

// A parsed dictionary, held for the life of the run.  `findPitzerPair` is called
// once per (cation, anion) per activity-model construction, and a scaling scan
// constructs one model per grid point -- so re-reading and re-parsing the pair
// file from disk on every call turned a 40-point scan into thousands of file
// parses.  The flagship brine case ran at 100 % CPU for minutes and was written
// off as a non-convergent solve; it was neither.  Parse once, keyed by path.
inline const DictPtr& parsedOnce(const fs::path& p)
{
    static std::map<std::string, DictPtr> cache;
    auto it = cache.find(p.string());
    if (it == cache.end())
        it = cache.emplace(p.string(), Dictionary::fromFile(p.string())).first;
    return it->second;
}

// The overlay announcement is a CURATION fact -- which file won for which pair --
// so it belongs in the log exactly ONCE, not once per solver iteration.
inline bool announceOnce(const std::string& key)
{
    static std::set<std::string> said;
    return said.insert(key).second;
}

// Catalogue files to scan, case-local FIRST (overlay) then standard (base).
inline std::vector<fs::path> electrolytePaths(const std::string& file)
{
    std::vector<fs::path> v;
    fs::path cl = caseElectrolytePath(file);
    if (!cl.empty()) v.push_back(cl);
    fs::path st = fs::path(Database::currentRoot()) / "standards" / "electrolyte" / file;
    if (fs::exists(st)) v.push_back(st);
    return v;
}

// Find a (cation,anion)-keyed entry, case-local first; LOUD announce when a
// case-local file supplies it (no silent crutch -- the student sees the overlay).
inline DictPtr findPair(const std::string& file, const std::string& listKey,
                        const std::string& cation, const std::string& anion)
{
    bool first = true;
    for (const auto& path : electrolytePaths(file))
    {
        const bool isCase = first && !caseElectrolytePath(file).empty();
        first = false;
        auto d = parsedOnce(path);
        for (const auto& p : d->lookupDictList(listKey))
            if (p->lookupWord("cation") == cation && p->lookupWord("anion") == anion)
            {
                if (isCase && thermoAnnounce())
                    std::cerr << "[overlay] electrolyte (" << cation << "," << anion
                              << ") from case-local " << path.string() << "\n";
                return p;
            }
    }
    return nullptr;
}

// Bridge a NESTED species/aqueous/<species>.dat record to the FLAT inline keys every
// ion accessor expects (z/MW/hfAq/sAq/cpAq/radius/D0).  CONDITIONAL emission
// preserves found() semantics (so e.g. Electrochem's LOUD !found("radius") still
// fires for ions without a transport tier, and ionAqReference returns false for
// an hfAq-less ion).  setprecision(17) = double max_digits10 -> bit-exact
// round-trip, so no golden KPI drifts.
inline DictPtr bridgeTrueIon(const DictPtr& r, const std::string& species)
{
    std::ostringstream os;  os << std::setprecision(17);
    os << "species " << species << "; ";
    if (r->found("ion")) os << "ion \"" << r->lookupWord("ion") << "\"; ";
    os << "z " << static_cast<int>(r->lookupScalar("charge")) << "; ";
    if (r->found("MW")) os << "MW " << r->subDict("MW")->lookupScalar("value") << "; ";
    if (r->found("aqueousThermo"))
    {
        auto a = r->subDict("aqueousThermo");
        if (a->found("hfAq")) os << "hfAq " << a->subDict("hfAq")->lookupScalar("value") << "; ";
        if (a->found("sAq"))  os << "sAq "  << a->subDict("sAq")->lookupScalar("value")  << "; ";
        if (a->found("cpAq")) os << "cpAq " << a->subDict("cpAq")->lookupScalar("value") << "; ";
    }
    if (r->found("transport"))
    {
        auto t = r->subDict("transport");
        if (t->found("radius")) os << "radius " << t->subDict("radius")->lookupScalar("value") << "; ";
        if (t->found("D0"))     os << "D0 "     << t->subDict("D0")->lookupScalar("value")     << "; ";
    }
    return Dictionary::fromString(os.str());
}

// Ion record by species name.  Source legs, case-first (the ion kind is now
// stored ONLY as the species/aqueous.dat catalogue; the old monolithic
// electrolyte/ions.dat is gone):
//   (1) case-local constant/electrolyte/ions.dat -- OLD FLAT list, read EXACTLY
//       as before, whole-row FIRST-FILE-WINS (do NOT merge fields with the
//       standards leg: crystalliser05 ships {z,MW}-only Na with NO hfAq, and its
//       golden depends on ionAqReference returning false there).
//   (2) case-local constant/species/aqueous.dat -- the MIRRORED single
//       catalogue (a sealed import writes it FILTERED to the case's closure;
//       same grammar as the standards catalogue, never a per-file forest),
//       matched by `name`, bridged to flat.  Case wins per-record; unsealed,
//       the standards catalogue fills any name the case does not carry.
//   (3) [legacy] snapshot species/aqueous/<species>.dat -- the retired v1
//       per-file form (lithiumBrinePlant / Crystallizer09chatGPT only; see
//       the RecordResolver TODO).
//   (4) standards species/aqueous.dat -- ONE catalogue (aqueousSpecies list),
//       FORBIDDEN when the case is sealed (loud refusal instead).
inline DictPtr findIon(const std::string& species)
{
    const fs::path cl = caseElectrolytePath("ions.dat");
    if (!cl.empty())
    {
        auto d = parsedOnce(cl);
        for (const auto& i : d->lookupDictList("ions"))
            if (i->lookupWord("species") == species) return i;
    }
    const fs::path localCat = records::localRecord("species/aqueous.dat");
    if (!localCat.empty())
    {
        auto c = parsedOnce(localCat);
        for (const auto& r : c->lookupDictList("aqueousSpecies"))
            if (r->lookupWord("name") == species)
                return bridgeTrueIon(r, species);
    }
    if (records::sealed())
        records::refuseSealed("species/aqueous.dat: " + species,
                              "aqueous species record");
    const fs::path cat = records::standardsRecord("species/aqueous.dat");
    if (fs::exists(cat))
    {
        auto c = parsedOnce(cat);
        for (const auto& r : c->lookupDictList("aqueousSpecies"))
            if (r->lookupWord("name") == species)
                return bridgeTrueIon(r, species);
    }
    return nullptr;
}

// Bridge a NESTED per-pair record (parameters{ beta0.. }) to the FLAT inline keys
// the callers expect (loadSalt/readPair/pairCalorimetricFit/ElectrolyteActivity).
// beta0/beta1/Cphi are REQUIRED (lookupScalar throws if absent); beta2/alpha1/
// alpha2 + the optional T-slots/lphiValidityMax are emitted when present (faithful,
// NOT defaulted); calorimetricFit is a WORD.  setprecision(17) -> bit-exact.
inline DictPtr bridgePitzerPair(const DictPtr& r)
{
    auto pr = r->subDict("parameters");
    std::ostringstream os;  os << std::setprecision(17);
    os << "beta0 " << pr->lookupScalar("beta0") << "; ";
    os << "beta1 " << pr->lookupScalar("beta1") << "; ";
    os << "Cphi "  << pr->lookupScalar("Cphi")  << "; ";
    for (const char* k : {"beta2", "alpha1", "alpha2",
                          "dbeta0_dT", "dbeta1_dT", "dCphi_dT", "lphiValidityMax",
                          "sp_q1", "sp_q2", "sp_q3", "sp_q4", "sp_q5",
                          "sp_q6", "sp_q9", "sp_q10",
                          "sp_q11", "sp_q12", "sp_q13", "sp_q14",
                          "TvalidLo", "TvalidHi"})
        if (pr->found(k)) os << k << " " << pr->lookupScalar(k) << "; ";
    if (pr->found("calorimetricFit"))
        os << "calorimetricFit " << pr->lookupWord("calorimetricFit") << "; ";
    return Dictionary::fromString(os.str());
}

// The pair record's temperature-correlation form, DECLARED + cross-checked
// (forum #101/#103: `tCorrelationForm` is a typed contract, never a silent
// field probe).  Legal words: `constant298` | `linearSlopes` |
// `silvesterPitzer1977`.  A record that declares one form but carries the
// fields of another REFUSES (dead data is a lie); an UNDECLARED record with
// T-fields resolves by the historical inference and files a deduped
// "provenance" advisory asking for the declaration -- byte-identical
// behaviour, now with the gap on the record's ledger.  Shared by BOTH
// Pitzer readers (single-salt loadSalt + PitzerHMW::readPair): one contract.
inline std::string resolveTCorrelationForm(const DictPtr& p,
                                           const std::string& pairName)
{
    const bool hasSp    = p->found("sp_q1");
    const bool hasSlope = p->found("dbeta0_dT") || p->found("dbeta1_dT")
                       || p->found("dCphi_dT");
    const std::string declared =
        p->found("tCorrelationForm") ? p->lookupWord("tCorrelationForm") : "";
    if (declared.empty())
    {
        const std::string inferred =
            hasSp ? "silvesterPitzer1977"
                  : (hasSlope ? "linearSlopes" : "constant298");
        if (hasSp || hasSlope)
            AdvisoryLog::instance().add("provenance", "info",
                "pitzer pair " + pairName,
                "tCorrelationForm not declared -- inferred '" + inferred
                + "' from the record's fields; declare it in the record");
        return inferred;
    }
    if (declared == "silvesterPitzer1977")
    {
        if (!hasSp)
            throw std::runtime_error("pitzer pair " + pairName
                + ": tCorrelationForm silvesterPitzer1977 declared but the"
                " record carries no sp_q1..q14 coefficients");
    }
    else if (declared == "linearSlopes")
    {
        if (!hasSlope)
            throw std::runtime_error("pitzer pair " + pairName
                + ": tCorrelationForm linearSlopes declared but the record"
                " carries no dbeta*_dT/dCphi_dT slopes");
        if (hasSp)
            throw std::runtime_error("pitzer pair " + pairName
                + ": tCorrelationForm linearSlopes declared but sp_q*"
                " coefficients are present -- AMBIGUOUS; declare"
                " silvesterPitzer1977 or remove the sp_q* fields");
    }
    else if (declared == "constant298")
    {
        if (hasSp || hasSlope)
            throw std::runtime_error("pitzer pair " + pairName
                + ": tCorrelationForm constant298 declared but T-extension"
                " fields are present -- dead data is a lie; declare the"
                " real form or remove the fields");
    }
    else
        throw std::runtime_error("pitzer pair " + pairName
            + ": unknown tCorrelationForm '" + declared
            + "' (legal: constant298 | linearSlopes | silvesterPitzer1977)");
    return declared;
}

// Pitzer pair by (cation,anion).  Two legs (the pairs kind is now stored ONLY as
// per-pair records under parameters/Pitzer/pairs/; the monolithic
// electrolyte/pairs.dat is gone) -- sibling of findIon, NOT a change to the
// generic findPair (which enrtl.dat/mixing.dat still use as a list):
//   (1) case-local constant/electrolyte/pairs.dat -- OLD FLAT list, whole-row
//       FIRST-FILE-WINS, NO merge (a case may ship a divergent value, e.g.
//       enthalpy_naoh_water's Li-Cl beta0 0.1494 vs the standards 0.17).
//   (2) standards per-file, bridged to flat keys.
inline DictPtr findPitzerPair(const std::string& cation, const std::string& anion)
{
    // Memoise the RESOLVED pair, not just the parsed file: the flat case-local list
    // is scanned linearly with string compares, and an activity model asks for every
    // (cation, anion) combination on every gamma evaluation.
    static std::map<std::string, DictPtr> resolved;
    const std::string key = cation + "," + anion;
    { auto it = resolved.find(key); if (it != resolved.end()) return it->second; }
    struct Memo {
        std::map<std::string, DictPtr>& m; const std::string& k;
        DictPtr operator()(DictPtr d) const { m[k] = d; return d; }
    } memo{resolved, key};

    const fs::path cl = caseElectrolytePath("pairs.dat");
    if (!cl.empty())
    {
        const DictPtr& d = parsedOnce(cl);
        for (const auto& p : d->lookupDictList("pairs"))
            if (p->lookupWord("cation") == cation && p->lookupWord("anion") == anion)
            {
                if (thermoAnnounce() && announceOnce("pair:" + cation + "," + anion))
                    std::cerr << "[overlay] electrolyte pair (" << cation << "," << anion
                              << ") from case-local " << cl.string() << "\n";
                return memo(p);
            }
    }
    // ONE resolver (sealing redesign): case-local mirrored home -> legacy
    // snapshot -> standards.  ABSENCE-TOLERANT (resolveRecord, not
    // resolveRequired): the multi-ion Pitzer-HMW engine asks for EVERY
    // (cation, anion) combination, and most pairs legitimately DO NOT exist
    // (a missing pair is zero interaction, never an error).  A sealed case
    // returns EMPTY for a locally-absent pair -> nullptr -> the caller decides:
    // HMW readPair treats it as zero; the single-salt loadSalt throws (a salt
    // that has no pair IS an error).  The seal closure pulls every pair that
    // exists, so a sealed run never silently drops a present pair.
    const fs::path tp = records::resolveRecord(
        "parameters/Pitzer/pairs/" + cation + "-" + anion + ".dat");
    if (!tp.empty() && fs::exists(tp))
        return memo(bridgePitzerPair(parsedOnce(tp)));
    return nullptr;
}

inline int ionCharge(const std::string& species)
{
    auto i = findIon(species);
    if (!i)
        throw std::runtime_error("electrolyte: ion '" + species
            + "' not in constant/electrolyte/ions.dat (case) or standards/species/aqueous/");
    return static_cast<int>(i->lookupScalar("z"));
}

// Molar mass [g/mol] of a named ion; 0.0 if not tabulated (a few complex ions
// ship with MW pending -- not needed for the gamma math).
inline double ionMW(const std::string& species)
{
    auto i = findIon(species);
    return (i && i->found("MW")) ? i->lookupScalar("MW") : 0.0;
}

// Build a configured PitzerSingleSalt for the salt M(nu_c) X(nu_a) named by its
// cation/anion species keys.  Throws (loudly) if either ion or the pair is absent.
inline PitzerSingleSalt loadSalt(const std::string& cation, const std::string& anion)
{
    const int zc = ionCharge(cation);          // > 0
    const int za = ionCharge(anion);           // < 0
    if (zc <= 0 || za >= 0)
        throw std::runtime_error("electrolyte: '" + cation + "' must be a cation and '"
            + anion + "' an anion (check ions.dat charges)");

    const int g = std::gcd(zc, -za);
    PitzerSingleSalt s;
    s.z_c = zc; s.z_a = -za;                    // magnitudes into the kernel
    s.nu_c = (-za) / g;                         // nu_c*zc = nu_a*|za| (electroneutral)
    s.nu_a = zc / g;

    auto p = findPitzerPair(cation, anion);
    if (!p)
        throw std::runtime_error("electrolyte: no Pitzer pair (" + cation + ", " + anion
            + ") in constant/electrolyte/pairs.dat (case) or "
              "standards/parameters/Pitzer/pairs/" + cation + "-" + anion + ".dat");
    s.beta0  = p->lookupScalar("beta0");
    s.beta1  = p->lookupScalar("beta1");
    s.beta2  = p->lookupScalarOrDefault("beta2", 0.0);
    s.Cphi   = p->lookupScalar("Cphi");
    s.alpha1 = p->lookupScalarOrDefault("alpha1", 2.0);
    s.alpha2 = p->lookupScalarOrDefault("alpha2", 12.0);
    // The record's T-correlation form, DECLARED and cross-checked (never
    // inferred silently) -- see resolveTCorrelationForm.
    const std::string tForm =
        resolveTCorrelationForm(p, cation + "-" + anion);
    // Silvester-Pitzer calorimetric T-slots (default 0 = frozen-beta; fitted
    // at curation time against Parker Phi_L -- bin/curate/fit_lphi_pitzer.py).
    s.dbeta0_dT = p->lookupScalarOrDefault("dbeta0_dT", 0.0);
    s.dbeta1_dT = p->lookupScalarOrDefault("dbeta1_dT", 0.0);
    s.dCphi_dT  = p->lookupScalarOrDefault("dCphi_dT",  0.0);
    // full Silvester-Pitzer 1977 T-functions (eqs 30-32), deviation form --
    // gated by the RESOLVED form (identical to the historical sp_q1 probe
    // for undeclared records; a declared record that lies about its fields
    // has already been refused above).
    if (tForm == "silvesterPitzer1977")
    {
        s.spForm = true;
        s.spB0[0]=p->lookupScalar("sp_q1");  s.spB0[1]=p->lookupScalar("sp_q2");
        s.spB0[2]=p->lookupScalar("sp_q3");  s.spB0[3]=p->lookupScalar("sp_q4");
        s.spB0[4]=p->lookupScalar("sp_q5");
        s.spB1[0]=p->lookupScalar("sp_q6");  s.spB1[1]=p->lookupScalar("sp_q9");
        s.spB1[2]=p->lookupScalar("sp_q10");
        s.spCp[0]=p->lookupScalar("sp_q11"); s.spCp[1]=p->lookupScalar("sp_q12");
        s.spCp[2]=p->lookupScalar("sp_q13"); s.spCp[3]=p->lookupScalar("sp_q14");
        s.TvalidLo = p->lookupScalarOrDefault("TvalidLo", 273.15);
        s.TvalidHi = p->lookupScalarOrDefault("TvalidHi", 573.15);
    }
    return s;
}

// Aqueous infinite-dilution ion reference for a salt: Sum nu_i * (hfAq_i +
// cpAq_i (T-298.15)) [J/mol salt], on the H+(aq)=0 convention (the convention
// cancels for any neutral salt, so the sum sits on the ELEMENTS datum --
// consistent with h_pure_ig).  Returns false when an ion lacks the tier
// (ions.dat slice-2 fields) -- the caller must then keep the legacy path.
inline bool ionAqReference(const std::string& cation, const std::string& anion,
                           double nu_c, double nu_a,
                           double& hfAqSum, double& cpAqSum)
{
    auto c = findIon(cation), a = findIon(anion);
    if (!c || !a || !c->found("hfAq") || !a->found("hfAq")) return false;
    hfAqSum = nu_c * c->lookupScalar("hfAq") + nu_a * a->lookupScalar("hfAq");
    cpAqSum = nu_c * c->lookupScalarOrDefault("cpAq", 0.0)
            + nu_a * a->lookupScalarOrDefault("cpAq", 0.0);
    return true;
}

// Criss-Cobble 1964 (JACS 86, 5390, Table II): the salt's T-AVERAGED ionic
// heat capacity Sum nu*Cp-bar]_25^T at the published nodes 25/60/100/150/200 C,
// converted cal -> J.  Single-ion values sit on the CC "absolute" scale
// (Cp(H+) = 28 cal), which CANCELS in any neutral-salt sum -- the only thing
// this function returns.  false when either ion lacks a CC entry (caller
// falls back to the constant cpAq tier).  Read at BUILD time only (the
// builder preloads the five nodes; the hot path interpolates in memory).
// One ion's five CC nodes from ITS OWN aqueous-species record (the arity-1
// home, migrated 2026-07-18: aqueousThermo.cpAvg298.averageFrom298, cal/mol/K
// on the CC absolute scale).  Reads the RAW catalogue record (same resolution
// legs as findIon -- case-local first, sealed refusal, standards) because the
// bridged flat form deliberately carries only the constant tier.  false when
// the ion carries no cpAvg298 block (caller falls to the cpAq tier).
inline bool ionCCNodes(const std::string& ion, double v[5])
{
    DictPtr rec;
    const fs::path localCat = records::localRecord("species/aqueous.dat");
    if (!localCat.empty())
    {
        auto c = parsedOnce(localCat);
        for (const auto& r : c->lookupDictList("aqueousSpecies"))
            if (r->lookupWord("name") == ion) { rec = r; break; }
    }
    if (!rec && !records::sealed())
    {
        const fs::path cat = records::standardsRecord("species/aqueous.dat");
        if (fs::exists(cat))
        {
            auto c = parsedOnce(cat);
            for (const auto& r : c->lookupDictList("aqueousSpecies"))
                if (r->lookupWord("name") == ion) { rec = r; break; }
        }
    }
    if (!rec || !rec->found("aqueousThermo")) return false;
    auto at = rec->subDict("aqueousThermo");
    if (!at->found("cpAvg298")) return false;
    auto cc = at->subDict("cpAvg298");
    const auto pts = cc->lookupDictList("averageFrom298");
    if (pts.size() != 5) return false;              // the published node grid
    for (int k = 0; k < 5; ++k)
        v[k] = pts[static_cast<std::size_t>(k)]->lookupScalar("value");
    return true;
}

inline bool crissCobbleNodes(const std::string& cation, const std::string& anion,
                             double nu_c, double nu_a, double nodes[5])
{
    // The salt's neutral sum from EACH ion's own record (species/aqueous.dat
    // aqueousThermo.cpAvg298 -- ONE home per ion, no parallel monolith).  The
    // single-ion CC "absolute" scale (Cp(H+)=28 cal) cancels in this sum.
    // Absence-TOLERANT: an ion without the block degrades the pair to the
    // constant-cpAq tier (the builder announces which tier runs).
    double vc[5], va[5];
    if (!ionCCNodes(cation, vc) || !ionCCNodes(anion, va)) return false;
    for (int k = 0; k < 5; ++k)
        nodes[k] = 4.184 * (nu_c * vc[k] + nu_a * va[k]);
    return true;
}

// Was this pair's T-dependence regressed against calorimetry?  Read the
// per-row flag (default false -- the slice-0 honesty gate).
inline bool pairCalorimetricFit(const std::string& cation, const std::string& anion)
{
    auto p = findPitzerPair(cation, anion);
    return p && p->lookupWordOrDefault("calorimetricFit", "false") == "true";
}

// Build a configured ENRTLSingleSalt (electrolyte-NRTL) for the named salt,
// reading tau/alpha from the curated catalogue electrolyte/enrtl.dat.
// Bridge a NESTED per-salt eNRTL record (parameters{ tau.. }) to the FLAT keys
// loadENRTL expects.  tau_m_ca/tau_ca_m REQUIRED (lookupScalar); alpha CONDITIONAL
// (loadENRTL uses lookupScalarOrDefault(0.2), so a missing alpha must stay missing).
inline DictPtr bridgeENRTLPair(const DictPtr& r)
{
    auto pr = r->subDict("parameters");
    std::ostringstream os;  os << std::setprecision(17);
    os << "tau_m_ca " << pr->lookupScalar("tau_m_ca") << "; ";
    os << "tau_ca_m " << pr->lookupScalar("tau_ca_m") << "; ";
    if (pr->found("alpha")) os << "alpha " << pr->lookupScalar("alpha") << "; ";
    return Dictionary::fromString(os.str());
}

// eNRTL params by (cation,anion).  Dual leg (the eNRTL kind is now stored ONLY as
// per-salt records under parameters/eNRTL/; the monolithic
// electrolyte/enrtl.dat is gone) -- sibling of findPitzerPair, NOT a change to the
// generic findPair (which mixing.dat still uses as a list).
inline DictPtr findENRTLPair(const std::string& cation, const std::string& anion)
{
    const fs::path cl = caseElectrolytePath("enrtl.dat");
    if (!cl.empty())
    {
        auto d = parsedOnce(cl);
        for (const auto& p : d->lookupDictList("enrtl"))
            if (p->lookupWord("cation") == cation && p->lookupWord("anion") == anion)
            {
                if (thermoAnnounce())
                    std::cerr << "[overlay] eNRTL pair (" << cation << "," << anion
                              << ") from case-local " << cl.string() << "\n";
                return p;
            }
    }
    // ONE resolver (sealing redesign), mirroring findPitzerPair: case-local
    // mirrored home -> legacy snapshot -> standards.  ABSENCE-TOLERANT: a
    // locally-absent pair returns nullptr (the caller decides -- loadENRTL
    // throws for a salt that needs one; a multi-salt survey treats it as zero).
    const fs::path tp = records::resolveRecord(
        "parameters/eNRTL/" + cation + "-" + anion + ".dat");
    if (!tp.empty() && fs::exists(tp))
        return bridgeENRTLPair(parsedOnce(tp));
    return nullptr;
}

inline ENRTLSingleSalt loadENRTL(const std::string& cation, const std::string& anion)
{
    const int zc = ionCharge(cation), za = ionCharge(anion);
    if (zc <= 0 || za >= 0)
        throw std::runtime_error("eNRTL: '" + cation + "' must be a cation and '"
            + anion + "' an anion (check ion charges)");
    const int g = std::gcd(zc, -za);
    ENRTLSingleSalt s;
    s.z_c = zc; s.z_a = -za;
    s.nu_c = (-za) / g; s.nu_a = zc / g;

    auto p = findENRTLPair(cation, anion);
    if (!p)
        throw std::runtime_error("eNRTL: no parameters for (" + cation + ", " + anion
            + ") in constant/electrolyte/enrtl.dat (case) or "
              "standards/parameters/eNRTL/" + cation + "-" + anion + ".dat");
    s.tau_m_ca = p->lookupScalar("tau_m_ca");
    s.tau_ca_m = p->lookupScalar("tau_ca_m");
    s.alpha    = p->lookupScalarOrDefault("alpha", 0.2);
    return s;
}

} // namespace electrolyte
} // namespace Choupo
