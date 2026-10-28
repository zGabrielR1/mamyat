"use client"
import * as React from "react"
const KEY = "mamy-saved-pieces"
export function useSaved() {
  const [saved, setSaved] = React.useState<string[]>([])
  React.useEffect(() => {
    const sync = () => { try { const rows = JSON.parse(localStorage.getItem(KEY) || "[]"); setSaved(Array.isArray(rows) ? rows.filter((v): v is string => typeof v === "string") : []) } catch { setSaved([]) } }
    sync(); window.addEventListener("mamy-saved", sync); window.addEventListener("storage", sync)
    return () => { window.removeEventListener("mamy-saved", sync); window.removeEventListener("storage", sync) }
  }, [])
  const toggle = (id: string) => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]")
      const current: string[] = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []
      const next = current.includes(id) ? current.filter(v => v !== id) : [...current, id]
      localStorage.setItem(KEY, JSON.stringify(next)); setSaved(next); window.dispatchEvent(new Event("mamy-saved"))
    } catch { /* Storage can be unavailable in private browsers. */ }
  }
  return { saved, toggle }
}
