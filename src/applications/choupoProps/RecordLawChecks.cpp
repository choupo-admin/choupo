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
File
    src/applications/choupoProps/RecordLawChecks.cpp

Description
    See RecordLawChecks.H.
\*---------------------------------------------------------------------------*/

#include "RecordLawChecks.H"

#include "core/Dictionary.H"
#include "core/Dimensions.H"
#include "thermo/Component.H"
#include "thermo/Database.H"
#include "thermo/RecordLaws.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <algorithm>
#include <clocale>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo {
namespace recordLawChecks {

namespace {

DictPtr modelDict(const std::string& type)
{
    auto d = std::make_shared<Dictionary>("law");
    d->insert("model", EntryValue(type));
    return d;
}

std::string g(double v)
{
    char b[48];
    std::snprintf(b, sizeof(b), "%.10g", v);
    return b;
}

//  The engine's value of one law at T, through the law's own type -- the
//  same objects a package builds (Component::buildVP_ / buildCp_, the
//  package's per-constituent transport laws).
double evaluate(const Component& c, const std::string& property,
                const recordLaws::Law& L, double T)
{
    if (property == "vaporPressure")
    {
        DictPtr b = L.body;
        if (!b->found("Tc"))    b->insert("Tc", c.Tc());
        if (!b->found("Pc"))    b->insert("Pc", c.Pc());
        if (!b->found("omega")) b->insert("omega", c.omega());
        if (!b->found("Tb") && c.Tb() > 0.0) b->insert("Tb", c.Tb());
        return VaporPressureModel::New(b)->Psat_Pa(T);
    }
    if (recordLaws::familyOf(property) == "heatCapacity")
        return HeatCapacityModel::New(L.body)->Cp(T);
    if (property == "liquidViscosity")
    {
        auto m = LiquidViscosityModel::New(modelDict(L.type));
        m->bindLaw(L.name);
        return m->viscosityLiquidPure(c, T);
    }
    if (property == "liquidThermalConductivity")
    {
        auto m = LiquidConductivityModel::New(modelDict(L.type));
        m->bindLaw(L.name);
        return m->conductivityLiquidPure(c, T);
    }
    auto m = SurfaceTensionModel::New(modelDict(L.type));
    m->bindLaw(L.name);
    return m->sigmaPure(c, T);
}

//  THE REFERENCE FORMULATIONS THE TREE EVALUATES, one row each: a law fitted
//  to one of them is checked by evaluating it (C398, ruling on `check {}`,
//  2026-11-14), never by a value copied into the record.  `uncertainty` is
//  the formulation's OWN published uncertainty over the states compared --
//  a property of the reference, not of any fit to it.
struct Formulation
{
    const char* name;
    const char* property;
    double      uncertainty;
    const char* citation;
    double (*evaluate)(const Database& db, double T);
};

double iapwsConductivity(const Database& db, double T)
{
    //  The saturated liquid, through the package: water on IF97 with the
    //  IAPWS 2011 conductivity (src/thermo/iapws/IAPWSTransport.cpp), the
    //  route a case declaring `pureFluids { water { method IF97; } }` reads.
    static std::unique_ptr<ThermoPackage> pk;
    if (!pk)
    {
        const DictPtr d = Dictionary::fromString(
            "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
            "components ( water );\n"
            "equilibrium { formulation gammaPhi; liquid { activityModel { model ideal; } }"
            " vapour { fugacityModel idealGas; } }\n"
            "pureFluids { water { method IF97; } }\n"
            "transport { liquid { thermalConductivity { model SatoRiedel; } } }\n",
            "<record-law check: IAPWS R15-11>");
        pk = std::make_unique<ThermoPackage>(ThermoPackageBuilder::build(d, db));
    }
    return pk->thermalConductivityLiquid(T, { 1.0 });
}

const std::vector<Formulation>& formulations()
{
    static const std::vector<Formulation> f = {
        { "IAPWS-R15-11", "liquidThermalConductivity", 0.007,
          "IAPWS R15-11 (2011), background conductivity on the IF97 saturated-liquid"
          " density; its estimated uncertainty on the saturated-liquid line, Sec. 2.5",
          &iapwsConductivity },
    };
    return f;
}

const Formulation* formulationNamed(const std::string& n)
{
    for (const auto& f : formulations()) if (n == f.name) return &f;
    return nullptr;
}

std::string knownFormulations()
{
    std::string s;
    for (const auto& f : formulations())
        s += std::string(s.empty() ? " (known: " : ", ") + f.name + " for " + f.property;
    return s.empty() ? std::string() : s + ")";
}

Dimensions dimsOf(const std::string& property)
{
    if (property == "vaporPressure")             return Dims::pressure;
    if (property == "liquidViscosity")           return Dims::viscosity;
    if (property == "liquidThermalConductivity") return Dims::thermalCond;
    if (property == "surfaceTension")            return Dims::surfaceTension;
    return Dims::molarHeatCap;
}

} // namespace

int run(const std::string& outPath)
{
    std::setlocale(LC_NUMERIC, "C");
    const Database db;
    const fs::path compDir = fs::path(db.root()) / "standards" / "components";
    std::vector<std::string> records;
    for (const auto& e : fs::directory_iterator(compDir))
        if (e.is_regular_file() && e.path().extension() == ".dat")
            records.push_back(e.path().stem().string());
    std::sort(records.begin(), records.end());

    const fs::path out = fs::absolute(fs::path(outPath));
    fs::create_directories(out.parent_path());
    std::ofstream os(out);
    if (!os) throw std::runtime_error("record-law checks: cannot write " + out.string());
    os << "# choupoProps --record-law-checks  (DEV.md 4c C398 slice (b), U3)\n"
       << "# record\tproperty\tlaw\ttype\tstatus\tT_K\tdeclared_SI\tengine_SI\trel\ttolerance\n";

    //  Run where no case-local constant/ can overlay a record.
    const fs::path here = fs::current_path();
    fs::current_path(out.parent_path());
    static const char* properties[] = { "vaporPressure", "idealGasHeatCapacity",
        "liquidHeatCapacity", "solidHeatCapacity", "liquidViscosity",
        "liquidThermalConductivity", "surfaceTension" };
    long checked = 0, failed = 0, nocheck = 0, notLoaded = 0;
    std::streambuf* old = std::cout.rdbuf(nullptr);   // the records' own announcements
    for (const auto& rec : records)
    {
        std::unique_ptr<Component> c;
        try { c = std::make_unique<Component>(db.loadComponent(rec)); }
        catch (const std::exception& e)
        {
            os << rec << "\t*\t*\t*\tnotLoaded\t\t\t\t\t" << std::string(e.what()).substr(0, 160) << "\n";
            ++notLoaded;
            continue;
        }
        for (const char* p : properties)
        {
            const recordLaws::Block* blk = c->recordLaws(p);
            if (!blk)
            {
                const std::string err = c->lawsError(p);
                if (!err.empty())
                    os << rec << "\t" << p << "\t*\t*\tunreadable\t\t\t\t\t" << err << "\n";
                continue;
            }
            for (const auto& L : blk->laws)
            {
                const std::string name = L.name.empty() ? std::string("-") : L.name;
                if (!L.body->found("check"))
                {
                    os << rec << "\t" << p << "\t" << name << "\t" << L.type << "\tnocheck\n";
                    ++nocheck;
                    continue;
                }
                const DictPtr ck = L.body->subDict("check");
                try
                {
                    if (ck->found("formulation"))
                    {
                        //  EVALUATED, NOT STORED: the law against a reference
                        //  formulation the tree itself evaluates, over the law's
                        //  soft window, within the formulation's own published
                        //  uncertainty (one row per formulation: formulations()).
                        const std::string fname = ck->lookupWord("formulation");
                        const Formulation* F = formulationNamed(fname);
                        if (!F || F->property != std::string(p))
                            throw std::runtime_error("check { formulation " + fname + "; }"
                                " names no reference formulation the tree evaluates for "
                                + std::string(p) + knownFormulations());
                        if (!L.hasSoft)
                            throw std::runtime_error("a law checked against a formulation"
                                " needs its window (the range the comparison spans)");
                        double worst = 0.0, Tw = L.softLo, vw = 0.0, ew = 0.0;
                        for (int k = 0; k <= 10; ++k)
                        {
                            const double T = L.softLo + (L.softHi - L.softLo) * k / 10.0;
                            const double v = F->evaluate(db, T);
                            const double e = evaluate(*c, p, L, T);
                            if (std::abs((e - v) / v) >= std::abs(worst))
                            { worst = (e - v) / v; Tw = T; vw = v; ew = e; }
                        }
                        os << rec << "\t" << p << "\t" << name << "\t" << L.type << "\tevaluated\t"
                           << g(Tw) << "\t" << g(vw) << "\t" << g(ew) << "\t" << g(worst) << "\t"
                           << g(F->uncertainty) << "\t" << fname << ": " << F->citation << "\n";
                        ++checked;
                        continue;
                    }
                    const double T   = ck->lookupScalar("T", Dims::temperature);
                    const double v   = ck->lookupScalar("value", dimsOf(p));
                    const double tol = ck->lookupScalar("tolerance");
                    const double e   = evaluate(*c, p, L, T);
                    const double rel = (e - v) / v;
                    os << rec << "\t" << p << "\t" << name << "\t" << L.type << "\tchecked\t"
                       << g(T) << "\t" << g(v) << "\t" << g(e) << "\t" << g(rel) << "\t" << g(tol) << "\n";
                    ++checked;
                }
                catch (const std::exception& ex)
                {
                    os << rec << "\t" << p << "\t" << name << "\t" << L.type << "\tnotEvaluable\t\t\t\t\t"
                       << ex.what() << "\n";
                    ++failed;
                }
            }
        }
    }
    std::cout.rdbuf(old);
    fs::current_path(here);
    std::cout << "record-law checks -> " << out.string() << "\n"
              << "  records " << records.size() << ", laws with a check " << checked
              << ", without " << nocheck << ", not evaluable " << failed
              << ", records not loaded " << notLoaded << "\n";
    return 0;
}

} // namespace recordLawChecks
} // namespace Choupo
