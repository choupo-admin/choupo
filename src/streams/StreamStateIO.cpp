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
#include "core/Dictionary.H"
#include "core/Types.H"

#include <cmath>
#include <fstream>
#include <functional>
#include <iomanip>
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
    // moleFractions.  (SolutionWriter 0/ snapshots must fall through to legacy.)
    if (has("componentMolarFlows") || has("componentMassFlows") || has("componentFlows"))
        return true;
    if (has("moleFractions") && has("molarFlow")) return true;
    if (has("massFractions") && has("massFlow")) return true;
    return false;
}

// A flattened solver name "SECTOR.sub.stream" -> path "SECTOR/sub/stream".
static fs::path nameToPath(const std::string& flat)
{
    fs::path p;
    std::string seg;
    std::istringstream ss(flat);
    while (std::getline(ss, seg, '.'))
        if (!seg.empty()) p /= seg;
    return p;
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

    // PHASE DECOMPOSITION -- written ONLY when a solid phase rides along.  It
    // decomposes the overall material and sums back to it (validated on read);
    // the fluid phase is named by its vapour fraction.
    bool anySolid = false;
    for (std::size_t i = 0; i < s.s.size(); ++i) if (s.s[i] != 0.0) { anySolid = true; break; }
    if (anySolid)
    {
        const char* fluidPhase = s.vf >= 0.999 ? "vapour"
                               : (s.vf <= 0.001 ? "liquid" : "fluid");
        auto block = [&](const char* nm, const std::function<scalar(std::size_t)>& q)
        {
            out << "    " << nm << "\n    {\n        componentMolarFlows\n        {\n";
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (significant(q(i)))
                    out << "            " << thermo.comp(i).name() << "    "
                        << q(i) * 3600.0 << " kmol/h;\n";
            out << "        }\n    }\n";
        };
        out << "\nphases\n{\n";
        block(fluidPhase, [&](std::size_t i){ return s.F * (i < s.z.size() ? s.z[i] : 0.0); });
        block("solid",    [&](std::size_t i){ return i < s.s.size() ? s.s[i] : 0.0; });
        out << "}\n";
    }

    // Particle-size distribution of the solid phase: diameter [m] + the mass
    // fraction per bin (Sigma = 1).  Part of a solid stream's STATE -- persisted
    // so a drilled crystalliser / dryer sub-case keeps the PSD it was fed.
    if (!s.psd.empty())
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
    const int  forms   = hasCMF + hasCF + hasMolF + hasCmMF + hasMasF;
    if (forms == 0)
        throw std::runtime_error("stream state '" + name + "': no material-flow "
            "specification (need componentMolarFlows, molarFlow+moleFractions, "
            "componentMassFlows, or massFlow+massFractions)");
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

    if      (hasCMF)  readMolar(d->subDict("componentMolarFlows"), false);
    else if (hasCF)   readMolar(d->subDict("componentFlows"),      false);
    else if (hasCmMF) readMolar(d->subDict("componentMassFlows"),  true);
    else if (hasMolF) readFractions("moleFractions", d->lookupScalar("molarFlow"), false);
    else if (hasMasF) readFractions("massFractions", d->lookupScalar("massFlow"),  true);

    // ---- SOLID phase: new phases{ solid { } } decomposition (validated to sum
    //      back to overall) OR the legacy solidFlows block.
    std::vector<scalar> solid(n, 0.0);
    if (d->found("phases"))
    {
        auto ph = d->subDict("phases");
        std::vector<scalar> phaseSum(n, 0.0);
        for (const auto& pname : ph->keys())
        {
            auto pd = ph->subDict(pname);
            if (!pd->found("componentMolarFlows")) continue;
            auto cmf = pd->subDict("componentMolarFlows");
            for (const auto& comp : cmf->keys())
            {
                const std::size_t i = thermo.indexOf(comp);
                const scalar v = cmf->lookupScalar(comp);
                phaseSum[i] += v;
                if (pname == "solid") solid[i] += v;
            }
        }
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

    if (d->found("particleSizeDistribution"))
    {
        auto pd = d->subDict("particleSizeDistribution");
        if (pd->found("diameter")) s.psd.diameter = pd->lookupList("diameter");
        if (pd->found("massFrac")) s.psd.massFrac = pd->lookupList("massFrac");
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
        // This is also the distinguisher from the per-iteration SolutionWriter
        // snapshot (`0/streams`, `0/byUnit/…`), which shares the `0/` name but
        // NOT the grammar -- those files are skipped, so a case whose `0/` is a
        // solution snapshot falls back to the legacy streams{} reader.
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
