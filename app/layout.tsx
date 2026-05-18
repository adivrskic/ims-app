import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./globals-underwater.css";

export const metadata: Metadata = {
  title: {
    default: "Nimbus",
    template: "%s · Nimbus",
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
    var stored = localStorage.getItem("nimbus_theme");
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
