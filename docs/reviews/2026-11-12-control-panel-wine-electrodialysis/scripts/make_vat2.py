"""Build the scratch TWO-COMPARTMENT stratified vat (choupoSemiContinuous):
the UNTREATED wine is a variable-volume vessel drained from the bottom at
the circulation flow (outflow mode flow); it feeds a quasi-steady
electrodialysisStack once through; the treated wine leaves the model as a
product (in a perfectly stratified vat it sits on top and never meets the
untreated wine again, so it is not modelled as a vessel).  The vessel's
only declared inlet is a zero-flow stream (the vat receives nothing at the
bottom).  Declared for this proposal: vat 10 m3, target 20 %; flow = the industrial stack
record's design flow 3000 L/h, target 20 % conductivity removal.
usage: make_vat2.py <ed09Case> <dst> [--endTime s] [--dt s] [--write s] [--flow L_per_h]
"""
import argparse, os, shutil
p = argparse.ArgumentParser()
p.add_argument('ed09'); p.add_argument('dst')
p.add_argument('--stack', required=True,
               help="identifier of the catalogue's industrial edStack record of 50 m2 cell-pair area")
p.add_argument('--endTime', type=float, default=11900)
p.add_argument('--dt', type=float, default=10)
p.add_argument('--write', type=float, default=600)
p.add_argument('--flow', type=float, default=3000.0)
p.add_argument('--vat', type=float, default=10.0)
p.add_argument('--placeholderVliq', action='store_true',
               help='PROBE ONLY: give every ion a Vliq equal to water\'s (no physical claim), '
                    'without which a variable-volume vessel refuses (no liquid density for an ion)')
p.add_argument('--brineTank', type=float, default=0.0,
               help='m3; > 0 closes the concentrate on a constant-volume isothermal brine tank')
a = p.parse_args()
ions = {'K':25.0,'Na':5.0,'Ca':1.25,'Mg':4.0,'H':0.25,'Cl':1.1,'SO4':6.025,'HTart':8.0,
        'Tart':1.5,'HMal':1.0,'Mal':0.05,'Lactate':9.0,'H2PO4':6.5}
MWW = 18.01528
if os.path.exists(a.dst): shutil.rmtree(a.dst)
os.makedirs(a.dst + '/system'); os.makedirs(a.dst + '/0/internalStates')
shutil.copytree(a.ed09 + '/constant', a.dst + '/constant')
os.remove(a.dst + '/constant/propertyManifest')
open(f'{a.dst}/{os.path.basename(a.dst)}.cho', 'w').close()
if a.placeholderVliq:
    for k in ions:
        with open(f'{a.dst}/constant/components/{k}.dat', 'a') as fh:
            fh.write("\n//  SCRATCH PROBE PLACEHOLDER: water's molar volume, NO physical claim.\nVliq        1.807e-5;\n")
L = a.vat * 1000.0
Fkmols = (a.flow / MWW + sum(v*a.flow*1e-6 for v in ions.values())) / 3600.0
def flows(Lph):
    s = "componentMolarFlows\n{\n" f"    water    {Lph/MWW:.10g} kmol/h;\n"
    for k, v in ions.items(): s += f"    {k:<8} {v*Lph*1e-6:.10g} kmol/h;\n"
    return s + "}\nT               298.15 K;\nP               250000 Pa;\n"
hold = ('recordType  internalState;\nunit        "VAT";\nequipment   dynamicCSTR;\n'
        'holdup\n{\n    T           298.15;\n    P           250000.0;\n'
        '    holdupMolar\n    {\n' f'        water     {L/MWW:.10g};\n')
for k, v in ions.items(): hold += f"        {k:<9} {v*L*1e-6:.10g};\n"
hold += "    }\n}\n"
open(f'{a.dst}/0/internalStates/VAT', 'w').write(hold)
open(f'{a.dst}/0/vatBottomInlet', 'w').write("componentMolarFlows\n{\n    water 1e-9 kmol/h;   // a zero-flow inlet is refused: molarComposition sums to zero\n}\nT 298.15 K;\nP 250000 Pa;\n")
open(f'{a.dst}/0/toStack', 'w').write(flows(a.flow))
open(f'{a.dst}/0/treated', 'w').write(flows(a.flow))
br = ("componentMolarFlows\n{\n" f"    water    {a.flow/MWW:.10g} kmol/h;\n    K        {20*a.flow*1e-6:.10g} kmol/h;\n"
      f"    HTart    {20*a.flow*1e-6:.10g} kmol/h;\n}}\nT               298.15 K;\nP               250000 Pa;\n")
open(f'{a.dst}/0/brineIn', 'w').write(br); open(f'{a.dst}/0/brineOut', 'w').write(br)
hdr = ("/* SCRATCH PROPOSAL: once-through electrodialysis on a stratified vat, as\n"
       "   two compartments; author-set assumptions throughout. */\n")
fs = hdr + f"""units
(
    {{
        name        VAT;
        type        dynamicCSTR;
        in          vatBottomInlet;
        outputs     ( toStack );
        operation
        {{
            energy      isothermal;
            UA          0.0;
            T_jacket    298.15 K;
            volumeMode  variable;
            geometry    {{ shape verticalCylinder; diameter 2.0 m; height 3.6 m; }}
            outflow     {{ mode flow; F {Fkmols:.10g}; }}
        }}
    }}
BRINE_UNIT    {{
        name        ED;
        type        quasiSteady;
        inputs      ( toStack  brineIn );
        outputs     ( treated  brineOut );
        unit
        {{
            type        electrodialysisStack;
            operation
            {{
                stack                      {a.stack};
                membrane                   CMX_AMX;
                targetConductivityRemoval  0.20;
                xi                         0.9;
                E_electrodes               2.0;
            }}
        }}
    }}
);
"""
brineUnit = ""
if a.brineTank > 0:
    brineUnit = """    {
        name        BRINE;
        type        dynamicCSTR;
        in          brineOut;
        outputs     ( brineIn );
        operation   { energy isothermal; UA 0.0; T_jacket 298.15 K; }
    }
"""
    Lb = a.brineTank * 1000.0
    open(f'{a.dst}/0/internalStates/BRINE', 'w').write('recordType  internalState;\nunit        "BRINE";\nequipment   dynamicCSTR;\nholdup\n{\n    T           298.15;\n    P           250000.0;\n'
        f'    V           {a.brineTank};\n    holdupMolar\n    {{\n        water     {Lb/MWW:.10g};\n        K         {20*Lb*1e-6:.10g};\n        HTart     {20*Lb*1e-6:.10g};\n    }}\n}}\n')
fs = fs.replace("BRINE_UNIT", brineUnit)
open(f'{a.dst}/system/flowsheetDict', 'w').write(fs)
open(f'{a.dst}/system/controlDict', 'w').write(hdr +
    'application   choupoSemiContinuous;\n'
    'description   "Once-through ED of a wine drawn from a stratified vat (scratch proposal)";\n'
    f'verbosity     2;\nstartTime     0;\nendTime       {a.endTime:g};\ndeltaT        {a.dt:g};\nwriteInterval {a.write:g};\n')
