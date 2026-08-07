//  Driver for check_reference_rung.py -- builds Components from synthetic
//  records and asks each for the surfaces that assume the IDEAL-GAS rung.
//  Kept beside the gate rather than in src/ because it is curation tooling.
//
//  The point of a probe here rather than a corpus case: the record that
//  provokes the defect DOES NOT EXIST in the catalogue and must not be added
//  to it (a solid-rung datum with a gas Cp is exactly the mistake the refusal
//  is meant to stop a curator from making).  So the gate builds one.
#include "core/Dictionary.H"
#include "thermo/Component.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

using namespace Choupo;

namespace
{

//  A minimal record.  `refState` is written verbatim when non-empty and
//  OMITTED when empty -- the empty case is the default-rung control, and it
//  matters that it takes the same path as a real record that writes nothing.
std::string record(const std::string& name, const std::string& refState,
                   bool withGasCp)
{
    std::string t =
        "name        " + name + ";\n"
        "formula     C12H22O11;\n"
        "MW          342.3;\n"
        "Tc          1000.0;\n"
        "Pc          5.0e6;\n"
        "omega       0.5;\n"
        "Tb          800.0;\n"
        "HvapTb      60000.0;\n"
        //  readFromDict refuses a component with no vapour-pressure model at
        //  all, so the probe supplies one.  Its VALUES are irrelevant here --
        //  nothing on the rung path evaluates Psat -- but omitting the block
        //  makes every arm fail with the SAME unrelated message, which is
        //  exactly the failure mode a gate must not have.
        "vaporPressure { model Antoine; coefficients ( 4.0 1200.0 -50.0 ); }\n"
        "liquidHeatCapacity { model polynomial; coefficients ( 400.0 0.0 0.0 0.0 0.0 ); }\n";
    if (withGasCp)
        t += "idealGasHeatCapacity { model polynomial; "
             "coefficients ( 100.0 0.1 0.0 0.0 0.0 ); }\n";
    t += "standardThermochemistry\n{\n"
         "    dHf_298   -2226100.0;\n"
         "    s_298      360.2;\n";
    if (!refState.empty())
        t += "    referenceState  " + refState + ";\n";
    t += "}\n";
    return t;
}

//  Ask for a surface and report what came back: "ok" plus the value, or the
//  refusal text.  The gate reads BOTH -- a refusal that fires for the wrong
//  reason is not the refusal being claimed.
void ask(const std::string& label, const std::string& refState, bool withGasCp,
         bool& firstOut)
{
    Component c;
    std::string what = "ok";
    double h = 0.0;
    try
    {
        c.readFromDict(Dictionary::fromString(record("probe", refState,
                                                     withGasCp), "probe.dat"));
        h = c.h_pure_ig(400.0);
    }
    catch (const std::exception& e)
    {
        what = e.what();
        h = 0.0;
    }
    //  Escape for JSON: the refusal text carries quotes and braces.
    std::string esc;
    for (char ch : what)
    {
        if (ch == '"' || ch == '\\') { esc += '\\'; esc += ch; }
        else if (ch == '\n')         { esc += "\\n"; }
        else                          { esc += ch; }
    }
    if (!firstOut) std::cout << ",\n";
    firstOut = false;
    std::cout << "  \"" << label << "\": {\"result\": \"" << esc
              << "\", \"h\": " << h << "}";
}

//  The ENTROPY surface, asked DIRECTLY, and the derived Gibbs one.
//
//  These must be separate calls, and a sabotage proved it: removing ONLY
//  s_pure_ig's guard left the whole gate green, because g = h - T*s evaluates
//  h_pure_ig first and that refusal fires before the entropy is ever touched.
//  So an arm that reaches the entropy through g_pure_ig cannot see the
//  entropy's guard at all -- it was claiming coverage it did not have.
//  ThermoPackage::S_ig calls s_pure_ig directly, so the gap was real.
void askSurface(const std::string& label, const std::string& refState,
                bool withGasCp, bool entropyOnly, bool& firstOut)
{
    Component c;
    std::string what = "ok";
    try
    {
        c.readFromDict(Dictionary::fromString(record("probe", refState,
                                                     withGasCp), "probe.dat"));
        if (entropyOnly) (void) c.s_pure_ig(400.0);
        else             (void) c.g_pure_ig(400.0);
    }
    catch (const std::exception& e) { what = e.what(); }
    std::string esc;
    for (char ch : what)
    {
        if (ch == '"' || ch == '\\') { esc += '\\'; esc += ch; }
        else if (ch == '\n')         { esc += "\\n"; }
        else                          { esc += ch; }
    }
    if (!firstOut) std::cout << ",\n";
    firstOut = false;
    std::cout << "  \"" << label << "\": {\"result\": \"" << esc << "\"}";
}

//  h_formation IS the rung-crossing route, and the refusal tells the reader to
//  use it -- so the gate checks the remedy WORKS, not merely that it is named.
//  A refusal whose advice fails is worse than none.
void askFormation(const std::string& label, const std::string& refState,
                  const std::string& target, bool& firstOut)
{
    Component c;
    std::string what = "ok";
    double h = 0.0;
    try
    {
        c.readFromDict(Dictionary::fromString(record("probe", refState, true),
                                              "probe.dat"));
        h = c.h_formation(400.0, target);
    }
    catch (const std::exception& e) { what = e.what(); }
    std::string esc;
    for (char ch : what)
    {
        if (ch == '"' || ch == '\\') { esc += '\\'; esc += ch; }
        else if (ch == '\n')         { esc += "\\n"; }
        else                          { esc += ch; }
    }
    if (!firstOut) std::cout << ",\n";
    firstOut = false;
    std::cout << "  \"" << label << "\": {\"result\": \"" << esc
              << "\", \"h\": " << h << "}";
}

}  // namespace

