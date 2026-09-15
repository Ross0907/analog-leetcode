"""Build display assets with KiCad's own SVG exporter, never a circuit backend.

sexpdata reads library metadata and hides display fields in an export-only copy.
All rendered symbol primitives are produced by the pinned official kicad-cli.
An export-only calibration circle locates the origin and is removed afterward.
No circuit connectivity, netlist generation, or simulation is implemented here.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import subprocess
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import sexpdata

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "kicad"
REVISION = "ad36cd14bcd1b1cd0484f629ccdd3481366f74f3"
BASE = f"https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/{REVISION}/"
KICAD_VERSION = "9.0.9"
SOURCE_HASHES = {
    "Device.kicad_sym": "bf466eecad72ed640dd9a279bce4741c1fcf3d0eecfb07e933c945f7a64744ae",
    "Simulation_SPICE.kicad_sym": "f21604539f20681f3920211ed8ea45da423b9b18c1be85df45f27ac49618b9cb",
    "power.kicad_sym": "541c49bdad55134b5f6379e80c6d18f165c1d9e98ca7df36ad6ec2a316a6d11b",
    "Switch.kicad_sym": "a93607f7bb68bce50996f458d7be86e1e187ac661877548a5119f8b890748fef",
    "Amplifier_Operational.kicad_sym": "79ce7f6aa1f484d848e7c2433cdf4c45c31337cf0be3b0a529ac247e7e06800d",
    "LICENSE.md": "45d2bce75e5a4208f5afb01b8fb2c406e700371c4fe2b5f5cd5c443d46db4d8f",
}
SYMBOLS = {
    "Device": ["R", "R_US", "C", "C_Polarized", "L", "D", "D_Zener", "LED", "Battery", "Q_NPN", "Q_PNP", "Q_NMOS", "Q_PMOS"],
    "Simulation_SPICE": ["NMOS", "PMOS", "OPAMP", "VDC", "IDC"],
    "Amplifier_Operational": ["LM2904"],
    "power": ["GND"],
    "Switch": ["SW_SPST"],
}
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)
MARKER_RADIUS_MM = 0.0123


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def members(node, kind):
    return [part for part in node if isinstance(part, list) and part and str(part[0]) == kind]


def member(node, kind):
    return next(iter(members(node, kind)), None)


def fetch_source(filename):
    destination = OUTPUT / "source" / filename
    data = destination.read_bytes() if destination.exists() else urllib.request.urlopen(BASE + filename, timeout=60).read()
    expected = SOURCE_HASHES.get(filename)
    if not expected or digest(data) != expected:
        raise RuntimeError(f"Upstream source hash mismatch: {filename}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return data


def hidden(node):
    previous = member(node, "hide")
    if previous is not None:
        previous[:] = [sexpdata.Symbol("hide"), sexpdata.Symbol("yes")]
    else:
        node.append([sexpdata.Symbol("hide"), sexpdata.Symbol("yes")])


def body_copy(symbol):
    result = copy.deepcopy(symbol)
    for prop in members(result, "property"):
        effects = member(prop, "effects")
        if effects is not None:
            hidden(effects)
    for kind in ["pin_numbers", "pin_names"]:
        # The op-amp's + and - terminal markings are semantic symbol artwork.
        if kind == "pin_names" and result[1] in ["OPAMP", "LM2904"]:
            continue
        setting = member(result, kind)
        if setting is None:
            setting = [sexpdata.Symbol(kind)]
            result.append(setting)
        hidden(setting)
    container = next((part for part in members(result, "symbol") if str(part[1]).endswith("_0_0")), None)
    if container is None:
        container = [sexpdata.Symbol("symbol"), f"{result[1]}_0_0"]
        result.append(container)
    container.append(sexpdata.loads(f"(circle (center 0 0) (radius {MARKER_RADIUS_MM}) (stroke (width 0.001) (type default)) (fill (type none)))"))
    return result


def source_pins(symbol):
    pins = []
    for unit in members(symbol, "symbol"):
        match = re.search(r"_(\d+)_(\d+)$", str(unit[1]))
        if not match or int(match[1]) not in [0, 1] or int(match[2]) not in [0, 1]:
            continue
        for pin in members(unit, "pin"):
            at = member(pin, "at")
            pins.append({"number": str(member(pin, "number")[1]), "name": str(member(pin, "name")[1]),
                         "sourceX": float(at[1]), "sourceY": float(at[2]), "angle": float(at[3]),
                         "length": float(member(pin, "length")[1])})
    if not pins:
        raise RuntimeError(f"No pins found for {symbol[1]}")
    return pins


def normalize_svg(path, source_id, calibration=False):
    root = ET.fromstring(path.read_bytes())
    viewbox = [float(value) for value in root.attrib["viewBox"].split()]
    width_mm = float(root.attrib["width"].removesuffix("mm"))
    units_per_mm = viewbox[2] / width_mm
    origin = None
    for parent in root.iter():
        for child in list(parent):
            tag = child.tag.split("}")[-1]
            if tag == "title":
                child.text = f"{source_id} — exported by KiCad {KICAD_VERSION}"
            if calibration and tag == "circle" and abs(float(child.attrib["r"]) / units_per_mm - MARKER_RADIUS_MM) < 0.0002:
                if origin is not None:
                    raise RuntimeError(f"Ambiguous origin marker in {source_id}")
                origin = [float(child.attrib["cx"]), float(child.attrib["cy"])]
                parent.remove(child)
    if calibration and origin is None:
        raise RuntimeError(f"KiCad origin marker missing in {source_id}")
    data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    path.write_bytes(data)
    return viewbox, units_per_mm, origin


def build(cli, prepare_only=False):
    libraries = {}
    for library in SYMBOLS:
        libraries[library] = sexpdata.loads(fetch_source(f"{library}.kicad_sym").decode("utf-8"))
    license_data = fetch_source("LICENSE.md")
    (OUTPUT / "LICENSE.md").write_bytes(license_data)
    selected = []
    for library, names in SYMBOLS.items():
        source = libraries[library]
        indexed = {str(symbol[1]): symbol for symbol in members(source, "symbol")}
        for name in names:
            if name not in indexed:
                raise RuntimeError(f"Missing official symbol: {library}:{name}")
            symbol = indexed[name]
            if member(symbol, "extends") is not None:
                raise RuntimeError(f"Select a standalone official symbol instead of alias {library}:{name}")
            selected.append((library, name, symbol, source_pins(symbol)))
    pin_metadata = {f"{lib}:{name}": pins for lib, name, _, pins in selected}
    (OUTPUT / "source-pins.json").write_text(json.dumps(pin_metadata, indent=2) + "\n", encoding="utf-8")
    if prepare_only:
        print(json.dumps(pin_metadata, indent=2))
        return
    version = subprocess.check_output([cli, "version"], text=True).strip()
    if not re.search(r"\b9\.0\.9\b", version):
        raise RuntimeError(f"Expected official KiCad {KICAD_VERSION}, got {version}")
    (OUTPUT / "svg").mkdir(parents=True, exist_ok=True)
    (OUTPUT / "stock").mkdir(parents=True, exist_ok=True)
    result = {}
    with tempfile.TemporaryDirectory(prefix="anacode-kicad-") as temporary:
        work = Path(temporary)
        for library, name, symbol, pins in selected:
            source_id = f"{library}:{name}"
            filename = f"{library}--{name}.svg"
            original = OUTPUT / "source" / f"{library}.kicad_sym"
            stock_dir = work / "stock" / library / name
            stock_dir.mkdir(parents=True)
            subprocess.run([cli, "sym", "export", "svg", "--black-and-white", "--symbol", name, "--output", str(stock_dir), str(original)], check=True)
            stock = OUTPUT / "stock" / filename
            stock.write_bytes((stock_dir / f"{name}_unit1.svg").read_bytes())
            normalize_svg(stock, source_id)
            source = libraries[library]
            headers = [copy.deepcopy(part) for part in source[1:] if not (isinstance(part, list) and part and str(part[0]) == "symbol")]
            export_source = work / f"{library}--{name}.kicad_sym"
            export_source.write_text(sexpdata.dumps([source[0], *headers, body_copy(symbol)]), encoding="utf-8")
            body_dir = work / "body" / library / name
            body_dir.mkdir(parents=True)
            subprocess.run([cli, "sym", "export", "svg", "--black-and-white", "--symbol", name, "--output", str(body_dir), str(export_source)], check=True)
            body = OUTPUT / "svg" / filename
            body.write_bytes((body_dir / f"{name}_unit1.svg").read_bytes())
            viewbox, units, origin = normalize_svg(body, source_id, calibration=True)
            for pin in pins:
                pin["x"] = round(origin[0] + pin["sourceX"] * units, 6)
                pin["y"] = round(origin[1] - pin["sourceY"] * units, 6)
                pin["bodyX"] = round(pin["x"] + pin["length"] * math.cos(math.radians(pin["angle"])) * units, 6)
                pin["bodyY"] = round(pin["y"] - pin["length"] * math.sin(math.radians(pin["angle"])) * units, 6)
                if not (-0.01 <= pin["x"] <= viewbox[2] + 0.01 and -0.01 <= pin["y"] <= viewbox[3] + 0.01):
                    raise RuntimeError(f"Pin outside exported viewBox: {source_id} {pin}")
            result[source_id] = {"sourceId": source_id, "unit": 1, "svg": f"/kicad/svg/{filename}", "stockSvg": f"/kicad/stock/{filename}",
                                 "viewBox": viewbox, "origin": origin, "unitsPerMm": units, "pins": pins,
                                 "sha256": digest(body.read_bytes()), "stockSha256": digest(stock.read_bytes()),
                                 "sourceFile": f"source/{library}.kicad_sym", "sourceSha256": SOURCE_HASHES[f"{library}.kicad_sym"]}
    manifest = {"schemaVersion": 1, "generator": "official kicad-cli sym export svg", "kicadVersion": version,
                "libraryRevision": REVISION, "libraryTag": "9.0.9", "libraryUrl": "https://gitlab.com/kicad/libraries/kicad-symbols",
                "license": "CC-BY-SA-4.0 with KiCad library exception", "sourceHashes": SOURCE_HASHES,
                "modifications": ["Reference/value fields and non-semantic pin labels hidden in an export-only library copy", "Temporary origin calibration circle removed after native SVG export", "SVG title timestamps normalized"],
                "symbols": result}
    (OUTPUT / "symbols.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(result)} official KiCad symbols to {OUTPUT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", default="kicad-cli")
    parser.add_argument("--prepare-only", action="store_true", help="verify official sources and pin metadata without exporting")
    args = parser.parse_args()
    build(args.cli, args.prepare_only)
