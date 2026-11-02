start: tutorials/steady/flash/flash01_benzene_toluene
allowed: system/flowsheetDict, system/controlDict
expect: unsupported
check: system/flowsheetDict absent /pack|hetp|pall|bedHeight/
feedback: Replace the flash by a packed-bed distillation column with 3 m of Pall-ring packing, and give me the HETP and the pressure drop per metre of packing.
# Problem 16 (REVISION, a request Choupo cannot satisfy)
Start case: tutorials/steady/flash/flash01_benzene_toluene. Choupo has no packed-column model (distillation is by equilibrium stages; no packing, HETP or packing pressure-drop key exists). Correct behaviour: say so in the REVISIONS entry, propose a labelled equilibrium-stage approximation (or leave the flash), and invent no key. The case must still solve.
