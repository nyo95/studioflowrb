import type { ReactNode } from "react";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const instrumentSerifN = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "normal", variable: "--font-serif" });
const instrumentSerifI = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-serif" });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${instrumentSans.variable} ${instrumentSerifN.variable} ${instrumentSerifI.variable}`}>
      <body>{children}</body>
    </html>
  );
}
