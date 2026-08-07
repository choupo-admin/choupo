//  Driver for check_ice_freezing.py -- asks SolidPhase for the pure-crystal
//  fugacity and asks Component for the cryoscopic constant it now DERIVES.
//  Kept beside the gate rather than in src/ because it is curation tooling.
//
//  WHY A PROBE AND NOT A CASE.  No tutorial declares a crystallising solid
//  yet, and the witness case is deliberately last (a tutorial whose answer
//  cannot be checked against a published anchor would freeze a wrong number
//  into a golden).  Meanwhile the claims here are exact and checkable now:
//  the crystal fugacity crosses its liquid twin AT the melting point, and the
//  refusals fire by name.  A probe reaches them without inventing a case.
//
//  It also reads the REAL data/standards/components/water.dat, so the
//  arithmetic the gate recomputes is the arithmetic the catalogue feeds.
#include "core/Dictionary.H"
#include "thermo/Component.H"
#include "thermo/phase/SolidPhase.H"
#include "thermo/phase/LiquidPhase.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

using namespace Choupo;

namespace
{

std::string home()
{
    const char* h = std::getenv("CHOUPO_HOME");
    return std::string(h ? h : ".");
}

Component fromCatalogue(const std::string& name)
{
    Component c;
    c.readFromDict(Dictionary::fromFile(
        home() + "/data/standards/components/" + name + ".dat"));
    return c;
}

//  A JSON-legal number token.  std::to_string(inf) writes "inf", which no
//  JSON reader accepts -- and a sabotage DOES produce one (dividing by a
//  missing heat of fusion).  A gate that dies on a parse error instead of
//  printing its own diagnosis is a gate whose failure nobody can read.
//  Python's json accepts the `Infinity` / `NaN` spellings.
std::string num(double v)
{
    if (std::isnan(v)) return "NaN";
    if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
    return std::to_string(v);
}

std::string esc(const std::string& s)
{
    std::string o;
    for (char ch : s)
    {
        if (ch == '"' || ch == '\\') { o += '\\'; o += ch; }
        else if (ch == '\n')          { o += "\\n"; }
        else                          { o += ch; }
    }
    return o;
}

//  THE JSON IS BUFFERED, NOT STREAMED, and that is not tidiness.  Asking
//  for a sub-freezing Psat raises a real `[psat]` extrapolation advisory on
//  stdout -- water's Antoine range starts AT 273 K, so every point below the
//  melting point is outside the fit BY CONSTRUCTION.  Streaming would splice
//  that advisory into the middle of a JSON value.  Buffering keeps both: the
//  advisories print first, in full, and the JSON follows between markers.
std::string buf;
bool first = true;
void emit(const std::string& key, const std::string& body)
{
    if (!first) buf += ",\n";
    first = false;
    buf += "  \"" + key + "\": " + body;
}

//  Build a solid phase from a dictionary fragment and report either its
//  crystal fugacity at T or the refusal text.  The refusal is the POINT of
//  most calls here, so it is reported verbatim: a refusal that fires for the
//  wrong reason is not the refusal being claimed.
void askSolid(const std::string& key, const std::string& dictText,
              const std::vector<std::string>& names,
              const std::vector<Component>& comps,
              scalar T)
{
    std::string what = "ok";
    double f = 0.0, fOther = -1.0;
    try
    {
        SolidPhase s(Dictionary::fromString(dictText, "probe.dict"),
                     names, comps);
        sVector x(names.size(), 0.0);
        x[0] = 1.0;
        const sVector fv = s.fEffective(T, 101325.0, x);
        f = fv[0];
        if (fv.size() > 1) fOther = fv[1];
    }
    catch (const std::exception& e) { what = e.what(); }
    emit(key, "{\"result\": \"" + esc(what) + "\", \"f\": "
             + num(f) + ", \"fOther\": " + num(fOther) + "}");
}

}  // namespace

