import sys,glob,os,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from dictparse import parse_file, Block
repo=sys.argv[1]
fs=sorted(glob.glob(repo+'/data/standards/components/*.dat')); print('records',len(fs))
B=['vaporPressure','idealGasHeatCapacity','liquidHeatCapacity','solidHeatCapacity','liquidViscosity','liquidThermalConductivity','surfaceTension']
cnt=collections.Counter(); models=collections.defaultdict(collections.Counter); win=collections.Counter(); prov=collections.Counter()
for f in fs:
    t=parse_file(f); p=t.get('provenance')
    for b in B:
        v=t.get(b)
        if not isinstance(v,Block): continue
        cnt[b]+=1
        m=v.get('model')
        if m: models[b][m[0]]+=1
        else: models[b]['subblocks:'+'+'.join(k for k,_,_ in v.blocks()) if v.blocks() else 'bare']+=1
        if 'Trange' in v.keys(): win[b]+=1
        if isinstance(p,Block) and isinstance(p.get(b),Block): prov[b]+=1
for b in B: print(b,cnt[b],dict(models[b]),'Trange',win[b],'prov',prov[b])
