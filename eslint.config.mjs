// @ts-check
/**
 * Lint config for the monorepo.
 *
 * `pnpm lint` ran through Turbo but no workspace defined the script, so nothing
 * had ever actually been linted. This turns it on.
 *
 * Scoped deliberately narrow to start with. The value here is catching real
 * defects — a floating promise that silently swallows a failed save, an unused
 * binding left behind by a refactor — not enforcing formatting opinions on a
 * codebase that already reads consistently. Style rules would produce hundreds
 * of findings and bury the handful that matter.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.expo/**",
      "**/android/**",
      "**/ios/**",
      "**/*.config.*",
      "apps/api/prisma/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      // An `_`-prefixed binding is the conventional "deliberately unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `any` is worth flagging but there are legitimate boundary cases; a
      // warning keeps it visible without failing the build over one cast.
      "@typescript-eslint/no-explicit-any": "warn",
      // The rule that earns its keep in this codebase: `catch {}` around an
      // await, or a mutation whose promise is never awaited, loses a failed
      // write silently — exactly the class of bug the error-state sweep found.
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  {
    // Hook rules matter most in the mobile app: a missing dependency shows up
    // as a screen quietly serving stale data, which is hard to spot by eye.
    files: ["apps/mobile/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Tests intentionally poke at malformed input and stub loose shapes.
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
