"use client";

import { createContext, useContext, type ReactNode } from "react";

type DisplaySettings = { locale: string; timezone: string };
const DisplayContext = createContext<DisplaySettings>({ locale: "id-ID", timezone: "Asia/Jakarta" });

export function DisplaySettingsProvider({ value, children }: { value: DisplaySettings; children: ReactNode }) {
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplaySettings() { return useContext(DisplayContext); }
