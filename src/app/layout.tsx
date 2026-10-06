import type { ReactNode } from "react";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { activeThemeAttribute } from "./active-theme";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
const serif = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
});

/**
 * The theme is stamped on `<html>` on the server, so the first paint is already right (no flash): `light` or
 * `dark` forces it, no attribute follows the device through the `prefers-color-scheme` tokens. My preferences
 * changes the attribute in place when a person picks a theme, hence `suppressHydrationWarning`.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await activeThemeAttribute();
  return (
    <html lang="id" data-theme={theme} suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
