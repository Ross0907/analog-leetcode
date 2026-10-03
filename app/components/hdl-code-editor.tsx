"use client";

import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';

const editorTheme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--surface)', height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--font-geist-mono), monospace', overflow: 'auto' },
  '.cm-content': { padding: '16px 0', minHeight: '320px' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--text-muted)', border: 'none' },
  '.cm-line': { padding: '0 18px 0 8px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)' },
});

export function HdlCodeEditor({ value, onChange, label, reveal, readOnly=false }: { value: string; onChange: (value: string) => void; label: string; reveal?: { line: number; revision: number }; readOnly?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const callbackRef = useRef(onChange);
  const initialRef = useRef(value);
  useEffect(() => { callbackRef.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!containerRef.current) return;
    const theme = new Compartment();
    const state = EditorState.create({ doc: initialRef.current, extensions: [
      lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      StreamLanguage.define(verilog), syntaxHighlighting(defaultHighlightStyle), editorTheme,
      EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
      EditorView.cspNonce.of(document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? ''),
      theme.of(EditorView.theme({}, { dark: document.documentElement.dataset.theme === 'dark' })),
      EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', 'aria-readonly': String(readOnly), 'role': 'textbox', spellcheck: 'false' }),
      EditorView.updateListener.of(update => { if (update.docChanged) callbackRef.current(update.state.doc.toString()); }),
    ] });
    const view = new EditorView({ state, parent: containerRef.current });
    editorRef.current = view;
    const observer = new MutationObserver(() => view.dispatch({ effects: theme.reconfigure(EditorView.theme({}, { dark: document.documentElement.dataset.theme === 'dark' })) }));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { observer.disconnect(); view.destroy(); editorRef.current = null; };
  }, [label,readOnly]);
  useEffect(() => {
    const view = editorRef.current;
    if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    const view=editorRef.current;
    if(view && reveal){const line=view.state.doc.line(Math.max(1,Math.min(view.state.doc.lines,reveal.line)));view.dispatch({selection:{anchor:line.from},effects:EditorView.scrollIntoView(line.from,{y:'center'})});view.focus();}
  },[reveal]);
  return <div ref={containerRef} style={{ height: '100%', minWidth: 0 }} />;
}
