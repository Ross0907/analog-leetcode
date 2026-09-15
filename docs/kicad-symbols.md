# Official KiCad symbol presentation

AnaCode's symbol artwork is exported by the official **KiCad 9.0.9** CLI from
the KiCad community's symbol library **9.0.9**, revision
[`ad36cd14bcd1b1cd0484f629ccdd3481366f74f3`](https://gitlab.com/kicad/libraries/kicad-symbols/-/tree/ad36cd14bcd1b1cd0484f629ccdd3481366f74f3).
The browser receives static SVG artwork and pin coordinates. CircuitJS retains
the electrical editor, connectivity, component models and solver.

The human-readable collection and credit page is
[`public/kicad/NOTICE.html`](../public/kicad/NOTICE.html), served at
`/kicad/NOTICE.html`. It links each of the 21 display SVGs, original exports and
unmodified upstream library inputs. Keep the page, source files and original
[`LICENSE.md`](../public/kicad/LICENSE.md) with the artwork. This redistributed
collection is **CC-BY-SA 4.0 with the KiCad library exception**, attributed to the
KiCad community; AnaCode's root MIT license does not replace those terms.

## Collection and terminal identities

| Official library | Symbols | Display terminals |
|---|---|---|
| `Device` | `R`, `R_US`, `C`, `C_Polarized`, `L`, `D`, `D_Zener`, `LED`, `Battery` | 2 each |
| `Device` | `Q_NPN`, `Q_PNP` | B, C, E |
| `Device` | `Q_NMOS`, `Q_PMOS` | G, D, S |
| `Simulation_SPICE` | `NMOS`, `PMOS` | G, D, S |
| `Simulation_SPICE` | `VDC`, `IDC` | 1 positive, 2 negative |
| `Simulation_SPICE` | `OPAMP` | +, −, V+, V−, output |
| `Amplifier_Operational` | `LM2904`, unit 1 | 3 positive input, 2 negative input, 1 output |
| `power` | `GND` | 1 |
| `Switch` | `SW_SPST` | 1, 2 |

The generic transistor names above are the actual names in this pinned library;
older suffix-based names such as `Q_NMOS_GDS` are not used. Diodes have terminal
1 = cathode (K), terminal 2 = anode (A). Terminal identity must be preserved when
mapping artwork onto CircuitJS posts; array order alone is not a pin contract.

The native three-terminal amplifier uses the **LM2904 unit-1 graphic**, whose
power unit is separate. This is a presentation choice, **not an LM2904 device
model claim**. The five-terminal SPICE OPAMP remains a distinct asset and must
not be used as a three-terminal symbol by discarding supply connections.

## Native export and modifications

[`scripts/build-kicad-symbols.py`](../scripts/build-kicad-symbols.py) invokes
`kicad-cli sym export svg --black-and-white --symbol ...` for every selected
symbol. It produces:

- `public/kicad/stock/`: native exports with the original display fields.
- `public/kicad/svg/`: native exports with reference/value fields and
  non-semantic pin labels hidden, retaining the op-amp's + and − markings.
- `public/kicad/symbols.json`: version, revision, input/output hashes, view boxes
  and terminal metadata for all 21 symbols.
- `public/kicad/source/`: unmodified pinned library inputs and upstream license.

The build-only, hash-pinned `sexpdata` library reads metadata and adjusts field
visibility in an export-only copy. KiCad renders every symbol primitive. A tiny
temporary circle at the source origin identifies the exact translation chosen
by KiCad's exporter; the script removes that circle after export. SVG title
timestamps are normalized so repeated exports can have stable hashes. No
schematic parser, electrical backend or alternative symbol renderer is shipped
from this build script.

`pins[].x/y` are electrical endpoints in SVG coordinates.
`pins[].bodyX/bodyY` are the points where the original pin leads meet the body.
`sourceX/sourceY`, `length`, and `angle` preserve upstream millimeter metadata.
The SVG Y axis points down and the library Y axis points up. The audit confirms
that all **51 terminal anchors** meet paths in the actual exported artwork.
`renderer.js` is separately maintained application integration code and is not
part of the generated SVG/source hash inventory.

## Export evidence and rebuilding

The shipped assets came from successful GitHub Actions run
[`35021795924`](https://github.com/Ross0907/analog-leetcode/actions/runs/35021795924),
at AnaCode commit `46b33182dd2b3e57d8cc449dfb57ac53fd1c0bad`. The downloaded
`official-kicad-symbols` artifact was checked before its SVGs and manifest were
copied into the application.

The workflow installs the official KiCad PPA's Ubuntu 24.04 package
`9.0.9~ubuntu24.04.1`, verifies package SHA-256
`b7e6d33867631dc44385067b703b4c39eadede2037a260790b19495fe17e43f0`,
and verifies each library input against the pinned hashes. It uses an isolated
KiCad configuration and the pinned requirements in
[`scripts/kicad-export-requirements.txt`](../scripts/kicad-export-requirements.txt).

Re-run the
[`Export official KiCad symbols` workflow](../.github/workflows/build-kicad-symbols.yml)
or, with the exact KiCad CLI and pinned Python requirements installed:

```sh
python3 scripts/build-kicad-symbols.py
node scripts/audit-kicad-symbols.mjs
```

`--prepare-only` verifies source hashes and selected symbol/pin metadata without
requiring the KiCad CLI. It does not generate substitute SVGs.

Changes to the exporter after the recorded run only add read-only pin endpoint
verification and place temporary exports in the project's `.tmp/kicad-export/`
directory with a path check. They do not change library selection, visibility,
CLI arguments, geometry, coordinate calculations or SVG serialization. The new
verification also passes against every shipped SVG, so those changes do not
require regenerating the assets. Any future change to an export input or output
transformation requires a fresh native export and review of the hashes.

The audit checks all SVG and source hashes, source revision, KiCad version,
license/credit materials, view boxes, pin coordinates, lead lengths and the
three-terminal MOS/op-amp contracts. It rejects missing or unexpected generated
files. Run it as part of the simulator provenance checks before release.
