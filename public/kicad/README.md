# Official KiCad symbol artwork

These display assets originate from the KiCad community's official symbol
library release **9.0.9**, commit
`ad36cd14bcd1b1cd0484f629ccdd3481366f74f3`:
https://gitlab.com/kicad/libraries/kicad-symbols

The unmodified library inputs and their original license are included in
`source/`. The collection is licensed under **CC-BY-SA 4.0 with the KiCad library
exception**; see `LICENSE.md`. Attribution: KiCad community / KiCad Libraries.
The application code has its own license; this directory's library collection
retains the upstream asset license.

Run `scripts/build-kicad-symbols.py` with official `kicad-cli` **9.0.9** to rebuild.
The `Export official KiCad symbols` GitHub workflow installs the exact official
Ubuntu package and verifies its SHA-256 before exporting. The build-only
`sexpdata` dependency is version/hash pinned in
`scripts/kicad-export-requirements.txt`. No parser is shipped in the browser.

`stock/` contains KiCad's native SVG export with the original display fields.
`svg/` contains display variants exported by the same CLI after hiding reference,
value, and non-semantic pin labels. The op-amp's + and - labels are preserved.
No symbol primitives are drawn or replaced by the export script.

An export-only circle at the symbol origin identifies KiCad's exact SVG
translation. The circle is removed after export. It is not part of the shipped
artwork. The export timestamp in each SVG title is normalized for reproducible
hashes. These changes and the original input hashes are recorded in
`symbols.json` alongside each SVG's hash.

The manifest maps source IDs to SVG paths, view boxes and original pin identities.
`pins[].x/y` are the electrical pin endpoints in SVG coordinates;
`pins[].bodyX/bodyY` are the points where each pin lead meets the body.
`sourceX/sourceY`, `length` and `angle` retain KiCad's original millimeter metadata.
The SVG axis points down; KiCad's source symbol Y axis points up.

`Amplifier_Operational:LM2904` uses **unit 1**, a three-terminal amplifier graphic.
The separate power unit is not exported for this display. This artwork does not
change CircuitJS's op-amp model or claim that the simulated component is an
LM2904 device model. The five-terminal `Simulation_SPICE:OPAMP` is retained as a
separate asset with all five pin identities and must not be mapped as a
three-terminal device.

`renderer.js` is application integration code maintained separately from these
generated assets. It is excluded from the generated SVG/source hash inventory.
