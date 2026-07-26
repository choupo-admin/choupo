import re, os
_R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','data','standards','electrolyte')
def safe(n):
    return re.sub(r'[+-]\d*$','',n).replace('(','').replace(')','')
MW={'Na':22.990,'Cl':35.453,'Ca':40.078,'Mg':24.305,'K':39.098,'Br':79.904,
 'Li':6.941,'Sr':87.62,'Ba':137.327,'Fe':55.845,'Mn':54.938,'H':1.008,
 'SO4':96.06,'CO3':60.01,'HCO3':61.02,'HSO4':97.07,'OH':17.007,'BOH4':78.84,'MgOH':41.31}

ions=[]
for l in open('ions.tsv').read().splitlines()[1:]:
    sp,z,mw=l.split('\t')
    if sp=='e-': continue
    s=safe(sp); ions.append((s,sp,int(z),MW.get(s,'')))
ions.sort(key=lambda r:(r[2]<0,r[0]))
with open(os.path.join(_R,'ions.dat'),'w') as f:
    f.write('/*---------------------------------------------------------------------------*\\\n')
    f.write('  Choupo electrolyte catalogue --- IONS (species, charge, molar mass).\n\n')
    f.write('  Source: USGS PHREEQC pitzer.dat (public domain). `species` is a dict-safe\n')
    f.write('  key (no +/-/parentheses); `ion` is the chemical form; `z` the charge.\n')
    f.write('  Polyatomic-ion MW is the ION mass (PHREEQC lists element gfw, e.g. 32.064\n')
    f.write('  for S not 96.06 for SO4 --- corrected); a few complex ions: MW pending.\n')
    f.write('\\*---------------------------------------------------------------------------*/\n\n')
    f.write('ions\n(\n')
    for s,sp,z,mw in ions:
        mwf=f' MW {mw};' if mw!='' else ''
        f.write(f"    {{ species {s}; ion \"{sp}\"; z {z:+d};{mwf} }}\n")
    f.write(');\n')

seen=set(); out=[]
for l in open('pairs_final.tsv').read().splitlines()[1:]:
    c,a,b0,b1,b2,cphi,a1,a2,src=l.split('\t')
    k=(safe(c),safe(a))
    if k in seen: continue
    seen.add(k); out.append((safe(c),safe(a),b0,b1,b2,cphi,a1,a2,src))
out.sort()
with open(os.path.join(_R,'pairs.dat'),'w') as f:
    f.write('/*---------------------------------------------------------------------------*\\\n')
    f.write('  Choupo electrolyte catalogue --- PITZER cation-anion parameters (25 C base).\n\n')
    f.write('  Source: USGS PHREEQC pitzer.dat (public domain); values from Appelo et al.\n')
    f.write('  (Geochim. Cosmochim. Acta 125 (2014) 49; Appl. Geochem. 55 (2015) 62).\n')
    f.write('  alpha1 = 1.4 for 2:2 salts (beta2 active), else 2.0; alpha2 = 12.\n')
    f.write('  25 C base only (the file T,P coefficients are deferred). Per-row gamma_pm\n')
    f.write('  validation (AAD vs literature) is recorded by the curation swarm.\n')
    f.write('\\*---------------------------------------------------------------------------*/\n\n')
    f.write('pairs\n(\n')
    for c,a,b0,b1,b2,cphi,a1,a2,src in out:
        f.write(f'    {{ cation {c}; anion {a}; beta0 {b0}; beta1 {b1}; beta2 {b2}; Cphi {cphi}; alpha1 {a1}; alpha2 {a2}; source "{src}"; }}\n')
    f.write(');\n')
print(f'ions.dat: {len(ions)}   pairs.dat: {len(out)} (deduped)')
