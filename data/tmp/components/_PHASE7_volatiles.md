# PHASE 7 — volatile / bio-based pure-component VLE data

Scope: the 7 volatile candidates only — `limonene, alphaPinene, HMF,
furfurylAlcohol, gammaValerolactone, levulinicAcid, nPropanol`.
Nothing outside `data/tmp/components/` touched. No promotion to standards.

Method: web SEARCH budget was exhausted at session start, so no discovery
searches were possible. Every value below was retrieved by **WebFetch on
individual NIST WebBook phase-change / thermochemistry pages, reading the
PRIMARY each names** (never a WebBook average), plus the DOI the WebBook prints.
Where NIST exposes only an average or a subscription-gated page, the value is
left as a declared gap — no digit was invented.

Hard rules honoured: no fabricated number or citation; a WebBook AVERAGE is
never used as a datum; no stored derivative (dHf kept on its measured phase,
ideal-gas shown only as a `derived{}` block); page/volume digits not actually
read are marked as such rather than guessed.

---

## Per-file status

### nPropanol — the only near-complete file; most improved
Primary-cited now:
- **Tc = 536.71 K** — Ambrose & Townsend, *J. Chem. Soc.* (1963) 3614-3625
  (direct critical-point determination; replaces the file's earlier NIST 20-value
  average). `measured`.
- **Vc = 2.18e-4 m3/mol** (0.218 L/mol) — Gude & Teja, *J. Chem. Eng. Data* 40
  (1995) 1025-1036. The single primary NIST names for Vc (not an average). NEW.
- **Antoine** (4.87601 / 1441.629 / -74.299, 333-378 K) — Ambrose & Sprake,
  *J. Chem. Thermodyn.* 2(5) (1970) 631-645. Full pages resolved.
- **Tb = 370.30 K** — `derived` from that Antoine set at 1.01325 bar (window brackets Tb).
- **dHf(298, LIQUID) = -302.54 kJ/mol** — Mosselman & Dekker, *J. Chem. Soc.
  Faraday Trans. 1* (1975) 417-424. Combustion; lowest-uncertainty primary NIST
  lists. Replaces the dropped ideal-gas 7-value average. `measured`, pure-liquid rung.
- **s(298, LIQUID) = 192.8 J/mol/K** — Counsell, Lees & Martin, *J. Chem. Soc. A*
  (1968) (page range not read). Third-law. Now the block sits on ONE consistent
  measured liquid rung.
- **ideal-gas dHf = -255.09 kJ/mol** — shown ONLY as a `derived{}` block
  (dHf(liq) + dvapH298), never stored as the datum; carries its dvapH input's flag.
- **Cp,liquid(298.15) = 143.96 J/mol/K** — Tanaka, Toyama & Murakami,
  *J. Chem. Thermodyn.* 18 (1986) 63-73. Replaces the earlier source-less 144.0. NEW primary.

Still flagged / gap:
- **Pc** — NIST exposes only a 12-value average (barred). Readable primaries named
  as the route: Ambrose & Townsend 1963 or Gude & Teja 1995 (both paywalled, not read).
- **omega** — the Poling compilation value 0.620 is rejected; derivable from
  Antoine+Tc+Pc once Pc is staged.
- **Cp,ideal-gas polynomial** — still a Poling compilation fit; in-range primary
  Stromsoe et al. 1970 (*J. Chem. Eng. Data* 15, 286-290) named as the re-fit route.
- **HvapTb = 41.44 kJ/mol** — Majer & Svoboda 1985 (evaluated compilation), flagged.

### limonene
Primary-cited now:
- **dHf(298, LIQUID) = -54.52 kJ/mol** — Hawkins & Eriksen, *J. Am. Chem. Soc.* 76
  (1954) 2669-2676 (combustion), Cox & Pilcher (1970) reanalysis. Full citation resolved.
- **dvapH(298) = 49.5 kJ/mol** table point — Clara, Marigliano & Solimo,
  *J. Chem. Eng. Data* 54(3) (2009) 1087-1090. Full citation resolved.
Still gap: **Tc, Pc, omega, Tb, Antoine, Cp,ideal-gas** — none on any open primary
retrievable this session (Steele/Chirico 2002 is the paywalled route; s_298 also missing,
so the thermochemistry block is not yet loadable).

### alphaPinene
Primary-cited now:
- **Antoine** (3.92161 / 1411.869 / -68.817) — Hawkins & Armstrong, *J. Am. Chem.
  Soc.* 76(14) (1954) 3756-3759. Full citation resolved (was "unresolved"). Tb=429.4 K derived from it.
- **dHf(298, LIQUID) = -16.4 kJ/mol** — Hawkins & Eriksen, *J. Am. Chem. Soc.* 76
  (1954) 2669-2676 (combustion), Cox & Pilcher (1970). NEW — fills the old gap and
  CORRECTS the wrong "~ -32 kJ/mol range" prose (never a value).
- **dvapH(298) = 44.6 kJ/mol** — An, Hu, Wang, Wu & Zou, *Acta Phys.-Chim. Sin.*
  3(6) (1987) 668-671; alt. Clara 2009 45.4 kJ/mol (not merged). Full citations resolved.
Still gap: **Tc, Pc, omega, Cp,ideal-gas, s_298** — no open primary; Joback poor for a
bridged bicyclo[3.1.1], so Choupo's estimator is not a legitimate fallback either.

### gammaValerolactone (GVL)
Primary-cited now:
- **dHf(298, LIQUID) = -461.3 kJ/mol** — Leitao, Pilcher, Meng-Yan, Brown & Conn,
  *J. Chem. Thermodyn.* 22 (1990) 885-891 (combustion). NEW — fills the old gap.