int main()
{
    //  EXPLICIT registration, exactly as a binary's main does it.
    VaporPressureModel::registerBuiltins();
    HeatCapacityModel::registerBuiltins();
    ActivityModel::registerBuiltins();

    buf += "{\n";

    // ---- (1) K_f: DERIVED where the inputs exist, untouched where not -----
    //
    //  WATER derives; ETHANOL declares neither constant and must stay at
    //  zero -- nothing invented out of nothing.
    //
    //  BUT THE NEGATIVE THAT MATTERS IS SYNTHESISED, and finding that out
    //  cost a surviving sabotage.  The first version of this probe used
    //  ethanol as the "declares K_f, declares no Hfus" fixture and the gate's
    //  own prose said so.  Ethanol declares NEITHER -- and in fact NO record
    //  in the catalogue declares a K_f without an Hfus, water being the only
    //  record carrying K_f at all.  So the arm was blocked by the anchor
    //  guard rather than by the Hfus guard, and removing the Hfus guard
    //  entirely left the gate green.  A negative whose subject does not
    //  exist tests nothing while reading as though it tests everything.
    //
    //  The two shapes are therefore built here, and NOT added to the
    //  catalogue: a record must never be curated into existence to make a
    //  gate reachable.
    auto askKf = [&](const std::string& key, const std::string& text)
    {
        std::string what = "ok";
        double kf = 0.0, anchor = 0.0, hfus = 0.0, tfus = 0.0, mw = 0.0;
        bool derived = false;
        try
        {
            Component c;
            c.readFromDict(text.rfind("@", 0) == 0
                ? Dictionary::fromFile(home()
                    + "/data/standards/components/" + text.substr(1) + ".dat")
                : Dictionary::fromString(text, "probe.dat"));
            kf      = c.K_f();
            anchor  = c.K_f_anchor();
            derived = c.K_f_derived();
            hfus    = c.subHfus();
            tfus    = c.subTripleT();
            mw      = c.MW();
        }
        catch (const std::exception& e) { what = e.what(); }
        emit(key,
             "{\"result\": \"" + esc(what) + "\", \"K_f\": "
             + num(kf) + ", \"anchor\": " + num(anchor)
             + ", \"derived\": " + (derived ? "true" : "false")
             + ", \"Hfus\": " + num(hfus)
             + ", \"Tfus\": " + num(tfus)
             + ", \"MW\": " + num(mw) + "}");
    };

    const std::string base =
        "name synth;\nformula H2O;\nMW 18.015;\nTc 647.1;\nPc 22.06e6;\n"
        "omega 0.344;\nTb 373.15;\nHvapTb 40650.0;\n"
        "vaporPressure { model Antoine; coefficients ( 5.0 1700.0 -40.0 ); }\n";

    askKf("Kf_water",   "@water");
    askKf("Kf_ethanol", "@ethanol");

    //  DECLARES K_f, DECLARES NO Hfus.  The derivation must not fire: an
    //  absent heat of fusion is the author saying "no freezing model here",
    //  and inventing one would give a cryoscopic constant to a record that
    //  never claimed one -- the exact K_b failure, one constant over.
    //
    //  K_f is parsed from `anchors {}` (or the older `ebulioscopic {}`), NOT
    //  as a bare key -- the first draft of this fixture wrote it bare, the
    //  parser ignored it, and the "declares K_f" negative was silently
    //  testing a record that declared nothing.
    askKf("Kf_anchorNoHfus",
          base + "anchors { K_f 9.999; }\ntriplePoint { T 273.16; }\n");

    //  DECLARES Hfus AND a triple point, DECLARES NO K_f.  Must stay at
    //  zero: the promotion replaces a stored derivative where it lives, and
    //  invents nothing where none was declared.
    askKf("Kf_hfusNoAnchor",
          base + "triplePoint { T 273.16; }\nsublimation { Hfus 6008.0; }\n");

    // ---- (2) THE CRYSTAL, against its own liquid twin ---------------------
    //
    //  K = f_solid / f_liquid at three temperatures around the melting point.
    //  The liquid leg is asked of LIQUIDPHASE, not recomputed here, and that
    //  is the whole claim: both phases reach Psat through the SAME
    //  components_[i].vp().Psat_Pa(T) call, so they cannot drift onto
    //  different references.  A probe that recomputed the liquid side would
    //  be testing its own arithmetic instead.
    //
    //  Component is MOVE-ONLY (it owns its correlation models), so the
    //  vectors are filled by move rather than by initializer-list, which
    //  copies.
    std::vector<std::string> names{"water", "ethanol"};
    std::vector<Component>   comps;
    comps.push_back(fromCatalogue("water"));
    comps.push_back(fromCatalogue("ethanol"));

    {
        std::string what = "ok";
        std::string rows;
        try
        {
            SolidPhase ice(Dictionary::fromString(
                "name ice; mode crystallizing; component water;",
                "probe.dict"), names, comps);
            LiquidPhase liq(Dictionary::fromString(
                "name liquid; activity { model ideal; }", "probe.dict"),
                names, comps);

            //  PURE water: x_w = 1, so gamma = 1 and f_liquid = Psat exactly.
            //  Any departure of K from 1 at the melting point is then the
            //  fusion term alone -- there is no activity model in the way to
            //  absorb an error.
            sVector x(2, 0.0); x[0] = 1.0;
            bool f2 = true;
            for (scalar T : {268.15, 273.15, 278.15})
            {
                const scalar fs = ice.fEffective(T, 101325.0, x)[0];
                const scalar fl = liq.fEffective(T, 101325.0, x)[0];
                if (!f2) rows += ", ";
                f2 = false;
                rows += "{\"T\": " + num(T)
                      + ", \"fSolid\": " + num(fs)
                      + ", \"fLiquid\": " + num(fl)
                      + ", \"K\": " + num(fs / fl) + "}";
            }
        }
        catch (const std::exception& e) { what = e.what(); }
        emit("crystalVsLiquid",
             "{\"result\": \"" + esc(what) + "\", \"rows\": [" + rows + "]}");
    }

    // ---- (3) THE PURITY CLAIM ---------------------------------------------
    //
    //  Every component that is not the crystal gets fugacity ZERO, and that
    //  zero is a claim (it cannot enter the lattice), not a default.  If it
    //  were non-zero the solute would silently dissolve into the ice and the
    //  concentrate's balance -- the reason to build this at all -- would be
    //  wrong while still closing.
    askSolid("purity", "name ice; mode crystallizing; component water;",
             names, comps, 268.15);

    // ---- (4) THE REFUSALS, each by name -----------------------------------
    askSolid("noComponentKey", "name ice; mode crystallizing;",
             names, comps, 268.15);
    askSolid("unknownComponent",
             "name ice; mode crystallizing; component unobtainium;",
             names, comps, 268.15);
    askSolid("inertMode", "name cake; mode inert;", names, comps, 268.15);

    //  A component with NO heat of fusion, and one with no triple point.
    //  Ethanol is the real record for the first; the second is synthesised,
    //  because no catalogue record carries Hfus without a triple point (and
    //  none should be added just to make a gate reachable).
    {
        std::vector<std::string> n2{"ethanol"};
        std::vector<Component>   c2;
        c2.push_back(fromCatalogue("ethanol"));
        askSolid("noHfus", "name s; mode crystallizing; component ethanol;",
                 n2, c2, 268.15);
    }
    {
        Component c;
        c.readFromDict(Dictionary::fromString(
            base + "sublimation { Hfus 6008.0; }\n", "synth.dat"));
        std::vector<std::string> n3{"synth"};
        std::vector<Component>   c3;
        c3.push_back(std::move(c));
        askSolid("noTriplePoint", "name s; mode crystallizing; component synth;",
                 n3, c3, 268.15);
    }
    {
        //  No vapour-pressure model at all.  readFromDict refuses that
        //  outright, so the record cannot be built -- which means the third
        //  refusal in fEffective is UNREACHABLE from a parsed record.  The
        //  probe says so rather than pretending to have exercised it: a gate
        //  must report the coverage it has, not the coverage it wants.
        std::string what = "unreachable";
        try
        {
            Component c;
            c.readFromDict(Dictionary::fromString(
                "name novp;\nformula H2O;\nMW 18.015;\n", "novp.dat"));
            what = "built without a vapour-pressure model";
        }
        catch (const std::exception& e) { what = std::string("refused at parse: ")
                                               + e.what(); }
        emit("noVaporPressure", "{\"result\": \"" + esc(what) + "\"}");
    }

    buf += "\n}\n";
    std::cout << "<<<JSON\n" << buf << "JSON>>>\n";
    return 0;
}
