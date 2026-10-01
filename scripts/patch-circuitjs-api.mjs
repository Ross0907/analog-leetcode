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
        mouse.anacodeCancelWire();`);
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
console.log('Applied CircuitJS measurement, native editing, inline values, theme and KiCad presentation integration.');
