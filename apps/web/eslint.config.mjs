import { FlatCompat } from "@eslint/eslintrc";

// shortcut: eslint-config-next 15 ships legacy config only; drop FlatCompat on Next 16.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const DATE_RULES = [
  {
    selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]",
    message:
      "Don't format dates with toLocaleDateString/toLocaleTimeString — the API sends UTC ISO strings and this renders in the machine's zone. Use lib/datetime.ts (formatTime, formatFullDate, formatLongDate, formatDateTime, formatRelativeDay, or formatDate(iso, tz, opts)) with the zone from useUserTimeZone(). Analytics: features/analytics/lib/format.ts, passing useUserTimeZone(). See CLAUDE.md §3.6."
  },
  {
    selector:
      "CallExpression[callee.object.type='NewExpression'][callee.object.callee.name='Date'][callee.property.name='toLocaleString']",
    message:
      "Don't format a Date with .toLocaleString() — it renders in the machine's zone. Use lib/datetime.ts helpers with useUserTimeZone(). See CLAUDE.md §3.6."
  }
];

const HEX = "#[0-9a-fA-F]{3,8}\\b";
const RGB = "(?<![a-zA-Z])(rgb|hsl)a?\\(\\s*\\d";
const PALETTE =
  "(?<![\\w-])(bg|text|border(-[lrtbxy])?|ring|ring-offset|from|via|to|fill|stroke|divide|outline|shadow|placeholder|accent|caret|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\\d{2,3})?(?![\\w-])";
const DARK = "(?<![\\w-])dark:(hover:|focus:|group-hover:)?(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow|placeholder)-";

const colourRule = (pattern, what) => ({
  selector: `:matches(Literal[value=/${pattern}/], TemplateElement[value.raw=/${pattern}/])`,
  message: `${what}. Use a colour token, or add one to styles/globals.css. See docs/UI_RULES.md §1.`
});

const COLOUR_RULES = [
  colourRule(HEX, "No hex colours"),
  colourRule(RGB, "No literal rgb()/hsl() colours"),
  colourRule(PALETTE, "No Tailwind palette colours"),
  colourRule(DARK, "No dark: colour overrides: tokens already switch with the theme")
];

export default [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      "no-restricted-syntax": ["error", ...DATE_RULES, ...COLOUR_RULES],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "chess.js",
              importNames: ["Chess"],
              message:
                "Import Chess from @/lib/chess — it drops castling rights the position can't support (a stale KQkq from a set-up position would otherwise offer O-O from a mid-board king)."
            }
          ]
        }
      ]
    }
  },
  {
    files: [
      "src/lib/datetime.ts",
      "src/features/analytics/lib/format.ts",
      "src/features/batch-schedules/lib/scheduleFormat.ts"
    ],
    rules: { "no-restricted-syntax": ["error", ...COLOUR_RULES] }
  },
  // These can't read CSS variables, or aren't theme colours: see docs/UI_RULES.md §1.
  {
    files: [
      "src/app/layout.tsx",
      "src/app/recorder/**",
      "src/features/chess-appearance/**",
      "src/features/chessboard/lib/drawBrushes.ts",
      "src/lib/document-reader/**",
      "src/lib/ogImage.tsx"
    ],
    rules: { "no-restricted-syntax": ["error", ...DATE_RULES] }
  },
  {
    files: ["src/lib/chess.ts"],
    rules: { "no-restricted-imports": "off" }
  }
];
