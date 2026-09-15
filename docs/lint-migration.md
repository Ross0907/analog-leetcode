# ESLint 10 migration

The project uses ESLint 10 with `@eslint-react/eslint-plugin` for modern React
checks and `eslint-plugin-jsx-a11y-x` for accessibility. The React team's
`eslint-plugin-react-hooks`, Next's `@next/eslint-plugin-next`, and
`typescript-eslint` remain enabled. `npm run typecheck` is a required companion
to `npm run lint` and runs in CI.

The previous React and accessibility plugins still exclude ESLint 10 from their
published peer requirements. ESLint 9 reached end of life on August 6, 2026;
keeping it would be a temporary compatibility hold, not a supported maintenance
strategy. This migration uses published compatible packages without peer
overrides, compatibility shims, or a private copy of either linter.

## Coverage and deliberate differences

- All 31 enabled accessibility rules retain their severities and options. The
  namespace changes from `jsx-a11y/` to `jsx-a11y-x/`; existing narrowly explained
  exceptions on the schematic and splitter surfaces keep their original scope.
- The official Hooks/compiler preset and the Next preset remain enabled.
  Duplicate checks in the modern React plugin are disabled only when the React
  team's preset already runs the matching rule.
- Missing keys, comment text nodes, children passed as props, unsafe external
  links, unknown DOM properties, conflicting HTML/children, and obsolete DOM
  APIs have modern React checks. Previously blocking equivalents remain errors.
- Strict TypeScript checks component prop contracts, duplicate JSX attributes,
  invalid string refs, and unknown JSX identifiers. ESLint 10 also tracks JSX
  references natively. These replace runtime `prop-types` and the old JSX scope
  helper rules for this repository's typed function components.
- `no-class-component` is an error, keeping the project's existing function
  component convention and preventing new legacy class patterns. The old
  `no-is-mounted` and `require-render-return` rules are therefore not carried
  over as class-specific checks. Supported deprecated lifecycle/DOM API and
  direct state mutation checks remain in the modern preset.
- Display-name checks use the modern plugin's component detection, which is not
  identical to the legacy plugin. The old `no-unescaped-entities` typography rule
  is not retained; this does not disable JSX parsing or accessibility checks.
  The modern preset additionally checks unsafe component patterns and leaked
  browser resources.

This is a migration to checks suited to the current React/TypeScript code, not
a claim that two different React plugins implement identical rules. New React
components should remain typed `.tsx` functions; CI typechecking is part of
their correctness check.

`tests/lint-configuration.test.mts` exercises the actual configuration against a
valid typed component and intentionally broken examples. It verifies that keys,
image text, keyboard access, Hooks, obsolete classes, conflicting HTML children,
and synchronous Next scripts still produce blocking diagnostics.

## Upstream references

- [ESLint support schedule](https://eslint.org/version-support/)
- [ESLint React migration and rule comparison](https://github.com/Rel1cx/eslint-react/blob/main/apps/website/content/docs/migrating-from-eslint-plugin-react.mdx)
- [Accessibility plugin migration](https://github.com/es-tooling/eslint-plugin-jsx-a11y-x#Migrating-from-eslint-plugin-jsx-a11y)
- [React plugin's outstanding ESLint 10 compatibility issue](https://github.com/jsx-eslint/eslint-plugin-react/issues/3977)

Dependabot groups the supported lint packages together. The ESLint 10 exclusion
used during the initial peer-compatibility investigation has been removed.
