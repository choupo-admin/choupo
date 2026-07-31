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

#include "streams/StreamStateIO.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/ReactiveVLE.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/electrolyte/ElectrolyteModel.H"   // solventIndex() on the molality path
#include "core/Dictionary.H"
#include "core/Types.H"

#include <cmath>
#include <fstream>
#include <functional>
#include <iomanip>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace Choupo
{
namespace StreamStateIO
{

namespace fs = std::filesystem;

bool looksLikeStreamState(const std::string& body)
{
    auto has = [&](const char* k){ return body.find(k) != std::string::npos; };
    // Component-wise forms are self-identifying.  The total-flow forms require
    // their companion fractions block -- so `molarFlow` never false-matches the
    // SolutionWriter's `molarFlows` block (a substring), which carries no
    // moleFractions -- so a SolutionWriter streamFaces snapshot is never
    // mistaken for per-stream state.
    if (has("componentMolarFlows") || has("componentMassFlows") || has("componentFlows"))
        return true;
    // The AQUEOUS-SPECIES basis is self-identifying too (a water analysis
    // written in ions -- aqueous-stream-basis, 2026-07-27).
    if (has("speciesMolarFlows")) return true;
    if (has("moleFractions") && has("molarFlow")) return true;
    if (has("massFractions") && has("massFlow")) return true;
    return false;
}

void writeStreamState(const ProcessStream&  s,
                      const ThermoPackage&  thermo,
                      const fs::path&       file)
{
    fs::create_directories(file.parent_path());
    std::ofstream out(file);
    out << std::setprecision(10);

    out << "/*--- Choupo stream state.  Every DIMENSIONAL value carries its unit; "
           "the parser converts to SI.\n"
           "     componentMolarFlows is the OVERALL material (all phases); a "
           "phases{} block, when present,\n"
           "     is a decomposition that sums back to it exactly. ---*/\n\n";

    // OVERALL per-component molar flow [kmol/h] = fluid (F*z) + solid (s).  This
    // is the primary material spec; F/z describe the fluid, s[] the solid.
    auto overall = [&](std::size_t i) -> scalar
    {
        return s.F * (i < s.z.size() ? s.z[i] : 0.0)
             + (i < s.s.size() ? s.s[i] : 0.0);
    };
    // A NEGLIGIBILITY floor relative to the stream total: a Gibbs/flash solver
    // leaves numerical underflow (1e-45, 1e-11 kmol/h) on absent species -- those
    // are physically zero and it is not natural to write them.  Drop any species
    // below 1e-10 of the total; a real trace (ppm and up) is far above it.
    scalar tot = 0.0;
    for (std::size_t i = 0; i < thermo.n(); ++i) tot += std::abs(overall(i));
    const scalar floor = 1e-10 * tot;
    auto significant = [&](scalar v){ return std::abs(v) > floor; };

    out << "componentMolarFlows\n{\n";
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (significant(overall(i)))
            out << "    " << thermo.comp(i).name() << "    "
                << overall(i) * 3600.0 << " kmol/h;\n";
    out << "}\n\n";

    // Stream state = T and P (a TP flash resolves the phase split).  We write
    // vaporFraction ONLY when it is genuinely needed to disambiguate an otherwise
    // non-unique liquid-vapour split (0 < vf < 1) -- never a decorative 0/1 that a
    // TP flash already fixes.  No derived{} second layer.
    out << "T               " << s.T << " K;\n";
    out << "P               " << s.P << " Pa;\n";
    // Phase is a RESULT the resolver recovers from (T,P,z); write a PIN only when
    // it cannot.  Two-phase split (0<vf<1) -> `vaporFraction q` (T,P alone do not
    // fix the split).  All-vapour -> the Tc screen recovers it iff T exceeds every
    // present component's Tc (a permanent gas); write nothing then.  Otherwise it
    // is a sub-critical gas mixture (steam in a gas) the screen cannot recover ->
    // the readable `phase gas` pin.  Liquid (vf~0) is the resolver default: nothing.
    if (s.vf > 1e-6 && s.vf < 1.0 - 1e-6)
        out << "vaporFraction   " << s.vf << ";\n";
    else if (s.vf >= 1.0 - 1e-6)
    {
        scalar maxTc = 0.0; bool allHaveTc = true, anyPresent = false;
        for (std::size_t i = 0; i < thermo.n() && i < s.z.size(); ++i)
        {
            if (s.z[i] <= 0.0) continue;
            anyPresent = true;
            const scalar tci = thermo.comp(i).Tc();
            if (tci > 0.0) { if (tci > maxTc) maxTc = tci; }
            else { allHaveTc = false; break; }
        }
        if (!(anyPresent && allHaveTc && s.T > maxTc))
            out << "phase           gas;\n";       // sub-critical vapour: needs the pin
        // else permanent gas: the Tc screen recovers vf=1, write no phase field
    }
    // Utility category (a stream ATTRIBUTE, not a state variable): marks this as
    // a utility stream (steam / hot-oil / cooling water), so the energy balance
    // and utility reports treat it as a utility loop, not a process boundary.
    if (!s.category.empty())
        out << "category        " << s.category << ";\n";

    //  AQUEOUS SPECIATION -- a DECOMPOSITION, written only when the reactive
    //  package solved one.  It is what the model actually resolved inside this
    //  liquid, which is the part no arithmetic on the block above can recover:
    //  HCO3- against CO3-2 against CaCO3(aq), and the pH they imply.  It
    //  collapses back through the components' declared bridges exactly, and
    //  the reader VERIFIES that and then discards it -- delete the block and
    //  the case is unchanged.  That deletability is what keeps it from being a
    //  second home for the material (aqueous-stream-basis, 2026-07-27).
    //  THE ONE RULE: the speciation attaches to the AQUEOUS material.  With a
    //  single liquid the stream IS that material and the block sits at top
    //  level; with a declared second liquid it moves INSIDE `phases.aqueous`,
    //  because the ions are there and nowhere else.  Two placements, one rule
    //  -- and the reader refuses the ambiguous combination.
    const bool splitLiquids = s.organicLiquid && !s.organicLiquid->empty();
    const bool hasSpec      = s.speciation && !s.speciation->flows.empty();

    auto writeSpeciation = [&](const char* pad)
    {
        const auto& sp = *s.speciation;
        out << "\n" << pad << "speciation\n" << pad << "{\n"
            << pad << "    //  Report-only: this decomposes the material of the"
                      " phase that carries it,\n"
            << pad << "    //  and must collapse back through the declared"
                      " bridges (verified on read).\n";
        out << pad << "    network   ( " << sp.network << " );\n";
        out << pad << "    basis     " << sp.basis << ";\n";
        if (sp.pH_valid) out << pad << "    pH        " << sp.pH << ";\n";
        out << "\n";
        for (const auto& [nm, v] : sp.flows)
            if (std::abs(v) > 0.0)
                out << pad << "    " << nm << "    " << v * 3600.0 << " kmol/h;\n";
        out << pad << "}\n";
    };

    bool anySolid = false;
    for (std::size_t i = 0; i < s.s.size(); ++i)
        if (s.s[i] != 0.0) { anySolid = true; break; }

    //  The fluid phase is named AQUEOUS only when it is a single liquid that
    //  carries a speciation: naming a two-phase fluid "aqueous" would be a
    //  lie the reader would then verify the block against.
    const bool aqueousNamed = hasSpec && s.vf <= 0.001 && (anySolid || splitLiquids);
    if (hasSpec && !splitLiquids && !aqueousNamed) writeSpeciation("");

    if (anySolid || splitLiquids)
    {
        const char* fluidPhase = s.vf >= 0.999 ? "vapour"
                               : (s.vf <= 0.001 ? "liquid" : "fluid");
        auto block = [&](const char* nm,
                         const std::function<scalar(std::size_t)>& q,
                         bool nest = false, bool nestPsd = false)
        {
            out << "    " << nm << "\n    {\n        componentMolarFlows\n        {\n";
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (significant(q(i)))
                    out << "            " << thermo.comp(i).name() << "    "
                        << q(i) * 3600.0 << " kmol/h;\n";
            out << "        }\n";
            if (nest) writeSpeciation("        ");
            //  THE PSD IS THE SOLID PHASE'S, not the stream's.  A size
            //  distribution describes a PARTICLE POPULATION; hung on the
            //  stream it can only ever describe one, which is why the field
            //  had to be documented as "the combined solid phase" -- and a
            //  single distribution over two different minerals is not a
            //  physical object.  Writing it inside the phase costs nothing
            //  while there is one solid phase, and is what the second one
            //  will need.  (Commercial simulators reach the same place from
            //  the other end: the distribution rides with a declared solids
            //  SUBSTREAM, one per population.  The substream machinery is a
            //  type system for streams and is not worth its price here; the
            //  phases{} block already carries the naming.)
            if (nestPsd && !s.psd.empty())
            {
                out << "\n        particleSizeDistribution\n        {\n"
                       "            diameter  (";
                for (const auto d : s.psd.diameter) out << " " << d;
                out << " );\n            massFrac  (";
                for (const auto m : s.psd.massFrac) out << " " << m;
                out << " );\n        }\n";
            }
            out << "    }\n";
        };
        auto fluidOf = [&](std::size_t i)
        { return s.F * (i < s.z.size() ? s.z[i] : 0.0); };
        out << "\nphases\n{\n";
        if (splitLiquids)
        {
            //  The AQUEOUS side is the liquid MINUS the organic -- derived,
            //  never stored twice, so the two sum back to the overall exactly
            //  at whatever precision this file is written in.
            const auto& org = *s.organicLiquid;
            auto orgOf = [&](std::size_t i)
            { return i < org.size() ? org[i] : 0.0; };
            block("aqueous", [&](std::size_t i){ return fluidOf(i) - orgOf(i); },
                  hasSpec);
            block("organic", orgOf);
        }
        else
            block(aqueousNamed ? "aqueous" : fluidPhase, fluidOf, aqueousNamed);
        if (anySolid)
            block("solid", [&](std::size_t i)
                  { return i < s.s.size() ? s.s[i] : 0.0; }, false, true);
        out << "}\n";
    }

    // Particle-size distribution: diameter [m] + the mass fraction per bin
    // (Sigma = 1).  Part of a solid stream's STATE -- persisted so a drilled
    // crystalliser / dryer sub-case keeps the PSD it was fed.
    //
    // Written HERE only when no solid phase was named above; when one was,
    // the distribution is already inside it and a copy out here would be a
    // second home for one quantity, free to drift.  Hand-authored 0/ files
    // in the old top-level form keep working -- the reader takes either.
    if (!s.psd.empty() && !anySolid)
    {
        out << "\nparticleSizeDistribution\n{\n    diameter  (";
        for (const auto d : s.psd.diameter) out << " " << d;
        out << " );\n    massFrac  (";
        for (const auto m : s.psd.massFrac) out << " " << m;
        out << " );\n}\n";
    }
}

void writeStateDir(const std::map<std::string, ProcessStream>& streams,
                   const ThermoPackage&  thermo,
                   const fs::path&       dir,
                   const std::map<std::string, fs::path>& ownedPath)
{
    // Each stream is written FLAT under its owning sector at ownedPath[name]
    // (arch doc 8.4).  A stream absent from ownedPath is a boundary alias
    // (stored once, under its producer) -- skipped.
    for (const auto& [name, st] : streams)
    {
        auto it = ownedPath.find(name);
        if (it == ownedPath.end()) continue;
        writeStreamState(st, thermo, dir / it->second);
    }
}

ProcessStream readStreamState(const fs::path&       file,
                              const std::string&    name,
                              const ThermoPackage&  thermo)
{
    auto d = Dictionary::fromFile(file.string());
    ProcessStream s;
    s.name = name;
    const std::size_t n = thermo.n();
    s.z.assign(n, 0.0);
    s.s.assign(n, 0.0);

    // ---- MATERIAL FLOW: exactly ONE canonical form (Choupo accepts several,
    //      mutually exclusive) -> the OVERALL per-component molar flow [kmol/s].
    //   A  componentMolarFlows { comp <kmol/h>; }
    //   A' componentFlows      { ... }               (LEGACY alias, fluid-only)
    //   B  molarFlow <kmol/h>; moleFractions { ... }
    //   C  componentMassFlows  { comp <kg/h>; }       (-> molar via MW)
    //   D  massFlow <kg/h>; massFractions { ... }
    const bool hasCMF  = d->found("componentMolarFlows");
    const bool hasCF   = d->found("componentFlows");     // legacy, fluid-only
    const bool hasMolF = d->found("molarFlow");
    const bool hasCmMF = d->found("componentMassFlows");
    const bool hasMasF = d->found("massFlow");
    //  E  speciesMolarFlows { network <set>; <species> <kmol/h>; ... }
    //     The AQUEOUS-SPECIES basis: a water measured the way waters are
    //     measured, in ions.  It is a SIXTH canonical form, exclusive with the
    //     rest -- two material blocks in one file cannot say which one the
    //     author meant.  See docs/design/aqueous-stream-basis-proposal.md.
    const bool hasSMF  = d->found("speciesMolarFlows");
    const int  forms   = hasCMF + hasCF + hasMolF + hasCmMF + hasMasF + hasSMF;
    if (forms == 0)
        throw std::runtime_error("stream state '" + name + "': no material-flow "
            "specification (need componentMolarFlows, molarFlow+moleFractions, "
            "componentMassFlows, massFlow+massFractions, or speciesMolarFlows)");
    if (forms > 1)
        throw std::runtime_error("stream state '" + name + "': FATAL conflicting "
            "material-flow specifications -- choose exactly ONE canonical form");

    std::vector<scalar> overall(n, 0.0);   // per-component molar flow [kmol/s]
    const bool legacyFluidOnly = hasCF;    // legacy componentFlows excluded solids

    const auto& mixTokens = thermo.mixtureMembersByToken();
    auto readMolar = [&](const DictPtr& blk, bool mass)
    {
        for (const auto& comp : blk->keys())
        {
            scalar v = blk->lookupScalar(comp);               // SI: kmol/s or kg/s
            // Predefined-mixture token (`air 50 kmol/h;`): splice its total into the
            // member component flows by their mole fractions -- so a stream can say
            // `air` instead of listing N2/O2/Ar.  Announced once via the loud splice
            // at package load; here it is a silent, exact re-distribution.
            auto mit = mixTokens.find(comp);
            if (mit != mixTokens.end())
            {
                // Distribute over NORMALISED member fractions (air's N2/O2/Ar sum
                // to 0.9996 raw -- trace species dropped -- so `air 50` means 50
                // kmol/h of gas split 78.11/20.96/0.93 %, not 49.98).
                scalar xsum = 0.0;
                for (const auto& [member, x] : mit->second) xsum += x;
                if (xsum <= 0.0) xsum = 1.0;
                for (const auto& [member, x] : mit->second)
                {
                    const std::size_t i = thermo.indexOf(member);
                    const scalar frac = x / xsum;
                    overall[i] += mass ? (v * frac / thermo.comp(i).MW()) : (v * frac);
                }
                continue;
            }
            const std::size_t i = thermo.indexOf(comp);
            if (mass) v /= thermo.comp(i).MW();               // kg/s / (kg/kmol) = kmol/s
            overall[i] += v;
        }
    };
    auto readFractions = [&](const char* fkey, scalar total, bool mass)
    {
        auto fr = d->subDict(fkey);
        scalar sum = 0.0;
        std::vector<scalar> f(n, 0.0);
        for (const auto& comp : fr->keys())
        {
            const scalar x = fr->lookupScalar(comp);
            f[thermo.indexOf(comp)] = x; sum += x;
        }
        if (std::abs(sum - 1.0) > 1e-6)
            throw std::runtime_error("stream state '" + name + "': " + std::string(fkey)
                + " do not close (sum = " + std::to_string(sum) + ", expected 1)");
        for (std::size_t i = 0; i < n; ++i)
            overall[i] = mass ? total * f[i] / thermo.comp(i).MW() : total * f[i];
    };

    //  ---- THE AQUEOUS-SPECIES BASIS ----------------------------------------
    //  A water analysis arrives in IONS.  Making the author convert it into
    //  salts makes them CHOOSE LABELS -- NaCl + KBr and NaBr + KCl give the
    //  same ions -- and that choice is exactly the degree of freedom the
    //  basis-rank test polices.  Reading the analysis as measured needs no
    //  inverse; stating it on the basis the flowsheet's units SHARE does, and
    //  the same rank condition applies.  m = A n, solved here for n.
    auto readSpecies = [&](const DictPtr& blk)
    {
        const auto* cfg = thermo.reactiveConfig();

        //  ---- THE SAME TWO PATHS THE OUTPUT SIDE ALREADY HAS -------------
        //
        //  A reactive package carries the bridges in its families; a MOLALITY
        //  package (Pitzer / eNRTL) resolves ions with no equilibrium NETWORK
        //  at all, and its bridges live on the components.  The output side
        //  was taught both earlier today -- a brine now writes
        //  `speciation { network ( completeDissociation ); ... }`.  The INPUT
        //  side still demanded a network, so the engine would write a form it
        //  refused to read back: 10 of the corpus's electrolyte cases failed
        //  exactly there when the two bases were measured against each other.
        //
        //  Columns of A are the components that DECLARE a bridge, in package
        //  order; the solvent is the package's declared one (never inferred
        //  from a name -- SystemClassifier settled that).
        //  One shape for both sources: the reactive families carry
        //  pair<SpeciesId,scalar>, a component's own bridge carries
        //  SpeciesStoich.  Same fact, two spellings -- normalised here so the
        //  projection below does not have to know which path it came from.
        struct Bridge
        {
            std::size_t apparentIdx;
            std::vector<std::pair<SpeciesId, scalar>> mapping;
        };
        std::vector<Bridge> bridges;
        std::size_t solventIdx = thermo.n();
        bool haveNetwork = false;

        if (cfg)
        {
            haveNetwork = true;
            solventIdx  = cfg->solventIdx;
            for (const auto& fam : cfg->families)
            {
                Bridge b; b.apparentIdx = fam.apparentIdx; b.mapping = fam.mapping;
                bridges.push_back(std::move(b));
            }
        }
        else if (thermo.hasElectrolyte())
        {
            solventIdx = thermo.electrolyte().solventIndex();
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (thermo.comp(i).hasAqueousMapping())
                {
                    Bridge b; b.apparentIdx = i;
                    for (const auto& ms : thermo.comp(i).aqueousMapping())
                        b.mapping.emplace_back(ms.species, ms.nu);
                    bridges.push_back(std::move(b));
                }
        }

        if (bridges.empty() || solventIdx >= thermo.n())
            throw std::runtime_error("stream state '" + name + "':"
                " `speciesMolarFlows` needs a package that RESOLVES IONS --"
                " either a reactive equilibrium (formulation"
                " electrolyteGammaPhi with a chemistry network) or a molality"
                " model (Pitzer / eNRTL) whose components declare their"
                " bridges.  This case declares neither, so the species names"
                " answer to nothing here.  Write the stream in"
                " `componentMolarFlows`.");
        //  The NETWORK is mandatory.  A species name is meaningful only
        //  relative to a declared chemistry set: an `NH4` written by one
        //  network is not the `NH4` of another, and a stream file that does
        //  not say which one it belongs to cannot be read anywhere else.
        if (!blk->found("network") && haveNetwork)
            throw std::runtime_error("stream state '" + name + "':"
                " `speciesMolarFlows` carries no `network <setName>;`.  A"
                " species basis is relative to the chemistry set that defines"
                " those names -- without it the block is unreadable outside"
                " the case that wrote it.");
        //  `network` is a WORD or a LIST: an analysis may span two declared
        //  sets (a carbonate water that also carries ammonia), and forcing one
        //  name would make the author pick a half-truth.
        std::vector<std::string> nets;
        if (blk->found("network"))
        {
            const EntryValue& ev = blk->entryValue("network");
            if (std::holds_alternative<std::string>(ev))
                nets.push_back(std::get<std::string>(ev));
            else
                nets = blk->lookupWordList("network");
        }
        const std::string net = nets.empty() ? std::string() : nets.front();
        //  ...and it must be a set THIS case's components declare.  A network
        //  name nobody in the system speaks is a typo that would otherwise
        //  pass silently and make the file look authoritative.
        {
            std::string declared;
            for (std::size_t i = 0; i < thermo.n(); ++i)
            {
                const std::string& s = thermo.comp(i).aqueousSpeciation();
                if (s.empty() || s == "none") continue;
                if (declared.find(s) == std::string::npos)
                    declared += (declared.empty() ? "" : " ") + s;
            }
            for (const auto& nm : nets)
            {
                bool known = false;
                for (std::size_t i = 0; i < thermo.n(); ++i)
                    if (thermo.comp(i).aqueousSpeciation() == nm) known = true;
                if (!known)
                    throw std::runtime_error("stream state '" + name + "':"
                        " `network " + nm + ";` is not a chemistry set this"
                        " system declares (its components declare: "
                        + (declared.empty() ? "none" : declared) + ").");
            }
        }
        //  ANALYTICAL vs STOICHIOMETRIC -- and this is not bookkeeping, it
        //  decides whether charge must close.  An ANALYTICAL set is a water
        //  measured in ions and it balances: that is what makes it a good
        //  analysis.  A STOICHIOMETRIC set is what the component bridges
        //  deliver, and it does NOT balance, because H/OH are the network's
        //  own mediators and are excluded from the masters -- a neutral acid
        //  delivered as its conjugate base looks 200 % imbalanced while being
        //  charge-balanced by construction (the same distinction
        //  SpeciationInput::stoichiometricTotals already draws inside the
        //  kernel).  Checking the wrong one either refuses a correct water or
        //  waves a broken one through, so it is DECLARED, never defaulted.
        if (!blk->found("basis"))
            throw std::runtime_error("stream state '" + name + "':"
                " `speciesMolarFlows` carries no `basis analytical|"
                "stoichiometric;`.  It decides whether charge must close:"
                " an ANALYTICAL water is measured in ions and balances; a"
                " STOICHIOMETRIC set is what the component bridges deliver"
                " and does not, because H/OH are excluded mediators.  There"
                " is no safe default -- one reading refuses a correct water,"
                " the other waves a broken one through.");
        const std::string basis = blk->lookupWord("basis");
        if (basis != "analytical" && basis != "stoichiometric")
            throw std::runtime_error("stream state '" + name + "': basis '"
                + basis + "' is not one of analytical / stoichiometric.");

        //  Read the totals, and the SOLVENT, which is a component and not a
        //  master (it is the medium the molalities are referenced to).
        std::map<std::string, scalar> mTot;      // master -> kmol/s
        scalar solventFlow = -1.0;
        const std::string solventName = thermo.comp(solventIdx).name();
        for (const auto& k : blk->keys())
        {
            if (k == "network" || k == "basis") continue;
            if (k == solventName) { solventFlow = blk->lookupScalar(k); continue; }
            mTot[k] += blk->lookupScalar(k);
        }
        if (solventFlow < 0.0)
            throw std::runtime_error("stream state '" + name + "':"
                " `speciesMolarFlows` names no solvent flow ('" + solventName
                + "') -- the aqueous species are dissolved IN something, and"
                  " the amount of it is not optional.");

        //  ELECTRONEUTRALITY, validated exactly as the props bench validates
        //  a formulated-salts `composition`: an analysis that does not balance
        //  charge is an error IN THE ANALYSIS, and absorbing it into the
        //  solved pH would hide a measurement fault inside a result.
        scalar netCharge = 0.0;
        for (const auto& [sp, v] : mTot)
        {
            DictPtr rec = electrolyte::findAqueousSpecies(sp);
            if (!rec)
                throw std::runtime_error("stream state '" + name + "': species '"
                    + sp + "' has no record (species/" + sp + ".dat) -- it is"
                    " not a species of any declared network.");
            netCharge += rec->lookupScalar("z") * v;
        }
        scalar absCharge = 0.0;
        for (const auto& [sp, v] : mTot)
        {
            DictPtr rec = electrolyte::findAqueousSpecies(sp);
            absCharge += std::abs(rec->lookupScalar("z") * v);
        }
        if (basis == "analytical" && absCharge > 0.0
            && std::abs(netCharge) > 1.0e-6 * absCharge)
        {
            std::ostringstream os;
            os << std::scientific << std::setprecision(4);
            os << "stream state '" << name << "': the species analysis does"
                  " NOT balance charge -- SUM z_i n_i = " << netCharge
               << " kmol/s against " << absCharge << " kmol/s of charge"
                  " carried.  H+ and OH- are the network's own mediators and"
                  " do not close a lab analysis: an unbalanced water is a"
                  " measurement to fix, never a residue for the pH to absorb.";
            throw std::runtime_error(os.str());
        }

        //  m = A n.  Columns are the components' DECLARED bridges (never name
        //  identity); rows are the masters the analysis names.
        std::vector<std::string> rows;
        for (const auto& [sp, v] : mTot) { (void)v; rows.push_back(sp); }
        const std::size_t nr = rows.size();
        std::vector<std::size_t> cols;              // component indices
        for (const auto& br : bridges) cols.push_back(br.apparentIdx);
        const std::size_t nc = cols.size();
        std::vector<sVector> A(nr, sVector(nc, 0.0));
        for (std::size_t c = 0; c < nc; ++c)
            for (const auto& [master, nu] : bridges[c].mapping)
                for (std::size_t r = 0; r < nr; ++r)
                    if (rows[r] == master.key) A[r][c] += nu;

        //  Solve by Gaussian elimination with partial pivoting on the square
        //  part; a rank short of nc is the SAME refusal the basis-rank test
        //  raises, reached from the input side.
        sVector nSol(nc, 0.0);
        {
            std::vector<sVector> M = A;
            sVector b(nr);
            for (std::size_t r = 0; r < nr; ++r) b[r] = mTot[rows[r]];
            std::vector<std::size_t> pivRow(nc, nr);
            std::size_t rank = 0;
            for (std::size_t c = 0; c < nc && rank < nr; ++c)
            {
                std::size_t piv = rank;
                for (std::size_t r = rank; r < nr; ++r)
                    if (std::abs(M[r][c]) > std::abs(M[piv][c])) piv = r;
                if (std::abs(M[piv][c]) < 1.0e-12) continue;
                std::swap(M[rank], M[piv]); std::swap(b[rank], b[piv]);
                for (std::size_t r = 0; r < nr; ++r)
                {
                    if (r == rank) continue;
                    const scalar f = M[r][c] / M[rank][c];
                    for (std::size_t cc = 0; cc < nc; ++cc) M[r][cc] -= f*M[rank][cc];
                    b[r] -= f * b[rank];
                }
                pivRow[c] = rank;
                ++rank;
            }
            if (rank < nc)
                throw std::runtime_error("stream state '" + name + "': the"
                    " species analysis cannot be stated on this component"
                    " basis -- the map has rank " + std::to_string(rank)
                    + " for " + std::to_string(nc) + " components, so several"
                      " different component vectors give these same species"
                      " totals and any one of them would be an arbitrary"
                      " choice of LABELS.  Remedy: drop a redundant component"
                      " from the case's basis (the same deficiency"
                      " flash15_refused_salt_basis_rank refuses).");
            for (std::size_t c = 0; c < nc; ++c)
                if (pivRow[c] < nr) nSol[c] = b[pivRow[c]] / M[pivRow[c]][c];
            //  Rows the components cannot reach at all: the analysis names a
            //  master no component in this case bridges to.
            for (std::size_t r = 0; r < nr; ++r)
            {
                scalar recon = 0.0;
                for (std::size_t c = 0; c < nc; ++c) recon += A[r][c] * nSol[c];
                const scalar want = mTot[rows[r]];
                if (std::abs(recon - want) > 1.0e-6*std::max(1.0, std::abs(want)))
                    throw std::runtime_error("stream state '" + name + "':"
                        " species '" + rows[r] + "' cannot be carried by this"
                        " case's components (declared " + std::to_string(want)
                        + " kmol/s, reachable " + std::to_string(recon)
                        + ") -- add a component whose bridge names it, or drop"
                          " it from the analysis.");
            }
        }
        for (std::size_t c = 0; c < nc; ++c) overall[cols[c]] += nSol[c];
        overall[solventIdx] += solventFlow;
        (void)net;
    };

    if      (hasCMF)  readMolar(d->subDict("componentMolarFlows"), false);
    else if (hasCF)   readMolar(d->subDict("componentFlows"),      false);
    else if (hasCmMF) readMolar(d->subDict("componentMassFlows"),  true);
    else if (hasSMF)  readSpecies(d->subDict("speciesMolarFlows"));
    else if (hasMolF) readFractions("moleFractions", d->lookupScalar("molarFlow"), false);
    else if (hasMasF) readFractions("massFractions", d->lookupScalar("massFlow"),  true);

    // ---- SOLID phase: new phases{ solid { } } decomposition (validated to sum
    //      back to overall) OR the legacy solidFlows block.
    std::vector<scalar> solid(n, 0.0);
    //  The AQUEOUS phase's own material, when the decomposition names one, and
    //  the speciation that rides inside it.  These are what the block is
    //  checked against: the ions are in the aqueous phase and nowhere else, so
    //  checking against the OVERALL material is right only while no other
    //  phase holds a speciating component -- true today by the accident of a
    //  declaration, not by anything the format enforced.
    std::vector<scalar>               aqueous;      // empty = none named
    std::shared_ptr<const Dictionary> nestedSpec;
    std::string                       specPhase;
    if (d->found("phases"))
    {
        auto ph = d->subDict("phases");
        std::vector<scalar> phaseSum(n, 0.0);
        for (const auto& pname : ph->keys())
        {
            auto pd = ph->subDict(pname);
            if (pd->found("speciation"))
            {
                if (nestedSpec)
                    throw std::runtime_error("stream state '" + name + "': two"
                        " phases carry a `speciation` block ('" + specPhase
                        + "' and '" + pname + "').  A speciation describes ONE"
                          " material; two of them are two accounts of the same"
                          " chemistry and nothing says which is believed.");
                nestedSpec = pd->subDict("speciation");
                specPhase  = pname;
            }
            if (!pd->found("componentMolarFlows")) continue;
            auto cmf = pd->subDict("componentMolarFlows");
            if (pname == "aqueous") aqueous.assign(n, 0.0);
            for (const auto& comp : cmf->keys())
            {
                const std::size_t i = thermo.indexOf(comp);
                const scalar v = cmf->lookupScalar(comp);
                phaseSum[i] += v;
                if (pname == "solid")   solid[i]   += v;
                if (pname == "aqueous") aqueous[i] += v;
            }
        }
        //  A top-level block beside a named aqueous phase is the ambiguity
        //  this whole change removes: it would be checked against the overall
        //  material while its own phase sits right there, named.
        if (!aqueous.empty() && d->found("speciation"))
            throw std::runtime_error("stream state '" + name + "': a"
                " `speciation` block sits at the top level while `phases`"
                " names an aqueous phase.  The ions are in the aqueous phase"
                " and nowhere else, so the block belongs INSIDE it -- at the"
                " top level it would be checked against material that includes"
                " the other phases.  Move it into `phases.aqueous`.");
        if (nestedSpec && specPhase != "aqueous")
            throw std::runtime_error("stream state '" + name + "': phase '"
                + specPhase + "' carries a `speciation` block.  Aqueous"
                  " speciation describes the AQUEOUS phase; a solid or an"
                  " organic liquid has no ion network to decompose.");
        for (std::size_t i = 0; i < n; ++i)
            if (std::abs(phaseSum[i] - overall[i]) > 1e-6 * std::max(1.0, std::abs(overall[i])))
                throw std::runtime_error("stream state '" + name + "': phase decomposition "
                    "does not sum to the overall material for '" + thermo.comp(i).name() + "'");
    }
    else if (d->found("solidFlows"))   // legacy
    {
        auto sf = d->subDict("solidFlows");
        for (const auto& comp : sf->keys())
            solid[thermo.indexOf(comp)] = sf->lookupScalar(comp);
    }

    //  ---- The SPECIATION decomposition: VERIFIED, then discarded ----------
    //  It is not read into the stream.  Nothing downstream consults it; the
    //  material is the component block above.  What happens here is the one
    //  thing that keeps it honest: it must collapse back through the
    //  components' declared bridges onto the material actually present.  A
    //  block that has drifted -- hand-edited, or copied from another state --
    //  is caught here rather than being quietly believed.
    if (d->found("speciation") || nestedSpec)
    {
        const auto* cfg = thermo.reactiveConfig();
        auto sd = nestedSpec ? nestedSpec : d->subDict("speciation");
        //  THE MATERIAL THE BLOCK DESCRIBES.  Nested: the aqueous phase's own
        //  amounts.  Top-level: the whole stream -- correct exactly when there
        //  is one liquid and no other phase holds a speciating component,
        //  which is why the nested form exists at all.
        const std::vector<scalar>& basisMaterial = nestedSpec ? aqueous : overall;
        //  A TOP-LEVEL block on a two-phase stream describes nothing
        //  checkable: `overall` is liquid plus vapour, and the ions are in
        //  the liquid.  It is refused rather than verified against the wrong
        //  material -- the same reasoning as the nested form, one phase
        //  boundary out.  (vf == 1 is refused too: no aqueous phase at all.)
        //  Read the vapour fraction FROM THE DICT, not from `s`: the
        //  thermodynamic state is parsed further down, so `s.vf` is still 0
        //  here.  Taking it from the half-built stream made this refusal
        //  silently unreachable -- it passed its own test by never firing.
        const scalar vfDecl =
            d->found("vaporFraction") ? d->lookupScalar("vaporFraction")
          : (d->found("phase") && d->lookupWord("phase") == "gas") ? 1.0
          : 0.0;
        if (!nestedSpec && vfDecl > 1e-6)
            throw std::runtime_error("stream state '" + name + "': a"
                " top-level `speciation` block on a stream that is "
                + std::to_string(vfDecl * 100.0).substr(0, 5) + " % vapour."
                "  The ions are in the LIQUID; at the top level the block"
                " would be checked against the liquid AND the vapour"
                " together.  Name the phase it describes"
                " (`phases { aqueous { ... speciation { ... } } }`), or drop"
                " the block.");
        //  NO NETWORK IS NOT NO CHEMISTRY.  A Pitzer or eNRTL package resolves
        //  ions -- that is what a molality model IS -- it simply has no
        //  equilibrium network to solve them from, so its block is complete
        //  dissociation through the components' own declared bridges.  This
        //  used to refuse outright, which meant the engine could not write a
        //  speciation for any brine in the corpus without producing a file it
        //  would then refuse to read.  What must never be believed is a block
        //  whose names answer to NOTHING here -- so the test is whether the
        //  components declare any bridge at all, not whether a network exists.
        bool anyBridge = false;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).hasAqueousMapping()) { anyBridge = true; break; }
        if (!cfg && !anyBridge)
            throw std::runtime_error("stream state '" + name + "': carries a"
                " `speciation` block but no component in this case declares an"
                " aqueous bridge (`aqueousMapping` / `dissociatesTo`) and there"
                " is no reactive chemistry -- the block's names answer to"
                " nothing here, so nothing could check it.");
        std::map<std::string, scalar> declared;      // master -> kmol/s
        for (const auto& k : sd->keys())
        {
            if (k == "network" || k == "basis" || k == "pH") continue;
            declared[k] += sd->lookupScalar(k);
        }
        //  m = A n from the material that IS state, against the same bridges.
        //  WITH a network the families carry them; without one they are the
        //  components' own -- the same matrix either way, read from the same
        //  declaration, which is why the block closes by construction rather
        //  than by two roundings agreeing.
        std::map<std::string, scalar> fromComponents;
        if (cfg)
            for (const auto& fam : cfg->families)
                for (const auto& [master, nu] : fam.mapping)
                    fromComponents[master.key] += nu * basisMaterial[fam.apparentIdx];
        else
            for (std::size_t i = 0; i < thermo.n() && i < basisMaterial.size(); ++i)
                for (const auto& m : thermo.comp(i).aqueousMapping())
                    fromComponents[m.species.key] += m.nu * basisMaterial[i];
        //  ...and the block collapsed the other way, through the NETWORK's own
        //  stoichiometry.  Summing the free ions would not do: the calcium of
        //  a calcium-bicarbonate water is spread over Ca(2+), CaHCO3(+),
        //  CaCO3(aq) and CaOH(+), and only the reactions know that.  H and OH
        //  fall out on their own -- they are the shared mediators, closed by
        //  electroneutrality, and no component bridges to them.
        std::map<std::string, scalar> collapsed;
        for (const auto& [sp, v] : declared)
        {
            if (!cfg)
            {
                //  Complete dissociation: there ARE no complexes, so each
                //  declared species is its own master and the collapse is the
                //  identity.  Routing it through speciesMasterComposition
                //  would ask a network that does not exist and get an empty
                //  answer -- which reads as "the block declares nothing" and
                //  refuses a block that is in fact exact.
                collapsed[sp] += v;
                continue;
            }
            for (const auto& [m, nu] : thermo.speciesMasterComposition(sp))
                collapsed[m] += nu * v;
        }
        std::string worst; scalar worstErr = 0.0, worstWant = 0.0, worstGot = 0.0;
        for (const auto& [m, want] : fromComponents)
        {
            auto it = collapsed.find(m);
            const scalar got = (it == collapsed.end()) ? 0.0 : it->second;
            const scalar err = std::abs(got - want);
            if (err > worstErr) { worstErr = err; worst = m; worstWant = want; worstGot = got; }
        }
        scalar scale = 0.0;
        for (const auto& [m, v] : fromComponents) scale = std::max(scale, std::abs(v));
        if (!worst.empty() && worstErr > 1.0e-6 * std::max(scale, 1.0e-30))
        {
            std::ostringstream os;
            os << std::scientific << std::setprecision(6);
            os << "stream state '" << name << "': the `speciation` block does"
                  " NOT collapse back to the material of "
               << (nestedSpec ? "the AQUEOUS phase" : "the stream")
               << ".  Master '" << worst
               << "': the components carry " << worstWant
               << " kmol/s through their declared bridges, the block declares "
               << worstGot << ".  A decomposition that does not close is a"
                  " SECOND account of the same matter, and the material is the"
                  " componentMolarFlows block -- delete the speciation block or"
                  " re-run the case that wrote it.";
            throw std::runtime_error(os.str());
        }
    }

    // ---- Reconstruct the ProcessStream: fluid = overall - solid (the legacy
    //      componentFlows was ALREADY fluid-only, so its overall IS the fluid).
    scalar Ftot = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar fluid = legacyFluidOnly ? overall[i] : (overall[i] - solid[i]);
        if (fluid < -1e-9)
            throw std::runtime_error("stream state '" + name + "': solid exceeds the "
                "overall material for '" + thermo.comp(i).name() + "'");
        s.z[i] = fluid;   // hold the flow; normalise below
        s.s[i] = solid[i];
        Ftot  += fluid;
    }
    s.F = Ftot;
    if (Ftot > 0.0) for (auto& zi : s.z) zi /= Ftot;

    // ---- THERMODYNAMIC STATE: T and P are the normal description (a TP flash
    //  resolves the phase split).  vaporFraction is read only when present -- it
    //  disambiguates an otherwise non-unique liquid-vapour split; it is not a
    //  decorative field.  Simplified grammar (2026-07-07): no PH/PS/TQ/PQ closure
    //  axis, no derived{} second layer.  A LEGACY derived{ vaporFraction }
    //  (written by the earlier grammar) is still honoured on read.
    s.T  = d->lookupScalarOrDefault("T", 0.0, Dims::temperature);
    s.P  = d->lookupScalarOrDefault("P", 0.0, Dims::pressure);
    // Phase PIN (read only, no thermodynamics here).  Two readable forms:
    //   `phase gas|liquid;`  -- a phase-INTENT boundary spec (this feed enters
    //      as gas / liquid), the legible replacement for a `vaporFraction 0/1`
    //      that a reader once needed.  Used when a cheap Tc screen cannot recover
    //      the phase (a gas mixture holding a sub-critical species, e.g. steam).
    //   `vaporFraction q;`   -- a quality / two-phase SPLIT pin (0 < q < 1 at
    //      saturation), where T and P alone do not fix the split.
    // Absent -> the resolver decides (Tc screen, then flash) in the unit context.
    s.vf = d->lookupScalarOrDefault("vaporFraction", 0.0);
    if (d->found("phase"))
    {
        const std::string ph = d->lookupWord("phase");
        if      (ph == "gas" || ph == "vapor" || ph == "vapour") s.vf = 1.0;
        else if (ph == "liquid")                                 s.vf = 0.0;
        // `solid` is carried by the solids block, not by vf.
    }
    if (d->found("derived"))
    {
        auto dv = d->subDict("derived");
        if (dv->found("vaporFraction")) s.vf = dv->lookupScalar("vaporFraction");
    }
    s.category = d->lookupWordOrDefault("category", "");   // utility-stream tag

    //  The PSD, from the SOLID PHASE that owns it, or -- for a file written
    //  before the distribution moved into the phase, and for hand-authored
    //  0/ states -- from the top level.  Both are read; only the nested form
    //  is written.  A file carrying BOTH is refused rather than silently
    //  preferring one: two distributions for one population is the drift
    //  this move exists to prevent.
    DictPtr psdDict;
    if (d->found("phases"))
    {
        auto ph = d->subDict("phases");
        for (const auto& pname : ph->keys())
        {
            auto pd = ph->subDict(pname);
            if (!pd->found("particleSizeDistribution")) continue;
            if (psdDict)
                throw std::runtime_error("stream state '" + name + "': more"
                    " than one phase carries a particleSizeDistribution."
                    "  Each solid population has its own -- but the stream"
                    " holds ONE, so a second cannot be represented and"
                    " picking either would decide the physics by the order"
                    " of the file.");
            if (pname != "solid")
                throw std::runtime_error("stream state '" + name + "': phase"
                    " '" + pname + "' carries a particleSizeDistribution."
                    "  A size distribution describes a population of"
                    " PARTICLES; a fluid phase has none.");
            psdDict = pd->subDict("particleSizeDistribution");
        }
    }
    if (psdDict && d->found("particleSizeDistribution"))
        throw std::runtime_error("stream state '" + name + "': a"
            " particleSizeDistribution at the top level AND inside the solid"
            " phase.  One population, one distribution -- two homes drift."
            "  Keep the one inside the phase.");
    if (!psdDict && d->found("particleSizeDistribution"))
        psdDict = d->subDict("particleSizeDistribution");
    if (psdDict)
    {
        if (psdDict->found("diameter")) s.psd.diameter = psdDict->lookupList("diameter");
        if (psdDict->found("massFrac")) s.psd.massFrac = psdDict->lookupList("massFrac");
    }
    return s;
}

std::map<std::string, ProcessStream>
readStateDir(const fs::path& dir, const ThermoPackage& thermo)
{
    std::map<std::string, ProcessStream> out;
    if (!fs::exists(dir)) return out;
    for (const auto& e : fs::recursive_directory_iterator(dir))
    {
        if (!e.is_regular_file()) continue;
        if (e.path().filename() == "manifest.dat") continue;
        // A stream-state file is CANONICAL: it carries a `componentFlows` block.
        // This is also the distinguisher from the aggregated SolutionWriter
        // snapshot (`0/streamFaces`, `0/byUnit/…`) -- a different grammar;
        // those files are skipped (faces, not per-stream state).
        {
            std::ifstream probe(e.path());
            std::string body((std::istreambuf_iterator<char>(probe)),
                             std::istreambuf_iterator<char>());
            if (!looksLikeStreamState(body)) continue;
        }
        // path relative to dir, separators -> dots: SECTOR/sub/name -> SECTOR.sub.name
        const fs::path rel = fs::relative(e.path(), dir);
        std::string name;
        for (const auto& seg : rel)
            name += (name.empty() ? "" : ".") + seg.string();
        out[name] = readStreamState(e.path(), name, thermo);
    }
    return out;
}

}
}
