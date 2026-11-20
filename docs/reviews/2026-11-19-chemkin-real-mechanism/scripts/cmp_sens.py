"""Compare Choupo's sensitivity.csv with ct_sensitivity.py's CSV, reaction by reaction
(Choupo reaction k in file order == Cantera reaction index k-1).
usage: cmp_sens.py choupo_sensitivity.csv ct_sens.csv
Acceptance (REPORT.md section 10): the same top 5 and |dS| <= 0.02 wherever |S| > 0.05."""
import csv, sys
ch = {}
for r in csv.DictReader(open(sys.argv[1])):
    ch[r["reaction"]] = (float(r["S"]), float(r["tau_s"]), float(r["tau0_s"]))
ct = [(int(r["index"]), r["equation"], float(r["S"]), float(r["tau_s"]), float(r["tau0_s"]))
      for r in csv.DictReader(open(sys.argv[2]))]
names = sorted(ch)                       # r001.. r021, or the case's own order below
order = list(ch)                         # Choupo's file is sorted by |S|; recover reaction order by name
rows = []
for idx, eq, S_ct, tau_ct, tau0_ct in ct:
    key = "r%03d" % (idx + 1)
    if key not in ch:
        sys.exit("reaction %s not in Choupo csv (use the LLNL-import run, names r001..r021)" % key)
    S_ch = ch[key][0]
    rows.append((key, eq, S_ch, S_ct, S_ch - S_ct))
rows.sort(key=lambda r: -abs(r[3]))
tau0_ch = next(iter(ch.values()))[2]
print("tau0: Choupo %.6f us  Cantera %.6f us  (rel %.2e)" % (tau0_ch * 1e6, ct[0][4] * 1e6, tau0_ch / ct[0][4] - 1))
print("%-5s %-30s %9s %9s %9s" % ("", "reaction", "S Choupo", "S Cantera", "diff"))
for k, eq, a, b, d in rows[:10]:
    print("%-5s %-30s %+9.4f %+9.4f %+9.4f" % (k, eq, a, b, d))
top5_ch = [r[0] for r in sorted(rows, key=lambda r: -abs(r[2]))[:5]]
top5_ct = [r[0] for r in rows[:5]]
big = [r for r in rows if abs(r[3]) > 0.05]
worst = max(rows, key=lambda r: abs(r[4]))
worst_big = max(big, key=lambda r: abs(r[4]))
print("top5 Choupo", top5_ch, "\ntop5 Cantera", top5_ct, "same order:", top5_ch == top5_ct)
print("worst |dS| over all %d reactions: %.5f (%s);  over the %d with |S|>0.05: %.5f (%s)"
      % (len(rows), abs(worst[4]), worst[0], len(big), abs(worst_big[4]), worst_big[0]))
