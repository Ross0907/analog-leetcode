// SPDX-License-Identifier: GPL-2.0-or-later
// Measurement API, official KiCad symbol presentation, and native undo correction.
// CircuitJS retains its solver, terminals, routing and electrical connectivity.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchCircuitJsStimulus } from './patch-circuitjs-stimulus.mjs';

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
        anacodeValueBounds = null;
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
replace('Graphics.java', '\t\t  context.setLineWidth(width);', `                  context.setLineWidth(anacodeSchematicDrawing && width == 3.0 ? 2.0 : width);`);
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
    void addElement(String type) {
        app.commands.menuPerformed("main", type);
        app.mouse.anacodeGroundSources = type.equals("DCVoltageElm") || type.equals("ACVoltageElm") || type.equals("BatteryElm") || type.equals("CurrentElm");
    }
    void zoomCircuit(int direction) { app.commands.menuPerformed("zoom", direction > 0 ? "zoomin" : "zoomout"); }`);
replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            zoomCircuit: $entry(function(direction) { that.@com.lushprojects.circuitjs1.client.JSInterface::zoomCircuit(I)(direction); }),
            addElement: $entry(function(type) { that.@com.lushprojects.circuitjs1.client.JSInterface::addElement(Ljava/lang/String;)(type); }),`);
