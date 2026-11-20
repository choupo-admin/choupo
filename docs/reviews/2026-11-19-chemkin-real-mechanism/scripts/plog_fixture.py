"""Build the PLOG numerical fixture (NOT chemistry) from the local LLNL H2 files.
usage: plog_fixture.py outdir mech.txt   -- writes mech_norev.txt (control) and mech_plog.txt (R1 as PLOG)"""
import re, sys, os
MECH = sys.argv[2]   # path of h2_v1b_mech.txt (local, never committed)
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
lines = open(MECH).read().split("\n")
norev, plog = [], []
skip_rev = False
for ln in lines:
    if re.match(r"\s*rev\s*/", ln, re.I):
        continue
    norev.append(ln)
    plog.append(ln)
txt_n = "\n".join(norev)
open(out + "/mech_norev.txt", "w").write(txt_n)
# R1 h+o2 = o+oh 1.915E+14 0.00 1.644E+04  ->  PLOG: 0.5 atm x0.6, 1.5 atm x1.0, 3 atm x1.6
A, b, Ea = 1.915e14, 0.0, 1.644e4
old = "   h+o2 = o+oh    1.915E+14   0.00  1.644E+04"
assert old in txt_n
new = (old + "\n   PLOG / 0.5 %.6E %.2f %.4E /\n   PLOG / 1.5 %.6E %.2f %.4E /\n   PLOG / 3.0 %.6E %.2f %.4E /"
       % (0.6 * A, b, Ea, 1.0 * A, b, Ea, 1.6 * A, b, Ea))
open(out + "/mech_plog.txt", "w").write(txt_n.replace(old, new))
