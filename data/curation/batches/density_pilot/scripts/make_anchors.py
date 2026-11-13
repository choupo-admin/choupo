#!/usr/bin/env python3
"""Pick the twelve printed anchor values of Wagner & Pruss (2002) that stay in
git (d1_anchors.tsv) from the regenerated d1_water_iapws95.tsv: the density
maximum near 4 C (saturated liquid 273.16, 276, 278 K), the ends of the 1 bar
isobar, the 50 MPa isobar, and 298 K."""
import os
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
want = {("sat", 273.16, None), ("sat", 276.0, None), ("sat", 278.0, None), ("sat", 298.0, None),
        ("iso", 275.0, 0.1), ("iso", 280.0, 0.1), ("iso", 285.0, 0.1), ("iso", 372.756, 0.1),
        ("iso", 275.0, 50.0), ("iso", 295.0, 50.0), ("iso", 300.0, 50.0), ("iso", 370.0, 50.0)}
out = []
for i, l in enumerate(open(os.path.join(H, "d1_water_iapws95.tsv"))):
    f = l.rstrip("\n").split("\t")
    if i == 0:
        out.append(l.rstrip("\n"))
        continue
    k, T, P = f[0], float(f[1]), float(f[2])
    if (k, T, None if k == "sat" else P) in want:
        out.append(l.rstrip("\n"))
open(os.path.join(H, "d1_anchors.tsv"), "w").write(
    "# Wagner & Pruss (2002), J. Phys. Chem. Ref. Data 31, 387-535: printed densities (Table 13.1 saturated liquid, 13.2 isobars), table and journal page per row\n"
    + "\n".join(out) + "\n")
print(len(out) - 1, "anchors")