// Editing extensions delegate to native elements, routing, junction splitting,
// value validation and undo. No alternate electrical representation is added.
function replaceSection(file, start, end, content) {
  const path = join(client, file), source = readFileSync(path, 'utf8');
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Upstream editing section changed: ${file}`);
  writeFileSync(path, source.slice(0, first) + content + source.slice(last));
}
replace('MouseManager.java', '    void selectArea(int x, int y, boolean add) {', `    boolean anacodeWireActive;
    int anacodeWireDownX, anacodeWireDownY;

    boolean anacodeWireMode() {
        return mouseMode == MODE_ADD_ELM && (ui.mouseModeStr.equals("WireElm") || ui.mouseModeStr.equals("RoutedWireElm"));
    }
    void anacodeCancelWire() {
        if (!anacodeWireActive) return;
        if (dragElm != null) dragElm.delete();
        dragElm = null;
        anacodeWireActive = false;
        mouseDragging = dragging = false;
        sim.repaint();
    }
    void anacodeFinishWire(int x, int y) {
        if (!anacodeWireActive || dragElm == null) return;
        dragElm.drag(x, y);
        if (dragElm.creationFailed()) return;
        splitAt(dragElm.x, dragElm.y);
        splitAt(dragElm.x2, dragElm.y2);
        ui.elmList.addElement(dragElm);
        dragElm.draggingDone();
        dragElm = null;
        anacodeWireActive = false;
        mouseDragging = dragging = false;
        sim.needAnalyze();
        sim.unsavedChanges = true;
        sim.undoManager.writeRecoveryToStorage();
        sim.repaint();
    }
    boolean anacodeWireDown(MouseDownEvent e) {
        if (!anacodeWireMode() || ui.isReadOnly() || e.getNativeButton() != NativeEvent.BUTTON_LEFT || e.isAltKeyDown() || e.isControlKeyDown() || e.isMetaKeyDown()) return false;
        if (!sim.circuitArea.contains(e.getX(), e.getY())) return false;
        int x = snapGrid(inverseTransformX(e.getX())), y = snapGrid(inverseTransformY(e.getY()));
        ui.cv.setFocus(true);
        if (anacodeWireActive) anacodeFinishWire(x, y);
        else {
            sim.undoManager.pushUndo();
            clearSelection();
            dragElm = new RoutedWireElm(x, y);
            anacodeWireActive = true;
            anacodeWireDownX = e.getX(); anacodeWireDownY = e.getY();
        }
        sim.repaint();
        return true;
    }

    // Preserve the exact native endpoint attachments existing before the move.
    // Legacy straight wires become native routed wires only when affected.
    void anacodeMoveSelection(int dx, int dy) {
        ArrayList<Point> movedPosts = new ArrayList<Point>();
        for (CircuitElm ce : ui.elmList) if (ce.isSelected())
            for (int n = 0; n < ce.getPostCount(); n++) {
                Point p = ce.getPost(n); movedPosts.add(new Point(p.x, p.y));
            }
        ArrayList<WireElm> wires = new ArrayList<WireElm>();
        ArrayList<boolean[]> ends = new ArrayList<boolean[]>();
        ArrayList<Point> fixedPosts = new ArrayList<Point>();
        java.util.HashSet<String> fixedKeys = new java.util.HashSet<String>();
        for (int i = 0; i < ui.elmList.size(); i++) {
            CircuitElm ce = ui.elmList.get(i);
            if (ce.isSelected()) continue;
            if (ce instanceof WireElm && ce.getPostCount() == 2) {
                boolean[] matches = new boolean[2];
                for (int n = 0; n < 2; n++) for (Point p : movedPosts)
                    if (p.equals(ce.getPost(n))) matches[n] = true;
                if (!matches[0] && !matches[1]) continue;
                WireElm wire = (WireElm)ce;
                if (!(wire instanceof RoutedWireElm)) {
                    ArrayList<Point> points = new ArrayList<Point>();
                    points.add(new Point(wire.x, wire.y)); points.add(new Point(wire.x2, wire.y2));
                    RoutedWireElm routed = new RoutedWireElm(points);
                    routed.flags = wire.flags;
                    ui.elmList.setElementAt(routed, i);
                    wire = routed;
                }
                wires.add(wire); ends.add(matches);
            } else if (!(ce instanceof WireElm)) {
                for (int n = 0; n < ce.getPostCount(); n++) for (Point p : movedPosts)
                    if (p.equals(ce.getPost(n)) && fixedKeys.add(p.x + "," + p.y)) fixedPosts.add(p);
            }
        }
        for (CircuitElm ce : ui.elmList) if (ce.isSelected()) ce.move(dx, dy);
        for (int i = 0; i < wires.size(); i++) {
            WireElm wire = wires.get(i); boolean[] match = ends.get(i);
            if (match[0]) { wire.x += dx; wire.y += dy; }
            if (match[1]) { wire.x2 += dx; wire.y2 += dy; }
            wire.setPoints();
        }
        for (Point p : fixedPosts) {
            RoutedWireElm wire = new RoutedWireElm(p.x, p.y);
            wire.drag(p.x + dx, p.y + dy);
            ui.elmList.addElement(wire);
        }
        sim.unsavedChanges = true;
    }

    void selectArea(int x, int y, boolean add) {`);
replaceSection('MouseManager.java', '    \tif (allowed) {', '    \t// don\'t leave mouseElm selected if we selected it above', `        if (allowed) {
            anacodeMoveSelection(dx, dy);
            sim.needAnalyze();
        }

`);
replace('MouseManager.java', '    public void onMouseDown(MouseDownEvent e) {', `    public void onMouseDown(MouseDownEvent e) {
        if (anacodeWireDown(e)) { e.preventDefault(); return; }
        if (mouseMode == MODE_SELECT && !ui.isReadOnly() && e.getNativeButton() == NativeEvent.BUTTON_LEFT && anacodeValueClick(e.getX(), e.getY())) { e.preventDefault(); return; }`);
replace('MouseManager.java', '    public void onMouseMove(MouseMoveEvent e) {', `    public void onMouseMove(MouseMoveEvent e) {
        if (anacodeWireActive && dragElm != null) {
            e.preventDefault();
            mouseCursorX = e.getX(); mouseCursorY = e.getY();
            dragElm.drag(snapGrid(inverseTransformX(e.getX())), snapGrid(inverseTransformY(e.getY())));
            sim.repaint(); return;
        }`);
replace('MouseManager.java', '    public void onMouseUp(MouseUpEvent e) {', `    public void onMouseUp(MouseUpEvent e) {
        if (anacodeWireActive) {
            e.preventDefault();
            // Keep click-to-click placement, while also accepting press-and-drag.
            if (Graphics.distanceSq(e.getX(), e.getY(), anacodeWireDownX, anacodeWireDownY) > 36)
                anacodeFinishWire(snapGrid(inverseTransformX(e.getX())), snapGrid(inverseTransformY(e.getY())));
            return;
        }`);
replace('UIManager.java', '    void setMouseMode(int mode) {', `    void setMouseMode(int mode) {
        mouse.anacodeCancelWire();
        mouse.anacodeGroundSources = false;`);
replace('UIManager.java', `    \t\t\tfor (int i = 0; i != elmList.size(); i++) {
    \t\t\t    CircuitElm ce = elmList.get(i);
    \t\t\t    if (ce.isSelected())
    \t\t\t\tce.move(dx, dy);
    \t\t\t}`, '                    mouse.anacodeMoveSelection(dx, dy);');

// Inline value edits use the same editable fields, engineering-unit parser,
// setter and analysis invalidation as the upstream properties dialog.
replace('CircuitElm.java', '    boolean anacodeSymbolApiReady;', `    Rectangle anacodeValueBounds;
    int anacodeValueIndex() {
        if (this instanceof VoltageElm) {
            VoltageElm source = (VoltageElm)this;
            if (source.anacodePwlTimes != null) return -1;
            int showVoltage = source instanceof RailElm ? VoltageElm.FLAG_SHOW_VOLTAGE_RAIL : VoltageElm.FLAG_SHOW_VOLTAGE;
            if (source.waveform != VoltageElm.WF_DC && source.waveform != VoltageElm.WF_NOISE && (flags & showVoltage) == 0) {
                // Frequency-only source labels must edit frequency, not amplitude.
                for (int n = 0; n < 20; n++) {
                    EditInfo ei = getEditInfo(n);
                    if (ei == null) break;
                    if (ei.name.equals("Frequency (Hz)")) return n;
                }
                return -1;
            }
        }
        for (int n = 0; n < 20; n++) {
            EditInfo ei = getEditInfo(n);
            if (ei == null) break;
            if (ei.text == null && ei.choice == null && ei.checkbox == null && ei.button == null && ei.textArea == null && ei.widget == null) return n;
        }
        return -1;
    }
    String anacodeValueName() { int n = anacodeValueIndex(); return n < 0 ? "" : getEditInfo(n).name; }
    double anacodeValue() { int n = anacodeValueIndex(); return n < 0 ? 0 : getEditInfo(n).value; }
    String anacodeValueText() { int n = anacodeValueIndex(); return n < 0 ? "" : EditDialog.unitString(getEditInfo(n), getEditInfo(n).value); }
    String anacodeSetValue(String text) {
        int n = anacodeValueIndex();
        if (n < 0 || app.ui.isReadOnly()) return "This value is not editable.";
        EditInfo ei = getEditInfo(n);
        try {
            String input = text.trim();
            if (input.length() == 0 || input.length() > 80) return "Enter a numeric value.";
            double value = EditDialog.parseUnits(input);
            if (Double.isNaN(value) || Double.isInfinite(value) || Math.abs(value) > 1e15) return "Enter a finite value.";
            if ((ei.positive || ei.name.equals("Frequency (Hz)") || this instanceof ResistorElm || this instanceof CapacitorElm || this instanceof InductorElm) && value <= 0) return "Value must be greater than zero.";
            if (ei.nonNegative && value < 0) return "Value must not be negative.";
            ei.value = value;
            app.undoManager.pushUndo();
            setEditValue(n, ei);
            if (ei.error != null) return ei.error;
            Adjustable adj = app.findAdjustable(this, n);
            if (adj != null) adj.setSliderValue(value);
            app.needAnalyze(); app.unsavedChanges = true;
            app.undoManager.writeRecoveryToStorage(); app.repaint();
            return null;
        } catch (Exception ex) { return "Enter a value such as 10k, 4.7u or 1e-3."; }
    }
    boolean anacodeSymbolApiReady;`);
replace('CircuitElm.java', '        var that = this;\n        this.getFlags', `        var that = this;
        this.getEditableValue = $entry(function() {
            if (that.@com.lushprojects.circuitjs1.client.CircuitElm::anacodeValueIndex()() < 0) return null;
            return {name: that.@com.lushprojects.circuitjs1.client.CircuitElm::anacodeValueName()(), text: that.@com.lushprojects.circuitjs1.client.CircuitElm::anacodeValueText()(), value: that.@com.lushprojects.circuitjs1.client.CircuitElm::anacodeValue()()};
        });
        this.setEditableValue = $entry(function(text) { return that.@com.lushprojects.circuitjs1.client.CircuitElm::anacodeSetValue(Ljava/lang/String;)(text); });
        this.getFlags`);
replace('CircuitElm.java', '\tif (dpx == 0)\n\t    g.drawString(s, xc-w/2, yc-abs(dpy)-2);', `        if (dpx == 0) {
            anacodeValueBounds = new Rectangle(xc-w/2-3, yc-abs(dpy)-2-valueFontSize, w+6, valueFontSize+6);
            g.drawString(s, xc-w/2, yc-abs(dpy)-2);
        }`);
replace('CircuitElm.java', '\t    g.drawString(s, xx, yc+dpy+ya);', `            anacodeValueBounds = new Rectangle(xx-3, yc+dpy+ya-valueFontSize, w+6, valueFontSize+6);
            g.drawString(s, xx, yc+dpy+ya);`);
replace('MouseManager.java', '    boolean anacodeWireActive;', `    boolean anacodeValueClick(int x, int y) {
        int gx = inverseTransformX(x), gy = inverseTransformY(y);
        for (CircuitElm ce : ui.elmList) {
            if (ce.anacodeValueBounds != null && ce.anacodeValueBounds.contains(gx, gy) && ce.anacodeValueIndex() >= 0) {
                ce.addJSMethods(); anacodeShowValue(ce); return true;
            }
        }
        return false;
    }
    native void anacodeShowValue(CircuitElm ce) /*-{
        var bounds = ce.@com.lushprojects.circuitjs1.client.CircuitElm::anacodeValueBounds;
        var cv = $doc.querySelector('canvas'), rect = cv.getBoundingClientRect();
        var api = $wnd.CircuitJS1, value = ce.getEditableValue();
        if (!value) return;
        var previous = $doc.querySelector('.anacode-inline-value'); if (previous) previous.remove();
        var box = $doc.createElement('div'); box.className = 'anacode-inline-value';
        var input = $doc.createElement('input'); input.type = 'text'; input.value = value.text;
        input.setAttribute('aria-label', value.name); input.setAttribute('autocomplete', 'off');
        var error = $doc.createElement('div'); error.setAttribute('role','alert');
        box.appendChild(input); box.appendChild(error);
        box.style.left = Math.max(4, Math.min($wnd.innerWidth - 180, rect.left + api.screenX(bounds.@com.lushprojects.circuitjs1.client.Rectangle::x))) + 'px';
        box.style.top = Math.max(4, rect.top + api.screenY(bounds.@com.lushprojects.circuitjs1.client.Rectangle::y)) + 'px';
        $doc.body.appendChild(box); input.focus(); input.select();
        var closing = false;
        function close() { closing = true; box.remove(); cv.focus(); }
        function apply() { var message = ce.setEditableValue(input.value); if (message) { error.textContent = message; input.setAttribute('aria-invalid','true'); return false; } close(); return true; }
        input.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') { e.preventDefault(); close(); } });
        input.addEventListener('blur', function() { if (!closing && box.isConnected) apply(); });
    }-*/;

    boolean anacodeWireActive;`);
replace('UIManager.java', '    public void onPreviewNativeEvent(NativePreviewEvent e) {', `    native boolean anacodeInlineEditing() /*-{
        return !!($doc.activeElement && $doc.activeElement.closest && $doc.activeElement.closest('.anacode-inline-value'));
    }-*/;
    public void onPreviewNativeEvent(NativePreviewEvent e) {
        if (anacodeInlineEditing()) return;`);
replace('VoltageElm.java', 'boolean showV = (flags & FLAG_SHOW_VOLTAGE) != 0;', 'boolean showV = (flags & FLAG_SHOW_VOLTAGE) != 0 || (showValues() && waveform == WF_DC);');
replace('CurrentElm.java', 'if (showValues() && current != 0) {', 'if (showValues()) {');
replace('CurrentElm.java', 'String s = getShortUnitText(current, "A");', 'String s = getShortUnitText(currentValue, "A");');

// One theme contract controls the native canvas, diagrams and GWT dialogs.
replace('UIManager.java', '    void drawAnaCodeGrid(Graphics g) {', `    boolean anacodeLight = true;
    void drawAnaCodeGrid(Graphics g) {`);
replace('UIManager.java', 'CircuitElm.whiteColor = new Color("#d2d8df");', 'CircuitElm.whiteColor = new Color(anacodeLight ? "#252b32" : "#d2d8df");');
replace('UIManager.java', 'CircuitElm.lightGrayColor = new Color("#aab2bf");', 'CircuitElm.lightGrayColor = new Color(anacodeLight ? "#56616e" : "#aab2bf");');
replace('UIManager.java', 'g.setColor("#17191d");', 'g.setColor(anacodeLight ? "#fafbfc" : "#17191d");');
replace('UIManager.java', 'cv.getElement().getStyle().setBackgroundColor("#17191d");', 'cv.getElement().getStyle().setBackgroundColor(anacodeLight ? "#fafbfc" : "#17191d");');
replace('UIManager.java', 'g.context.setFillStyle("#323740");', 'g.context.setFillStyle(anacodeLight ? "#dce2e8" : "#323740");');
replace('UIManager.java', 'g.setColor(menus.printableCheckItem.getState() ? "#eee" : "#111");', 'g.setColor(menus.printableCheckItem.getState() ? "#eee" : anacodeLight ? "#edf2f7" : "#20242b");');
replace('UIManager.java', '    Color getBackgroundColor() {\n\tif (menus.printableCheckItem.getState())\n\t    return Color.white;\n\treturn Color.black;\n    }', '    Color getBackgroundColor() {\n\tif (menus.printableCheckItem.getState())\n\t    return Color.white;\n\treturn new Color(anacodeLight ? "#fafbfc" : "#17191d");\n    }');
replaceEvery('VoltageElm.java', 'g.setColor(needsHighlight() ? selectColor : Color.gray);', 'g.setColor(needsHighlight() ? selectColor : whiteColor);', 2);
replace('JSInterface.java', '    void addElement(String type)', `    String getTheme() { return app.ui.anacodeLight ? "light" : "dark"; }
    void setTheme(String theme) { app.ui.anacodeLight = !theme.equals("dark"); applyTheme(getTheme()); app.repaint(); }
    native void applyTheme(String theme) /*-{
        $doc.documentElement.setAttribute('data-theme', theme);
        if ($wnd.AnaCodeKiCad) $wnd.AnaCodeKiCad.setTheme(theme);
    }-*/;
    void addElement(String type)`);
replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            startWire: $entry(function() { that.@com.lushprojects.circuitjs1.client.JSInterface::addElement(Ljava/lang/String;)("WireElm"); }),
            cancelDrawing: $entry(function() { that.@com.lushprojects.circuitjs1.client.JSInterface::addElement(Ljava/lang/String;)("Select"); }),
            setTheme: $entry(function(theme) { that.@com.lushprojects.circuitjs1.client.JSInterface::setTheme(Ljava/lang/String;)(theme); }),
            getTheme: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getTheme()(); }),`);
// Fast acquisition bypasses animation pacing only. The upstream accepted-step,
// adaptive convergence, stamping and measurement paths remain the solver.
replace('CirSim.java', '    void needAnalyze() {', '    int anacodeCircuitRevision;\n    void needAnalyze() {\n        anacodeCircuitRevision++;');
replace('JSInterface.java', '    void setMaxTimeStep(double ts) { app.sim.maxTimeStep = app.sim.timeStep = ts; }', `    void setMaxTimeStep(double ts) {
        if (!(ts > 0) || Double.isNaN(ts) || Double.isInfinite(ts)) return;
        if (app.sim.maxTimeStep != ts) app.sim.needsStamp = true;
        app.sim.maxTimeStep = app.sim.timeStep = ts;
    }`);
replace('SimulationManager.java', '    void runCircuit(boolean didAnalyze) {', `    boolean anacodeBatch;
    int anacodeBatchLimit, anacodeBatchSteps;
    long anacodeBatchDeadline;
    int anacodeStepSimulation(int maxSteps, int budgetMs) {
        if (!app.simRunning || anacodeBatch) return 0;
        anacodeBatch = true;
        anacodeBatchSteps = 0;
        anacodeBatchLimit = Math.max(1, Math.min(4096, maxSteps));
        anacodeBatchDeadline = System.currentTimeMillis() + Math.max(1, Math.min(16, budgetMs));
        try {
            boolean didAnalyze = app.analyzeFlag;
            if (app.analyzeFlag || app.dcAnalysisFlag) { analyzeCircuit(); app.analyzeFlag = false; }
            if (needsStamp) preStampAndStampCircuit();
            if (app.stopMessage == null) runCircuit(didAnalyze);
            return anacodeBatchSteps;
        } finally { anacodeBatch = false; }
    }
    void runCircuit(boolean didAnalyze) {`);
replace('SimulationManager.java', 'if (lit == 0) {', 'if (lit == 0 && !anacodeBatch) {');
replace('SimulationManager.java', 'if (1000 >= steprate*(tm-lastIterTime) && !didAnalyze)', 'if (!anacodeBatch && 1000 >= steprate*(tm-lastIterTime) && !didAnalyze)');
replace('SimulationManager.java', 'boolean delayWireProcessing = app.scopeManager.canDelayWireProcessing();', 'boolean delayWireProcessing = !anacodeBatch && app.scopeManager.canDelayWireProcessing();');
replace('SimulationManager.java', '\t    app.onTimeStep();', '\t    anacodeBatchSteps++;\n\t    app.onTimeStep();');
replace('SimulationManager.java', 'if ((timeStepCount-timeStepCountAtFrameStart)*1000 >= steprate*(tm-lastIterTime) || (tm-app.ui.lastFrameTime > frameTimeLimit))', 'if (anacodeBatch ? (anacodeBatchSteps >= anacodeBatchLimit || tm >= anacodeBatchDeadline) : ((timeStepCount-timeStepCountAtFrameStart)*1000 >= steprate*(tm-lastIterTime) || (tm-app.ui.lastFrameTime > frameTimeLimit)))');
replace('JSInterface.java', '    String getTheme()', `    int stepSimulation(int steps, int milliseconds) { return app.sim.anacodeStepSimulation(steps, milliseconds); }
    boolean anacodeEnsuringAnalysis;
    String ensureAnalyzed() {
        if (anacodeEnsuringAnalysis) return app.stopMessage;
        anacodeEnsuringAnalysis = true;
        try {
            if (app.analyzeFlag || app.dcAnalysisFlag) { app.sim.analyzeCircuit(); app.analyzeFlag = false; }
            // The upstream display-only analyze pass does not allocate nodes
            // while paused. Use its ordinary pre-stamp path without stepping
            // time or changing the user's running/paused state.
            if (app.sim.needsStamp && !app.elmList.isEmpty()) app.sim.preStampAndStampCircuit();
            app.repaint(); return app.stopMessage;
        } finally { anacodeEnsuringAnalysis = false; }
    }
    int getCircuitRevision() { return app.anacodeCircuitRevision; }
    int compactComponentLeads() {
        int changed = 0;
        java.util.Vector<CircuitElm> originals = new java.util.Vector<CircuitElm>(app.elmList);
        for (CircuitElm element : originals) {
            if (element.getPostCount() != 2 || !(element instanceof ResistorElm || element instanceof CapacitorElm || element instanceof InductorElm || element instanceof VoltageElm || element instanceof CurrentElm || element instanceof BatteryElm)) continue;
            int x1 = element.getPost(0).x, y1 = element.getPost(0).y, x2 = element.getPost(1).x, y2 = element.getPost(1).y;
            if ((x1 != x2 && y1 != y2) || Math.abs(x2-x1) + Math.abs(y2-y1) <= 64) continue;
            int cx = app.snapGrid((x1+x2)/2), cy = app.snapGrid((y1+y2)/2);
            int dx = x2 > x1 ? 32 : x2 < x1 ? -32 : 0, dy = y2 > y1 ? 32 : y2 < y1 ? -32 : 0;
            element.x = cx-dx; element.y = cy-dy; element.x2 = cx+dx; element.y2 = cy+dy;
            element.setPoints();
            for (int post = 0; post < 2; post++) {
                Point endpoint = element.getPost(post);
                WireElm lead = new WireElm(post == 0 ? x1 : x2, post == 0 ? y1 : y2);
                lead.x2 = endpoint.x; lead.y2 = endpoint.y; lead.setPoints();
                if (lead.x != lead.x2 || lead.y != lead.y2) app.elmList.add(lead);
            }
            changed++;
        }
        if (changed > 0) app.needAnalyze();
        return changed;
    }
    void dismissEditors() {
        dismissInlineEditor();
        if (CirSim.editDialog != null) CirSim.editDialog.closeDialog();
    }
    native void dismissInlineEditor() /*-{
        if ($wnd.AnaCodeDismissInlineEditor) $wnd.AnaCodeDismissInlineEditor();
    }-*/;
    String getTheme()`);
replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            stepSimulation: $entry(function(steps, milliseconds) { return that.@com.lushprojects.circuitjs1.client.JSInterface::stepSimulation(II)(steps, milliseconds); }),
            ensureAnalyzed: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::ensureAnalyzed()(); }),
            getCircuitRevision: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getCircuitRevision()(); }),
            compactComponentLeads: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::compactComponentLeads()(); }),
            dismissEditors: $entry(function() { that.@com.lushprojects.circuitjs1.client.JSInterface::dismissEditors()(); }),`);
// Native properties close through their own lifecycle so no stale modal state
// survives dismissal. Auto-hide is limited to property editors, not file dialogs.
replace('EditDialog.java', 'super(); // Do we need this?', `super();
        setAutoHideEnabled(true);
        addCloseHandler(event -> { if (event.isAutoClosed()) closeDialog(); });`);
replace('MouseManager.java', "var previous = $doc.querySelector('.anacode-inline-value'); if (previous) previous.remove();", 'if ($wnd.AnaCodeDismissInlineEditor) $wnd.AnaCodeDismissInlineEditor();');
replace('MouseManager.java', 'function close() { closing = true; box.remove(); cv.focus(); }', `function close() { closing = true; box.remove(); $doc.removeEventListener('pointerdown', outside, true); if ($wnd.AnaCodeDismissInlineEditor === dismiss) $wnd.AnaCodeDismissInlineEditor = null; }
        function dismiss() { if (closing) return; ce.setEditableValue(input.value); close(); }
        function outside(event) { if (!box.contains(event.target)) dismiss(); }
        $wnd.AnaCodeDismissInlineEditor = dismiss;
        $doc.addEventListener('pointerdown', outside, true);`);
replace('MouseManager.java', "input.addEventListener('blur', function() { if (!closing && box.isConnected) apply(); });", "input.addEventListener('blur', function() { if (!closing && box.isConnected) dismiss(); });");
replace('VoltageElm.java', 'inds="*";', 'inds="";');
// Actual junctions are computed by upstream post counting. Selection retains
// native hit-testing but no longer paints filled bubbles over device terminals.
replace('SimulationManager.java', 'if (entry.getValue() != 2)', 'if (entry.getValue() >= 3)');
replaceSection('CircuitElm.java', '    void drawPosts(Graphics g) {', '    void drawScopeTerminalLabels(Graphics g) {', `    void drawPosts(Graphics g) {
        if (isCreating() || needsHighlight()) drawScopeTerminalLabels(g);
    }

`);
replace('CircuitElm.java', 'g.fillOval(pt.x-3, pt.y-3, 7, 7);', 'g.fillOval(pt.x-2, pt.y-2, 4, 4);');
replace('UIManager.java', 'CircuitElm.lightGrayColor = new Color(anacodeLight ? "#56616e" : "#aab2bf");', 'CircuitElm.lightGrayColor = CircuitElm.whiteColor;');
// Palette source placement is a native source plus native ground, grouped in
// the same upstream undo operation. Imported/floating sources remain untouched.
replace('MouseManager.java', '    boolean anacodeWireActive;', '    boolean anacodeWireActive;\n    boolean anacodeGroundSources;');
replace('MouseManager.java', '\t    dragElm = sim.constructElement(ui.mouseModeStr, x0, y0);', '\t    dragElm = sim.constructElement(ui.mouseModeStr, x0, y0);\n            if (dragElm != null) dragElm.anacodeGroundSource = anacodeGroundSources && dragElm.getPostCount() == 2 && (dragElm instanceof VoltageElm || dragElm instanceof CurrentElm);');
replace('CircuitElm.java', '    void drag(int xx, int yy) {', `    boolean anacodeGroundSource;
    void drag(int xx, int yy) {
        if (anacodeGroundSource) { xx = x; if (Math.abs(yy-y) < 32) yy = y-64; }`);
replace('CircuitElm.java', '    void draggingDone() {}', `    void draggingDone() {
        if (!anacodeGroundSource) return;
        anacodeGroundSource = false;
        // Voltage post1 is positive; current post1 receives the source current.
        // Put both above the grounded return at post0 for newly placed sources.
        if (y < y2) { int previous = y; y = y2; y2 = previous; }
        x2 = x; setPoints();
        for (CircuitElm element : app.elmList) {
            if (element instanceof GroundElm && element.getPost(0).x == x && element.getPost(0).y == y) return;
        }
        GroundElm ground = new GroundElm(x, y); ground.x2=x; ground.y2=y+32; ground.setPoints();
        app.elmList.addElement(ground);
    }`);

// Labels retain upstream electrical name matching and XML/text serialization.
// The unused flag bit changes presentation only; it never creates a new netlist.
replace('LabeledNodeElm.java', '    final int FLAG_ESCAPE = 4;', `    final int FLAG_ESCAPE = 4;
    static final int FLAG_ANACODE_FLAG = 16;
    static String anacodeLastName = "label";
    static boolean anacodeLastFlag;
    boolean anacodeFlag() { return (flags & FLAG_ANACODE_FLAG) != 0; }`);
replace('LabeledNodeElm.java', '\ttext = "label";', '\ttext = anacodeLastName;\n        if (anacodeLastFlag) flags |= FLAG_ANACODE_FLAG;');
replace('LabeledNodeElm.java', '    void drawLabeledNode(Graphics g, String str, Point pt1, Point pt2) {', `    void drawLabeledNode(Graphics g, String str, Point pt1, Point pt2) {
        if (anacodeFlag()) {
            g.save();
            g.setFont(valueFont);
            int width = (int)g.context.measureText(str).getWidth() + 16;
            int height = valueFontSize + 8;
            int dir = pt2.x < pt1.x ? -1 : 1;
            int left = dir > 0 ? pt2.x + 7 : pt2.x - width - 7;
            int right = left + width, top = pt2.y - height/2, bottom = top + height;
            g.setLineWidth(3);
            g.context.beginPath();
            g.context.moveTo(pt2.x, pt2.y);
            g.context.lineTo(dir > 0 ? left : right, top);
            g.context.lineTo(dir > 0 ? right : left, top);
            g.context.lineTo(dir > 0 ? right : left, bottom);
            g.context.lineTo(dir > 0 ? left : right, bottom);
            g.context.closePath(); g.context.stroke();
            g.context.setTextBaseline("middle");
            g.drawString(str, left + 8, pt2.y);
            adjustBbox(Math.min(left, pt2.x), top, Math.max(right, pt2.x), bottom);
            g.restore(); return;
        }`);
replace('LabeledNodeElm.java', '\tif (n == 2) {\n\t    EditInfo ei = new EditInfo("", 0, -1, -1);', `        if (n == 3) {
            EditInfo ei = new EditInfo("Label style", 0);
            ei.choice = new Choice(); ei.choice.add("Plain label"); ei.choice.add("Flag");
            ei.choice.select(anacodeFlag() ? 1 : 0); return ei;
        }
\tif (n == 2) {\n\t    EditInfo ei = new EditInfo("", 0, -1, -1);`);
replace('LabeledNodeElm.java', '    public void setEditValue(int n, EditInfo ei) {', `    public void setEditValue(int n, EditInfo ei) {
        if (n == 3) flags = ei.choice.getSelectedIndex() == 1 ? flags | FLAG_ANACODE_FLAG : flags & ~FLAG_ANACODE_FLAG;`);
// A vertical label tether can visually cross an adjacent source-return ground
// even though the label has just one electrical post. Offset its presentation
// only; preserve authored endpoints, label identity and native wire closure.
replace('LabeledNodeElm.java', '\tdrawThickLine(g, point1, lead1, (busWidth > 1) ? 5 : 3);', `        Point labelStart = point1, labelEnd = lead1;
        if (point1.x == lead1.x && !isRotateText()) {
            g.save(); g.setFont(valueFont);
            int textWidth = (int)g.context.measureText(text).getWidth(); g.restore();
            int top = Math.min(point1.y, lead1.y) - valueFontSize*2;
            int bottom = Math.max(point1.y, lead1.y) + valueFontSize*2;
            for (CircuitElm other : app.elmList) {
                if (!(other instanceof GroundElm)) continue;
                Point ground = other.getPost(0);
                if (Math.abs(ground.x - point1.x) > textWidth/2+12 || ground.y+34 < top || ground.y > bottom) continue;
                int shift = Math.max(28, textWidth/2+18);
                labelStart = new Point(point1.x+shift, point1.y);
                labelEnd = new Point(lead1.x+shift, lead1.y);
                drawThickLine(g, point1, labelStart, (busWidth > 1) ? 5 : 3);
                break;
            }
        }
        drawThickLine(g, labelStart, labelEnd, (busWidth > 1) ? 5 : 3);`);
replace('LabeledNodeElm.java', '\tdrawLabeledNode(g, text, point1, lead1);', '\tdrawLabeledNode(g, text, labelStart, labelEnd);');
replace('CircuitElm.java', '    native void addJSMethods() /*-{', `    native com.google.gwt.core.client.JavaScriptObject anacodeWirePoint(int x, int y) /*-{
        return {x:x, y:y};
    }-*/;
    com.google.gwt.core.client.JsArray<com.google.gwt.core.client.JavaScriptObject> getWirePathJS() {
        if (!(this instanceof WireElm) || getPostCount() != 2) return null;
        com.google.gwt.core.client.JsArray<com.google.gwt.core.client.JavaScriptObject> result = com.google.gwt.core.client.JavaScriptObject.createArray().cast();
        if (this instanceof RoutedWireElm && ((RoutedWireElm)this).routePoints != null) {
            for (Point point : ((RoutedWireElm)this).routePoints) result.push(anacodeWirePoint(point.x, point.y));
        } else { result.push(anacodeWirePoint(x,y)); result.push(anacodeWirePoint(x2,y2)); }
        return result;
    }
    String getLabelStyleJS() {
        return this instanceof LabeledNodeElm ? (((LabeledNodeElm)this).anacodeFlag() ? "flag" : "plain") : null;
    }
    String setLabelStyleJS(String style) {
        if (!(this instanceof LabeledNodeElm)) return "Select a net label.";
        if (!style.equals("plain") && !style.equals("flag")) return "Choose plain or flag.";
        app.undoManager.pushUndo();
        flags = style.equals("flag") ? flags | LabeledNodeElm.FLAG_ANACODE_FLAG : flags & ~LabeledNodeElm.FLAG_ANACODE_FLAG;
        app.unsavedChanges = true; app.needAnalyze(); app.repaint(); return null;
    }
    native void addJSMethods() /*-{`);
replace('CircuitElm.java', '        var that = this;\n', `        var that = this;
        this.getWirePath = $entry(function() { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getWirePathJS()(); });
        this.getLabelStyle = $entry(function() { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getLabelStyleJS()(); });
        this.setLabelStyle = $entry(function(style) { return that.@com.lushprojects.circuitjs1.client.CircuitElm::setLabelStyleJS(Ljava/lang/String;)(style); });
`);
replace('GroundElm.java', '\tvoid draw(Graphics g) {', `        void setPoints() {
            // Only the non-electrical endpoint is normalized. The ground post
            // and its existing wire/node identity stay exactly where authored.
            x2 = x; y2 = y + Math.max(24, Math.abs(y2-y)); super.setPoints();
        }
\tvoid draw(Graphics g) {`);
replace('JSInterface.java', '    native void setupJSInterface() /*-{', `    String addNetLabel(String name, String style) {
        if (name == null || !name.matches("[A-Za-z_][A-Za-z0-9_.$:/-]{0,63}")) return "Use a label beginning with a letter or underscore, followed by up to 63 letters, digits, underscores, dots, slashes, colons or hyphens.";
        if (!style.equals("plain") && !style.equals("flag")) return "Choose plain or flag.";
        LabeledNodeElm.anacodeLastName = name; LabeledNodeElm.anacodeLastFlag = style.equals("flag");
        app.commands.menuPerformed("main", "LabeledNodeElm"); return null;
    }
    void resetSimulation() {
        boolean running = app.simIsRunning();
        app.resetAction(); app.setSimRunning(running);
    }
    native JavaScriptObject makeHit(JavaScriptObject element, int post, double x, double y, double distance, boolean wire, double fraction) /*-{
        return { element: element, post: post, x: x, y: y, distance: distance, wire: wire, pathFraction: wire ? fraction : null };
    }-*/;
    JavaScriptObject hitTest(double sx, double sy) {
        if (Double.isNaN(sx) || Double.isNaN(sy) || Double.isInfinite(sx) || Double.isInfinite(sy) || !app.circuitArea.contains((int)sx, (int)sy)) return null;
        double scale = Math.abs(app.transform[0]);
        if (!(scale > 0)) return null;
        double gx = (sx-app.transform[4])/app.transform[0], gy = (sy-app.transform[5])/app.transform[3];
        CircuitElm closest = null;
        int post = 0;
        double px = 0, py = 0, fraction = 0, distance = 12*12/(scale*scale);
        // Real posts take priority; no component-body click invents a voltage node.
        for (CircuitElm element : app.elmList) {
            if (element instanceof GraphicElm) continue;
            for (int n = 0; n < element.getPostCount(); n++) {
                Point p = element.getPost(n);
                double d = (p.x-gx)*(p.x-gx)+(p.y-gy)*(p.y-gy);
                if (d <= distance) { distance=d; closest=element; post=n; px=p.x; py=p.y; }
            }
        }
        if (closest != null) { closest.addJSMethods(); return makeHit(closest.getJavaScriptObject(), post, px, py, Math.sqrt(distance)*scale, closest instanceof WireElm, post == 0 ? 0 : 1); }
        for (CircuitElm element : app.elmList) {
            if (!(element instanceof WireElm) || element.getPostCount() != 2) continue;
            // Native segment-distance code chooses the same wire the editor sees.
            if (element.getMouseDistance((int)Math.round(gx), (int)Math.round(gy)) > distance) continue;
            java.util.ArrayList<Point> points = new java.util.ArrayList<Point>();
            if (element instanceof RoutedWireElm && ((RoutedWireElm)element).routePoints != null) points = ((RoutedWireElm)element).routePoints;
            else { points.add(element.getPost(0)); points.add(element.getPost(1)); }
            double total = 0, walked = 0;
            for (int n=1; n<points.size(); n++) {
                double dx=points.get(n).x-points.get(n-1).x, dy=points.get(n).y-points.get(n-1).y;
                total += Math.sqrt(dx*dx+dy*dy);
            }
            if (!(total > 0)) continue;
            for (int n = 1; n < points.size(); n++) {
                Point a=points.get(n-1), b=points.get(n);
                double dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
                if (!(length > 0)) continue;
                double t=Math.max(0, Math.min(1, ((gx-a.x)*dx+(gy-a.y)*dy)/length));
                double x=a.x+t*dx, y=a.y+t*dy, d=(x-gx)*(x-gx)+(y-gy)*(y-gy);
                if (d <= distance) { closest=element; distance=d; px=x; py=y; fraction=(walked+t*Math.sqrt(length))/total; }
                walked += Math.sqrt(length);
            }
        }
        if (closest == null) return null;
        closest.addJSMethods(); return makeHit(closest.getJavaScriptObject(), 0, px, py, Math.sqrt(distance)*scale, true, fraction);
    }
    native void setupJSInterface() /*-{`);
replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            hitTest: $entry(function(x, y) { return that.@com.lushprojects.circuitjs1.client.JSInterface::hitTest(DD)(x, y); }),
            addNetLabel: $entry(function(name, style) { return that.@com.lushprojects.circuitjs1.client.JSInterface::addNetLabel(Ljava/lang/String;Ljava/lang/String;)(name, style); }),
            resetSimulation: $entry(function() { that.@com.lushprojects.circuitjs1.client.JSInterface::resetSimulation()(); }),`);
// Presentation text is native XML/undo state. Moving it never moves a post,
// changes a net name, or substitutes a second connectivity implementation.
replace('CircuitElm.java', '    Rectangle anacodeValueBounds;', `    int anacodeTextX, anacodeTextY, anacodeTextAngle;
    Rectangle anacodeValueBounds;
    void anacodeTextBounds(int x, int y, int left, int top, int width, int height) {
        double angle = anacodeTextAngle * Math.PI / 180;
        double cs = Math.cos(angle), sn = Math.sin(angle);
        int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, maxY = Integer.MIN_VALUE;
        for (int i=0; i<4; i++) {
            int px = left + ((i&1)==0 ? 0 : width), py = top + ((i&2)==0 ? 0 : height);
            int tx = (int)Math.round(x + px*cs - py*sn), ty = (int)Math.round(y + px*sn + py*cs);
            minX = Math.min(minX, tx); minY = Math.min(minY, ty); maxX = Math.max(maxX, tx); maxY = Math.max(maxY, ty);
        }
        anacodeValueBounds = new Rectangle(minX-3, minY-3, maxX-minX+6, maxY-minY+6);
        adjustBbox(minX-3,minY-3,maxX+3,maxY+3);
    }
    void anacodeDrawValue(Graphics g, String text, int x, int y, int width) {
        x += anacodeTextX; y += anacodeTextY;
        g.save(); g.context.translate(x,y); g.context.rotate(anacodeTextAngle*Math.PI/180);
        g.drawString(text,0,0); g.restore();
        anacodeTextBounds(x,y,0,-valueFontSize,width,valueFontSize+3);
    }
    String setLabelAngleJS(double angle) {
        if (!(this instanceof LabeledNodeElm)) return "Select a net label.";
        if (app.ui.isReadOnly()) return "This schematic is read only.";
        if (Double.isNaN(angle) || Double.isInfinite(angle) || angle%90 != 0) return "Choose an angle in steps of 90 degrees.";
        int normalized = (int)((angle%360+360)%360);
        if (normalized == anacodeTextAngle) return null;
        app.undoManager.pushUndo(); anacodeTextAngle = normalized;
        app.unsavedChanges = true; app.undoManager.writeRecoveryToStorage(); app.repaint(); return null;
    }`);
replace('CircuitElm.java', '    void dumpXml(Document doc, Element elem) {', `    void dumpXml(Document doc, Element elem) {
        if (anacodeTextX != 0) XMLSerializer.dumpAttr(elem,"atx",anacodeTextX);
        if (anacodeTextY != 0) XMLSerializer.dumpAttr(elem,"aty",anacodeTextY);
        if (anacodeTextAngle != 0) XMLSerializer.dumpAttr(elem,"ata",anacodeTextAngle);`);
replace('CircuitElm.java', '    void undumpXml(XMLDeserializer xml) {', `    void undumpXml(XMLDeserializer xml) {
        anacodeTextX = Math.max(-100000,Math.min(100000,xml.parseIntAttr("atx",0)));
        anacodeTextY = Math.max(-100000,Math.min(100000,xml.parseIntAttr("aty",0)));
        int angle = xml.parseIntAttr("ata",0); anacodeTextAngle = angle%90==0 ? (angle%360+360)%360 : 0;`);
replace('CircuitElm.java', '        this.getLabelStyle = $entry(', `        this.getLabelAngle = $entry(function() { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getLabelStyleJS()() === null ? null : that.@com.lushprojects.circuitjs1.client.CircuitElm::anacodeTextAngle; });
        this.setLabelAngle = $entry(function(angle) { return that.@com.lushprojects.circuitjs1.client.CircuitElm::setLabelAngleJS(D)(angle); });
        this.getBusWidth = $entry(function() { return that.@com.lushprojects.circuitjs1.client.CircuitElm::getBusWidth()(); });
        this.getLabelStyle = $entry(`);
replace('CircuitElm.java', '            g.drawString(s, xc-w/2, yc-abs(dpy)-2);', '            anacodeDrawValue(g,s,xc-w/2,yc-abs(dpy)-2,w);');
replace('CircuitElm.java', '            g.drawString(s, xx, yc+dpy+ya);', '            anacodeDrawValue(g,s,xx,yc+dpy+ya,w);');
// Op-amp's generic first resize handle is an internal geometry anchor halfway
// between its inputs. Selection marks belong only to its three real posts.
replace('CircuitElm.java', '    void drawHandles(Graphics g, Color c) {', `    void drawHandles(Graphics g, Color c) {
        if (this instanceof OpAmpElm) {
            g.setColor(c);
            for (int i=0;i<getPostCount();i++) { Point p=getPost(i); g.drawRect(p.x-3,p.y-3,6,6); }
            return;
        }`);
// Scope-free host sampling still needs native solved wire currents on each
// accepted timestep, not the final value deferred until the repaint batch ends.
replace('SimulationManager.java', 'boolean delayWireProcessing = !anacodeBatch && app.scopeManager.canDelayWireProcessing();', 'boolean delayWireProcessing = !anacodeBatch && !anacodeHasTimestepHook() && app.scopeManager.canDelayWireProcessing();');
replace('SimulationManager.java', '    boolean anacodeBatch;', `    native boolean anacodeHasTimestepHook() /*-{
        return !!($wnd.CircuitJS1 && typeof $wnd.CircuitJS1.ontimestep === 'function');
    }-*/;
    boolean anacodeBatch;`);
// A text drag and a double-click value edit are separate native gestures.
replace('MouseManager.java', '                ce.addJSMethods(); anacodeShowValue(ce); return true;', `                anacodeTextDrag = ce; anacodeTextDownX=gx; anacodeTextDownY=gy;
                anacodeTextOldX=ce.anacodeTextX; anacodeTextOldY=ce.anacodeTextY; anacodeTextChanged=false;
                setMouseElm(ce); return true;`);
replace('MouseManager.java', 'ce.anacodeValueIndex() >= 0) {', '(ce instanceof LabeledNodeElm || ce.anacodeValueIndex() >= 0)) {');
replace('MouseManager.java', '    boolean anacodeValueClick(int x, int y) {', `    CircuitElm anacodeTextDrag;
    int anacodeTextDownX, anacodeTextDownY, anacodeTextOldX, anacodeTextOldY;
    boolean anacodeTextChanged;
    void anacodeEndTextDrag() {
        if (anacodeTextDrag == null) return;
        if (anacodeTextChanged) { sim.unsavedChanges=true; sim.undoManager.writeRecoveryToStorage(); }
        anacodeTextDrag=null; sim.repaint();
    }
    boolean anacodeValueClick(int x, int y) {`);
replace('MouseManager.java', '    public void onMouseMove(MouseMoveEvent e) {', `    public void onMouseMove(MouseMoveEvent e) {
        if (anacodeTextDrag != null) {
            int dx=inverseTransformX(e.getX())-anacodeTextDownX, dy=inverseTransformY(e.getY())-anacodeTextDownY;
            if (!anacodeTextChanged && dx*dx+dy*dy<9) return;
            if (!anacodeTextChanged) { sim.undoManager.pushUndo(); anacodeTextChanged=true; }
            anacodeTextDrag.anacodeTextX=anacodeTextOldX+dx; anacodeTextDrag.anacodeTextY=anacodeTextOldY+dy;
            sim.repaint(); e.preventDefault(); return;
        }`);
replace('MouseManager.java', '    public void onMouseUp(MouseUpEvent e) {', `    public void onMouseUp(MouseUpEvent e) {
        if (anacodeTextDrag != null) { anacodeEndTextDrag(); e.preventDefault(); return; }`);
replace('MouseManager.java', '    public void onMouseOut(MouseOutEvent e) {', `    public void onMouseOut(MouseOutEvent e) {
        anacodeEndTextDrag();`);
replace('MouseManager.java', '    public void onDoubleClick(DoubleClickEvent e){', `    public void onDoubleClick(DoubleClickEvent e){
        if (!ui.isReadOnly() && mouseMode == MODE_SELECT) {
            int gx=inverseTransformX(e.getX()), gy=inverseTransformY(e.getY());
            for (CircuitElm ce : ui.elmList) {
                if (ce instanceof LabeledNodeElm || ce.anacodeValueIndex()<0 || ce.anacodeValueBounds==null || !ce.anacodeValueBounds.contains(gx,gy)) continue;
                ce.addJSMethods(); anacodeShowValue(ce); e.preventDefault(); return;
            }
        }`);
// Net-label tethers terminate at a separate text/flag anchor. A vertical label
// starts to the side of its wire; all offsets/rotation are presentation only.
replaceSection('LabeledNodeElm.java', '    void drawLabeledNode(Graphics g, String str, Point pt1, Point pt2) {', '    void drawRotatedLabeledNode(', `    void drawLabeledNode(Graphics g, String str, Point pt1, Point pt2) {
        g.save(); g.setFont(valueFont);
        boolean overline=str.startsWith("/"); if(overline) str=str.substring(1);
        int width=(int)g.context.measureText(str).getWidth(), height=valueFontSize+8;
        int anchorX=pt2.x, anchorY=pt2.y;
        int dir=point2.x<point1.x ? -1 : 1;
        int left=dir>0 ? 8 : -width-8;
        g.context.translate(anchorX,anchorY); g.context.rotate(anacodeTextAngle*Math.PI/180);
        g.context.setTextBaseline("middle");
        if(anacodeFlag()) {
            int near=dir*7, far=dir*(width+23);
            g.setLineWidth(3); g.context.beginPath(); g.context.moveTo(0,0);
            g.context.lineTo(near,-height/2); g.context.lineTo(far,-height/2);
            g.context.lineTo(far,height/2); g.context.lineTo(near,height/2); g.context.closePath(); g.context.stroke();
            left=dir>0 ? 15 : -width-15;
        }
        g.drawString(str,left,0); if(overline) g.drawLine(left,-height/2,left+width,-height/2);
        g.restore();
        anacodeTextBounds(anchorX,anchorY,Math.min(0,left)-3,-height/2,Math.max(width+16,Math.abs(left)+width)+6,height);
    }

`);
replace('LabeledNodeElm.java', '        Point labelStart = point1, labelEnd = lead1;', `        Point labelStart = point1, labelEnd = lead1;`);
replace('LabeledNodeElm.java', '        drawThickLine(g, labelStart, labelEnd, (busWidth > 1) ? 5 : 3);', `        int extraX = point1.x == point2.x && labelEnd.x==point1.x ? 16 : 0;
        labelEnd = new Point(labelEnd.x+extraX+anacodeTextX,labelEnd.y+anacodeTextY);
        Point bend=new Point(labelStart.x,labelEnd.y);
        drawThickLine(g,labelStart,bend,(busWidth>1)?5:3);
        drawThickLine(g,bend,labelEnd,(busWidth>1)?5:3);`);
// Migrate the upstream rotate-when-vertical flag once, for both legacy text and
// XML without an explicit angle. One properties control then owns the angle;
// Apply must not overwrite it with a second, stale checkbox/choice value.
replace('LabeledNodeElm.java', '\tsuper(xa, ya, xb, yb, f);', `\tsuper(xa, ya, xb, yb, f);
        if ((flags & FLAG_ROTATE_TEXT) != 0 && xa == xb) anacodeTextAngle = 270;
        flags &= ~FLAG_ROTATE_TEXT;`);
replace('LabeledNodeElm.java', '        text = xml.parseStringAttr("te", text);', `        text = xml.parseStringAttr("te", text);
        if (xml.parseStringAttr("ata", "").length() == 0 && isRotateText() && x == x2) anacodeTextAngle = 270;
        flags &= ~FLAG_ROTATE_TEXT;`);
replace('LabeledNodeElm.java', '\t    EditInfo ei = new EditInfo("", 0, -1, -1);\n\t    ei.checkbox = new Checkbox("Rotate Text When Vertical", isRotateText());\n\t    return ei;', `            EditInfo ei = new EditInfo("Label angle", 0); ei.choice = new Choice();
            ei.choice.add("0°"); ei.choice.add("90°"); ei.choice.add("180°"); ei.choice.add("270°");
            ei.choice.select(anacodeTextAngle/90); return ei;`);
replace('LabeledNodeElm.java', '\t    flags = ei.changeFlag(flags, FLAG_ROTATE_TEXT);', '            anacodeTextAngle = ei.choice.getSelectedIndex()*90;');

// Keep annotations above geometry, with real clearance from native segments and
// nearby text. This changes display coordinates only, never electrical posts.
replace('CircuitElm.java', '        anacodeValueBounds = null;', '        anacodeValueBounds = null; anacodeAnnotationText = null;');
replace('CircuitElm.java', '    int anacodeTextX, anacodeTextY, anacodeTextAngle;', `    String anacodeAnnotationText;
    boolean anacodeAnnotationLabel;
    int anacodeAnnotationX, anacodeAnnotationY, anacodeAnnotationWidth;
    int anacodeTextX, anacodeTextY, anacodeTextAngle;`);
replace('CircuitElm.java', '        adjustBbox(minX-3,minY-3,maxX+3,maxY+3);', '        // Final annotation placement extends the hit box after layout.');
replaceSection('CircuitElm.java', '    void anacodeDrawValue(Graphics g, String text, int x, int y, int width) {', '    String setLabelAngleJS(', `    void anacodeDrawValue(Graphics g, String text, int x, int y, int width) {
        anacodeAnnotationText=text; anacodeAnnotationLabel=false;
        anacodeAnnotationX=x+anacodeTextX; anacodeAnnotationY=y+anacodeTextY; anacodeAnnotationWidth=width;
        anacodeTextBounds(anacodeAnnotationX,anacodeAnnotationY,0,-valueFontSize,width,valueFontSize+3);
    }
    static boolean anacodeSegmentOverlap(Rectangle r, Point a, Point b) {
        if(Math.max(a.x,b.x)<r.x || Math.min(a.x,b.x)>r.x+r.width || Math.max(a.y,b.y)<r.y || Math.min(a.y,b.y)>r.y+r.height)return false;
        double min=Double.POSITIVE_INFINITY,max=Double.NEGATIVE_INFINITY;
        for(int i=0;i<4;i++){double x=r.x+((i&1)==0?0:r.width),y=r.y+((i&2)==0?0:r.height),cross=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);min=Math.min(min,cross);max=Math.max(max,cross);}
        return min<=0 && max>=0;
    }
    boolean anacodeAnnotationCollision(Rectangle r) {
        for(CircuitElm other:app.elmList){
            if(other!=this && other.anacodeValueBounds!=null && r.intersects(other.anacodeValueBounds))return true;
            if(other instanceof LabeledNodeElm)continue;
            if(other instanceof GroundElm){Point p=other.getPost(0);if(r.intersects(new Rectangle(p.x-14,p.y,28,36)))return true;continue;}
            if(other instanceof RoutedWireElm && ((RoutedWireElm)other).routePoints!=null){
                java.util.ArrayList<Point> path=((RoutedWireElm)other).routePoints;for(int i=1;i<path.size();i++)if(anacodeSegmentOverlap(r,path.get(i-1),path.get(i)))return true;
            }else if(other.getPostCount()==2 && anacodeSegmentOverlap(r,other.getPost(0),other.getPost(1)))return true;
        }
        return false;
    }
    void anacodePaintAnnotation(Graphics g) {
        if(anacodeAnnotationText==null)return;
        g.save();g.setFont(valueFont);g.setColor(needsHighlight()?selectColor:whiteColor);
        int width=anacodeAnnotationWidth,height=valueFontSize+3,left=0,top=-valueFontSize;
        if(anacodeAnnotationLabel){height=valueFontSize+8;top=-height/2;left=x2<x?-width-8:8;if(((LabeledNodeElm)this).anacodeFlag()){left=x2<x?-width-15:15;width+=16;}}
        int ax=anacodeAnnotationX,ay=anacodeAnnotationY;
        int[] sx={0,0,0,-width-18,width+18,0,0,-width-18,width+18};
        int[] sy={0,-20,20,0,0,-40,40,-20,-20};
        for(int i=0;i<sx.length;i++){
            anacodeTextBounds(ax+sx[i],ay+sy[i],left,top,width,height);
            if((anacodeTextX!=0 || anacodeTextY!=0) || !anacodeAnnotationCollision(anacodeValueBounds)){ax+=sx[i];ay+=sy[i];break;}
            if(i==sx.length-1)anacodeTextBounds(ax,ay,left,top,width,height);
        }
        if(anacodeAnnotationLabel){((LabeledNodeElm)this).anacodePaintLabel(g,anacodeAnnotationText,point1,new Point(ax,ay));}
        else {
            g.context.translate(ax,ay);g.context.rotate(anacodeTextAngle*Math.PI/180);
            g.setColor(app.ui.getBackgroundColor());g.fillRect(left-2,top-2,width+4,height+4);
            g.setColor(needsHighlight()?selectColor:whiteColor);g.drawString(anacodeAnnotationText,0,0);
        }
        Rectangle r=anacodeValueBounds;if(r!=null)adjustBbox(r.x,r.y,r.x+r.width,r.y+r.height);g.restore();
    }
`);
replace('LabeledNodeElm.java', '    void drawLabeledNode(Graphics g, String str, Point pt1, Point pt2) {', `    void drawLabeledNode(Graphics g, String str, Point pt1, Point pt2) {
        anacodeAnnotationText=str;anacodeAnnotationLabel=true;anacodeAnnotationX=pt2.x;anacodeAnnotationY=pt2.y;
        g.save();g.setFont(valueFont);anacodeAnnotationWidth=(int)g.context.measureText(str.startsWith("/")?str.substring(1):str).getWidth();g.restore();
        anacodeTextBounds(pt2.x,pt2.y,x2<x?-anacodeAnnotationWidth-8:8,-(valueFontSize+8)/2,anacodeAnnotationWidth,valueFontSize+8);
    }
    void anacodePaintLabel(Graphics g, String str, Point pt1, Point pt2) {
        g.setColor(needsHighlight()?selectColor:whiteColor);g.context.setLineWidth(2);
        Point bend=new Point(pt1.x,pt2.y);
        if(anacodeValueBounds!=null && (anacodeSegmentOverlap(anacodeValueBounds,pt1,bend)||anacodeSegmentOverlap(anacodeValueBounds,bend,pt2)))bend=new Point(pt2.x,pt1.y);
        g.context.beginPath();g.context.moveTo(pt1.x,pt1.y);g.context.lineTo(bend.x,bend.y);g.context.lineTo(pt2.x,pt2.y);g.context.stroke();`);
replace('LabeledNodeElm.java', '        g.context.setTextBaseline("middle");\n        if(anacodeFlag()) {', `        g.context.setTextBaseline("middle");
        int backingLeft=anacodeFlag()?(dir>0?0:-width-25):left-2;
        int backingWidth=anacodeFlag()?width+25:width+4;
        g.setColor(app.ui.getBackgroundColor());g.fillRect(backingLeft,-height/2-2,backingWidth,height+4);
        g.setColor(needsHighlight()?selectColor:whiteColor);
        if(anacodeFlag()) {`);
replace('LabeledNodeElm.java', '                drawThickLine(g, point1, labelStart, (busWidth > 1) ? 5 : 3);', '                // The final annotation pass draws the complete tether.');
replace('LabeledNodeElm.java', '        drawThickLine(g,labelStart,bend,(busWidth>1)?5:3);\n        drawThickLine(g,bend,labelEnd,(busWidth>1)?5:3);', '        // Text and tether are rendered together after automatic clearance.');
replace('UIManager.java', '        if (mouse.tempMouseMode == MouseManager.MODE_DRAG_ROW ||', `        for(CircuitElm element:elmList)element.anacodePaintAnnotation(g);

        if (mouse.tempMouseMode == MouseManager.MODE_DRAG_ROW ||`);
replace('CircuitElm.java', '    static void drawPost(Graphics g, Point pt) {', `    static void drawPost(Graphics g, Point pt) {
        int physicalPosts=0;
        for(CircuitElm element:app.elmList){if(element instanceof LabeledNodeElm)continue;for(int n=0;n<element.getPostCount();n++)if(element.getPost(n).equals(pt))physicalPosts++;}
        if(physicalPosts<3)return;`);
replace('CircuitElm.java', 'g.fillOval(pt.x-2, pt.y-2, 4, 4);', 'g.fillOval(pt.x-3, pt.y-3, 6, 6);');
// Imports are fitted before their first visible paint. Measure the real native
// captions on an offscreen canvas so source values and displaced labels are
// included in that first fit, rather than clipped at the viewport's left edge.
replace('UIManager.java', '\tRectangle bounds = getCircuitBounds();', `        com.google.gwt.canvas.client.Canvas measure = com.google.gwt.canvas.client.Canvas.createIfSupported();
        if(measure != null) {
            measure.setCoordinateSpaceWidth(1); measure.setCoordinateSpaceHeight(1);
            Graphics annotationGraphics = new Graphics(measure.getContext2d());
            annotationGraphics.setFont(CircuitElm.unitsFont);
            for(CircuitElm ce:elmList)ce.drawWithKiCad(annotationGraphics);
            for(CircuitElm ce:elmList)ce.anacodePaintAnnotation(annotationGraphics);
        }
\tRectangle bounds = getCircuitBounds();`);
// The upstream PNG/SVG exporters use their own native draw pass. Keep the same
// annotation finalization there so deferring canvas captions cannot drop them
// from exported images.
replace('ImageExporter.java', '\t\t    ce.draw(g);', '\t\t    ce.anacodeValueBounds=null; ce.anacodeAnnotationText=null; ce.draw(g);');
replace('ImageExporter.java', '\t\t// restore everything', '        for(CircuitElm ce:sim.elmList)ce.anacodePaintAnnotation(g);\n\t\t// restore everything');
replace('ImageExporter.java', 'CircuitElm.whiteColor = Color.white;\n\t            CircuitElm.lightGrayColor = Color.lightGray;\n\t            g.setColor(Color.black);', 'CircuitElm.whiteColor = new Color(sim.ui.anacodeLight ? "#252b32" : "#d2d8df");\n                CircuitElm.lightGrayColor = CircuitElm.whiteColor;\n                g.setColor(sim.ui.getBackgroundColor());');

patchCircuitJsStimulus(client);
console.log('Applied CircuitJS native editing, bounded solver acquisition and attributed symbol presentation.');
