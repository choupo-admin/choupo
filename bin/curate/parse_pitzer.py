import re, sys

txt = open('pitzer.dat', encoding='utf-8', errors='replace').read().splitlines()

def charge_of(sp):
    m = re.search(r'([+-])(\d*)$', sp)
    if not m: return 0
    sign = 1 if m.group(1)=='+' else -1
    mag = int(m.group(2)) if m.group(2) else 1
    return sign*mag

# --- master species: MW (gfw) where available -------------------------------
mw = {}
inms=False
for ln in txt:
    if ln.startswith('SOLUTION_MASTER_SPECIES'): inms=True; continue
    if inms and ln.startswith('SOLUTION_SPECIES'): break
    if inms:
        p=ln.split()
        if len(p)>=5 and re.match(r'^[A-Za-z]', p[0]):
            sp=p[1]
            try: mw[sp]=float(p[-1])
            except: pass

# --- PITZER blocks ----------------------------------------------------------
blocks={'-B0':{}, '-B1':{}, '-B2':{}, '-C0':{}}
cur=None; inpz=False
for ln in txt:
    s=ln.strip()
    if ln.startswith('PITZER'): inpz=True; continue
    if inpz and re.match(r'^[A-Z]', ln) and not ln.startswith('PITZER'): inpz=False
    if not inpz: continue
    if s.startswith('-'):
        kw=s.split()[0]; cur=kw if kw in blocks else None; continue
    if cur and s and not s.startswith('#'):
        # strip inline comment, capture ref
        ref=''
        m=re.search(r'#\s*ref\.\s*(\d+)', ln)
        if m: ref='ref'+m.group(1)
        body=re.split(r'#', ln)[0].split()
        if len(body)<3: continue
        cat,an = body[0], body[1]
        try: val=float(body[2])
        except: continue
        blocks[cur][(cat,an)] = (val, ref)

# --- ion set from all pairs + masters ---------------------------------------
ions=set(mw)
for b in blocks.values():
    for (c,a) in b: ions.add(c); ions.add(a)
ions={i for i in ions if charge_of(i)!=0}  # keep charged species only

with open('ions.tsv','w') as f:
    f.write('species\tcharge\tMW\n')
    for sp in sorted(ions, key=lambda s:(charge_of(s)<0, s)):
        f.write(f'{sp}\t{charge_of(sp):+d}\t{mw.get(sp,"")}\n')

# --- merge pairs across B0/B1/B2/C0 (cation = +, anion = -) ------------------
pairkeys=set(blocks['-B0'])|set(blocks['-B1'])|set(blocks['-B2'])|set(blocks['-C0'])
rows=[]
for (c,a) in pairkeys:
    # orient: cation first (positive charge)
    if charge_of(c)<0 and charge_of(a)>0: c,a=a,c
    if not(charge_of(c)>0 and charge_of(a)<0): continue   # only cation-anion binaries
    def get(bk):
        return blocks[bk].get((c,a)) or blocks[bk].get((a,c))
    b0=get('-B0'); b1=get('-B1'); b2=get('-B2'); c0=get('-C0')
    ref = (b0 and b0[1]) or (b1 and b1[1]) or (c0 and c0[1]) or 'ref1'
    rows.append((c,a,
        b0[0] if b0 else 0.0, b1[0] if b1 else 0.0,
        b2[0] if b2 else 0.0, c0[0] if c0 else 0.0, ref or 'ref1'))
rows.sort()
with open('pairs.tsv','w') as f:
    f.write('cation\tanion\tbeta0\tbeta1\tbeta2\tCphi\tref\n')
    for r in rows: f.write('\t'.join(map(str,r))+'\n')

print(f'ions: {len(ions)}   cation-anion pairs: {len(rows)}')
print('--- sample ions ---'); print(open("ions.tsv").read())
print('--- sample pairs (NaCl, CaCl2, MgSO4 check) ---')
for ln in open('pairs.tsv'):
    if ln.split('\t')[:2] in (['Na+','Cl-'],['Ca+2','Cl-'],['Mg+2','SO4-2'],['cation','anion']): print(ln.rstrip())

# --- refinement pass: alphas per charge type + citation mapping --------------
CITE = {
 'ref1':'Appelo, Parkhurst & Post, Geochim. Cosmochim. Acta 125 (2014) 49',
 'ref3':'Appelo, Appl. Geochem. 55 (2015) 62',
 'ref4':'Appelo, Cem. Concr. Res. 101 (2017) 102',
}
def alphas(zc, za):
    a1 = 1.4 if (abs(zc)>=2 and abs(za)>=2) else 2.0
    return a1, 12.0
import csv
out=[]
for ln in open('pairs.tsv'):
    p=ln.rstrip('\n').split('\t')
    if p[0]=='cation' or len(p)<7: continue
    c,a,b0,b1,b2,cphi,ref=p
    if c=='e-' or a=='e-': continue
    a1,a2=alphas(charge_of(c),charge_of(a))
    out.append((c,a,b0,b1,b2,cphi,a1,a2,CITE.get(ref,CITE['ref1'])))
with open('pairs_final.tsv','w') as f:
    f.write('cation\tanion\tbeta0\tbeta1\tbeta2\tCphi\talpha1\talpha2\tsource\n')
    for r in out: f.write('\t'.join(map(str,r))+'\n')
print(f'final pairs (e- excluded): {len(out)}')
print('--- 2:2 pairs (alpha1=1.4) ---')
for r in out:
    if r[6]==1.4: print(f'  {r[0]:8} {r[1]:8} b0={r[2]} b1={r[3]} b2={r[4]} Cphi={r[5]}')
