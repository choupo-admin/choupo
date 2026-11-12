"""Build the scratch once-through-on-a-stratified-vat case (choupoSemiContinuous).

The vat is approximated by N stacked well-mixed layers (dynamicCSTR, no
jacket): wine is drawn from the bottom layer, deionised in one pass through a
quasi-steady electrodialysisStack, and returned to the top layer; each layer
overflows into the one below.  N -> infinity is plug flow; finite N adds a
numerical dispersion that is NOT the vat's.  Every operating number is an
author-set assumption (vat volume, flow, layer count, target).
usage: make_vat.py <ed09Case> <dst> [--layers N] [--vat m3] [--flow L_per_h]
                    [--removal f] [--endTime s] [--dt s] [--controller]
"""
import argparse, os, shutil
p = argparse.ArgumentParser()
p.add_argument('ed09'); p.add_argument('dst')
p.add_argument('--stack', required=True,
               help="identifier of the catalogue's industrial edStack record of 50 m2 cell-pair area")
p.add_argument('--layers', type=int, default=5)
p.add_argument('--vat', type=float, default=10.0)      # m3
p.add_argument('--flow', type=float, default=3000.0)   # L/h
p.add_argument('--removal', type=float, default=0.20)
p.add_argument('--endTime', type=float, default=16000)
p.add_argument('--dt', type=float, default=10)
p.add_argument('--write', type=float, default=600)
p.add_argument('--app', default='choupoSemiContinuous')
p.add_argument('--controller', action='store_true',
               help='replace targetConductivityRemoval by current + a PID on kappa_dil_out (probe)')
a = p.parse_args()
ions = {'K':25.0,'Na':5.0,'Ca':1.25,'Mg':4.0,'H':0.25,'Cl':1.1,'SO4':6.025,'HTart':8.0,
        'Tart':1.5,'HMal':1.0,'Mal':0.05,'Lactate':9.0,'H2PO4':6.5}
MWW = 18.01528
if os.path.exists(a.dst): shutil.rmtree(a.dst)
os.makedirs(a.dst + '/system'); os.makedirs(a.dst + '/0/internalStates')
shutil.copytree(a.ed09 + '/constant', a.dst + '/constant')
os.remove(a.dst + '/constant/propertyManifest')   # unsealed scratch copy
open(f'{a.dst}/{os.path.basename(a.dst)}.cho', 'w').close()
Vl = a.vat / a.layers                       # m3 per layer
Lh = a.flow                                 # L/h
def flows(scale=1.0, Lph=Lh):
    s = "componentMolarFlows\n{\n"
    s += f"    water    {Lph/MWW:.10g} kmol/h;\n"
    for k, v in ions.items(): s += f"    {k:<8} {v*scale*Lph*1e-6:.10g} kmol/h;\n"
    return s + "}\nT               298.15 K;\nP               250000 Pa;\n"
def holdup(name):
    L = Vl * 1000.0
    s = (f'recordType  internalState;\nunit        "{name}";\nequipment   dynamicCSTR;\n'
         f'holdup\n{{\n    T           298.15;\n    P           250000.0;\n    V           {Vl};\n'
         '    holdupMolar\n    {\n' f'        water     {L/MWW:.10g};\n')
    for k, v in ions.items(): s += f"        {k:<9} {v*L*1e-6:.10g};\n"
    return s + "    }\n}\n"
N = a.layers
layer = lambda i: f'L{i}'
units = []
for i in range(1, N+1):
    inn = 'treated' if i == 1 else f's{i-1}{i}'
    out = 'toStack' if i == N else f's{i}{i+1}'
    units.append(f"""    {{
        name        {layer(i)};
        type        dynamicCSTR;
        in          {inn};
        outputs     ( {out} );
        operation   {{ energy isothermal; UA 0.0; T_jacket 298.15 K; }}
    }}""")
    open(f'{a.dst}/0/internalStates/{layer(i)}', 'w').write(holdup(layer(i)))
    open(f'{a.dst}/0/{out}', 'w').write(flows())
drive = (f"current 6.7;" if a.controller else f"targetConductivityRemoval  {a.removal};")
units.append(f"""    {{
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
                {drive}
                xi                         0.9;
                E_electrodes               2.0;
            }}
        }}
    }}""")
open(f'{a.dst}/0/treated', 'w').write(flows())
open(f'{a.dst}/0/brineIn', 'w').write("componentMolarFlows\n{\n"
    f"    water    {Lh/MWW:.10g} kmol/h;\n    K        {20*Lh*1e-6:.10g} kmol/h;\n"
    f"    HTart    {20*Lh*1e-6:.10g} kmol/h;\n}}\nT               298.15 K;\nP               250000 Pa;\n")
open(f'{a.dst}/0/brineOut', 'w').write(open(f'{a.dst}/0/brineIn').read())
ctrl = ""
if a.controller:
    ctrl = """
controllers
(
    {
        name         CC1;
        type         PID;
        measurement  { unit ED;  cv kappa_dil_out_S_m; }
        actuator     { unit ED;  mv current; }
        setpoint     0.383;
        gains        { Kp -50.0; Ki -0.5; Kd 0.0; }
        output       { min 0.0; max 60.0; bias 6.7; }
    }
);
"""
hdr = ("/* SCRATCH PROPOSAL: a once-through electrodialysis stack on a stratified vat\n"
       "   approximated by stacked well-mixed layers.  Author-set assumptions throughout. */\n")
open(f'{a.dst}/system/flowsheetDict', 'w').write(hdr + "units\n(\n" + "\n".join(units) + "\n);\n" + ctrl)
open(f'{a.dst}/system/controlDict', 'w').write(hdr +
    f'application   {"choupoCtrl" if a.controller else a.app};\n'
    'description   "Once-through ED of a wine on a stratified vat (scratch proposal)";\n'
    f'verbosity     2;\nstartTime     0;\nendTime       {a.endTime:g};\ndeltaT        {a.dt:g};\nwriteInterval {a.write:g};\n')
