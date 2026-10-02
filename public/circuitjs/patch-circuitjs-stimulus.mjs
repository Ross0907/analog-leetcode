// SPDX-License-Identifier: GPL-2.0-or-later
// Native VoltageElm stimulus tables and upstream CustomCompositeModel bridges.
// CircuitJS still stamps, solves, serializes and places every element itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function patchCircuitJsStimulus(client) {
  const replace = (file, before, after) => {
    const path = join(client, file), text = readFileSync(path, 'utf8');
    if (!text.includes(before)) throw Error('Upstream stimulus API changed: ' + file);
    writeFileSync(path, text.replace(before, after));
  };
  replace('VoltageElm.java', '    double getVoltage() {', `    double[] anacodePwlTimes, anacodePwlValues;
    String anacodePwlText;
    double anacodePwlRepeat;
    void setAnacodePwl(String data, double period) {
        if (data == null || data.length() == 0) { anacodePwlTimes = null; anacodePwlValues = null; anacodePwlText = null; return; }
        String[] fields = data.trim().split("\\\\s+");
        if (fields.length < 4 || fields.length > 2048 || fields.length % 2 != 0) throw new IllegalArgumentException("Use 2-1024 time/value pairs.");
        double[] times = new double[fields.length/2], values = new double[fields.length/2];
        for (int i=0; i<times.length; i++) {
            times[i] = Double.parseDouble(fields[i*2]); values[i] = Double.parseDouble(fields[i*2+1]);
            if (Double.isNaN(times[i]) || Double.isInfinite(times[i]) || times[i] < 0 || times[i] > 1e9 || Double.isNaN(values[i]) || Double.isInfinite(values[i]) || Math.abs(values[i]) > 1e6 || (i > 0 && times[i] <= times[i-1])) throw new IllegalArgumentException("Invalid PWL point.");
        }
        if (Double.isNaN(period) || Double.isInfinite(period) || period < 0 || period > 1e9) throw new IllegalArgumentException("Invalid repeat period.");
        anacodePwlTimes = times; anacodePwlValues = values; anacodePwlText = data; anacodePwlRepeat = period;
        waveform = WF_AC;
    }
    double getAnacodePwlVoltage() {
        double time = doDcAnalysis() ? 0 : sim.t;
        if (anacodePwlRepeat > 0) time %= anacodePwlRepeat;
        if (time <= anacodePwlTimes[0]) return anacodePwlValues[0];
        int low = 0, high = anacodePwlTimes.length-1;
        if (time >= anacodePwlTimes[high]) return anacodePwlValues[high];
        while (high-low > 1) { int middle = (high+low)/2; if (anacodePwlTimes[middle] <= time) low = middle; else high = middle; }
        double fraction = (time-anacodePwlTimes[low])/(anacodePwlTimes[high]-anacodePwlTimes[low]);
        return anacodePwlValues[low]+fraction*(anacodePwlValues[high]-anacodePwlValues[low]);
    }
    double getVoltage() {
        if (anacodePwlTimes != null) return getAnacodePwlVoltage();`);
  replace('VoltageElm.java', '        XMLSerializer.dumpAttr(elem, "wf", waveform);', `        if (anacodePwlText != null) { XMLSerializer.dumpAttr(elem, "pwl", anacodePwlText); XMLSerializer.dumpAttr(elem, "pwlr", anacodePwlRepeat); }
        XMLSerializer.dumpAttr(elem, "wf", waveform);`);
  replace('VoltageElm.java', '\tinternalResistance = xml.parseDoubleAttr("ir", 0);', `\tinternalResistance = xml.parseDoubleAttr("ir", 0);
        setAnacodePwl(xml.parseStringAttr("pwl", null), xml.parseDoubleAttr("pwlr", 0));`);
  replace('VoltageElm.java', '    public void setEditValue(int n, EditInfo ei) {', '    public void setEditValue(int n, EditInfo ei) {\n        setAnacodePwl(null, 0);');
  replace('DataInputElm.java', '\tdouble getVoltage() {', '\tdouble getVoltage() {\n            if (anacodePwlTimes != null) return getAnacodePwlVoltage();');
  replace('MosfetElm.java', '\t    XMLSerializer.dumpAttr(elem, "mo", modelName);', '\t    XMLSerializer.dumpAttr(elem, "mo", modelName);\n            XMLSerializer.dumpAttr(elem, "vt", vt);\n            XMLSerializer.dumpAttr(elem, "be", beta);');
  replace('JSInterface.java', '    native void setupJSInterface() /*-{', `    String setSourceWaveform(int index, String kind, String data, double repeat) {
        if (index < 0 || index >= app.elmList.size()) return "Source no longer exists.";
        CircuitElm element = app.elmList.get(index);
        if (!(element instanceof VoltageElm)) return "Select a voltage source.";
        VoltageElm source = (VoltageElm) element;
        try {
            if (kind.equals("pwl")) {
                // Validate before recording an undo entry or changing the source.
                VoltageElm check = new VoltageElm(0, 0, VoltageElm.WF_AC); check.setAnacodePwl(data, repeat);
                app.undoManager.pushUndo(); source.setAnacodePwl(data, repeat);
            } else {
                String[] fields = data.trim().split("\\\\s+");
                if (!(kind.equals("dc") && fields.length == 1) && !(kind.equals("sine") && fields.length == 4)) return "Invalid source settings.";
                double[] values = new double[fields.length];
                for (int i=0; i<fields.length; i++) { values[i]=Double.parseDouble(fields[i]); if (Double.isNaN(values[i]) || Double.isInfinite(values[i]) || Math.abs(values[i]) > 1e9) return "Invalid source value."; }
                if (kind.equals("sine") && values[2] <= 0) return "Frequency must be positive.";
                app.undoManager.pushUndo(); source.setAnacodePwl(null, 0);
                if (kind.equals("dc")) { source.waveform=VoltageElm.WF_DC; source.maxVoltage=values[0]; source.bias=0; }
                else { source.waveform=VoltageElm.WF_AC; source.bias=values[0]; source.maxVoltage=values[1]; source.frequency=values[2]; source.phaseShift=values[3]*Math.PI/180; }
            }
            source.setPoints(); app.needAnalyze(); app.repaint(); return null;
        } catch (Exception error) { return "Invalid source settings: " + error.getMessage(); }
    }
    String exportNativeBlock(String name) {
        if (name == null || !name.matches("[A-Za-z][A-Za-z0-9_-]{0,47}")) throw new IllegalArgumentException("Use a short block name containing letters, digits, underscores or hyphens.");
        if (CustomCompositeModel.getModelWithName(name) != null) throw new IllegalArgumentException("A block already has that name; choose a new version name.");
        EditCompositeModelDialog editor = new EditCompositeModelDialog();
        if (!editor.createModel()) throw new IllegalArgumentException("Label each external port and select the block components before saving.");
        CustomCompositeModel model = editor.model;
        if (model.extList.size() > 32) throw new IllegalArgumentException("A block may have at most 32 external terminals.");
        model.name=name; model.setShowLabel(true);
        com.google.gwt.xml.client.Document doc = com.google.gwt.xml.client.XMLParser.createDocument();
        doc.appendChild(doc.createElement("cir"));
        CustomCompositeModel.clearDumpedFlags();
        for (CircuitElm element : app.elmList) element.dumpXmlModel(doc);
        model.dumpXml(doc);
        CustomCompositeModel.localModelMap.put(name, model);
        app.needAnalyze();
        return doc.toString();
    }
    String insertNativeBlock(String name) {
        if (name == null || !name.matches("[A-Za-z][A-Za-z0-9_-]{0,47}") || CustomCompositeModel.getModelWithName(name) == null) return "Import the saved block before placing it.";
        CustomCompositeElm.lastModelName=name;
        app.commands.menuPerformed("main", "CustomCompositeElm"); return null;
    }
    void addAnalysisElement(JsArray<JavaScriptObject> arr, CircuitElm element, int depth) {
        if (depth > 32) throw new IllegalArgumentException("Saved block nesting exceeds 32 levels.");
        if (element instanceof CustomCompositeElm) {
            for (CircuitElm child : element.getChildElmList()) addAnalysisElement(arr, child, depth+1);
            return;
        }
        // Preserve built-in ICs such as OpAmpRealElm as single devices. Their
        // selected SPICE macro-model already represents their internal circuit.
        element.addJSMethods(); arr.push(element.getJavaScriptObject());
    }
    JsArray<JavaScriptObject> getAnalysisElements() {
        JsArray<JavaScriptObject> arr=getJSArray();
        for (CircuitElm element : app.elmList) addAnalysisElement(arr, element, 0);
        return arr;
    }
    native void setupJSInterface() /*-{`);
  replace('JSInterface.java', '\t$wnd.CircuitJS1 = {', `\t$wnd.CircuitJS1 = {
            setSourceWaveform: $entry(function(index,kind,data,repeat) { return that.@com.lushprojects.circuitjs1.client.JSInterface::setSourceWaveform(ILjava/lang/String;Ljava/lang/String;D)(index,kind,data,repeat); }),
            exportNativeBlock: $entry(function(name) { return that.@com.lushprojects.circuitjs1.client.JSInterface::exportNativeBlock(Ljava/lang/String;)(name); }),
            insertNativeBlock: $entry(function(name) { return that.@com.lushprojects.circuitjs1.client.JSInterface::insertNativeBlock(Ljava/lang/String;)(name); }),
            getAnalysisElements: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getAnalysisElements()(); }),`);
}
