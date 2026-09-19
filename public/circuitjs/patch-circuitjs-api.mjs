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
function replaceEvery(file, before, after, expected) {
  const path = join(client, file);
  const source = readFileSync(path, 'utf8');
  const parts = source.split(before);
  if (parts.length - 1 !== expected) throw new Error(`Upstream presentation changed: ${file}`);
  writeFileSync(path, parts.join(after));
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
// Unsupported elements, printing, voltage/power display and missing assets use native draw.
replace('CircuitElm.java', '    native void addJSMethods() /*-{', `    boolean anacodeSymbolApiReady;
    void drawWithKiCad(Graphics g) {
        boolean previousDrawing = g.anacodeSchematicDrawing;
        g.anacodeSchematicDrawing = true;
        try {
            if (!anacodeSymbolApiReady) { addJSMethods(); anacodeSymbolApiReady = true; }
            if (app.menus.printableCheckItem.getState() || app.menus.voltsCheckItem.getState() || app.menus.powerCheckItem.getState() || !hasKiCadSymbol()) {
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
        } finally {
            g.anacodeSchematicDrawing = previousDrawing;
        }
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
        boolean anacodeSchematicDrawing;
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

// Match the native wires and fallback symbols to the official artwork without
// changing terminal positions, hit tolerances, bus widths or scope plots.
replace('Graphics.java', '\t\t  context.setLineWidth(width);', `                  context.setLineWidth(anacodeSchematicDrawing && width == 3.0 ? 1.5 : width);`);
for (const file of ['CircuitElm.java', 'ResistorElm.java', 'VoltageElm.java', 'SweepElm.java', 'FuseElm.java', 'LDRElm.java', 'ThermistorNTCElm.java']) {
  replace(file, 'g.context.setLineWidth(3.0);', 'g.setLineWidth(3.0);');
}
replace('CircuitElm.java', '    static int valueFontSize = 12;', '    static int valueFontSize = 13;');
replaceEvery('CircuitElm.java', 'valueFont = new Font("SansSerif", 0, valueFontSize);', 'valueFont = new Font("Georgia, serif", 0, valueFontSize);', 2);
replace('CircuitElm.java', '    void drawValues(Graphics g, String s, double hs) {', `    void drawValues(Graphics g, String s, double hs) {
        // Leave room around enlarged artwork while retaining native values,
        // orientation and the user's value-font-size preference.
        hs += 4;`);
replace('UIManager.java', 'CircuitElm.selectColor = Color.cyan;', 'CircuitElm.selectColor = new Color("#e4b568");');
replace('EditOptions.java', 'setColor("selectColor", ei, Color.cyan)', 'setColor("selectColor", ei, new Color("#e4b568"))');
replace('UIManager.java', `            CircuitElm.whiteColor = Color.white;
            CircuitElm.lightGrayColor = Color.lightGray;
            g.setColor(Color.black);
            cv.getElement().getStyle().setBackgroundColor("#000");`, `            CircuitElm.whiteColor = new Color("#d2d8df");
            CircuitElm.lightGrayColor = new Color("#aab2bf");
            g.setColor("#17191d");
            cv.getElement().getStyle().setBackgroundColor("#17191d");`);
replace('UIManager.java', '        g.fillRect(0, 0, canvasWidth, canvasHeight);', `        g.fillRect(0, 0, canvasWidth, canvasHeight);
        drawAnaCodeGrid(g);`);
replace('UIManager.java', '    void setGrid() {', `    // Draw only a presentation grid. Every dot is a native snap point, and
    // coarsening selects a power-of-two subset of those same world coordinates.
    void drawAnaCodeGrid(Graphics g) {
        if (menus.printableCheckItem.getState()) return;
        double scaleX = Math.abs(app.transform[0]);
        double scaleY = Math.abs(app.transform[3]);
        double pixelRatio = devicePixelRatio();
        if (!(scaleX > 0) || !(scaleY > 0) || Double.isInfinite(scaleX) || Double.isInfinite(scaleY)) return;
        double spacing = Math.max(1, app.gridSize);
        double minimumScale = Math.min(scaleX, scaleY);
        for (int level = 0; spacing * minimumScale < 12 && level < 32; level++) spacing *= 2;
        double stepX = spacing * scaleX, stepY = spacing * scaleY;
        if (!(stepX >= 12) || !(stepY >= 12)) return;
        double offsetX = app.transform[4], offsetY = app.transform[5];
        if (Double.isNaN(offsetX) || Double.isNaN(offsetY) || Double.isInfinite(offsetX) || Double.isInfinite(offsetY)) return;
        double width = Math.min(canvasWidth, app.circuitArea.width);
        double height = Math.min(canvasHeight, app.circuitArea.height);
        if (!(width > 0) || !(height > 0)) return;
        double startX = ((offsetX % stepX) + stepX) % stepX;
        double startY = ((offsetY % stepY) + stepY) % stepY;
        g.context.save();
        try {
            g.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            g.context.beginPath();
            g.context.rect(0, 0, width, height);
            g.context.clip();
            g.context.setFillStyle("#323740");
            g.context.beginPath();
            for (double x = startX; x < width; x += stepX) {
                for (double y = startY; y < height; y += stepY) {
                    g.context.moveTo(x + .65, y);
                    g.context.arc(x, y, .65, 0, 2 * Math.PI);
                }
            }
            g.context.fill();
        } finally {
            g.context.restore();
        }
    }

    void setGrid() {`);
// The component palette delegates directly to the same upstream Draw command.
replace('JSInterface.java', '    String getStopMessage() { return app.stopMessage; }', `    String getStopMessage() { return app.stopMessage; }
    void addElement(String type) { app.commands.menuPerformed("main", type); }
    void zoomCircuit(int direction) { app.commands.menuPerformed("zoom", direction > 0 ? "zoomin" : "zoomout"); }`);
replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            zoomCircuit: $entry(function(direction) { that.@com.lushprojects.circuitjs1.client.JSInterface::zoomCircuit(I)(direction); }),
            addElement: $entry(function(type) { that.@com.lushprojects.circuitjs1.client.JSInterface::addElement(Ljava/lang/String;)(type); }),`);
console.log('Applied CircuitJS measurement API, KiCad presentation hooks and native undo checkpoint correction.');
