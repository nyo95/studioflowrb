import type { ReactNode } from "react";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const lora = Lora({ subsets: ["latin"], weight: "variable", variable: "--font-serif" });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
