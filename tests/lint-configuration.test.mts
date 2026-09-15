import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const eslint = new ESLint({
  overrideConfigFile: fileURLToPath(new URL("../eslint.config.mjs", import.meta.url)),
});
const filePath = fileURLToPath(new URL("../app/components/lint-regression-fixture.tsx", import.meta.url));

async function diagnostics(source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  assert.equal(result.fatalErrorCount, 0, "the ESLint 10 plugins must load and parse TSX");
  return result.messages;
}

test("modern lint accepts a typed, accessible function component", async () => {
  const messages = await diagnostics(`
    export function ProbeButton({ name, onSelect }: { name: string; onSelect: () => void }) {
      return <button type="button" onClick={onSelect}>Probe {name}</button>;
    }
  `);
  assert.deepEqual(messages, []);
});

test("React keys, keyboard accessibility, image text and official Hooks checks remain blocking", async () => {
  const messages = await diagnostics(`
    import { useState } from "react";
    export function BrokenProbes({ names, enabled }: { names: string[]; enabled: boolean }) {
      if (enabled) useState(0);
      return <div onClick={() => {}}>{names.map(name => <img src={name} />)}</div>;
    }
  `);
  const blocking = new Set(messages.filter(message => message.severity === 2).map(message => message.ruleId));
  for (const rule of [
    "@eslint-react/no-missing-key",
    "jsx-a11y-x/alt-text",
    "jsx-a11y-x/click-events-have-key-events",
    "jsx-a11y-x/no-static-element-interactions",
    "react-hooks/rules-of-hooks",
  ]) {
    assert(blocking.has(rule), `expected blocking diagnostic from ${rule}`);
  }
});

test("obsolete classes, conflicting HTML children and synchronous Next scripts remain blocked", async () => {
  const messages = await diagnostics(`
    import { Component } from "react";
    export class OldProbe extends Component {
      render() {
        return <div dangerouslySetInnerHTML={{ __html: "probe" }}>children<script src="/blocking.js" /></div>;
      }
    }
  `);
  const blocking = new Set(messages.filter(message => message.severity === 2).map(message => message.ruleId));
  for (const rule of [
    "@eslint-react/no-class-component",
    "@eslint-react/dom-no-dangerously-set-innerhtml-with-children",
    "@next/next/no-sync-scripts",
  ]) {
    assert(blocking.has(rule), `expected blocking diagnostic from ${rule}`);
  }
});
