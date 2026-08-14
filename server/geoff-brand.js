/**
 * Public Geoff brand tokens consumed from geoff.ai (meta + CSS/fonts).
 * /manifesto currently 404s — do not invent a manifesto body.
 */
export const GEOFF_BRAND = {
  name: "Geoff",
  tagline: "The peoples Ai. Go Turbo. Create, learn, build and play with the future of AI",
  shortTag: "The peoples Ai · Go Turbo",
  verbs: ["create", "learn", "build", "play"],
  themeColor: "hsl(240deg 10% 3.92%)",
  colors: {
    bg: "#0b0b0e",
    card: "#18181b",
    fg: "#f4f4f5",
    muted: "#71717a",
    border: "#27272a",
    accent: "#ffd60a",
    live: "#3b82f6",
  },
  fonts: {
    display: "integralcf",
    ui: "Inter",
    // Public hashed asset on geoff.ai — may rotate with deploys.
    displayWoff:
      "https://www.geoff.ai/_next/static/media/cfextrabold-s.p.0ts02z8o9a7nh.woff",
  },
  sources: {
    site: "https://www.geoff.ai/",
    manifestoRoute: "https://www.geoff.ai/manifesto",
    manifestoStatus: "not_found",
    metaDescription: true,
  },
};

export function brandStrip() {
  return {
    kicker: "Geoff brand · public meta",
    line: GEOFF_BRAND.tagline,
    note: "Official site tagline. /manifesto is not published yet — we don’t invent one.",
  };
}
