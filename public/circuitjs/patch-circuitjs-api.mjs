// SPDX-License-Identifier: GPL-2.0-or-later
// Measurement API, official KiCad symbol presentation, and native undo correction.
// CircuitJS retains its solver, terminals, routing and electrical connectivity.
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
    int getWaveformJS() { return this instanceof VoltageElm ? ((VoltageElm) this).waveform : -1; }
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

// The native draw still computes its original hit boxes and value labels. Only
// supported symbol geometry is replaced, using SVGs exported by KiCad itself.
// Unsupported elements, voltage/power display and missing assets use native draw.
replace('CircuitElm.java', '    native void addJSMethods() /*-{', `    boolean anacodeSymbolApiReady;
    void drawWithKiCad(Graphics g) {
        if (!anacodeSymbolApiReady) { addJSMethods(); anacodeSymbolApiReady = true; }
        if (app.menus.voltsCheckItem.getState() || app.menus.powerCheckItem.getState() || !hasKiCadSymbol()) {
            draw(g);
            return;
        }
        double opacity = g.context.getGlobalAlpha();
        g.anacodeSymbolOpacity = opacity;
        g.anacodeSymbolText = !(this instanceof OpAmpElm);
        g.context.setGlobalAlpha(0);
        try { draw(g); }
        finally {
            g.context.setGlobalAlpha(opacity);
            g.anacodeSymbolText = false;
        }
        if (!paintKiCadSymbol(g.context, needsHighlight() || isCreating())) draw(g);
        drawPosts(g);
    }
    native boolean hasKiCadSymbol() /*-{
        var renderer = $wnd.AnaCodeKiCad;
        return !!(renderer && renderer.canDraw(this));
    }-*/;
    native boolean paintKiCadSymbol(com.google.gwt.canvas.dom.client.Context2d context, boolean selected) /*-{
        return $wnd.AnaCodeKiCad.draw(context, this, selected);
    }-*/;

    native void addJSMethods() /*-{`);
replace('CircuitElm.java', '        this.getPostX = $entry(', `        this.getFlags = $entry(function() { return that.@com.lushprojects.circuitjs1.client.CircuitElm::flags; });
        this.getWaveform = $entry(function() { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getWaveformJS()(); });
        this.getEndpointX = $entry(function(n) { return n ? that.@com.lushprojects.circuitjs1.client.CircuitElm::x2 : that.@com.lushprojects.circuitjs1.client.CircuitElm::x; });
        this.getEndpointY = $entry(function(n) { return n ? that.@com.lushprojects.circuitjs1.client.CircuitElm::y2 : that.@com.lushprojects.circuitjs1.client.CircuitElm::y; });
        this.getPostX = $entry(`);
replace('Graphics.java', '\tContext2d context;', `\tContext2d context;
        boolean anacodeSymbolText;
        double anacodeSymbolOpacity;`);
replace('Graphics.java', '\t\t  context.fillText(s, x, y);', `                  double opacity = context.getGlobalAlpha();
                  // Polarity signs already belong to the official symbol artwork.
                  if (anacodeSymbolText && !s.equals("+")) context.setGlobalAlpha(anacodeSymbolOpacity);
                  context.fillText(s, x, y);
                  context.setGlobalAlpha(opacity);`);
for (const element of ['ce', 'stopHighlightElm', 'mouse.dragElm']) {
  replace('UIManager.java', element + '.draw(g);', element + '.drawWithKiCad(g);');
}
// The component palette delegates directly to the same upstream Draw command.
replace('JSInterface.java', '    String getStopMessage() { return app.stopMessage; }', `    String getStopMessage() { return app.stopMessage; }
    void addElement(String type) { app.commands.menuPerformed("main", type); }
    void zoomCircuit(int direction) { app.commands.menuPerformed("zoom", direction > 0 ? "zoomin" : "zoomout"); }`);
replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            zoomCircuit: $entry(function(direction) { that.@com.lushprojects.circuitjs1.client.JSInterface::zoomCircuit(I)(direction); }),
            addElement: $entry(function(type) { that.@com.lushprojects.circuitjs1.client.JSInterface::addElement(Ljava/lang/String;)(type); }),`);
console.log('Applied CircuitJS measurement API, KiCad presentation hooks and native undo checkpoint correction.');
