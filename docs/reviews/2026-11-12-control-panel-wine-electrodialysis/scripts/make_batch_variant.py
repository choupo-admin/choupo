"""Build a variant of the scratch wine batch-ED case.
usage: make_variant.py <srcCase> <dstCase> [--scale S] [--voltage U] [--T K] [--xi X] [--endTime s]
The wine is ed09's author-set thirteen-ion table (mmol/L); the concentrate
is primed with the SAME ionic composition (an assumption), so every ion the
diluate can lose already has a column in the concentrate from t = 0.
"""
import sys, shutil, os, re, argparse
p = argparse.ArgumentParser()
p.add_argument('src'); p.add_argument('dst')
p.add_argument('--scale', type=float, default=1.0)
p.add_argument('--voltage', type=float, default=4.0)
p.add_argument('--T', type=float, default=298.15)
p.add_argument('--xi', type=float, default=0.9)
p.add_argument('--endTime', type=float, default=1800)
p.add_argument('--writeInterval', type=float, default=60)
a = p.parse_args()
ions = {'K':25.0,'Na':5.0,'Ca':1.25,'Mg':4.0,'H':0.25,'Cl':1.1,'SO4':6.025,'HTart':8.0,
        'Tart':1.5,'HMal':1.0,'Mal':0.05,'Lactate':9.0,'H2PO4':6.5}
V = 5.0; water = 0.2775418672
def block(scale, indent):
    n = {k: v*scale*V*1e-6 for k, v in ions.items()}
    tot = water + sum(n.values())
    s = f"{indent}totalMoles   {tot!r};\n{indent}molarComposition\n{indent}{{\n"
    s += f"{indent}    water    {water/tot!r};\n"
    for k in ions: s += f"{indent}    {k:<8} {n[k]/tot!r};\n"
    return s + f"{indent}}}\n"
if os.path.exists(a.dst): shutil.rmtree(a.dst)
os.makedirs(a.dst + '/system'); os.makedirs(a.dst + '/0/internalStates')
shutil.copytree(a.src + '/constant', a.dst + '/constant')
open(a.dst + '/' + os.path.basename(a.dst) + '.cho', 'w').close()
fs = open(a.src + '/system/flowsheetDict').read()
fs = re.sub(r'voltage\s+[0-9.eE+-]+;', f'voltage        {a.voltage};', fs)
fs = re.sub(r'xi\s+[0-9.eE+-]+;', f'xi             {a.xi};', fs)
open(a.dst + '/system/flowsheetDict', 'w').write(fs)
cd = open(a.src + '/system/controlDict').read()
cd = re.sub(r'endTime\s+[0-9.]+;', f'endTime         {a.endTime:g};', cd)
cd = re.sub(r'writeInterval\s+[0-9.]+;', f'writeInterval   {a.writeInterval:g};', cd)
open(a.dst + '/system/controlDict', 'w').write(cd)
hold = ("recordType  internalState;\nunit        \"rig\";\nequipment   batchElectrodialysis;\n"
        "holdup\n{\n" f"    T            {a.T} K;\n    P            1.5 bar;\n    V            0.005;\n"
        + block(a.scale, '    ') + "    concentrate\n    {\n" + block(1.0, '        ') + "    }\n}\n")
open(a.dst + '/0/internalStates/rig', 'w').write(hold)
