import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import react from "@eslint-react/eslint-plugin";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Keep Hooks and compiler checks with the React team's plugin. The modern
// React preset also includes some of these checks under its own namespace.
const officialHookRules = reactHooks.configs.flat["recommended-latest"].rules;
const duplicateHookRules = Object.fromEntries(
  Object.keys(officialHookRules)
    .map((rule) => rule.replace("react-hooks/", ""))
    .filter((rule) => rule in react.rules)
    .map((rule) => [`@eslint-react/${rule}`, "off"]),
);

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    ".tmp/**",
    "public/circuitjs/**",
    "vendor/eecircuit-engine/dist/**",
    "artifacts/**",
    "test-results/**",
    "playwright-report/**",
    ".wrangler/**",
    ".vinext/**",
    "next-env.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...react.configs["recommended-typescript"],
    files: ["**/*.{jsx,tsx}"],
    rules: {
      ...react.configs["recommended-typescript"].rules,
      ...duplicateHookRules,
      // Preserve error severity for the previous React correctness checks.
      "@eslint-react/no-missing-component-display-name": "error",
      "@eslint-react/jsx-no-comment-textnodes": "error",
      "@eslint-react/jsx-no-children-prop": "error",
      "@eslint-react/dom-no-unsafe-target-blank": "error",
      "@eslint-react/dom-no-unknown-property": "error",
      "@eslint-react/dom-no-dangerously-set-innerhtml-with-children": "error",
      "@eslint-react/dom-no-find-dom-node": "error",
      "@eslint-react/dom-no-render-return-value": "error",
      // Components in this project are typed functions. This also prevents
      // obsolete class patterns whose legacy rules are no longer provided.
      "@eslint-react/no-class-component": "error",
    },
  },
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.configs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
]);

export default eslintConfig;
