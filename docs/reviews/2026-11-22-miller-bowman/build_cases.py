#!/usr/bin/env python3
"""Assemble tutorials/batch/combustion/nox02_millerbowman_denox and nox03_millerbowman_large.

    build_cases.py            (from anywhere; writes the two case directories)

Pipeline per case: gen_chemkin.py -> mb1989_app{B,A}.inp -> bin/curate/chemkin_to_choupo.py
--reactions-only -> constant/reactions (renamed A<k>/B<k> as the paper numbers them, page
comments added) -> build_components.py (case-local NASA-9 of the stable species) ->
dictionaries.  The generated files are then the case; this script is its provenance.
"""
import csv, os, re, subprocess, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
COMB = os.path.join(ROOT, 'tutorials/batch/combustion')
BANNER = ''.join(open(os.path.join(COMB, 'ignition04_h2air_sensitivity/system/controlDict')).readlines()[:9])
def rows(tab): return [r for r in csv.DictReader(open(os.path.join(HERE, 'mb1989_table.tsv')), delimiter='\t') if r['table'] == tab]
def sh(*a, **k): return subprocess.run(a, check=True, capture_output=True, text=True, **k)
def reactions(case, tab, title):
    tmp = '/tmp/mb89/build_' + tab; shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    sh(sys.executable, os.path.join(HERE, 'gen_chemkin.py'), tab, **{}) if False else None
    inp = os.path.join(HERE, 'mb1989_app%s.inp' % tab)
    sh(os.path.join(ROOT, 'bin/curate/chemkin_to_choupo.py'), inp, '--reactions-only', '--case', tmp, '--licence',
       'Miller and Bowman 1989, printed rate table (rate coefficients are facts); our transcription')
    t = open(tmp + '/constant/reactions').read().replace('SCH2', '1CH2')
    R = rows(tab)
    names = []
    parts = re.split(r'^(r\d{3})\n\{', t, flags=re.M)
    head, body = parts[0], parts[1:]
    assert len(body) // 2 == len(R), (len(body) // 2, len(R))
    out = []
    for i, r in enumerate(R):
        nm = '%s%s' % (tab, r['rxn']); names.append(nm)
        blk = body[2 * i + 1]
        blk = blk.replace('reversible        true;', '// %s p.%s, as printed: %s   A=%s n=%s E=%s cal/mol\n    reversible        true;' % (
            ('Miller & Bowman Appendix ' + tab + ' reaction ' + r['rxn']), r['page'], r['equation'].replace('SCH2', '1CH2'), r['A'], r['n'], r['E'].rstrip('.')), 1)
        out.append('%s\n{%s' % (nm, blk))
    hdr = ('/*--------------------------------*- Choupo -*--------------------------------*\\\n'
           '  %s\n\n'
           '  Written by bin/curate/chemkin_to_choupo.py from our CHEMKIN transcription of the\n'
           '  printed table (docs/reviews/2026-11-22-miller-bowman/mb1989_app%s.inp, made by\n'
           '  gen_chemkin.py from mb1989_table.tsv), reaction names are the paper numbers.  A stays in\n'
           '  cm3-mol-s and Ea in cal/mol as printed; the engine converts and announces\n'
           '  (kinetics.units{}).  Reverse rates from equilibrium (the species thermo), as the paper does.\n'
           '  Third-body efficiencies as printed.  Interpretations (Troe footnote, SRI e, B10\n'
           '  efficiencies): docs/reviews/2026-11-22-miller-bowman/README.md.\n'
           '\\*-----------------------------------------------------------------------------*/\n\n'
           'provenance\n{\n    status  "CURATED -- Miller & Bowman 1989 Appendix %s, rate table transcribed from the page images (two readings)";\n'
           '    review  { state transcribed; reviewer "session 2026-11-22 (two passes over the page images, Cantera element-balance check of every reaction)"; }\n'
           '    kinetics_source  "J.A. Miller, C.T. Bowman, Prog. Energy Combust. Sci. 15 (1989) 287-338, DOI 10.1016/0360-1285(89)90017-8, Appendix %s";\n'
           '    thermo_source    "NASA/TP-2002-211556 (NASA-9) via the NASA table and case-local overrides; nine species RRHO-computed (data/standards/thermoTables/RRHO-computed)";\n}\n\n') % (title, tab, tab, tab)
    open(case + '/constant/reactions', 'w').write(hdr + '\n'.join(out))
    return names
