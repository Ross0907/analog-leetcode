Standard simulation model sources

lm741.lib: National Semiconductor LM741 macro-model, distributed by Texas
Instruments as SNOM211B. The original copyright and distribution notice are
preserved in the file. https://www.ti.com/product/LM741
Download: https://www.ti.com/lit/zip/SNOM211

1n4148.mod, bc546b.lib, bc556b.lib, irfp240.mod, irfp9240.mod:
ngspice project's public basic model-parameter collection. Original files and
their model comments are preserved verbatim.
https://ngspice.sourceforge.io/modelparams.html
https://ngspice.sourceforge.io/model-parameters/basic_models.7z

Fetched 2026-10-02. lm741-ngspice.lib expands the two affine POLY(1) statements
into standard linear controlled sources plus independent offset sources:
EOS = 1 mV + V(16,49); F6 = 450 uA + I(V6). This exact algebraic translation
avoids requiring XSPICE in the browser build; no model parameter is changed.
bc556b-ngspice.lib omits the collection's LTspice catalogue metadata fields
(Vceo rating, Icrating rating and mfg name); all device-equation parameters stay.
The original vendor file remains available separately. The TypeScript registry
removes comments and blank lines only from these runtime files. Model choice
applies to ngspice analysis. CircuitJS's live solver retains its native device
model. These models describe nominal behavior and do not certify a physical
device or guarantee all process, temperature, load, or supply corners.
