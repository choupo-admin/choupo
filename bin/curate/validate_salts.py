import re, math, json, sys, os
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','data','standards','electrolyte')

def parse_block(fn, key):
    rows=[]
    for m in re.finditer(r'\{([^}]*)\}', open(f'{ROOT}/{fn}').read()):
        d={}
        for kv in re.finditer(r'(\w+)\s+("?[^;"]*"?)\s*;', m.group(1)):
            d[kv.group(1)]=kv.group(2).strip('"')
        if key in d: rows.append(d)
    return rows

ions={r['species']:int(r['z']) for r in parse_block('ions.dat','species')}
pairs={(r['cation'],r['anion']):r for r in parse_block('pairs.dat','cation')}

def gamma_pm(c,a,m):
    p=pairs[(c,a)]
    zc=ions[c]; za=-ions[a]
    g=math.gcd(zc,abs(za)); nu_c=abs(za)//g; nu_a=zc//g; nu=nu_c+nu_a
    b0=float(p['beta0']); b1=float(p['beta1']); b2=float(p.get('beta2',0))
    Cphi=float(p['Cphi']); a1=float(p.get('alpha1',2)); a2=float(p.get('alpha2',12))
    A=0.3915; b=1.2
    I=0.5*(nu_c*zc*zc+nu_a*za*za)*m; sI=math.sqrt(I)
    fg=-A*(sI/(1+b*sI)+(2/b)*math.log(1+b*sI))
    def h(al,be):
        if be==0: return 0.0
        aI=al*al*I; asI=al*sI
        return (2*be/aI)*(1-(1+asI-0.5*aI)*math.exp(-asI))
    Bg=2*b0+h(a1,b1)+h(a2,b2); Cg=1.5*Cphi
    ln=abs(zc*za)*fg + m*(2*nu_c*nu_a/nu)*Bg + m*m*(2*(nu_c*nu_a)**1.5/nu)*Cg
    return math.exp(ln)

if __name__=='__main__' and len(sys.argv)==1:
    print("self-check vs C++ op:")
    print(f"  NaCl  gamma(1)={gamma_pm('Na','Cl',1.0):.4f}  (C++ 0.6572)")
    print(f"  CaCl2 gamma(1)={gamma_pm('Ca','Cl',1.0):.4f}  (C++ 0.4985)")
    print(f"  NaCl  gamma(3)={gamma_pm('Na','Cl',3.0):.4f}  (C++ 0.7140)")
