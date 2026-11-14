"""Group the Antoine-water cases by family and by a heuristic of vapour-pressure dependence.
Heuristic V (vapour-pressure-dependent): the equilibrium block declares a vapour
(sub-block `vapour`, or formulation words gammaPhi/equationOfState/reactive with a vapour),
OR the flowsheet has a unit whose type is an equilibrium/evaporation unit.
Pinned: an `expected` golden file exists in the case dir."""
import sys,os,re,collections
sys.path.insert(0,os.path.dirname(__file__))
from dictparse import parse_file, Block
repo=sys.argv[1]; tsv=sys.argv[2]
VUNITS=re.compile(r'\btype\s+(flash|isothermalFlash|adiabaticFlash|distillationColumn|shortcutColumn|evaporator|absorber|stripper|sprayDryer|solidDryer|evaporativeDryer|coolingTower|humidifier|dehumidifier|phaseChanger|reactiveFlash|crystalliser|batchStill|condenser|reboiler|kettleReboiler|partialCondenser|threePhaseFlash|lleFlash|vlleFlash|psychrometer|steamGenerator|boiler)\b')
fam=collections.defaultdict(lambda: collections.Counter())
rows=[]
for line in open(tsv):
    rel,src,law,co=line.rstrip('\n').split('\t')
    if law!='Antoine': continue
    cd=os.path.join(repo,'tutorials',rel)
    t=parse_file(os.path.join(cd,'constant','thermoPhysPropDict'))
    eq=t.get('equilibrium'); vap=False; why=[]
    if isinstance(eq,Block):
        ks=eq.keys()
        if 'vapour' in ks or 'vapor' in ks: vap=True; why.append('eq.vapour')
        f=eq.get('formulation')
        if f and f[0] in ('gammaPhi','equationOfState','eos'): vap=True; why.append('form:'+f[0])
    fs=os.path.join(cd,'system','flowsheetDict'); txt=open(fs).read() if os.path.exists(fs) else ''
    for root,_,files in os.walk(cd):
        if 'flowsheetDict' in files and root!=os.path.join(cd,'system'):
            txt+=open(os.path.join(root,'flowsheetDict')).read()
    m=VUNITS.findall(txt)
    if m: vap=True; why.append('unit:'+','.join(sorted(set(m))))
    pd=os.path.join(cd,'system','propsDict')
    if os.path.exists(pd) and re.search(r'vaporPressure|bubble|dew|Psat|psat|txy|pxy|flash',open(pd).read()): vap=True; why.append('props:vle-op')
    pinned=os.path.exists(os.path.join(cd,'expected'))
    f2='/'.join(rel.split('/')[:2])
    fam[f2][(vap,pinned)]+=1
    rows.append((rel,vap,pinned,';'.join(why)))
tot=collections.Counter()
print(f"{'family':32s} {'V&pinned':>8s} {'V,unpinned':>10s} {'notV':>5s} {'total':>5s}")
for f in sorted(fam):
    c=fam[f]; a=c[(True,True)]; b=c[(True,False)]; n=c[(False,True)]+c[(False,False)]
    tot['a']+=a; tot['b']+=b; tot['n']+=n
    print(f"{f:32s} {a:8d} {b:10d} {n:5d} {a+b+n:5d}")
print(f"{'TOTAL':32s} {tot['a']:8d} {tot['b']:10d} {tot['n']:5d} {tot['a']+tot['b']+tot['n']:5d}  families={len(fam)}")
with open(os.path.join(os.path.dirname(tsv),'water_family.tsv'),'w') as fh:
    for r in rows: fh.write('\t'.join(map(str,r))+'\n')