def species_of(tab):
    txt = open(os.path.join(HERE, 'mb1989_app%s.inp' % tab)).read()
    sp = re.search(r'SPECIES(.*?)END', txt, re.S).group(1).split()
    return ['1CH2' if s == 'SCH2' else s for s in sp]
def thermo(case, comps):
    open(case + '/constant/thermoPhysPropDict', 'w').write(BANNER + """/*---------------------------------------------------------------------------*\\
  thermoPhysPropDict (v2) -- ideal gas, ONE thermochemistry per run.
  Stable species: case-local NASA-9 overrides (constant/components/); radicals and the
  other species: the NASA/TP-2002-211556 table; the nine species the table lacks (NNH,
  CH2CO, 1CH2, H2CN, HOCN, HCNO, HCCOH, C3H2, C4H3): RRHO-computed records with dHf
  from ATcT (data/standards/thermoTables/RRHO-computed, Theory Guide sec:rrho-thermo).
\\*---------------------------------------------------------------------------*/

recordType    thermophysicalPropertySystem;
schemaVersion 1;

components       ( %s );

speciesTables ( NASA-TP-2002-211556 RRHO-computed );

equilibrium
{
    formulation gammaPhi;

    liquid
    {
        activityModel ideal;
        standardState pureLiquid;
    }

    vapour
    {
        fugacityModel idealGas;
    }
}
""" % ' '.join(comps))

