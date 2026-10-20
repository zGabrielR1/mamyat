"use client"

import * as React from "react"

import { api, readAdminToken, writeAdminToken } from "@/lib/api"
import type { Admin } from "@/lib/types"

type AdminValue = {
  admin: Admin | null
  ready: boolean
  mustChange: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setMustChange: (value: boolean) => void
}

const AdminContext = React.createContext<AdminValue | null>(null)

export function useAdmin() {
  const value = React.useContext(AdminContext)
  if (!value) throw new Error("useAdmin must be used inside AdminProvider")
  return value
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = React.useState<Admin | null>(null)
  const [ready, setReady] = React.useState(false)
  const [mustChange, setMustChangeState] = React.useState(false)

  React.useEffect(() => {
    if (!readAdminToken()) {
      setReady(true)
      return
    }
    api<{ admin: Admin }>("/api/admin/me")
      .then((answer) => {
        setAdmin(answer.admin)
        setMustChangeState(window.sessionStorage.getItem("mamyat.admin.mustchange") === "1")
      })
      .catch(() => writeAdminToken(""))
      .finally(() => setReady(true))
  }, [])

  const login = React.useCallback(async (username: string, password: string) => {
    const answer = await api<{
      admin: Admin
      token: string
      must_change_password?: boolean
    }>("/api/admin/login", { body: { username, password }, adminToken: "" })
    writeAdminToken(answer.token)
    setAdmin(answer.admin)
    setMustChangeState(Boolean(answer.must_change_password))
    window.sessionStorage.setItem(
      "mamyat.admin.mustchange",
      answer.must_change_password ? "1" : "0",
    )
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await api("/api/admin/logout", { method: "POST", body: {} })
    } catch {
      // local token is cleared regardless
    }
    writeAdminToken("")
    setAdmin(null)
    window.sessionStorage.removeItem("mamyat.admin.mustchange")
  }, [])

  const setMustChange = React.useCallback((value: boolean) => {
    setMustChangeState(value)
    window.sessionStorage.setItem("mamyat.admin.mustchange", value ? "1" : "0")
  }, [])

  return (
    <AdminContext.Provider value={{ admin, ready, mustChange, login, logout, setMustChange }}>
      {children}
    </AdminContext.Provider>
  )
}
