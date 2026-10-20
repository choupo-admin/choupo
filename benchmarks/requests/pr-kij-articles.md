# Peng-Robinson kij: primary articles requested (C123, phase 1b)

Ruled 2026-10-20 (Vitor): the kij of the Peng-Robinson benchmarks come from
PRIMARY sources only; this list says which articles to obtain.  Every
citation was checked against an index record (Crossref, OpenAlex, Semantic
Scholar), none from memory.  [abs] = the abstract confirms the content;
[title] = only the title could be read (publisher refused the fetch) -- to
confirm on the PDF.  No kij value is quoted here.

Engine facts the papers must be read against: Choupo's PR takes a CONSTANT
kij per pair from `binaryInteractions`, else 0 announced
(`src/thermo/equationOfState/PR.cpp:341-345`), and uses the 1976 alpha for
every omega (`PR.cpp:59`) -- methanol (omega 0.565) is the one component
where the 1978 form would differ, so a methanol kij source must say which
alpha it was fitted with.

## Case A (Cavett; 15 components, 105 pairs) -- route P (PPR78)

1. All hydrocarbon-hydrocarbon pairs -- Jaubert, Mutelet (2004), Fluid Phase
   Equilib. 224(2):285-304, doi:10.1016/j.fluid.2004.06.059 [title]
2. CO2 with hydrocarbons -- Vitu, Privat, Jaubert, Mutelet (2008), J.
   Supercrit. Fluids 45(1):1-26, doi:10.1016/j.supflu.2007.11.015 [title]
3. CO2 with iC4, iC5 -- Mutelet, Vitu, Privat, Jaubert (2005), Fluid Phase
   Equilib. 238(2):157-168, doi:10.1016/j.fluid.2005.10.001 [title]
4. N2 with hydrocarbons, N2-CO2 -- Privat, Jaubert, Mutelet (2008), Ind. Eng.
   Chem. Res. 47(6):2033-2048, doi:10.1021/ie071524b [abs]
5. H2S with hydrocarbons, H2S-CO2, H2S-N2 -- Privat, Mutelet, Jaubert (2008),
   Ind. Eng. Chem. Res. 47(24):10041-10052, doi:10.1021/ie800799z [abs]

## Case A -- route C cross-checks (constant kij fitted to measured VLE)

6. CH4 with n-C2..n-C10 -- Oba, Suzuki, Tanaka, Nagahama, Hirata (1985), J.
   Japan Petrol. Inst. 28(3):202-209, doi:10.1627/jpi1958.28.202 -- OPEN:
   https://www.jstage.jst.go.jp/article/jpi1958/28/3/28_3_202/_pdf [abs]
7. CO2 with n-paraffins -- Kato, Nagahama, Hirata (1981), Fluid Phase
   Equilib. 7(3-4):219-231, doi:10.1016/0378-3812(81)80009-X [title]
8. CO2 with hydrocarbons -- Deo, Nutakki, Orr (1993), SPE Adv. Technol. Ser.
   1(2):142-151, doi:10.2118/18796-PA [abs]
9. H2S with paraffins -- Carroll, Mather (1995), Fluid Phase Equilib.
   105(2):221-228, doi:10.1016/0378-3812(94)02612-5 [title]
10. Several families (N2-hydrocarbon candidate) -- Nishiumi, Arai, Takeuchi
    (1988), Fluid Phase Equilib. 42:43-62, doi:10.1016/0378-3812(88)80049-9
    [title]

## Case D (methanol from CO2; 8 components, 28 pairs) -- route P

11. H2-CO2, H2-CO, H2-Ar, H2-N2 -- Qian, Jaubert, Privat (2013), J. Supercrit.
    Fluids 75:58-71, doi:10.1016/j.supflu.2012.12.014 [title]
12. CO2-water, H2-water (N2-water) -- Qian, Privat, Jaubert (2013), Ind. Eng.
    Chem. Res. 52:16457-16490, doi:10.1021/ie402541h [abs]
13. CO and Ar groups (CO-CO2, CO-Ar, CO2-Ar; maybe CO-water, Ar-water) --
    Plee, Jaubert, Privat, Arpentinier (2015), J. Petrol. Sci. Eng.
    133:744-770, doi:10.1016/j.petrol.2015.03.025 [title]
14. (optional) O2 group -- Xu, Privat, Jaubert (2015), Ind. Eng. Chem. Res.
    54(38):9494-9504, doi:10.1021/acs.iecr.5b02639 [abs]
15. (optional) consolidated E-PPR78 table -- Xu, Lasala, Privat, Jaubert
    (2017), Int. J. Greenh. Gas Control 56:126-154,
    doi:10.1016/j.ijggc.2016.11.015 [title]

## Case D -- the methanol pairs (no PPR78 group)

16. CO2-methanol -- Joung et al. (2001), Fluid Phase Equilib. 185(1-2):
    219-230, doi:10.1016/S0378-3812(01)00472-1 [title; PR + kij not verified]
17. CO2 in methanol and methanol-water -- Chang, Rousseau (1985), Fluid Phase
    Equilib. 23(2-3):243-258, doi:10.1016/0378-3812(85)90009-3 [title]
18. H2, N2, CH4, CO, CO2 with methanol (measured VLE) -- Brunner,
    Hueltenschmidt, Schlichthaerle (1987), J. Chem. Thermodyn. 19(3):273-291,
    doi:10.1016/0021-9614(87)90135-2 [title]
19. CO2-methanol at 25 C (data) -- Katayama, Ohgaki, Maekawa, Goto, Nagano
    (1975), J. Chem. Eng. Japan 8(2):89-92, doi:10.1252/jcej.8.89 -- OPEN:
    https://www.jstage.jst.go.jp/article/jcej1968/8/2/8_2_89/_pdf [abs]

Still without a verified primary PR kij source: methanol-water, H2-methanol,
CO-methanol, Ar-methanol (and CO2-methanol until 16/17 are read).  Fallback:
Choupo's own regression to measured data (item 18; the ThermoML
methanol-water series curate04 uses), which needs a high-pressure solubility
residual in `fitParameters` -- Vitor's decision.

Minimum to obtain for route P: items 1-5 (case A) and 11-13 + 16-18 (case D);
6 and 19 are open access.

## Kinetics (cases D and E), verified on Crossref 2026-10-20

20. Methanol synthesis + water-gas shift on Cu/ZnO/Al2O3 (case D) --
    Vanden Bussche, Froment (1996), J. Catal. 161:1-10,
    doi:10.1006/jcat.1996.0156
21. Methane steam reforming, methanation and water-gas shift (case E) --
    Xu, Froment (1989), AIChE J. 35(1):88-96, doi:10.1002/aic.690350109
