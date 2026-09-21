import type { ReactNode } from "react";
import { Instrument_Sans, Lora } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const lora = Lora({ subsets: ["latin"], weight: "variable", variable: "--font-serif" });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${instrumentSans.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
