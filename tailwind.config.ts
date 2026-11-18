import type { Config } from "tailwindcss";
import defaultColors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

/**
 * Karanlık mod (18.11.2026): Tailwind renk paleti CSS değişkenine bağlı. Açık modda değişkenler Tailwind'in kendi değerleri
 * (görünüm birebir aynı); `.dark`'ta tonlar ters döner: gri aileleri kayık (50→950, 100→800 … 900→50; beyaz kart → slate-900),
 * renkliler aynalı (50↔950 … 400↔600, 500 aynı). Sayfa sınıflarına dokunulmaz; grafiklerin sabit koyu renkleri globals.css'te.
 */
const PALETTES = ["slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"] as const;
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
const NEUTRALS = new Set<string>(["slate", "gray", "zinc", "neutral", "stone"]);
const NEUTRAL_DARK: Record<string, string> = { "50": "950", "100": "800", "200": "700", "300": "600", "400": "500", "500": "400", "600": "300", "700": "200", "800": "100", "900": "50", "950": "white" };
const MIRROR: Record<string, string> = { "50": "950", "100": "900", "200": "800", "300": "700", "400": "600", "500": "500", "600": "400", "700": "300", "800": "200", "900": "100", "950": "50" };
const palette = defaultColors as unknown as Record<string, Record<string, string>>;
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
};
const themeColors: Record<string, string | Record<string, string>> = {
  white: "rgb(var(--c-white) / <alpha-value>)",
  black: "rgb(var(--c-black) / <alpha-value>)",
};
const lightVars: Record<string, string> = { "--c-white": "255 255 255", "--c-black": "0 0 0" };
const darkVars: Record<string, string> = { "--c-white": rgb(palette.slate["900"]), "--c-black": rgb(palette.slate["50"]) };
for (const p of PALETTES) {
  themeColors[p] = Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--c-${p}-${s}) / <alpha-value>)`]));
  for (const s of SHADES) {
    lightVars[`--c-${p}-${s}`] = rgb(palette[p][s]);
    const d = NEUTRALS.has(p) ? NEUTRAL_DARK[s] : MIRROR[s];
    darkVars[`--c-${p}-${s}`] = d === "white" ? "255 255 255" : rgb(palette[p][d]);
  }
}

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        ...themeColors,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      gridTemplateColumns: {
        "24": "repeat(24, minmax(0, 1fr))",
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "0.85rem" }],
        "3xs": ["0.55rem", { lineHeight: "0.75rem" }],
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(({ addBase }) => addBase({ ":root": lightVars, ".dark": { ...darkVars, colorScheme: "dark" } })),
  ],
};

export default config;
