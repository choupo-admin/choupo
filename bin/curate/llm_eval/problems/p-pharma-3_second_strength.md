start: tutorials/batch/plant/donepezil01_tablets
allowed: system/postDict, constant/economics
omit: ^(system/layoutDict|0/)
touch: system/postDict
check: system/postDict batchPlan.products[strength10].perYear == 26121 kg
check: system/postDict batchPlan.products[strength5].perYear == 8707 kg
check: system/postDict absent /production \{ perYear/
feedback: Add the 5 mg strength as a second product on the same line. Products: strength10 (the current 10 mg tablet, 90 million a year = 26 121 kg of packaged tablets) and strength5 (60 million a year of 0.145115 g = 8 707 kg), campaigns in the order strength10 then strength5. The 5 mg tablet is the same blend at half the weight (core 0.14 g), so the same 300 kg lot makes twice the tablets: for the 5 mg the tablet press takes 14 h and the packaging line 18 h per lot. The clean between products is 12 h at the coating pan before the 5 mg and 6 h before the 10 mg.
# Problem p-pharma-3 (REVISION, a second product)
Start: donepezil01_tablets (one product). The reference is donepezil02_two_strengths: batchPlan { products ( ... ) campaignOrder ( ... ) }, per-product stage times, changeoverTo, itemMassByProduct on the press and the packaging line. The run must converge.
