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

#include "thermo/ResolvedView.H"

#include "core/ThermoResolution.H"
#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/liquidProperty/Measured.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <cstdio>
#include <filesystem>
#include <cstdint>
#include <functional>
#include <memory>
#include <set>
#include <sstream>
#include <variant>

namespace Choupo {
namespace resolvedView {

namespace {

//  ---- reading a DEEP COPY: nothing the view consults is marked read --------

DictPtr sub(const DictPtr& d, const std::string& k)
{
    if (!d || !d->found(k)) return nullptr;
    if (!std::holds_alternative<DictPtr>(d->entryValue(k))) return nullptr;
    return d->subDict(k);
}

DictPtr at(const DictPtr& d, std::initializer_list<const char*> path)
{
    DictPtr cur = d;
    for (const char* k : path) { cur = sub(cur, k); if (!cur) return nullptr; }
    return cur;
}

std::string word(const DictPtr& d, const std::string& k)
{
    if (!d || !d->found(k)) return "";
    const auto& v = d->entryValue(k);
    if (std::holds_alternative<std::string>(v)) return std::get<std::string>(v);
    if (std::holds_alternative<DictPtr>(v))
        return std::get<DictPtr>(v)->lookupWordOrDefault("model", "");
    return "";
}

std::string si(double v)
{
    char b[32];
    std::snprintf(b, sizeof b, "%.6g", v);
    return b;
}

//  ---- the printer: every line begins with [properties] ---------------------

struct Out
{
    std::ostream& os;
    void line(const std::string& s) { os << "[properties] " << s << "\n"; }
    void row(const std::string& what, const std::string& choice,
             const std::vector<std::string>& data)
    {
        line("  " + what);
        line("      CHOICE  " + choice);
        for (std::size_t k = 0; k < data.size(); ++k)
            line(std::string(k ? "              " : "      DATA    ") + data[k]);
    }
};

//  ONE CONSTITUENT'S RECORD LAW, as the view prints it (C398 slice (b)):
//  which law, of which type, who chose it, and its window.
std::string lawText(const Component& c, const std::string& property)
{
    const Component::LawChoice ch = c.lawChoice(property);
    const recordLaws::Block* blk = c.recordLaws(property);
    if (!blk) return "none";
    const int idx = blk->indexOf(ch.law);
    const recordLaws::Law& L = blk->laws.at(std::size_t(idx >= 0 ? idx : (blk->preferred >= 0 ? blk->preferred : 0)));
    std::string r = (L.name.empty() ? std::string("its one law") : "law `" + L.name + "`")
                  + " (" + L.type + "), " + (ch.by.empty() ? std::string("the record's law") : ch.by)
                  + "; window: " + L.windowText();
    if (blk->laws.size() > 1) r += "; the record's laws: " + blk->names();
    return r;
}

//  U3: the form of every law type the row uses, declared by the type
//  (recordLaws::declareForm) -- one line per distinct type.
void formLines(std::vector<std::string>& d, const std::string& family,
               const std::set<std::string>& types)
{
    for (const auto& t : types)
    {
        const std::string f = recordLaws::formOf(family, t);
        d.push_back("form of " + t + ": " + (f.empty() ? std::string("NOT DECLARED by the type") : f));
    }
}

std::string pairName(const ThermoPackage& p, std::size_t i, std::size_t j)
{
    return p.comp(i).name() + "-" + p.comp(j).name();
}

//  ---- the fingerprint: a canonical text of the definition, hashed ----------

void canon(const DictPtr& d, std::ostringstream& o)
{
    char b[40];
    for (const auto& k : d->keys())
    {
        if (k == "components" || k == "binaryPairsBase" || k == "activeComponents"
            || k == "variants")
            continue;
        o << k << "=";
        const auto& v = d->entryValue(k);
        if (std::holds_alternative<scalar>(v))
        { std::snprintf(b, sizeof b, "%.17g", std::get<scalar>(v)); o << b; }
        else if (std::holds_alternative<std::string>(v)) o << std::get<std::string>(v);
        else if (std::holds_alternative<std::vector<scalar>>(v))
        {
            o << "(";
            for (double x : std::get<std::vector<scalar>>(v))
            { std::snprintf(b, sizeof b, "%.17g ", x); o << b; }
            o << ")";
        }
        else if (std::holds_alternative<std::vector<std::string>>(v))
        { o << "("; for (const auto& w : std::get<std::vector<std::string>>(v)) o << w << " "; o << ")"; }
        else if (std::holds_alternative<std::vector<DictPtr>>(v))
        { o << "("; for (const auto& c : std::get<std::vector<DictPtr>>(v)) { o << "{"; canon(c, o); o << "}"; } o << ")"; }
        else if (std::holds_alternative<DictPtr>(v))
        { o << "{"; canon(std::get<DictPtr>(v), o); o << "}"; }
        else o << "$" << std::get<Reference>(v).name;
        o << ";";
    }
}

} // namespace

Choice systemChoice(const DictPtr& system)
{
    Choice c;
    c.system = "system (constant/thermoPhysPropDict)";
    const std::string src = system ? system->sourceName() : std::string();
    if (src.empty() || !std::filesystem::exists(src)) return c;
    std::error_code ec;
    const std::string rel = std::filesystem::relative(src, ec).string();
    c.system = "system (" + (ec || rel.empty() ? src : rel) + ")";
    const DictPtr raw = Dictionary::fromFile(src);
    const std::string parent = raw->lookupWordOrDefault("inherits", "");
    if (parent.empty()) return c;
    c.localFile = raw;
    c.inherited = "the parent system, through `inherits \"" + parent + "\"`";
    return c;
}

std::string fingerprint(const DictPtr& resolved)
{
    if (!resolved) return "none";
    std::ostringstream o;
    canon(resolved->deepCopy(), o);
    //  FNV-1a, 64 bit: a short, stable label, not a security property.
    std::uint64_t h = 1469598103934665603ULL;
    for (unsigned char c : o.str()) { h ^= c; h *= 1099511628211ULL; }
    char b[24];
    std::snprintf(b, sizeof b, "%016llx", static_cast<unsigned long long>(h));
    return b;
}

void print(std::ostream& os, const std::string& title, const ThermoPackage& pkg,
           const DictPtr& resolvedIn, const Choice& choice,
           const std::vector<std::string>& selectedBy)
{
    Out out{ os };
    const DictPtr R = resolvedIn ? resolvedIn->deepCopy() : std::make_shared<Dictionary>("none");
    const DictPtr F = choice.fragment ? choice.fragment->deepCopy() : nullptr;
    const DictPtr L = choice.localFile ? choice.localFile->deepCopy() : nullptr;
    const std::size_t n = pkg.n();

    //  WHERE a block's choice was made: the variant when its body declares
    //  the block; else, for a base that inherits, the file that declared it
    //  (its own, or the parent it inherits); else the base.
    auto chosen = [&](std::initializer_list<const char*> path,
                      const std::string& absent) -> std::string
    {
        if (F && at(F, path)) return choice.variant;
        if (at(R, path))
        {
            if (L && !at(L, path)) return choice.inherited;
            return choice.system;
        }
        return absent;
    };

    out.line("================  RESOLVED PROPERTIES: " + title + "  ================");
    out.line("  How every property this package can be asked is decided (DEV.md 4c C398).");
    out.line("  CHOICE = where the choice was made;  DATA = what runs, and where its data come from.");
    out.line("  Values in SI.  A record value is converted to SI when it is read (src/core/Units);");
    out.line("  the unit it was declared in is not kept by the component reader yet, so it is not shown.");
    out.line("  fingerprint " + fingerprint(resolvedIn) + " (the resolved definition; components excluded)");
    if (!selectedBy.empty())
    {
        std::string s;
        for (const auto& w : selectedBy) s += (s.empty() ? "" : "; ") + w;
        out.line("  selected by: " + s);
    }
    {
        std::string comps;
        for (std::size_t i = 0; i < n; ++i) comps += (i ? " " : "") + pkg.comp(i).name();
        out.line("  components: " + comps + "   (always the system's: a variant never changes them)");
    }

    //  ---- equilibrium ----------------------------------------------------
    const DictPtr eq = sub(R, "equilibrium");
    const std::string form = word(eq, "formulation");
    {
        std::vector<std::string> d;
        d.push_back("formulation " + (form.empty() ? std::string("(none: aqueousProperties surface)") : form));
        if (pkg.hasActivity())
        {
            std::string ss = word(sub(eq, "liquid"), "standardState");
            d.push_back("liquid activity model: " + pkg.activity().modelName()
                        + (ss.empty() ? "" : "; liquid standard state " + ss));
        }
        if (pkg.hasEos())
            d.push_back("vapour (and, under phiPhi, liquid) model: " + pkg.eos().modelName());
        //  The K-value world is a vapour-liquid notion of the gammaPhi and phiPhi
        //  formulations; the package's word defaults to "gammaPhi" for every
        //  other one, so it is printed only where it is the formulation's own
        //  (review row SA-04: a gammaGamma sector was labelled gammaPhi).
        if (form == "gammaPhi" || form == "phiPhi")
            d.push_back("K-value world: " + pkg.vleWorld());
        if (pkg.hasElectrolyte()) d.push_back("electrolyte model: active (aqueous ion surface)");
        //  The pairs the activity model consumes, as it recorded them while it
        //  was built (core/ThermoResolution.H) -- the source file of each.
        if (pkg.hasActivity())
        {
            std::set<std::string> names;
            for (std::size_t i = 0; i < n; ++i) names.insert(pkg.comp(i).name());
            int shown = 0;
            for (const auto& e : ThermoResolutionLog::instance().entries())
            {
                if (e.model != pkg.activity().modelName()) continue;
                if (!names.count(e.i) || !names.count(e.j)) continue;
                d.push_back("pair " + e.i + "-" + e.j + ": " + e.status
                            + (e.source.empty() ? "" : " (" + e.source + ")")
                            + (e.provSource.empty() ? "" : ", provenance " + e.provSource));
                if (++shown >= 12) { d.push_back("(further pairs: the thermoResolution block of the result)"); break; }
            }
        }
        std::string c = chosen({ "equilibrium" }, choice.system);
        //  A FRAGMENT THAT REPLACES ONLY SOME SLOTS (review row SA-04): an inline
        //  `thermo {}` or a variant with the same formulation replaces the slots
        //  it names (ThermoOverride.H), so the row names those slots and the base
        //  the others came from, instead of attributing the whole block.
        if (F && sub(F, "equilibrium"))
        {
            const DictPtr fe = sub(F, "equilibrium");
            const std::string ff = word(fe, "formulation");
            if (ff.empty() || ff == form)
            {
                std::string slots;
                for (const auto& k : fe->keys())
                    if (k != "formulation") slots += (slots.empty() ? "" : ", ") + k;
                const std::string base = (L && !at(L, { "equilibrium" })) ? choice.inherited
                                                                         : choice.system;
                c = choice.variant + " for the slot(s) " + (slots.empty() ? std::string("(none)") : slots)
                  + "; every other slot from " + base;
            }
            else
                c = choice.variant + " (the whole block: its formulation " + ff + " replaces the base's)";
        }
        if (F && sub(F, "equilibrium"))
            c += "  -- a MODEL BOUNDARY: this world's equilibrium differs from the system's;"
                 " the energy report accounts the step at the unit's boundary";
        out.row("equilibrium", c, d);
    }

    //  ---- volumetric -----------------------------------------------------
    {
        std::vector<std::string> d;
        d.push_back("most units (ThermoPackage::density, liquid branch): a liquid effectively pure in a");
        d.push_back("  pure-fluid component takes that method; otherwise ideal mixing of molar volumes:");
        for (std::size_t i = 0; i < n; ++i)
        {
            const Component& c = pkg.comp(i);
            std::string r = "  " + c.name() + ": ";
            if (pkg.hasPureFluid(i)) r += "pure-fluid method " + pkg.pureFluidMethod(i) + " when the liquid is pure in it; else ";
            switch (pkg.liquidVolumeRouteOf(i))
            {
            case ThermoPackage::LiquidVolumeRoute::anchoredRackett:
                r += "the record's Vliq = " + si(c.Vliq()) + " m3/mol at " + si(c.VliqT()) + " K"
                   + (c.hasVliqT() ? " (VliqT declared)" : " (25 C, the default datum)")
                   + ", Rackett (Tc, Pc, omega) supplying the temperature shape"; break;
            case ThermoPackage::LiquidVolumeRoute::flatVliq:
                r += "the record's Vliq = " + si(c.Vliq()) + " m3/mol, flat in T (no Tc, Pc)"; break;
            case ThermoPackage::LiquidVolumeRoute::bareRackett:
                r += "Rackett from Tc, Pc, omega alone (no Vliq in the record)"; break;
            default:
                r += "no liquid volume (a unit that asks is refused)"; break;
            }
            if (pkg.isHenrySolute(i)) r += "; a declared Henry solute";
            d.push_back(r);
        }
        d.push_back("pump, CSTR and the props key rho_liquid_kernel (the property kernel): resolved per");
        d.push_back("  constituent set at the set's first request -- a marked measurement, then a record law");
        d.push_back("  for exactly the set (pure fluid, reference equation, solution record), then ideal");
        d.push_back("  mixing of one leaf per constituent, else a refusal; the set and the method each");
        d.push_back("  consumer took are printed in the [liquid properties] table after the run");
        const auto& ms = liquidProperty::MeasurementDeclarations::instance().all();
        for (const auto& m : ms)
            d.push_back("case measurement " + m.name + " (use " + m.use + ")"
                        + (m.replacesMethod.empty() ? "" : ", replaces " + m.replacesMethod));
        out.row("liquid density (volumetric.liquid)",
                chosen({ "volumetric", "liquid" }, choice.system + ": no volumetric block (the catalogue's routes)"), d);
    }
    {
        std::vector<std::string> d;
        d.push_back(pkg.hasEos()
            ? "rho = P M / (Z R T), Z from the vapour model " + pkg.eos().modelName()
              + " (Z = 1 for idealGas)"
            : "no vapour model in this package (a liquid-only system)");
        out.row("vapour density (volumetric.vapour)",
                chosen({ "equilibrium", "vapour" }, choice.system), d);
    }

    //  ---- caloric --------------------------------------------------------
    const bool phiPhi = (form == "phiPhi");
    {
        std::vector<std::string> d;
        d.push_back("elementsDatum: every enthalpy is referred to the elements at 298.15 K, 1 bar");
        d.push_back("(the formation datum each record carries in its natural phase; the one datum the engine holds)");
        out.row("energy basis (caloric.energyBasis)",
                chosen({ "caloric" }, choice.system + ": not declared -- the formulation's own"), d);
    }
    {
        std::vector<std::string> d;
        if (phiPhi)
        {
            d.push_back("equilibriumEquationOfState: h = sum y_i (Hf298_i + integral Cp_ig,i dT) + H_R");
            d.push_back("  and s likewise with S_R, the departures of " + std::string(pkg.hasEos() ? pkg.eos().modelName() : "?"));
        }
        else
        {
            d.push_back("idealGasCp: h = sum y_i (Hf298_i + integral of the ideal-gas Cp_i dT)");
            d.push_back("  + H_R, the departure of the vapour model ("
                        + std::string(pkg.hasEos() ? pkg.eos().modelName() : "none")
                        + "; exactly 0 for idealGas)");
            d.push_back("s = sum y_i s_ig,i - R sum y_i ln y_i - R ln(P/P0) + S_R");
        }
        out.row("vapour enthalpy and entropy (caloric.vapour)",
                chosen({ "caloric", "vapour" }, choice.system + ": the formulation's route"), d);
    }
    {
        std::vector<std::string> d;
        if (phiPhi)
            d.push_back("equilibriumEquationOfState: the liquid root's departures, on the same ideal-gas legs");
        else if (pkg.hasElectrolyte())
        {
            d.push_back("ionicReferencePlusExcess: the salt's aqueous infinite-dilution ion reference");
            d.push_back("  (sum nu hfAq + the ions' Cp), plus the heat of dilution L_phi where the salt is");
            d.push_back("  calorimetrically fitted; the solvent and the molecular species on the liquid leg below");
        }
        if (!phiPhi)
        {
            d.push_back("pureCpPlusExcess: h_i = Hf298_i in the record's natural phase, bridged to the liquid");
            d.push_back("  at 298.15 K by the latent heat where the natural phase is not liquid, + integral of");
            d.push_back("  the liquid Cp_i dT (Component::h_formation); h = sum x_i h_i + H^E");
            const bool fit = pkg.hasActivity() && pkg.activity().calorimetricFit();
            d.push_back(fit ? "  H^E: from the activity model (every pair carries `calorimetricFit true;`)"
                            : "  H^E: omitted, 0 -- no pair of the activity model carries `calorimetricFit true;`"
                              " (the heat of mixing is an announced omission)");
            d.push_back("  s = sum x_i s_i - R sum x_i ln x_i + H^E/T - R sum x_i ln gamma_i (G^E from the activity model)");
        }
        out.row("liquid enthalpy and entropy (caloric.liquid)",
                chosen({ "caloric", "liquid" }, choice.system + ": the formulation's route"), d);
    }
    {
        std::vector<std::string> d;
        std::set<std::string> cpTypes;
        for (std::size_t i = 0; i < n; ++i)
        {
            const Component& c = pkg.comp(i);
            std::string r = c.name() + ": formation datum in its " + c.naturalPhase() + " phase";
            if (pkg.hasPureFluid(i)) r += "; pure-fluid method " + pkg.pureFluidMethod(i) + " when pure (its own datum)";
            d.push_back(r);
            for (const char* key : { "idealGasHeatCapacity", "liquidHeatCapacity", "solidHeatCapacity" })
            {
                if (!c.recordLaws(key)) continue;
                std::string line = std::string("  ") + key + ": " + lawText(c, key);
                if (std::string(key) == "liquidHeatCapacity" && c.lawChoice(key).type == "RowlinsonBondi")
                    line += "; consumes Tc, omega and the ideal-gas law `"
                          + (c.lawChoice("idealGasHeatCapacity").law.empty()
                               ? std::string("its one law") : c.lawChoice("idealGasHeatCapacity").law)
                          + "` of the record (SL-05: the chosen one)";
                d.push_back(line);
                cpTypes.insert(c.lawChoice(key).type);
            }
        }
        formLines(d, "heatCapacity", cpTypes);
        out.row("heat-capacity laws per constituent",
                chosen({ "caloric" }, "the records (each component's .dat)"), d);
    }
    {
        std::vector<std::string> d;
        std::set<std::string> vpTypes;
        for (std::size_t i = 0; i < n; ++i)
        {
            const Component& c = pkg.comp(i);
            std::string r = c.name() + ": ";
            if (pkg.hasPureFluid(i)) r += "pure-fluid method " + pkg.pureFluidMethod(i) + " inside its window, else ";
            r += c.hasVaporPressure() ? lawText(c, "vaporPressure") : std::string("none (nonvolatile)");
            if (c.hasVaporPressure())
            {
                vpTypes.insert(c.lawChoice("vaporPressure").type);
                r += "; record facts injected: Tc, Pc, omega" + std::string(c.Tb() > 0.0 ? ", Tb" : "");
            }
            if (pkg.isHenrySolute(i)) r += "; K by its Henry pair (a declared solute)";
            d.push_back(r);
        }
        formLines(d, "vaporPressure", vpTypes);
        out.row("vapour-pressure laws per constituent",
                chosen({ "pureFluids" }, chosen({ "equilibrium", "vaporPressure" },
                                                "the records (each component's .dat)")), d);
    }

    //  ---- transport: one row per property block --------------------------
    struct TRow { const char* phase; const char* prop; const char* key; const char* label; };
    static const TRow rows[] = {
        { "vapour", "viscosity",           "viscosity",          "vapour viscosity" },
        { "vapour", "thermalConductivity", "thermalConductivity","vapour thermal conductivity" },
        { "vapour", "diffusivity",         "diffusivity",        "vapour diffusivity" },
        { "liquid", "viscosity",           "liquidViscosity",    "liquid viscosity" },
        { "liquid", "thermalConductivity", "liquidConductivity", "liquid thermal conductivity" },
        { "liquid", "diffusivity",         "liquidDiffusivity",  "liquid diffusivity" },
        { "interface", "surfaceTension",   "surfaceTension",     "surface tension" },
    };
    for (const auto& tr : rows)
    {
        const auto info = pkg.transportMethodInfo(tr.key);
        const DictPtr block = at(R, { "transport", tr.phase, tr.prop });
        const std::string where = std::string("transport.") + tr.phase + "." + tr.prop;
        std::vector<std::string> d;
        std::string c = chosen({ "transport", tr.phase, tr.prop }, "not declared");
        const bool perConstituent = std::string(tr.key) == "liquidViscosity"
            || std::string(tr.key) == "liquidConductivity" || std::string(tr.key) == "surfaceTension";
        const bool hasLaws = perConstituent && !pkg.liquidLaws(tr.key).empty();
        if (info.model.empty() && !hasLaws)
        {
            d.push_back("no model: a consumer that asks is refused, or takes its own source"
                        " (the [liquid properties] table names it)");
            out.row(std::string(tr.label) + " (" + where + ")", c, d);
            continue;
        }
        const std::string p = tr.phase;
        if (std::string(tr.key) == "diffusivity")
        {
            d.push_back("binary D_ij of each pair by " + info.model + "; the package holds no mixture rule"
                        " (a consumer combines the binaries)");
        }
        else if (std::string(tr.key) == "liquidDiffusivity")
        {
            d.push_back("binary infinite-dilution D_ij (solute i in solvent j) by " + info.model
                        + ", reading the pure solvent's viscosity from the liquid viscosity law;");
            d.push_back("  no composition rule in the package (a consumer that needs one builds it: C398 slice (d))");
        }
        else if (hasLaws)
        {
            //  ONE LAW PER CONSTITUENT (C398 slice (b), A1): which law of which
            //  record, who chose it (pin, the block's word, the record's
            //  preferred), its window; or the refusal waiting at first use.
            const std::string rkey = std::string(tr.key) == "liquidConductivity"
                                   ? "liquidThermalConductivity" : std::string(tr.key);
            const std::string family = rkey;
            d.push_back(info.model.empty()
                ? std::string("pure-component law per constituent: each record's own (no word in the block)")
                : "pure-component law per constituent, by the block's word " + info.model + ":");
            std::set<std::string> types;
            const auto& laws = pkg.liquidLaws(tr.key);
            for (std::size_t i = 0; i < n && i < laws.size(); ++i)
            {
                const auto& L = laws[i];
                const Component& comp = pkg.comp(i);
                if (!L.absent.empty())
                { d.push_back("  " + comp.name() + ": ABSENT -- refused at its first evaluation: " + L.absent); continue; }
                std::string r = "  " + comp.name() + ": ";
                if (L.predictive) r += L.law + " (" + L.by + ")";
                else
                {
                    const recordLaws::Block* blk = comp.recordLaws(rkey);
                    const recordLaws::Law* law = blk ? blk->find(L.law) : nullptr;
                    r += (L.law.empty() ? std::string("its one law") : "law `" + L.law + "`")
                       + " (" + L.type + "), " + L.by;
                    if (law) r += "; window: " + law->windowText();
                    else if (blk) r += "; NOT in the record (its laws: " + blk->names()
                                     + ") -- refused at first evaluation";
                    else r += "; the record has no " + rkey + " block";
                }
                types.insert(L.type);
                d.push_back(r);
            }
            formLines(d, family, types);
            for (std::size_t i = 0; i < n; ++i)
                if (pkg.hasPureFluid(i) && p != "vapour")
                    d.push_back("  " + pkg.comp(i).name() + ": when the phase is pure in it, the pure-fluid method "
                                + pkg.pureFluidMethod(i));
        }
        else
        {
            std::string pure = "pure-component law per constituent: " + info.model;
            if (std::string(tr.key) == "liquidViscosity")
                pure += " (each record's liquidViscosity block)";
            d.push_back(pure);
            for (std::size_t i = 0; i < n; ++i)
                if (pkg.hasPureFluid(i) && p != "vapour")
                    d.push_back("  " + pkg.comp(i).name() + ": when the phase is pure in it, the pure-fluid method "
                                + pkg.pureFluidMethod(i));
        }
        if (!info.modelCitation.empty()) d.push_back("  source: " + info.modelCitation);
        if (!info.modelWindow.empty())   d.push_back("  window: " + info.modelWindow);
        if (std::string(tr.key) == "viscosity")
            d.push_back("mixing rule: Wilke, fixed in code (transport/GasMixingRules.H) -- not selectable");
        else if (std::string(tr.key) == "thermalConductivity")
            d.push_back("mixing rule: Wassiljewa with the Mason-Saxena factors (the same phi_ij as Wilke),"
                        " fixed in code -- not selectable; Eucken-type laws read the vapour viscosity above");
        else if (!info.rule.empty())
        {
            const bool declared = block && block->found("mixingRule");
            d.push_back("mixing rule: " + info.rule
                        + (declared ? " (declared)" : " (default of the " + std::string(tr.label)
                                                       + " property: the case wrote no mixingRule)"));
            if (!info.ruleCitation.empty()) d.push_back("  source: " + info.ruleCitation);
            if (!info.ruleWindow.empty())   d.push_back("  window: " + info.ruleWindow);
            if (info.rule == "GrunbergNissan")
            {
                std::set<std::string> have;
                if (block && block->found("interaction") && block->hasDictList("interaction"))
                    for (const auto& r : block->lookupDictList("interaction"))
                    {
                        const std::string a = r->lookupWordOrDefault("i", "?"),
                                          b = r->lookupWordOrDefault("j", "?");
                        have.insert(a + "-" + b); have.insert(b + "-" + a);
                        d.push_back("  interaction " + a + "-" + b + ": declared inline"
                                    + std::string(r->found("source") ? " (source " + r->lookupWordOrDefault("source", "") + ")" : ""));
                    }
                for (std::size_t i = 0; i < n; ++i)
                    for (std::size_t j = i + 1; j < n; ++j)
                        if (!have.count(pairName(pkg, i, j)))
                            d.push_back("  missing: " + pairName(pkg, i, j) + ", treated as G_ij = 0"
                                        " (ideal log-mole mixing for that pair; announced by the rule)");
            }
            else if (info.rule == "Butler")
                d.push_back("  consumes the case's liquid activity model ("
                            + std::string(pkg.hasActivity() ? pkg.activity().modelName() : "none")
                            + ") and its pairs, listed under equilibrium");
            else
                d.push_back("  interaction parameters: none (the rule has none)");
        }
        out.row(std::string(tr.label) + " (" + where + ")", c, d);
    }
    out.line("================  end of resolved properties: " + title + "  ================");
}

} // namespace resolvedView
} // namespace Choupo
