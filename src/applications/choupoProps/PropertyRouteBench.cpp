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
#include "core/InfeasibleTrial.H"
#include "thermo/Database.H"
#include "thermo/LiquidPropertyDoor.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/transport/LiquidDiffusivityModel.H"
#include "thermo/transport/LiquidViscosityMixingRule.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/SurfaceTensionMixingRule.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "core/Sha256.H"

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
        os_ << state << "\tREFUSED\t" << rootLess(oneLine(msg, dataRoot_, pathHits_)) << "\n";
        ++refusals_;
    }
    //  A package that could not be assembled: one line for the whole block.
    void notAssembled(const std::string& msg)
    {
        os_ << "*\tNOT ASSEMBLED\t" << rootLess(oneLine(msg, dataRoot_, pathHits_)) << "\n";
        ++notAssembled_;
    }

    long blocks_ = 0, values_ = 0, refusals_ = 0, notAssembled_ = 0,
         nans_ = 0, infs_ = 0, pathHits_ = 0;

private:
    //  A sealed copy's message names its case by an absolute path under the
    //  checkout (C398 slice (b)); the checkout is replaced by `<root>` so a
    //  pinned hash does not depend on where the tree lives.  The catalogue's
    //  messages carry only the data root, already replaced by `<data>`.
    std::string rootLess(std::string s) const
    {
        const std::string root = fs::path(dataRoot_).parent_path().string();
        if (root.size() < 2) return s;
        for (std::size_t p = s.find(root); p != std::string::npos; p = s.find(root, p))
        { s.replace(p, root.size(), "<root>"); p += 6; }
        return s;
    }
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

//  THE KERNEL'S ENTRY (C378 pilot): the liquid density through the methods
//  of thermo/liquidProperty/, resolved per constituent set.  Its values are
//  NEW blocks (`density.kernel...`), hashed like every other; its method id
//  and label go to the labels file.  Each state is also compared with the
//  package's own `density` (liquid) and counted: equal to the bit, both
//  refused, or different -- the kernel's departures from the package are
//  deliberate (the reference leaf, the liquid branch) and printed by kind.
long kernelCompared = 0, kernelEqual = 0, kernelBothRefused = 0, kernelDiffer = 0,
     kernelOnlyKernelRefused = 0, kernelOnlyPackageRefused = 0;
std::map<std::string, long> kernelDifferByMethod;

