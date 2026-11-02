start: tutorials/steady/flash/flash01_benzene_toluene
allowed: system/flowsheetDict
check: system/flowsheetDict units[H1].type == heater
check: system/flowsheetDict units[H1].operation.Q == 100 kW
check: system/flowsheetDict units[flash01].in == feedHot
check: system/flowsheetDict units[flash01].operation.T == 370 K
feedback: We want to preheat the feed before the flash. Insert a heater called H1 with a duty of 100 kW between the feed and the flash, name the new stream feedHot, and keep the flash at 370 K and 1 bar.
# Problem 15 (REVISION, structural change)
Start case: tutorials/steady/flash/flash01_benzene_toluene. A unit and a stream are added: flowsheetDict changes, and the new stream feedHot has no 0/ file (the student runs Complete 0/; the harness runs init0). The flash input changes from feed to feedHot.
