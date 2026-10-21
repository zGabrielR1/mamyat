"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Light is the shop's default. The visitor's choice is remembered in
 * localStorage; the class lands on <html> so both the storefront and the
 * admin panel pick up the same palette.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="mamyat.theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