CTL_B = '''application   choupoBatch;
description   "Miller & Bowman 1989 Fig. 57 (Lyon & Hardy flow reactor, data set 1): thermal DeNOx window, Appendix B, 17 isothermal vessels, 0.1 s";
verbosity     1;

startTime       0;
endTime         0.1;         // s, the residence time of the experiment
deltaT          1.0e-3;      // s (not used by the adaptive integrator)
writeInterval   5.0e-3;      // s -- 20 state directories

timeStepping    adaptive;
timeSteppingControl
{
    rtol        1.0e-6;
    atol        1.0e-17;     // kmol (V = 1 m3, n of the order of 1e-5 kmol)
    deltaT0     1.0e-9;      // s
    deltaTmax   5.0e-3;      // s
}
'''
CTL_A = '''application   choupoBatch;
description   "Miller & Bowman 1989 Appendix A (235 reactions, 51 species): lean CH4/air + 100 ppm NO, adiabatic constant volume, 1300 K, 1 atm";
verbosity     3;

startTime       0;
endTime         3.0e-2;      // s
deltaT          1.0e-3;      // s (not used by the adaptive integrator)
writeSpacing    log;         // the ignition runs from microseconds to milliseconds: points evenly spaced in log t
writeStart      1.0e-6;      // s, the first write point after t = 0
writePerDecade  20;          // 91 write points up to endTime

timeStepping    adaptive;
timeSteppingControl
{
    rtol        1.0e-8;
    atol        1.0e-15;     // kmol (n of the order of 1e-5 kmol)
    deltaT0     1.0e-9;      // s
    deltaTmax   1.0e-3;      // s
}
'''
ROUTE_BLOCK = "        //  WHERE THE NO COMES FROM (DEV.md 4c C477): the net NO made by each declared\n        //  SET OF REACTIONS, integrated in time.  Every reaction of Appendix A that has\n        //  NO in its stoichiometry is listed once (29 of them, labels are the paper's\n        //  reaction numbers); a route is a reaction CLASS, not a traced atom path:\n        //    thermal        the N-atom steps of the extended Zeldovich mechanism (N + O2, N + OH, N + NO, N + CO2)\n        //    nitrousOxide   N2O made from NO and NH, and N2O + O = 2 NO\n        //    nitrogenDioxide  the NO <-> NO2 cycle (HO2 + NO, NO2 + H, NO2 + O, NO2 + M, CN + NO2)\n        //    nitroxylNH     the HNO and NH2/NH/NNH steps (HNO + M, HNO + OH, HNO + H, NH + O2, NH2 + NO, NNH + NO ...)\n        //    cyanideNCO     the HCN/NCO branch that CH + N2 feeds (prompt), and its reburning of NO\n        //                   (C/CH/CH2/CH3/HCCO + NO), with NCO + O and NCO + OH making NO\n        //  A route's total is NET: it counts what its reactions destroy as well as make.\n        //  The reactions in no route would be `other` (none here).  The sum is checked\n        //  against the vessel's own NO inventory in the run's [routes] lines.\n        routeIntegral\n        {\n            species NO;\n            routes\n            {\n                thermal          ( A166 A232 A233 A234 );\n                nitrousOxide     ( A197 A202 A207 );\n                nitrogenDioxide  ( A184 A188 A189 A190 A191 );\n                nitroxylNH       ( A201 A216 A217 A222 A228 A229 A230 A231 );\n                cyanideNCO       ( A156 A157 A158 A159 A160 A161 A162 A193 A195 );\n            }\n        }\n"
R_GAS = 8314.46261815324   # J/(kmol K)
ATM = 101325.0
RULE = '/*---------------------------------------------------------------------------*\\\n'
RULE_END = '\\*---------------------------------------------------------------------------*/\n'
def holdup_text(unit, desc, T, P_atm, comp, V=None, nmol=None):
    n = nmol if nmol else P_atm * ATM * V / (R_GAS * T)
    body = ''.join('        %-8s %.10g;\n' % (k, v) for k, v in comp.items())
    vline = ('    V            %.6g;\n' % V) if V else ''
    return (BANNER + RULE + '  0/internalStates/%s -- the initial HOLDUP (the single source of truth).\n  %s\n' % (unit, desc) + RULE_END + '\n'
            + 'recordType  internalState;\n\nunit        "%s";\nequipment   batchReactor;\n\nholdup\n{\n    T            %.2f K;\n    P            %.6g atm;\n%s    totalMoles   %.10e;         // kmol, n = P V / (R T)\n    molarComposition\n    {\n%s    }\n}\n'
            % (unit, T, P_atm, vline, n, body))
def zero_fill(comp, comps):
    c = dict(comp)
    for s in comps: c.setdefault(s, 0.0)
    return c
def wipe(case):
    """Remove what this script writes; keep README.md, expected, propertyManifest (re-pin and re-record after)."""
    #  system/postDict (the case's declared figures, C477) is authored by hand and kept
    sysd = os.path.join(case, 'system')
    if os.path.isdir(sysd):
        for f in os.listdir(sysd):
            if f != 'postDict': os.remove(os.path.join(sysd, f))
    for sub in ('constant/components', 'constant/reactions', 'constant/thermoPhysPropDict', '0'):
        p = os.path.join(case, sub)
        shutil.rmtree(p) if os.path.isdir(p) else (os.remove(p) if os.path.exists(p) else None)
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True); open(path, 'w').write(text)