- **Antoine** — Stull, *Ind. Eng. Chem.* 39(4) (1947) 517-540. Full pages resolved.
- **dvapH = 53.9 kJ/mol, 276-350 K** — Emel'yanenko, Kozlova et al.,
  *J. Chem. Thermodyn.* 40(6) (2008) 911-916 (gas saturation). Full citation resolved.
Still flagged / gap: **Tb = 480.7 K** (Aldrich catalogue 1990 via NIST — vendor, flagged;
corroborated by the Antoine range ceiling); **Tc, Pc, omega, Cp,ideal-gas, s_298** — no
open primary (omega derivable from Antoine+Tc+Pc once Tc/Pc exist).

### levulinicAcid
Primary-cited now:
- **Antoine** — Stull, *Ind. Eng. Chem.* 39(4) (1947) 517-540. Full pages resolved.
- **dHfus = 9.22 kJ/mol** (306.2 K) — Acree, *Thermochim. Acta* 189(1) (1991) 37-56. Resolved.
- **Tfus determinations** — Buechner, *Z. Phys. Chem.* 54 (1906) 665; Berthelot,
  *Thermochimie* (1897). Two disagreeing points (306 / 310 K), kept separate, NOT averaged
  (the earlier invented 308.0 midpoint stays removed).
Still gap: **Tc, Pc, omega, Cp,ideal-gas** — the sanctioned route is `bin/estimate` on the
clean Joback groups already in the file (linear keto-acid); NOT run here (a curation act, and
the group-contribution tables could not be verified against a source this session, so no
number was published rather than risk a wrong one). **standardThermochemistry** — NIST
condensed-phase page is subscription-gated; combustion/formation data exist in the primary
literature (route stated). **acid pKa** still the most consequential missing equilibrium.

### furfurylAlcohol
Primary-cited now:
- **dvapH(298) = 64.4 kJ/mol** — Landrieu, Baylocq & Johnson, *Bull. Soc. Chim.
  France* 45 (1929) 36-49. Full citation resolved.
Still flagged / gap: **Tb = 443 K** (handbook value; free NIST is only a 6-value average
430±70 K, useless as a cross-check); **Antoine, Tc, Pc, omega, Cp,ideal-gas,
standardThermochemistry** — NONE present on free NIST for this compound; TRC/subscription
is the only route named. Least improved of the seven (citation polish only).

### HMF
HMF **decomposes before a normal boiling point** — no Tb invented (stated explicitly).
Primary-cited now (all resolved to one paper):
- **Tfus = 308.5 K, dHfus = 19.8 kJ/mol, dvapH = 83.4 kJ/mol (314-368 K, melt not
  sublimation)** — Verevkin, Emel'yanenko, Stepurko, Ralys, Zaitsau & Stark,
  *Ind. Eng. Chem. Res.* 48(22) (2009) 10087-10093, doi:10.1021/ie901012g. Full citation + DOI resolved.
Still flagged / gap: **standardThermochemistry** — the SAME Verevkin 2009 paper reports
dHf(cr) and dHf(gas), citation now resolved, but the paper is paywalled and the free NIST
condensed page is subscription-gated, so the digits were NOT read; **Tc, Pc, omega, Antoine,
Cp,ideal-gas** absent (decomposition); the reduced-pressure boiling point stays dropped
(only source was the excluded CRC handbook); **solidDensity 1240 kg/m3** stays flagged
(unattributed). Data-poorest file, as before.

---

## Report answers

**Complete gamma-phi set (Antoine + Tc + Pc + omega): 0 of 7.**
The blocker is uniform: **Pc and omega are unavailable from open primaries for every one
of these compounds this session.** Free NIST exposes Pc only as an average (barred) for
nPropanol and carries no Tc/Pc at all for the terpenes, GVL, furfuryl alcohol or HMF; the
terpene/GVL critical data live in paywalled primaries (Steele/Chirico, Ambrose & Townsend,
Gude & Teja) that could not be read, and the web-search budget was exhausted so none could
be located by discovery.

Closest to complete: **nPropanol** — Antoine + Tc + Vc all primary-cited; only Pc + omega
missing (and omega is one derivation away once Pc is read). **alphaPinene, GVL, levulinicAcid**
each carry a full-primary Antoine + Tb but no Tc/Pc/omega. **limonene, furfurylAlcohol** lack
even an Antoine set. **HMF** has no gamma-phi set at all by nature (decomposes).

**Values newly FILLED from a primary this pass:** nPropanol Vc, dHf(liq), s(liq), Cp(liq);
alphaPinene dHf(liq); GVL dHf(liq).
**Citations RESOLVED to a full primary (value already present):** nPropanol Tc / Antoine;
alphaPinene Antoine / dvapH points; limonene dHf / dvapH298; GVL Antoine / dvapH;
levulinicAcid Antoine / dHfus / Tfus sources; furfurylAlcohol dvapH298; HMF Tfus / dHfus /
dvapH (Verevkin 2009 + DOI).

**Constants genuinely unavailable from open primaries (all left as declared gaps, none invented):**
- **Pc and omega** — all 7 (nPropanol's Pc is a NIST average; the rest have no open Tc/Pc).
- **Tc** — limonene, alphaPinene, GVL, furfurylAlcohol, HMF, levulinicAcid.
- **Antoine set** — limonene, furfurylAlcohol (HMF: none exists — decomposition).
- **Ideal-gas Cp polynomial** — all 7 from a primary (nPropanol keeps a compilation fit).
- **s_298** — limonene, alphaPinene, GVL (so their now-filled dHf(liq) blocks are not yet
  loadable); furfurylAlcohol, HMF, levulinicAcid whole thermochemistry.
- **standardThermochemistry** — furfurylAlcohol (nothing open); HMF and levulinicAcid
  (paywalled/subscription-gated, routes named).
