"""Build steam01's reference CSV from the case's OWN expected file (digits copied from
IAPWS R7-97(2012) Tables 5, 15, 35, 36 by the case's author) -- nothing typed here."""
import re, sys
base = 'tutorials/props/steam/steam01_if97_verification/'
exp = {}
for line in open(base + 'expected'):
    if line.lstrip().startswith('#') or not line.strip():
        continue
    f = line.split()
    if f[0] != 'diag':
        continue
    exp[(f[1], f[2])] = f[3]          # keep the text: no float round trip

# (id, kind, T_K, P_MPa) as the propsDict declares the points
states = [
    ('r1_T300_p3MPa', 'T5', '300', '3'), ('r1_T300_p80MPa', 'T5', '300', '80'),
    ('r1_T500_p3MPa', 'T5', '500', '3'),
    ('r2_T300_p3p5kPa', 'T15', '300', '0.0035'), ('r2_T700_p3p5kPa', 'T15', '700', '0.0035'),
    ('r2_T700_p30MPa', 'T15', '700', '30'),
]
cols = ['v', 'h', 'u', 's', 'cp', 'w']
out = ['id,kind,T_K,P_MPa,v_m3kg,h_kJkg,u_kJkg,s_kJkgK,cp_kJkgK,w_ms,psat_MPa']
for sid, kind, T, P in states:
    vals = [exp[(sid, c)] for c in cols]
    out.append(','.join([sid, kind, T, P] + vals + ['']))
# Table 35: psat at 300 K and 500 K (the psat_MPa pins of the region-1 points)
for sid, T in (('r1_T300_p3MPa', '300'), ('r1_T500_p3MPa', '500')):
    out.append(','.join([sid + '_psat', 'T35', T, '', '', '', '', '', '', '', exp[(sid, 'psat_MPa')]]))
# Table 36: Tsat at 0.1 / 1 / 10 MPa -- the saturation point (T = Tsat, psat = p)
for sid, P in (('isobar_1bar', '0.1'), ('isobar_1MPa', '1'), ('isobar_10MPa', '10')):
    out.append(','.join([sid + '_Tsat', 'T36', exp[(sid, 'Tsat_K')], P, '', '', '', '', '', '', P]))
hdr = '''# The computer-program verification values of IAPWS R7-97(2012) (the IAPWS-IF97 release),
#   as this case's own `expected` file carries them (each value there was copied digit for
#   digit from the release's tables; this file is WRITTEN from that file, nothing is retyped):
#   kind T5  = Table 5, region 1 (liquid): v [m3/kg], h, u [kJ/kg], s, cp [kJ/(kg K)], w [m/s]
#   kind T15 = Table 15, region 2 (vapour): the same six properties
#   kind T35 = Table 35, the saturation pressure psat [MPa] at T = 300 K and 500 K
#   kind T36 = Table 36, the saturation temperature at p = 0.1, 1, 10 MPa
#              (T_K carries Tsat, psat_MPa the pressure, so a row is one point of the saturation line)
#   P_MPa of the 3.5 kPa rows is 0.0035.  cv is NOT in the release's tables and is not here.
#   The release itself was not re-read for this file; see the case README.
'''
open(base + 'constant/reference/iapws_if97_verification.csv', 'w').write(hdr + '\n'.join(out) + '\n')
print('\n'.join(out))
