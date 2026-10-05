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
  replace('VoltageElm.java', '    public EditInfo getEditInfo(int n) {', `    public EditInfo getEditInfo(int n) {
        if (anacodePwlTimes != null) {
            if (n == 0) { EditInfo ei = new EditInfo("PWL points", 0); ei.widget = new AnacodePwlEditor(this); return ei; }
            if (n == 1) { EditInfo ei = new EditInfo("", 0); ei.button = new com.google.gwt.user.client.ui.Button("Use standard waveform settings"); return ei; }
            return null;
        }`);
  replace('VoltageElm.java', '    public void setEditValue(int n, EditInfo ei) {', `    public void setEditValue(int n, EditInfo ei) {
        if (anacodePwlTimes != null) {
            if (n == 0) {
                try { AnacodePwlEditor editor = (AnacodePwlEditor)ei.widget; String data=editor.data(); double repeat=editor.period();
                    VoltageElm check=new VoltageElm(0,0,WF_AC); check.setAnacodePwl(data,repeat); setAnacodePwl(data,repeat);
                } catch (Exception error) { ei.setError("Enter finite points with increasing times and a nonnegative repeat period."); }
            } else if (n == 1) { setAnacodePwl(null,0); ei.newDialog=true; }
            return;
        }
        setAnacodePwl(null, 0);`);
  writeFileSync(join(client, 'AnacodePwlEditor.java'), `// SPDX-License-Identifier: GPL-2.0-or-later
package com.lushprojects.circuitjs1.client;

import java.util.Vector;
import com.google.gwt.user.client.ui.*;
import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.canvas.dom.client.Context2d;

/** A native property widget. Draft points never reach the solver before Apply. */
class AnacodePwlEditor extends VerticalPanel {
    Vector<TextBox> times=new Vector<TextBox>(), values=new Vector<TextBox>();
    FlexTable table=new FlexTable(); TextBox repeat=new TextBox(); Label error=new Label();
    Canvas preview=Canvas.createIfSupported(); Button add=new Button("Add point");
    AnacodePwlEditor(VoltageElm source) {
        setStyleName("anacode-pwl-editor");
        add(new Label("Time in seconds and voltage in volts; engineering units such as 1m and 500u are accepted."));
        if(preview!=null){preview.setCoordinateSpaceWidth(580);preview.setCoordinateSpaceHeight(170);preview.getElement().setAttribute("aria-label","PWL waveform preview");add(preview);}
        error.setStyleName("pwl-error");error.getElement().setAttribute("role","status");add(error);add(table);
        for(int i=0;i<source.anacodePwlTimes.length;i++)append(Double.toString(source.anacodePwlTimes[i]),Double.toString(source.anacodePwlValues[i]));
        add.addClickHandler(event->{if(times.size()>=1024)return;double last=0,step=.001;try{last=EditDialog.parseUnits(times.lastElement().getText());if(times.size()>1)step=Math.max(1e-12,last-EditDialog.parseUnits(times.get(times.size()-2).getText()));}catch(Exception ignored){}append(Double.toString(last+step),values.lastElement().getText());rows();draw();});
        add(add);HorizontalPanel period=new HorizontalPanel();period.setStyleName("pwl-repeat");period.add(new Label("Repeat period (s; 0 = once)"));repeat.setText(Double.toString(source.anacodePwlRepeat));repeat.getElement().setAttribute("aria-label","PWL repeat period");period.add(repeat);add(period);
        repeat.addKeyUpHandler(event->draw());repeat.addChangeHandler(event->draw());rows();draw();
    }
    void append(String time,String value){TextBox t=new TextBox(),v=new TextBox();t.setText(time);v.setText(value);times.add(t);values.add(v);t.addKeyUpHandler(event->draw());v.addKeyUpHandler(event->draw());t.addChangeHandler(event->draw());v.addChangeHandler(event->draw());}
    void rows(){table.removeAllRows();table.setText(0,0,"Time (s)");table.setText(0,1,"Voltage (V)");table.setText(0,2,"");
        for(int i=0;i<times.size();i++){final int index=i;times.get(i).getElement().setAttribute("aria-label","PWL time "+(i+1));values.get(i).getElement().setAttribute("aria-label","PWL voltage "+(i+1));table.setWidget(i+1,0,times.get(i));table.setWidget(i+1,1,values.get(i));Button remove=new Button("Remove");remove.getElement().setAttribute("aria-label","Remove PWL point "+(i+1));remove.setEnabled(times.size()>2);remove.addClickHandler(event->{times.remove(index);values.remove(index);rows();draw();});table.setWidget(i+1,2,remove);}add.setEnabled(times.size()<1024);
    }
    double period() throws java.text.ParseException {return EditDialog.parseUnits(repeat.getText());}
    String data() throws java.text.ParseException {StringBuilder text=new StringBuilder();for(int i=0;i<times.size();i++){if(i>0)text.append(' ');text.append(EditDialog.parseUnits(times.get(i).getText()));text.append(' ');text.append(EditDialog.parseUnits(values.get(i).getText()));}return text.toString();}
    void draw(){if(preview==null)return;Context2d g=preview.getContext2d();boolean dark="dark".equals(com.google.gwt.dom.client.Document.get().getDocumentElement().getAttribute("data-theme"));String ink=dark?"#d2d8df":"#252b32";g.setFillStyle(dark?"#17191d":"#fafbfc");g.fillRect(0,0,580,170);
        try{VoltageElm check=new VoltageElm(0,0,VoltageElm.WF_AC);check.setAnacodePwl(data(),period());double maxTime=Math.max(check.anacodePwlTimes[check.anacodePwlTimes.length-1],check.anacodePwlRepeat),min=Double.POSITIVE_INFINITY,max=Double.NEGATIVE_INFINITY;
            for(double value:check.anacodePwlValues){min=Math.min(min,value);max=Math.max(max,value);}double range=Math.max(1e-9,max-min);if(max==min){min-=.5;max+=.5;range=1;}maxTime=Math.max(1e-12,maxTime);
            g.setStrokeStyle(dark?"#39424e":"#d7dfe7");g.setLineWidth(1);for(int i=0;i<=4;i++){double x=50+i*125,y=18+i*30;g.beginPath();g.moveTo(x,18);g.lineTo(x,138);g.moveTo(50,y);g.lineTo(550,y);g.stroke();}
            g.setStrokeStyle(dark?"#e4b568":"#a96809");g.setLineWidth(2);g.beginPath();g.moveTo(50,138-(check.anacodePwlValues[0]-min)/range*120);for(int i=0;i<check.anacodePwlTimes.length;i++)g.lineTo(50+check.anacodePwlTimes[i]/maxTime*500,138-(check.anacodePwlValues[i]-min)/range*120);g.lineTo(550,138-(check.anacodePwlValues[check.anacodePwlValues.length-1]-min)/range*120);g.stroke();
            g.setFillStyle(ink);g.setFont("11px Arial");g.fillText(CircuitElm.getUnitText(max,"V"),2,22);g.fillText(CircuitElm.getUnitText(min,"V"),2,140);g.fillText("0 s",50,160);g.fillText(CircuitElm.getUnitText(maxTime,"s"),490,160);error.setText("");
        }catch(Exception invalid){error.setText("Enter 2–1024 finite points with increasing times. Repeat period must be zero or positive.");}
    }
}
`);
  replace('VoltageElm.java', '    void getInfo(String arr[]) {', `    void getInfo(String arr[]) {
        if (anacodePwlTimes != null) {
            arr[0] = "PWL voltage source";
            arr[1] = "I = " + getCurrentText(getCurrent());
            arr[2] = "V = " + getVoltageText(getVoltage());
            arr[3] = anacodePwlTimes.length + " programmed points";
            arr[4] = anacodePwlRepeat > 0 ? "Repeat = " + getUnitText(anacodePwlRepeat, "s") : "Single sequence";
            return;
        }`);
  replace('VoltageElm.java', '\tint xc2;\n\tswitch (waveform)', '\tint xc2;\n\tswitch (anacodePwlTimes != null ? WF_PULSE : waveform)');
  replace('VoltageElm.java', '\t    if (s != null) {\n\t\tint hs', '\t    if (anacodePwlTimes != null && showValues()) s = anacodePwlRepeat > 0 ? "PWL " + getShortUnitText(anacodePwlRepeat, "s") : "PWL";\n\t    if (s != null) {\n\t\tint hs');
  replace('VoltageElm.java', '\t    if (s != null)\n\t\tdrawValues(g, s, circleSize);', '\t    if (anacodePwlTimes != null && showValues()) s = anacodePwlRepeat > 0 ? "PWL " + getShortUnitText(anacodePwlRepeat, "s") : "PWL";\n\t    if (s != null)\n\t\tdrawValues(g, s, circleSize);');
  replace('CircuitElm.java', 'int getWaveformJS() { return this instanceof VoltageElm ? ((VoltageElm) this).waveform : -1; }', 'int getWaveformJS() { return this instanceof VoltageElm ? (((VoltageElm)this).anacodePwlTimes != null ? -2 : ((VoltageElm)this).waveform) : -1; }');
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