int main()
{
    //  EXPLICIT registration, exactly as a binary's main does it.  Nothing
    //  self-registers in this tree, so a probe that forgets this gets
    //  "Unknown vapor-pressure model 'Antoine'.  Available: (none)" from
    //  every arm at once -- a uniform unrelated failure, which is the one
    //  failure mode a gate must not have.
    VaporPressureModel::registerBuiltins();
    HeatCapacityModel::registerBuiltins();

    bool first = true;
    std::cout << "{\n";

    //  (1) The DEFAULT rung: no `referenceState` key at all.  Must succeed --
    //      142 catalogue records rely on this and none of them may change.
    ask("defaultRung", "", true, first);

    //  (2) The rung declared EXPLICITLY as idealGas.  Must behave identically
    //      to (1); if it does not, the parser is treating written and omitted
    //      differently, which no reader would expect.
    ask("explicitIdealGas", "idealGas", true, first);

    //  (3) THE DEFECT.  A solid-rung datum that also carries a gas Cp -- the
    //      record a curator creates by following the OLD error message.
    ask("solidRungWithGasCp", "pureSolid", true, first);

    //  (4) The same record WITHOUT the gas Cp: today's 18 catalogue records.
    //      It refused before this slice too, but for the wrong reason.  The
    //      gate checks WHICH reason.
    ask("solidRungNoGasCp", "pureSolid", false, first);

    //  (5) The liquid rung -- H2SO4 and HNO3 in the catalogue.
    ask("liquidRungWithGasCp", "pureLiquid", true, first);

    //  (6) The ENTROPY surface, asked directly -- NOT through g_pure_ig,
    //      which would refuse on the enthalpy leg first and never reach it.
    askSurface("entropySolidRung", "pureSolid", true, true, first);
    askSurface("entropyDefaultRung", "", true, true, first);

    //  (6b) The derived Gibbs surface must refuse too.
    askSurface("gibbsSolidRung", "pureSolid", true, false, first);
    askSurface("gibbsDefaultRung", "", true, false, first);

    //  (8) MULTI-RUNG: a record may declare a SECOND standard state, and a
    //      DUPLICATE of its own declared one must be refused as two homes for
    //      one datum.  Tested here rather than through a case, because every
    //      corpus case is SEALED with its own mirrored records -- editing
    //      data/standards/components/water.dat does not reach a sealed case's
    //      parser at all, and a sabotage that never reaches the code path
    //      proves nothing in either direction.
    {
        bool ok = true; std::string what = "ok";
        Component c;
        try
        {
            std::string r = record("probe", "idealGas", true);
            //  a legitimate SECOND rung
            r.replace(r.rfind("}"), 1,
                      "    pureLiquid { dHf_298 -285830.0; s_298 69.95; }\n}");
            c.readFromDict(Dictionary::fromString(r, "probe.dat"));
            ok = c.hasRung("pureLiquid") && c.hasRung("idealGas");
        }
        catch (const std::exception& e) { what = e.what(); ok = false; }
        if (!first) std::cout << ",\n";
        first = false;
        std::cout << "  \"secondRungAccepted\": {\"result\": \""
                  << (ok ? "ok" : what) << "\"}";
    }
    {
        std::string what = "ok";
        Component c;
        try
        {
            std::string r = record("probe", "idealGas", true);
            //  a DUPLICATE of the declared rung -- must refuse
            r.replace(r.rfind("}"), 1,
                      "    idealGas { dHf_298 -1.0; s_298 1.0; }\n}");
            c.readFromDict(Dictionary::fromString(r, "probe.dat"));
        }
        catch (const std::exception& e) { what = e.what(); }
        std::string esc;
        for (char ch : what) { if (ch=='"'||ch=='\\') { esc+='\\'; esc+=ch; }
                               else if (ch=='\n') esc += "\\n"; else esc += ch; }
        if (!first) std::cout << ",\n";
        first = false;
        std::cout << "  \"duplicateRungRefused\": {\"result\": \"" << esc << "\"}";
    }

    //  (9) THE POTENTIAL IS RIGHT WHERE BOTH ITS HALVES ARE WRONG.
    //      Real water, from the catalogue, crossed gas -> liquid at 298.15 K.
    //      The enthalpy leg (Watson Hvap) and the entropy leg
    //      (dS = (Hvap - dG_vap)/T) are each visibly off CODATA, in OPPOSITE
    //      directions, so g = h - T*s closes far tighter than either.  That
    //      cancellation is not a coincidence to be tolerated -- it is why a
    //      POTENTIAL is the right interface and a raw enthalpy is not.
    {
        const char* home = std::getenv("CHOUPO_HOME");
        std::string path = std::string(home ? home : ".")
                         + "/data/standards/components/water.dat";
        std::string what = "ok";
        double h = 0.0, s = 0.0, g = 0.0;
        try
        {
            Component w;
            w.readFromDict(Dictionary::fromFile(path));
            h = w.h_formation(298.15, "liquid");
            s = w.s_formation(298.15, "liquid");
            g = w.g_formation(298.15, "liquid");
        }
        catch (const std::exception& e) { what = e.what(); }
        std::string esc;
        for (char ch : what) { if (ch=='"'||ch=='\\') { esc+='\\'; esc+=ch; }
                               else if (ch=='\n') esc += "\\n"; else esc += ch; }
        if (!first) std::cout << ",\n";
        first = false;
        std::cout << "  \"waterLiquidCrossing\": {\"result\": \"" << esc
                  << "\", \"h\": " << h << ", \"s\": " << s
                  << ", \"g\": " << g << "}";
    }

    //  (7) The REMEDY the refusal names must actually work.
    askFormation("formationSolidToSolid", "pureSolid", "solid", first);
    askFormation("formationSolidToLiquid", "pureSolid", "liquid", first);

    std::cout << "\n}\n";
    return 0;
}
