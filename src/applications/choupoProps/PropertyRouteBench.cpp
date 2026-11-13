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
\*---------------------------------------------------------------------------*/

#include "PropertyRouteBench.H"

#include "core/Dictionary.H"
#include "thermo/Database.H"
#include "thermo/LiquidPropertyDoor.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/transport/LiquidDiffusivityModel.H"
#include "thermo/transport/LiquidViscosityMixingRule.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/SurfaceTensionMixingRule.H"

#include <algorithm>
#include <cctype>
#include <cstring>
#include <chrono>
#include <clocale>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <streambuf>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo {
namespace propertyRouteBench {

namespace {

//  The package announces its routes on std::cout; the bench keeps the
//  values only.  A streambuf that drops everything.
class NullBuffer : public std::streambuf
{
protected:
    int overflow(int c) override { return c; }
    std::streamsize xsputn(const char*, std::streamsize n) override { return n; }
};

//  Swaps std::cout's buffer for the lifetime of the object.
class Silence
{
public:
    Silence() : old_(std::cout.rdbuf(&null_)) {}
    ~Silence() { std::cout.rdbuf(old_); }
    Silence(const Silence&) = delete;
    Silence& operator=(const Silence&) = delete;
private:
    NullBuffer      null_;
    std::streambuf* old_;
};

//  The registered names of a factory, read from its own refusal of an
//  unknown name ("...Registered: a b c").  Aliases that differ only in
//  case are one route: the first in the factory's (sorted) order is kept.
std::vector<std::string> registeredNames(const std::function<void()>& probe)
{
    std::string msg;
    try { probe(); }
    catch (const std::exception& e) { msg = e.what(); }
    const std::string key = "Registered:";
    const auto at = msg.find(key);
    if (at == std::string::npos)
        throw std::runtime_error("property-route bench: a factory did not"
            " list its registered names when asked for an unknown one ("
            + (msg.empty() ? std::string("it accepted the probe") : msg) + ")");
    std::istringstream in(msg.substr(at + key.size()));
    std::vector<std::string> out;
    std::set<std::string> seenLower;
    std::string w;
    while (in >> w)
    {
        if (w == "(none)") continue;
        std::string lower = w;
        std::transform(lower.begin(), lower.end(), lower.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        if (seenLower.insert(lower).second) out.push_back(w);
    }
    return out;
}

DictPtr probeDict(const std::string& key)
{
    return Dictionary::fromString(key + " __propertyRouteBenchProbe__;\n",
                                  "<property-route bench probe>");
}

std::string hexfloat(double v)
{
    char b[64];
    std::snprintf(b, sizeof(b), "%a", v);
    return b;
}

//  One line of text: newlines and tabs escaped, the data root replaced so
//  the hash does not depend on where the tree is checked out.
std::string oneLine(std::string s, const std::string& dataRoot, long& pathHits)
{
    if (!dataRoot.empty())
        for (std::size_t p = s.find(dataRoot); p != std::string::npos;
             p = s.find(dataRoot, p))
        {
            s.replace(p, dataRoot.size(), "<data>");
            ++pathHits;
            p += 6;
        }
    std::string o;
    o.reserve(s.size());
    for (char c : s)
    {
        if (c == '\n')      o += "\\n";
        else if (c == '\t') o += "\\t";
        else if (c == '\r') o += "\\r";
        else                o += c;
    }
    return o;
}

struct Grid
{
    std::vector<double> T, P, x;   // K, Pa, mole fraction of the FIRST component
};

std::vector<double> numbers(const DictPtr& d, const std::string& key)
{
    std::vector<double> v;
    for (const scalar x : d->lookupList(key)) v.push_back(x);
    if (v.empty())
        throw std::runtime_error("property-route bench manifest: `" + key + "` is empty");
    return v;
}

//  The v2 thermophysical system of one bench package: an ideal liquid, an
//  ideal-gas vapour, and the one route under test.
std::string systemText(const std::vector<std::string>& comps,
                       const std::string& extra)
{
    std::string t = "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
                    "components (";
    for (const auto& c : comps) t += " " + c;
    t += " );\nequilibrium\n{\n    formulation gammaPhi;\n"
         "    liquid { activityModel { model ideal; } standardState pureLiquid; }\n"
         "    vapour { fugacityModel idealGas; }\n}\n";
    return t + extra;
}

//  THE DOOR'S DESCRIPTION, per state (review DR-11): the method id and the
//  label the door returns, written beside the values in a second file whose
//  blocks are hashed apart -- a route tagged with another route's words, or a
//  label edited away from its route, moves these blocks while every value
//  stays put.
std::ofstream* labelsOut = nullptr;

class Writer
{
public:
    Writer(std::ofstream& os, std::string dataRoot)
      : os_(os), dataRoot_(std::move(dataRoot)) {}

    void block(const std::string& record, const std::string& property)
    {
        os_ << "## " << record << "\t" << property << "\n";
        if (labelsOut) *labelsOut << "## " << record << "\t" << property << "\n";
        ++blocks_;
    }
    void value(const std::string& state, double v)
    {
        os_ << state << "\t" << hexfloat(v) << "\n";
        ++values_;
        if (v != v) ++nans_;
        else if (v - v != 0.0) ++infs_;
    }
    void refused(const std::string& state, const std::string& msg)
    {
        os_ << state << "\tREFUSED\t" << oneLine(msg, dataRoot_, pathHits_) << "\n";
        ++refusals_;
    }
    //  A package that could not be assembled: one line for the whole block.
    void notAssembled(const std::string& msg)
    {
        os_ << "*\tNOT ASSEMBLED\t" << oneLine(msg, dataRoot_, pathHits_) << "\n";
        ++notAssembled_;
    }

    long blocks_ = 0, values_ = 0, refusals_ = 0, notAssembled_ = 0,
         nans_ = 0, infs_ = 0, pathHits_ = 0;

private:
    std::ofstream& os_;
    std::string    dataRoot_;
};

std::string stateKey(double T, double P, const std::string& xTag = "")
{
    char b[96];
    std::snprintf(b, sizeof(b), "T=%.17g\tP=%.17g", T, P);
    return xTag.empty() ? std::string(b) : std::string(b) + "\t" + xTag;
}

//  Build the package; on refusal, write NOT ASSEMBLED and return nullptr.
std::unique_ptr<ThermoPackage> assemble(const Database& db, const std::string& text,
                                        Writer& w)
{
    try
    {
        const DictPtr d = Dictionary::fromString(text, "<property-route bench>");
        return std::make_unique<ThermoPackage>(ThermoPackageBuilder::build(d, db));
    }
    catch (const std::exception& e) { w.notAssembled(e.what()); }
    catch (...) { w.notAssembled("(an exception that is not a std::exception)"); }
    return nullptr;
}

//  THE DOOR AGAINST THE OLD CALL (C378 slice 0): when `dc.pk` is set, every
//  state is asked again through liquidProperty::evaluate and the answer --
//  the double bit for bit, or the refusal message byte for byte -- must be
//  the old call's.  Counted and printed, never written to the bench file
//  (whose hashes pin the old call).
struct DoorCheck
{
    const ThermoPackage* pk = nullptr;
    int                  prop = -1;     // 0 density, 1 viscosity, 2 surface tension
    const sVector*       x = nullptr;
};
long doorCompared = 0, doorDisagreed = 0;
std::vector<std::string> doorFirst;


//  Evaluate `f` over the grid; one line per state.
void sweep(const Grid& g, Writer& w, const std::string& xTag,
           const std::function<double(double, double)>& f, DoorCheck dc = {})
{
    for (double T : g.T)
        for (double P : g.P)
        {
            const std::string s = stateKey(T, P, xTag);
            bool ok = false;
            double v = 0.0;
            std::string msg;
            try { v = f(T, P); ok = true; w.value(s, v); }
            catch (const std::exception& e) { msg = e.what(); w.refused(s, msg); }
            catch (...) { msg = "(non-standard)"; w.refused(s, "(an exception that is not a std::exception)"); }
            if (!dc.pk) continue;
            bool dOk = false;
            double dv = 0.0;
            std::string dMsg;
            try
            {
                const liquidProperty::Result r = liquidProperty::evaluate(*dc.pk,
                    static_cast<liquidProperty::Property>(dc.prop), T, P, *dc.x);
                dv = r.value;
                dOk = true;
                if (labelsOut)
                    *labelsOut << s << "\t" << r.methodId << "\t" << r.label << "\n";
            }
            catch (const std::exception& e) { dMsg = e.what(); }
            catch (...) { dMsg = "(non-standard)"; }
            ++doorCompared;
            const bool same = (ok == dOk)
                && (ok ? std::memcmp(&v, &dv, sizeof v) == 0 : msg == dMsg);
            if (!same)
            {
                ++doorDisagreed;
                if (doorFirst.size() < 5) doorFirst.push_back(s);
            }
        }
}

} // namespace

int run(const std::string& manifestPath, const std::string& outPath)
{
    const auto t0 = std::chrono::steady_clock::now();
    std::setlocale(LC_NUMERIC, "C");

    const DictPtr man = Dictionary::fromFile(manifestPath);
    Grid g;
    g.T = numbers(man, "temperatures");
    g.P = numbers(man, "pressures");
    g.x = numbers(man, "fractions");
    std::vector<std::pair<std::string, std::string>> binaries;
    {
        const DictPtr b = man->subDict("binaries");
        for (const auto& k : b->keys())
        {
            const auto pair = b->lookupWordList(k);
            if (pair.size() != 2)
                throw std::runtime_error("property-route bench manifest: binary '"
                    + k + "' must name two components");
            binaries.emplace_back(pair[0], pair[1]);
        }
    }

    const Database db;                       // CHOUPO_HOME or the cwd walk
    const std::string dataRoot = fs::weakly_canonical(fs::path(db.root())).string();
    const fs::path compDir = fs::path(dataRoot) / "standards" / "components";
    const fs::path helmDir = fs::path(dataRoot) / "standards" / "parameters" / "Helmholtz";
    if (!fs::is_directory(compDir))
        throw std::runtime_error("property-route bench: no catalogue at "
                                 + compDir.string());

    std::vector<std::string> records;
    for (const auto& e : fs::directory_iterator(compDir))
        if (e.is_regular_file() && e.path().extension() == ".dat")
            records.push_back(e.path().stem().string());
    std::sort(records.begin(), records.end());

    //  Reference equations: record name -> the fluid it describes.
    std::vector<std::pair<std::string, std::string>> helmholtz;
    if (fs::is_directory(helmDir))
        for (const auto& e : fs::directory_iterator(helmDir))
            if (e.is_regular_file() && e.path().extension() == ".dat")
            {
                const DictPtr r = Dictionary::fromFile(e.path().string());
                helmholtz.emplace_back(e.path().stem().string(),
                                       r->lookupWordOrDefault("fluid", ""));
            }
    std::sort(helmholtz.begin(), helmholtz.end());

    //  The routes, discovered from the factories.
    const auto viscModels = registeredNames([] { LiquidViscosityModel::New(probeDict("model")); });
    const auto viscRules  = registeredNames([] { LiquidViscosityMixingRule::New(probeDict("mixingRule")); });
    const auto sigModels  = registeredNames([] { SurfaceTensionModel::New(probeDict("model")); });
    const auto sigRules   = registeredNames([] { SurfaceTensionMixingRule::New(probeDict("mixingRule")); });
    const auto diffModels = registeredNames([] { LiquidDiffusivityModel::New(probeDict("model")); });
    const std::string solvent = ThermoPackage::defaultAqueousSolvent();
    const std::string viscForDiffusivity = viscModels.empty() ? "" : viscModels.front();

    const fs::path out = fs::absolute(fs::path(outPath));
    fs::create_directories(out.parent_path());
    std::ofstream os(out);
    if (!os) throw std::runtime_error("property-route bench: cannot write " + out.string());
    const fs::path labelsPath = out.parent_path() / "labels.tsv";
    std::ofstream labels(labelsPath);
    if (!labels) throw std::runtime_error("property-route bench: cannot write " + labelsPath.string());
    labelsOut = &labels;
    Writer w(os, dataRoot);

    auto list = [](const std::vector<std::string>& v) {
        std::string s; for (const auto& x : v) s += " " + x; return s; };
    os << "# choupoProps --property-route-bench  (format 1; DEV.md 4c C378 slice 0)\n"
       << "# values are C99 hexfloats; a refusal carries the engine's full message\n"
       << "# liquidViscosity models:" << list(viscModels) << "\n"
       << "# liquidViscosity mixing rules:" << list(viscRules) << "\n"
       << "# surfaceTension models:" << list(sigModels) << "\n"
       << "# surfaceTension mixing rules:" << list(sigRules) << "\n"
       << "# liquidDiffusivity models:" << list(diffModels)
       << " (solute in " << solvent << ", solvent viscosity " << viscForDiffusivity << ")\n";
    for (const auto& h : helmholtz)
        os << "# reference equation: " << h.first << " (fluid " << h.second << ")\n";

    //  The bench runs where no case-local constant/ can overlay a record.
    const fs::path here = fs::current_path();
    fs::current_path(out.parent_path());

    const auto viscBlock = [](const std::string& m, const std::string& r) {
        return "transport { liquid { viscosity { model " + m + ";"
             + (r.empty() ? "" : " mixingRule " + r + ";") + " } } }\n"; };
    const auto sigBlock = [](const std::string& m, const std::string& r) {
        return "transport { interface { surfaceTension { model " + m + ";"
             + (r.empty() ? "" : " mixingRule " + r + ";") + " } } }\n"; };

    {
        Silence quiet;
        for (const auto& rec : records)
        {
            const std::vector<std::string> one { rec };
            const sVector pure { 1.0 };

            //  Liquid density, the record's own route (anchored / flat /
            //  bare Rackett, or the refusal).
            w.block(rec, "density.liquid");
            if (auto pk = assemble(db, systemText(one, ""), w))
                sweep(g, w, "", [&](double T, double P)
                      { return pk->density(T, P, pure, DensityPhase::Liquid); },
                      DoorCheck{ pk.get(), 0, &pure });

            //  The pure-fluid routes that describe this record.
            std::vector<std::pair<std::string, std::string>> pureRoutes;
            if (rec == solvent) pureRoutes.emplace_back("IF97", "method IF97;");
            for (const auto& h : helmholtz)
            {
                bool match = (h.second == rec);
                if (!match)
                    try
                    {
                        const Component c = db.loadComponent(rec);
                        for (const auto& a : c.aliases()) if (a == h.second) match = true;
                    }
                    catch (...) {}
                if (match)
                    pureRoutes.emplace_back("Helmholtz." + h.first,
                        "method Helmholtz; equation " + h.first + ";");
            }
            for (const auto& pr : pureRoutes)
            {
                w.block(rec, "density.pureFluid." + pr.first);
                const std::string extra = "pureFluids { " + rec + " { " + pr.second + " } }\n";
                if (auto pk = assemble(db, systemText(one, extra), w))
                    sweep(g, w, "", [&](double T, double P)
                          { return pk->density(T, P, pure, DensityPhase::Liquid); },
                      DoorCheck{ pk.get(), 0, &pure });
                w.block(rec, "viscosity.pureFluid." + pr.first);
                if (auto pk = assemble(db, systemText(one, extra), w))
                    sweep(g, w, "", [&](double T, double)
                          { return pk->viscosityLiquid(T, pure); },
                          DoorCheck{ pk.get(), 1, &pure });
                w.block(rec, "surfaceTension.pureFluid." + pr.first);
                if (auto pk = assemble(db, systemText(one, extra), w))
                    sweep(g, w, "", [&](double T, double)
                          { return pk->surfaceTension(T, pure); },
                          DoorCheck{ pk.get(), 2, &pure });
            }

            for (const auto& m : viscModels)
            {
                w.block(rec, "viscosity." + m);
                if (auto pk = assemble(db, systemText(one, viscBlock(m, "")), w))
                    sweep(g, w, "", [&](double T, double)
                          { return pk->viscosityLiquid(T, pure); },
                          DoorCheck{ pk.get(), 1, &pure });
            }
            for (const auto& m : sigModels)
            {
                w.block(rec, "surfaceTension." + m);
                if (auto pk = assemble(db, systemText(one, sigBlock(m, "")), w))
                    sweep(g, w, "", [&](double T, double)
                          { return pk->surfaceTension(T, pure); },
                          DoorCheck{ pk.get(), 2, &pure });
            }
            if (rec != solvent)
                for (const auto& m : diffModels)
                {
                    w.block(rec, "diffusivity." + m + ".in." + solvent);
                    const std::string extra = "transport { liquid { viscosity { model "
                        + viscForDiffusivity + "; } diffusivity { model " + m + "; } } }\n";
                    if (auto pk = assemble(db, systemText({ rec, solvent }, extra), w))
                        sweep(g, w, "", [&](double T, double)
                              { return pk->diffusivityLiquid(T, 0, 1); });
                }
        }

        //  The mixture calls, on the manifest's binaries.
        for (const auto& b : binaries)
        {
            const std::string rec = b.first + "+" + b.second;
            const std::vector<std::string> two { b.first, b.second };
            auto overX = [&](ThermoPackage& pk, int prop, const std::function<double(ThermoPackage&, double, double, const sVector&)>& f)
            {
                for (double x : g.x)
                {
                    const sVector z { x, 1.0 - x };
                    char tag[48];
                    std::snprintf(tag, sizeof(tag), "x=%.17g", x);
                    sweep(g, w, tag, [&](double T, double P) { return f(pk, T, P, z); },
                          DoorCheck{ &pk, prop, &z });
                }
            };
            w.block(rec, "density.liquid");
            if (auto pk = assemble(db, systemText(two, ""), w))
                overX(*pk, 0, [](ThermoPackage& p, double T, double P, const sVector& z)
                      { return p.density(T, P, z, DensityPhase::Liquid); });
            for (const auto& m : viscModels)
                for (const auto& r : viscRules)
                {
                    w.block(rec, "viscosity." + m + "." + r);
                    if (auto pk = assemble(db, systemText(two, viscBlock(m, r)), w))
                        overX(*pk, 1, [](ThermoPackage& p, double T, double, const sVector& z)
                              { return p.viscosityLiquid(T, z); });
                }
            for (const auto& m : sigModels)
                for (const auto& r : sigRules)
                {
                    w.block(rec, "surfaceTension." + m + "." + r);
                    if (auto pk = assemble(db, systemText(two, sigBlock(m, r)), w))
                        overX(*pk, 2, [](ThermoPackage& p, double T, double, const sVector& z)
                              { return p.surfaceTension(T, z); });
                }
        }
    }
    fs::current_path(here);
    os.close();
    labelsOut = nullptr;
    labels.close();

    const double secs = std::chrono::duration<double>(
        std::chrono::steady_clock::now() - t0).count();
    std::cout << "property-route bench -> " << out.string() << "\n"
              << "  records " << records.size() << ", binaries " << binaries.size()
              << ", blocks " << w.blocks_ << ", values " << w.values_
              << ", refusals " << w.refusals_ << ", packages not assembled "
              << w.notAssembled_ << "\n"
              << "  non-finite values: NaN " << w.nans_ << ", inf " << w.infs_
              << "; data-root paths replaced in messages: " << w.pathHits_ << "\n"
              << "  door against the old call: " << doorCompared << " compared, "
              << doorDisagreed << " disagreements";
    for (const auto& s : doorFirst) std::cout << "  [" << s << "]";
    std::cout << "\n";
    char b[64];
    std::snprintf(b, sizeof(b), "%.1f", secs);
    std::cout << "  wall time " << b << " s\n";
    return 0;
}

} // namespace propertyRouteBench
} // namespace Choupo