def case_b(comps_b):
    """nox02: Fig. 57 (Lyon & Hardy flow reactor, data set 1) with Appendix B."""
    case = os.path.join(COMB, 'nox02_millerbowman_denox'); wipe(case)
    os.makedirs(case + '/constant', exist_ok=True); os.makedirs(case + '/system', exist_ok=True)
    open(case + '/nox02_millerbowman_denox.cho', 'a').close()
    comps = comps_b            # B's species include the carrier He (no reaction)
    names = reactions(case, 'B', 'Miller & Bowman 1989, Appendix B (ammonia / Thermal DeNOx mechanism, 73 reactions)')
    sh(sys.executable, os.path.join(HERE, 'build_components.py'), case)
    thermo(case, comps)
    Ts = [900, 1000, 1050, 1100, 1125, 1150, 1175, 1200, 1225, 1250, 1275, 1300, 1325, 1350, 1400, 1450, 1500]
    units = []
    for T in Ts:
        units.append('    {\n        name        T%d;\n        type        batchReactor;\n'
                     '        operation   { mode isothermal; energy gasConstantP; }     // plug-flow element at its wall temperature, 1.1 atm\n'
                     '        solver      { integrator Rosenbrock23; jacobian analytic; linearSolver auto; verbosity 1; }\n'
                     '        reactions   ( %s );\n    }' % (T, ' '.join(names)))
    write(case + '/system/flowsheetDict', BANNER + RULE + '  nox02_millerbowman_denox / flowsheetDict -- one isothermal vessel per temperature of\n  the Thermal DeNOx window (900-1500 K, 25 K steps through the window), each a plug-flow element held 0.1 s.\n' + RULE_END + 'units\n(\n' + '\n'.join(units) + '\n);\n')
    for T in Ts:
        comp = zero_fill({'NO': 225e-6, 'NH3': 450e-6, 'O2': 0.0123, 'He': 1 - 225e-6 - 450e-6 - 0.0123}, comps)
        write(case + '/0/internalStates/T%d' % T, holdup_text('T%d' % T, 'Lyon & Hardy data set 1 (Miller & Bowman Fig. 57): NO 225 ppm, NH3 450 ppm, O2 1.23 %, He balance, 1.1 atm, 1 m3.', float(T), 1.1, comp, nmol=1.1 * ATM * 1.0 / (R_GAS * T)))
    write(case + '/system/controlDict', BANNER + RULE + '  nox02_millerbowman_denox / controlDict\n' + RULE_END + CTL_B)
    return case

def case_a(comps_a):
    case = os.path.join(COMB, 'nox03_millerbowman_large'); wipe(case)
    os.makedirs(case + '/constant', exist_ok=True); os.makedirs(case + '/system', exist_ok=True)
    open(case + '/nox03_millerbowman_large.cho', 'a').close()
    names = reactions(case, 'A', 'Miller & Bowman 1989, Appendix A (C/H/O/N mechanism, 235 reactions)')
    sh(sys.executable, os.path.join(HERE, 'build_components.py'), case)
    thermo(case, comps_a)
    rl = '\n            '.join(' '.join(names[i:i + 6]) for i in range(0, len(names), 6))
    write(case + '/system/flowsheetDict', BANNER + RULE + '  nox03_millerbowman_large / flowsheetDict -- one adiabatic constant-volume vessel with the\n  235-reaction Appendix A mechanism.  Two declared figures (system/postDict): when it ignites and what NO it leaves,\n  and where the NO comes from (routeIntegral below: five declared reaction classes, integrated on the dense output).\n' + RULE_END
          + 'units\n(\n    {\n        name        vessel;\n        type        batchReactor;\n        operation   { mode adiabatic; energy gasConstantV; }\n'
          + '        solver      { integrator Rosenbrock23; jacobian analytic; linearSolver sparse; verbosity 3; }\n' + ROUTE_BLOCK + '        reactions\n        (\n            %s\n        );\n    }\n);\n' % rl)
    X = {'CH4': 0.6 * 0.5, 'O2': 1.0, 'N2': 3.76}
    s = sum(X.values()); tot = s * 1.0001
    comp = {k: v / tot for k, v in X.items()}; comp['NO'] = 1e-4 * s / tot
    comp = zero_fill(comp, comps_a)
    write(case + '/0/internalStates/vessel', holdup_text('vessel', 'Lean CH4/air (phi 0.6) with 100 ppm NO, 1300 K, 1 atm, 1 L.', 1300.0, 1.0, comp, V=1.0e-3))
    write(case + '/system/controlDict', BANNER + RULE + '  nox03_millerbowman_large / controlDict\n' + RULE_END + CTL_A)
    return case

if __name__ == '__main__':
    case_b(species_of('B'))
    case_a(species_of('A'))
