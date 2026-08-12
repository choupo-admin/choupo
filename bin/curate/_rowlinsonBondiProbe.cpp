/*  Probe for check_rowlinson_bondi.py -- compiled by the gate, not shipped.

    It prints numbers and never a verdict: the gate decides.  A probe that
    graded its own output would be the auditee auditing itself.

    THE REFUSALS ARE EXERCISED HERE, NOT THROUGH A CASE, and that is a
    deliberate choice made after trying the other way.  Driving them through
    choupoProps meant a probe component first had to satisfy `role`,
    `vaporPressure` and `standardThermochemistry` -- three refusals with
    nothing to do with the liquid heat capacity.  A test that must first
    satisfy unrelated contracts is testing them too, and reports their
    failures as this model's.  The COMPONENT-LEVEL injection still needs the
    full path, and the gate keeps one arm there.

    modes:
      sweep <dataRoot>  one row per (curated component, Tr) -- the accuracy
                        measurement against every curated liquid Cp
      formula           the departure over a (Tr, omega) grid
      refuse-pole       construct, then call above Tc; print the refusal
      refuse-noig       construct with no ideal-gas Cp; print the refusal
      announce <T>      construct at Tc = 500 and call at T; print stdout
      integral          H over an interval, for the quadrature check         */

#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "core/Dictionary.H"

#include <filesystem>
#include <iomanip>
#include <iostream>
#include <memory>
#include <string>

using namespace Choupo;
namespace fs = std::filesystem;

namespace {

DictPtr igBlock(scalar a0)
{
    auto ig = std::make_shared<Dictionary>("idealGasHeatCapacity");
    ig->insert("model", std::string("polynomial"));
    ig->insert("coefficients", EntryValue(std::vector<scalar>{ a0 }));
    return ig;
}

DictPtr rbBlock(scalar Tc, scalar omega, bool withIg, scalar a0 = 100.0)
{
    auto d = std::make_shared<Dictionary>("liquidHeatCapacity");
    d->insert("model", std::string("RowlinsonBondi"));
    d->insert("Tc", Tc);
    d->insert("omega", omega);
    d->insert("owner", std::string("probe"));
    if (withIg) d->insert("idealGasHeatCapacity", EntryValue(igBlock(a0)));
    return d;
}

}   // namespace


int main(int argc, char** argv)
{
    HeatCapacityModel::registerBuiltins();
    const std::string mode = argc > 1 ? argv[1] : "";
    std::cout << std::setprecision(12);

    if (mode == "sweep")
    {
        if (argc < 3) { std::cerr << "sweep needs <dataRoot>\n"; return 2; }
        const fs::path dir = fs::path(argv[2]) / "standards" / "components";
        for (const auto& e : fs::directory_iterator(dir))
        {
            if (e.path().extension() != ".dat") continue;
            const std::string name = e.path().stem().string();
            DictPtr d;
            try { d = Dictionary::fromFile(e.path().string()); }
            catch (const std::exception&) { continue; }
            if (!d->found("liquidHeatCapacity")
             || !d->found("idealGasHeatCapacity")) continue;
            const scalar Tc = d->lookupScalarOrDefault("Tc", 0.0);
            if (!(Tc > 0.0)) continue;
            auto lcp = d->subDict("liquidHeatCapacity");
            //  Only a CURATED polynomial is a valid comparison: a record that
            //  already declares RowlinsonBondi would be compared with itself.
            if (lcp->lookupWordOrDefault("model", "") != "polynomial") continue;

            std::unique_ptr<HeatCapacityModel> curated, predicted;
            try { curated = HeatCapacityModel::New(lcp); }
            catch (const std::exception&) { continue; }
            auto rb = rbBlock(Tc, d->lookupScalarOrDefault("omega", 0.0), false);
            rb->insert("idealGasHeatCapacity",
                       EntryValue(d->subDict("idealGasHeatCapacity")));
            try { predicted = HeatCapacityModel::New(rb); }
            catch (const std::exception&) { continue; }

            for (int k = 0; k <= 4; ++k)
            {
                const scalar Tr = 0.45 + k * 0.10;
                const scalar T  = Tr * Tc;
                try {
                    const scalar cCur = curated->Cp(T);
                    const scalar cPre = predicted->Cp(T);
                    std::cout << "ROW " << name << " " << Tr << " " << T << " "
                              << cCur << " " << cPre << "\n";
                } catch (const std::exception&) { continue; }
            }
        }
        return 0;
    }

    if (mode == "formula")
    {
        //  a0 = 0 isolates the DEPARTURE: Cp then IS the departure, so the
        //  gate compares the correlation itself and not a sum in which a
        //  wrong departure could hide behind a right ideal-gas term.
        for (scalar omega : { 0.0, 0.30, 0.75 })
            for (scalar Tr : { 0.30, 0.50, 0.70, 0.80, 0.90 })
            {
                const scalar Tc = 500.0;
                auto m = HeatCapacityModel::New(rbBlock(Tc, omega, true, 0.0));
                const scalar dep = m->Cp(Tr * Tc);
                std::cout << "DEP " << omega << " " << Tr << " " << dep << "\n";
            }
        return 0;
    }

    if (mode == "refuse-pole")
    {
        auto m = HeatCapacityModel::New(rbBlock(500.0, 0.3, true));
        try { (void) m->Cp(600.0); std::cout << "NO-REFUSAL\n"; }
        catch (const std::exception& ex) { std::cout << "REFUSED " << ex.what() << "\n"; }
        return 0;
    }

    if (mode == "refuse-noig")
    {
        try { auto m = HeatCapacityModel::New(rbBlock(500.0, 0.3, false));
              (void) m; std::cout << "NO-REFUSAL\n"; }
        catch (const std::exception& ex) { std::cout << "REFUSED " << ex.what() << "\n"; }
        return 0;
    }

    //  COMPUTE FIRST, PRINT AFTER -- in every mode below.  Streaming a marker
    //  and a computed value in ONE expression (`cout << "H " << m->H(...)`)
    //  writes the marker before the call runs, so any caveat the call prints
    //  lands BETWEEN them and splits the probe's own line in two.  That is not
    //  hypothetical: it is how sabotage S3 of the gate produced "the probe did
    //  not report H and S", which looked like a missing number and was really
    //  a broken line.
    if (mode == "announce")
    {
        if (argc < 3) { std::cerr << "announce needs <T>\n"; return 2; }
        auto m = HeatCapacityModel::New(rbBlock(500.0, 0.3, true));
        const scalar cp = m->Cp(std::stod(argv[2]));
        std::cout << "CP " << cp << "\n";
        return 0;
    }

    if (mode == "integral")
    {
        auto m = HeatCapacityModel::New(rbBlock(500.0, 0.3, true));
        const scalar hh = m->H(400.0, 300.0);
        const scalar ss = m->S(400.0, 300.0);
        std::cout << "H " << hh << "\n";
        std::cout << "S " << ss << "\n";
        return 0;
    }

    std::cerr << "unknown mode\n";
    return 2;
}
