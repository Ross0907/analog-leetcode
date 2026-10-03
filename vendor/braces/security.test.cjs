// Regression coverage for the documented, development-only braces backport.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const braces = require('./');

test('backport is exactly the recorded security-only library change', () => {
  const manifest = require('./source-manifest.json');
  assert.equal(require('./package.json').name, 'braces');
  assert.equal(require('./package.json').version, '3.0.3');
  for (const [file, hashes] of Object.entries(manifest.hashes)) {
    const actual = createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex');
    assert.equal(actual, hashes.patched, file);
    assert.notEqual(hashes.original, hashes.patched, file);
  }
});

test('parser and public walkers reject the advisory pattern before stack exhaustion', () => {
  for (const [left, right] of [['{', '}'], ['(', ')']]) {
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      assert.doesNotThrow(() => braces[method](left.repeat(100) + 'a' + right.repeat(100)));
      for (const depth of [101, 4000, 4998]) {
        assert.throws(() => braces[method](left.repeat(depth) + 'a,b' + right.repeat(depth)), /Input depth .*exceeds max depth/);
      }
      assert.throws(() => braces[method](left.repeat(101) + 'a' + right.repeat(101), { maxDepth: Infinity }), /exceeds max depth/);
      assert.throws(() => braces[method](left.repeat(101) + 'a' + right.repeat(101), { maxDepth: 100000 }), /exceeds max depth/);
      assert.throws(() => braces[method](left.repeat(2) + 'a' + right.repeat(2), { maxDepth: 1.5 }), /exceeds max depth/);
    }
  }
});

test('caller supplied ASTs and parent cycles are bounded independently of parsing', () => {
  for (const method of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'a' };
    for (let depth = 0; depth < 101; depth++) ast = { type: 'brace', nodes: [ast] };
    assert.throws(() => braces[method]({ type: 'root', nodes: [ast] }), /AST depth .*exceeds max depth/);
  }
  const ast = { type: 'paren', nodes: [{ type: 'text', value: 'a' }] };
  ast.parent = ast;
  assert.throws(() => vm.runInNewContext('expand(ast)', { expand: braces.expand, ast }, { timeout: 500 }), /AST parent chain contains a cycle/);
});

test('normal glob ranges, nesting, escaping and malformed input keep published semantics', () => {
  assert.deepEqual(braces.expand('src/{a,b}/{1..3}.ts'), ['src/a/1.ts', 'src/a/2.ts', 'src/a/3.ts', 'src/b/1.ts', 'src/b/2.ts', 'src/b/3.ts']);
  assert.equal(braces.compile('app/{page,layout}.{ts,tsx}'), 'app/(page|layout).(ts|tsx)');
  assert.deepEqual(braces.expand('foo/({a,b})'), ['foo/(a)', 'foo/(b)']);
  assert.deepEqual(braces.expand('src/\\{literal\\}.ts'), ['src/{literal}.ts']);
  assert.deepEqual(braces.expand('src/{unclosed'), ['src/{unclosed']);
  for (const pattern of ['{{a}}', '{a,{b}}', '{{x}y}', '{a,{b,{c}}', '{}{a}']) {
    assert.equal(braces.stringify(braces.parse(pattern), { escapeInvalid: true }), pattern);
  }
});

test('installed glob consumers use the patched dependency and retain file discovery', () => {
  const rootRequire = createRequire(path.resolve(__dirname, '../../package.json'));
  const micromatchRequire = createRequire(rootRequire.resolve('micromatch'));
  assert.equal(fs.realpathSync(micromatchRequire.resolve('braces')), fs.realpathSync(require.resolve('./')));
  const micromatch = rootRequire('micromatch');
  assert.deepEqual(micromatch.braceExpand('src/{a,b}.{ts,tsx}'), ['src/a.ts', 'src/a.tsx', 'src/b.ts', 'src/b.tsx']);
  assert.throws(() => micromatch.braceExpand('{'.repeat(4000) + 'a,b' + '}'.repeat(4000)), /exceeds max depth/);
  const fastGlob = rootRequire('fast-glob');
  const files = fastGlob.sync('app/{hdl,problems}/page.{ts,tsx}', { cwd: path.resolve(__dirname, '../..'), onlyFiles: true });
  assert.deepEqual(files.sort(), ['app/hdl/page.tsx', 'app/problems/page.tsx']);
});
