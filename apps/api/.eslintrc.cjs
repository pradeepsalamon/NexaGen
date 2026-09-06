module.exports = {
  env: {
    es2022: true,
    jest: true,
    node: true
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["dist/", "node_modules/"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    sourceType: "module",
    tsconfigRootDir: __dirname
  },
  plugins: ["@typescript-eslint"],
  root: true,
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
    ],
    // The API must not localize dates — it has no viewer. Return ISO strings
    // (`.toISOString()`) and let the web format them per-viewer. The rare
    // server-side render (email, an error string) MUST pass an explicit
    // `timeZone` (the recipient's `User.timezone`, or `"UTC"` for a bare
    // calendar label). See .agents/AGENTS.md "Date & Time Rule".
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]:not(:has(ObjectExpression:has(Property[key.name='timeZone'])))",
        message:
          "Don't localize a date in the API without an explicit `timeZone`. Return the ISO string and format it on the web, or pass { timeZone } (recipient's User.timezone, or 'UTC'). See .agents/AGENTS.md."
      }
    ]
  },
  overrides: [
    {
      // Offset-probe helper — legitimately compares the same instant rendered
      // in two zones, both passed explicitly.
      files: ["src/common/time.ts"],
      rules: { "no-restricted-syntax": "off" }
    }
  ]
};
