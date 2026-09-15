// SPDX-License-Identifier: GPL-2.0-or-later
// Measurement API extensions and a native undo checkpoint correction. No solver,
// symbol, routing or electrical connectivity algorithms are changed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Pass the extracted CircuitJS1 source directory.');
const client = join(root, 'src/com/lushprojects/circuitjs1/client');
function replace(file, before, after) {
  const path = join(client, file);
  const source = readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`Upstream API changed: ${file}`);
  writeFileSync(path, source.replace(before, after));
}
replace('CircuitElm.java', '    native void addJSMethods() /*-{', `    // AnaCode integration: expose native terminal positions and solved node identity.
    int getPostXJS(int n) { return getPost(n).x; }
    int getPostYJS(int n) { return getPost(n).y; }
    int getNodeIdJS(int n) { return nodes[n] == null ? -1 : nodes[n].index; }
    String exportElementJS() {
        com.google.gwt.xml.client.Document doc = com.google.gwt.xml.client.XMLParser.createDocument();
        com.google.gwt.xml.client.Element root = doc.createElement("cir");
        doc.appendChild(root);
        com.google.gwt.xml.client.Element elem = doc.createElement("component");
        root.appendChild(elem);
        dumpXml(doc, elem);
        return elem.toString();
    }

    native void addJSMethods() /*-{`);
replace('CircuitElm.java', '        var that = this;\n        this.getType', `        var that = this;
        this.getPostX = $entry(function(n) { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getPostXJS(I)(n); });
        this.getPostY = $entry(function(n) { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getPostYJS(I)(n); });
        this.getNodeId = $entry(function(n) { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getNodeIdJS(I)(n); });
        this.exportElement = $entry(function() { return that.@com.lushprojects.circuitjs1.client.CircuitElm::exportElementJS()(); });
        this.getType`);
replace('JSInterface.java', '    native void setupJSInterface() /*-{', `    // AnaCode integration: use CircuitJS's existing hit testing and viewport transform.
    JavaScriptObject getHoveredElement() {
        CircuitElm ce = app.mouse.getMouseElm();
        if (ce == null) return null;
        ce.addJSMethods();
        return ce.getJavaScriptObject();
    }
    int screenX(double x) { return app.mouse.transformX(x); }
    int screenY(double y) { return app.mouse.transformY(y); }
    String getStopMessage() { return app.stopMessage; }

    native void setupJSInterface() /*-{`);
replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            getHoveredElement: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getHoveredElement()(); }),
            screenX: $entry(function(x) { return that.@com.lushprojects.circuitjs1.client.JSInterface::screenX(D)(x); }),
            screenY: $entry(function(y) { return that.@com.lushprojects.circuitjs1.client.JSInterface::screenY(D)(y); }),
            getStopMessage: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getStopMessage()(); }),`);
// Mouse-down already records the circuit before a drag. Recording the changed
// circuit again on mouse-up makes the first native Undo restore the current state.
replace('MouseManager.java', '    \tif (circuitChanged) {\n    \t    sim.needAnalyze();\n    \t    sim.undoManager.pushUndo();\n    \t}', '    \tif (circuitChanged) {\n    \t    sim.needAnalyze();\n    \t}');
console.log('Applied bounded CircuitJS1 measurement API extensions and native undo checkpoint correction.');
