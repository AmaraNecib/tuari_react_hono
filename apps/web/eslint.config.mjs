import js from "@eslint/js";
import { plugin as shadcn } from "@shadcn/lint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src/features/design-experiments/**",
      "src/features/design-system/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      // Design-system linter for this Tailwind v4 + components.json setup.
      // Registered only — no @shadcn/lint rules are enabled yet, so lint output
      // is unchanged until the rules are chosen deliberately.
      shadcn,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
);
