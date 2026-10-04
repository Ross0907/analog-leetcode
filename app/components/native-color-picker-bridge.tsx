"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { InlineColorPicker } from './color-picker';
import { normalizeHexColor } from '../../lib/color-picker';
import styles from './native-color-picker-bridge.module.css';

function listenForNativeColors(doc: Document, pick: (input: HTMLInputElement) => void, changed: () => void) {
  const click = (event: MouseEvent) => {
    const source = event.target as Element | null;
    const input = source?.closest?.('input[type="color"]') as HTMLInputElement | null;
    if (!input || input.disabled || input.readOnly) return;
    event.preventDefault(); event.stopImmediatePropagation(); pick(input);
  };
  doc.addEventListener('click', click, true);
  const observer = new MutationObserver(changed);
  observer.observe(doc, { subtree: true, childList: true });
  return () => { doc.removeEventListener('click', click, true); observer.disconnect(); };
}

/** Keep upstream GWT fields and Apply/Cancel semantics; replace only OS picking. */
export function NativeColorPickerBridge({ frame, ready }: { frame: RefObject<HTMLIFrameElement | null>; ready: boolean }) {
  const [target, setTarget] = useState<{ value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const iframe = frame.current;
    if (!ready || !iframe) return;
    let removeDocument = () => {};
    const bind = () => {
      removeDocument();
      let doc: Document | null;
      try { doc = iframe.contentDocument; } catch { return; }
      if (!doc) return;
      removeDocument = listenForNativeColors(doc, input => {
        inputRef.current=input; setTarget({ value: normalizeHexColor(input.value) ?? '#000000' });
      }, () => { if (inputRef.current && !inputRef.current.isConnected) { inputRef.current=null; setTarget(null); } });
    };
    const load = () => { inputRef.current=null; setTarget(null); bind(); };
    bind(); iframe.addEventListener('load', load);
    return () => { removeDocument(); iframe.removeEventListener('load', load); };
  }, [frame, ready]);
  useEffect(() => {
    if (target && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [target]);
  const close = () => { const input = inputRef.current; dialogRef.current?.close(); inputRef.current=null; setTarget(null); if (input?.isConnected) input.focus(); };
  if (!target) return null;
  const change = (value: string) => {
    const input=inputRef.current;
    if (!input?.isConnected) { close(); return; }
    input.value = value;
    // Dispatch in the iframe's realm. The existing native properties dialog
    // reads this same TextBox when its Apply/OK action commits the settings.
    for (const type of ['input', 'change']) {
      const event = input.ownerDocument.createEvent('Event'); event.initEvent(type, true, false); input.dispatchEvent(event);
    }
    setTarget({ value });
  };
  return createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-label="Schematic color" onCancel={event => { event.preventDefault(); close(); }} onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}>
    <div className={styles.content}>
      <div className={styles.heading}><strong>Schematic color</strong><button type="button" onClick={close} aria-label="Close schematic color picker">×</button></div>
      <InlineColorPicker value={target.value} onChange={change} label="Schematic color" />
      <button className={styles.done} type="button" onClick={close}>Done</button>
    </div>
  </dialog>, document.body);
}