void kernelSweep(const Grid& g, Writer& w, const std::string& xTag,
                 const ThermoPackage& pk, const sVector& x)
{
    for (double T : g.T)
        for (double P : g.P)
        {
            const std::string s = stateKey(T, P, xTag);
            bool ok = false;
            double v = 0.0;
            std::string method;
            try
            {
                liquidProperty::Request q;
                q.thermo = &pk; q.T = T; q.P = P; q.x = x;
                const liquidProperty::Result r = liquidProperty::density(q);
                v = r.value; ok = true; method = r.methodId;
                w.value(s, v);
                if (labelsOut) *labelsOut << s << "\t" << r.methodId << "\t" << r.label << "\n";
            }
            catch (const std::exception& e) { w.refused(s, e.what()); }
            catch (...) { w.refused(s, "(an exception that is not a std::exception)"); }
            bool pOk = false;
            double pv = 0.0;
            try { pv = pk.density(T, P, x, DensityPhase::Liquid); pOk = true; }
            catch (...) {}
            ++kernelCompared;
            if (ok && pOk && std::memcmp(&v, &pv, sizeof v) == 0) ++kernelEqual;
            else if (!ok && !pOk) ++kernelBothRefused;
            else if (!ok) ++kernelOnlyKernelRefused;
            else if (!pOk) ++kernelOnlyPackageRefused;
            else { ++kernelDiffer; ++kernelDifferByMethod[method]; }
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

            //  The same, through the kernel's entry (C378 pilot).
            w.block(rec, "density.kernel");
            if (auto pk = assemble(db, systemText(one, ""), w))
                kernelSweep(g, w, "", *pk, pure);

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
                w.block(rec, "density.kernel.pureFluid." + pr.first);
                if (auto pk = assemble(db, systemText(one, extra), w))
                    kernelSweep(g, w, "", *pk, pure);
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
            w.block(rec, "density.kernel");
            if (auto pk = assemble(db, systemText(two, ""), w))
                for (double x : g.x)
                {
                    const sVector z { x, 1.0 - x };
                    char tag[48];
                    std::snprintf(tag, sizeof(tag), "x=%.17g", x);
                    kernelSweep(g, w, tag, *pk, z);
                }
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
    //  THE RESOLUTION IS KEYED ON THE PACKAGE, NEVER ON ITS ADDRESS (C378
    //  pilot, ruling 6): packages with different pure-fluid selections for
    //  the same set {water}, built one after the other in this process (the
    //  allocator tends to give the next one the dead one's address), each
    //  resolve their own method.  A failure exits the bench non-zero.
    std::string reuseLine;
    bool reuseOk = true;
    {
        Silence quiet;
        const sVector pure { 1.0 };
        const std::string if97 = "pureFluids { " + solvent + " { method IF97; } }\n";
        const std::vector<std::pair<std::string, std::string>> runs = {
            { if97, "pureFluid.IF97" },
            { "", "referenceEquation.IAPWS95" },
            { if97, "pureFluid.IF97" } };
        const void* prev = nullptr;
        int sameAddress = 0;
        for (const auto& rn : runs)
        {
            const DictPtr d = Dictionary::fromString(systemText({ solvent }, rn.first),
                                                     "<address-reuse check>");
            auto pk = std::make_unique<ThermoPackage>(ThermoPackageBuilder::build(d, db));
            if (prev == pk.get()) ++sameAddress;
            prev = pk.get();
            liquidProperty::Request q;
            q.thermo = pk.get(); q.T = 298.15; q.P = 1.0e5; q.x = pure;
            const std::string id = liquidProperty::density(q).methodId;
            reuseLine += " " + id;
            if (id != rn.second) reuseOk = false;
        }
        reuseLine += " (packages at a reused address: " + std::to_string(sameAddress) + ")";

        //  THE DOMAIN ERROR IS A REJECTABLE TRIAL (C378 pilot, step 6): a
        //  state outside a method's hard domain reaches the caller as an
        //  InfeasibleTrial -- the type every recycle solver catches to reject
        //  a step -- and a missing datum does not (it fails the run).  NaOH
        //  at 40 wt % and 285 K lies outside the law's Table III; NaCl in
        //  water has no method at all.
        const DictPtr dn = Dictionary::fromString(systemText({ "NaOH", solvent }, ""),
                                                  "<domain-trial check>");
        ThermoPackage pn = ThermoPackageBuilder::build(dn, db);
        liquidProperty::Request q;
        q.thermo = &pn; q.T = 285.0; q.P = 1.0e5;
        const double a = 0.40 / 39.997, bw = 0.60 / 18.015;
        q.x = { a / (a + bw), bw / (a + bw) };
        bool trial = false, missingIsTrial = true;
        try { (void)liquidProperty::density(q); }
        catch (const InfeasibleTrial&) { trial = true; }
        catch (...) {}
        const DictPtr dc = Dictionary::fromString(systemText({ "NaCl", solvent }, ""),
                                                  "<domain-trial check>");
        ThermoPackage pc = ThermoPackageBuilder::build(dc, db);
        liquidProperty::Request qc;
        qc.thermo = &pc; qc.T = 298.15; qc.P = 1.0e5; qc.x = { 0.01, 0.99 };
        try { (void)liquidProperty::density(qc); missingIsTrial = false; }
        catch (const InfeasibleTrial&) { missingIsTrial = true; }
        catch (...) { missingIsTrial = false; }
        if (!trial || missingIsTrial) reuseOk = false;
        reuseLine += std::string("; a state outside the law's domain is ")
                   + (trial ? "an InfeasibleTrial" : "NOT an InfeasibleTrial")
                   + ", a missing method is " + (missingIsTrial ? "WRONGLY a trial" : "not a trial");
    }
    //  ---- C398 SLICE (b): THE OTHER PURE-COMPONENT LAWS, AND THE SEALED COPIES ----
    //  (review rows SL-01/SL-02.)  Slice (b) re-reads every record's laws:
    //  vapour pressure and the heat capacities through the component's law
    //  objects, liquid thermal conductivity per constituent.  These blocks
    //  pin what each of them answers on the grid's temperatures, for every
    //  catalogue record and for every DISTINCT sealed copy under tutorials/
    //  (a sealed case reads its own constant/, so the catalogue alone would
    //  never see 365 of the 371 dictionaries that name water).  Identical
    //  bytes give identical answers, so a sealed copy is benched once per
    //  content, named by its record and the first 12 hex digits of its
    //  sha256 (sealedCopies.tsv lists the paths that share each; the summary
    //  line counts the distinct contents).  Only records a case's
    //  propertyManifest claims are sealed copies.
    //  The liquid viscosity and surface-tension routes run for the sealed
    //  copies too; density and diffusivity do not (slice (b) changes neither).
    {
        Silence quiet;
        const auto condModels = registeredNames([] { LiquidConductivityModel::New(probeDict("model")); });
        const auto condBlock = [](const std::string& m) {
            return "transport { liquid { thermalConductivity { model " + m + "; } } }\n"; };
        const sVector pure { 1.0 };
        auto overT = [&](const std::function<double(double)>& f)
        {
            for (double T : g.T)
            {
                const std::string st = stateKey(T, 0.0);
                try { w.value(st, f(T)); }
                catch (const std::exception& e) { w.refused(st, e.what()); }
                catch (...) { w.refused(st, "(an exception that is not a std::exception)"); }
            }
        };
        //  The pure-component laws a component holds, and the liquid transport
        //  routes, for one record name read from the current directory's view.
        auto lawBlocks = [&](const std::string& tag, const std::string& rec, bool transportToo)
        {
            const std::vector<std::string> one { rec };
            w.block(tag, "vaporPressure");
            if (auto pk = assemble(db, systemText(one, ""), w))
                //  Through the PACKAGE (ThermoPackage::Psat), the call a unit
                //  makes: the bench's systems declare no pure-fluid method, so
                //  it answers with the record's chosen law, and the record is
                //  never read past the package (check_inlet_resolution l1).
                overT([&](double T) {
                    if (!pk->hasSaturationCurve(0)) throw std::runtime_error("no vapour-pressure law");
                    return pk->Psat(0, T); });
            struct CpRoute { const char* name; int which; };
            for (const CpRoute& r : { CpRoute{ "idealGas", 0 }, CpRoute{ "liquid", 1 }, CpRoute{ "solid", 2 } })
                for (int q = 0; q < 2; ++q)
                {
                    w.block(tag, std::string(q == 0 ? "cp." : "h.") + r.name);
                    if (auto pk = assemble(db, systemText(one, ""), w))
                        overT([&](double T) {
                            const Component& c = pk->comp(0);
                            const bool has = r.which == 0 ? c.hasCpIdealGas()
                                           : r.which == 1 ? c.hasCpLiquid() : c.hasCpSolid();
                            if (!has) throw std::runtime_error(std::string("no ") + r.name + " heat-capacity law");
                            const HeatCapacityModel& m = r.which == 0 ? c.cpIdealGas()
                                                       : r.which == 1 ? c.cpLiquid() : c.cpSolid();
                            return q == 0 ? m.Cp(T) : m.H(T, 298.15); });
                }
            for (const auto& m : condModels)
            {
                w.block(tag, "conductivity." + m);
                if (auto pk = assemble(db, systemText(one, condBlock(m)), w))
                    overT([&](double T) { return pk->thermalConductivityLiquid(T, pure); });
            }
            if (!transportToo) return;
            for (const auto& m : viscModels)
            {
                w.block(tag, "viscosity." + m);
                if (auto pk = assemble(db, systemText(one, viscBlock(m, "")), w))
                    overT([&](double T) { return pk->viscosityLiquid(T, pure); });
            }
            for (const auto& m : sigModels)
            {
                w.block(tag, "surfaceTension." + m);
                if (auto pk = assemble(db, systemText(one, sigBlock(m, "")), w))
                    overT([&](double T) { return pk->surfaceTension(T, pure); });
            }
        };
        for (const auto& rec : records) lawBlocks(rec, rec, false);

        //  The sealed copies: every tutorials/**/constant/components/*.dat,
        //  grouped by content.
        std::map<std::string, std::pair<fs::path, int>> distinct;   // "<rec>@<sha12>" -> (first case root, copies)
        std::map<std::string, std::vector<std::string>> pathsOf;      // the same key -> every path (sealedCopies.tsv)
        const fs::path tut = fs::path(dataRoot).parent_path() / "tutorials";
        if (fs::is_directory(tut))
        {
            std::vector<fs::path> files;
            //  A SEALED copy is a record its case's propertyManifest CLAIMS
            //  (imported, merged or adopted): case data in the tree.  A file
            //  a run writes beside them (an estimate a props operation
            //  promotes, gitignored) is not one, and must not make the bench
            //  depend on which cases have been run.
            auto claimed = [](const fs::path& f)
            {
                const fs::path man = f.parent_path().parent_path() / "propertyManifest";
                if (!fs::exists(man)) return false;
                std::ifstream in(man);
                std::stringstream text;
                text << in.rdbuf();
                return text.str().find("\"components/" + f.filename().string() + "\"") != std::string::npos;
            };
            for (const auto& e : fs::recursive_directory_iterator(tut))
                if (e.is_regular_file() && e.path().extension() == ".dat"
                    && e.path().parent_path().filename() == "components"
                    && e.path().parent_path().parent_path().filename() == "constant"
                    && claimed(e.path()))
                    files.push_back(e.path());
            std::sort(files.begin(), files.end());
            for (const auto& f : files)
            {
                const std::string key = f.stem().string() + "@" + sha256::hexFile(f.string()).substr(0, 12);
                pathsOf[key].push_back(fs::relative(f, tut.parent_path()).string());
                auto it = distinct.find(key);
                if (it == distinct.end())
                    distinct[key] = { f.parent_path().parent_path().parent_path(), 1 };
                else
                    ++it->second.second;
            }
        }
        //  Which paths share each benched content: a file of its own, so the
        //  hashed outputs (bench.tsv, labels.tsv) carry only answers.
        std::ofstream sealedList(out.parent_path() / "sealedCopies.tsv");
        sealedList << "# sealed copy key (record@sha256-prefix)\tthe paths that share it\n";
        for (const auto& [key, where] : distinct)
        {
            const std::string rec = key.substr(0, key.find('@'));
            fs::current_path(where.first);
            sealedList << key;
            for (const auto& p : pathsOf[key]) sealedList << "\t" << p;
            sealedList << "\n";
            lawBlocks("sealed:" + key, rec, true);
        }
        fs::current_path(out.parent_path());
        reuseLine += "; sealed copies benched: " + std::to_string(distinct.size()) + " distinct";
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
    std::cout << "  kernel entry against the package's density: " << kernelCompared
              << " compared, " << kernelEqual << " equal to the bit, " << kernelBothRefused
              << " both refused, " << kernelOnlyKernelRefused << " refused by the kernel only, "
              << kernelOnlyPackageRefused << " refused by the package only, "
              << kernelDiffer << " different";
    for (const auto& kv : kernelDifferByMethod) std::cout << "  [" << kv.first << " " << kv.second << "]";
    std::cout << "\n";
    std::cout << "  resolution by package, not address, and the domain error as a trial: "
              << (reuseOk ? "ok" : "FAIL")
              << " --" << reuseLine << "\n";
    char b[64];
    std::snprintf(b, sizeof(b), "%.1f", secs);
    std::cout << "  wall time " << b << " s\n";
    return reuseOk ? 0 : 1;
}

} // namespace propertyRouteBench
} // namespace Choupo
