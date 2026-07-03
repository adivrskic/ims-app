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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f5efde" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Inline script runs before React hydration to set the theme attribute,
// preventing a flash of the wrong palette. Reads from localStorage; falls
// back to "dark" (matches Bloomberg-terminal default).
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem("Nautilus_theme");
    var theme = (stored === "light" || stored === "dark") ? stored : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
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
