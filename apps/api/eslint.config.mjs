import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.jest, ...globals.node },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      },
      sourceType: "module"
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // chess.js trusts a FEN's castling field; common/chess/chess.ts drops the
      // rights a position can't support before every load.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "chess.js",
              importNames: ["Chess"],
              message: "Import Chess from common/chess/chess — it drops castling rights the position can't support."
            }
          ]
        }
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrors: "none", varsIgnorePattern: "^_" }
      ],
      // The API must not localize dates — it has no viewer. Return ISO strings
      // (`.toISOString()`) and let the web format them per-viewer. The rare
      // server-side render (email, an error string) MUST pass an explicit
      // `timeZone` (the recipient's `User.timezone`, or `"UTC"` for a bare
      // calendar label). See AGENTS.md "Date & Time Rule".
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]:not(:has(ObjectExpression:has(Property[key.name='timeZone'])))",
          message:
            "Don't localize a date in the API without an explicit `timeZone`. Return the ISO string and format it on the web, or pass { timeZone } (recipient's User.timezone, or 'UTC'). See AGENTS.md."
        }
      ]
    }
  },
  {
    files: ["src/common/chess/chess.ts"],
    rules: { "no-restricted-imports": "off" }
  },
  {
    // Offset-probe helper — legitimately compares the same instant rendered
    // in two zones, both passed explicitly.
    files: ["src/common/time.ts"],
    rules: { "no-restricted-syntax": "off" }
  }
);
