import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./globals-underwater.css";

// Self-hosted (vendored from Fontshare, ITF Free Font License). The old
// jsDelivr @font-face pointed at a personal GitHub repo that has since
// deleted the file — prod was silently on system fallbacks.
const satoshi = localFont({
  src: "./fonts/Satoshi-Variable.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-satoshi",
});

// Body font per the design tokens (--mono names JetBrains Mono first, but it
// was never actually loaded). next/font/google downloads at build and serves
// it self-hosted — no runtime Google request.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Nautilus",
    template: "%s · Nautilus",
  },
  description: "Warehouse operations dashboard.",
};

// NOTE: no `themeColor` here. The theme is chosen by the user and stored in
// localStorage — it is NOT a prefers-color-scheme signal, so a media-keyed
// themeColor would show a dark address bar above a paper-white page for
// anyone whose OS preference disagrees with their choice. The init script
// below writes the meta tag imperatively instead, and ThemeToggle keeps it
// in sync on switch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Inline script runs before React hydration to set the theme attribute,
// preventing a flash of the wrong palette. Reads from localStorage; falls
// back to "dark" (matches Bloomberg-terminal default).
const themeInitScript = `
(function() {
  var theme = "dark";
  try {
    var stored = localStorage.getItem("Nautilus_theme");
    if (stored === "light" || stored === "dark") theme = stored;
  } catch (e) {}
  document.documentElement.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", theme === "light" ? "#f2f2ef" : "#061124");
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${satoshi.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
