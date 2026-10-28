"use client"

import * as React from "react"
import { toast } from "sonner"

import { api, readAdminToken, writeAdminToken } from "@/lib/api"
import type { Admin } from "@/lib/types"

const IDLE_LIMIT_MS = 30 * 60 * 1000
const IDLE_WARNING_MS = 25 * 60 * 1000
const ACTIVITY_THROTTLE_MS = 15 * 1000

type AdminValue = {
  admin: Admin | null
  ready: boolean
  mustChange: boolean
  canWrite: boolean
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

  const endSession = React.useCallback(async (reason: "manual" | "expired" = "manual") => {
    try {
      await api("/api/admin/logout", { method: "POST", body: {} })
    } catch {
      // local token is cleared regardless
    }
    writeAdminToken("")
    setAdmin(null)
    setMustChangeState(false)
    window.sessionStorage.removeItem("mamyat.admin.mustchange")
    if (reason === "expired") {
      toast.warning("Sessão encerrada por inatividade. Entre novamente para continuar.")
    }
  }, [])

  const logout = React.useCallback(async () => {
    await endSession("manual")
  }, [endSession])

  const setMustChange = React.useCallback((value: boolean) => {
    setMustChangeState(value)
    window.sessionStorage.setItem("mamyat.admin.mustchange", value ? "1" : "0")
  }, [])

  React.useEffect(() => {
    const onUnauthorized = () => {
      setAdmin(null)
      setMustChangeState(false)
      window.sessionStorage.removeItem("mamyat.admin.mustchange")
      toast.warning("Sua sessão expirou. Entre novamente no painel.")
    }
    window.addEventListener("mamyat:admin-unauthorized", onUnauthorized)
    return () => window.removeEventListener("mamyat:admin-unauthorized", onUnauthorized)
  }, [])

  React.useEffect(() => {
    if (!admin) return
    let warned = false
    let lastActivity = 0
    let warningTimer = 0
    let idleTimer = 0
    let warningToast: string | number = 0

    const schedule = () => {
      warned = false
      window.clearTimeout(warningTimer)
      window.clearTimeout(idleTimer)
      warningTimer = window.setTimeout(() => {
        warned = true
        warningToast = toast.warning("Sua sessão expira em 5 minutos por inatividade.")
      }, IDLE_WARNING_MS)
      idleTimer = window.setTimeout(() => {
        void endSession("expired")
      }, IDLE_LIMIT_MS)
    }

    const onActivity = () => {
      const now = Date.now()
      if (now - lastActivity < ACTIVITY_THROTTLE_MS) return
      lastActivity = now
      if (warned && warningToast) toast.dismiss(warningToast)
      schedule()
    }

    schedule()
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"]
    for (const event of events) window.addEventListener(event, onActivity, { passive: true })
    return () => {
      window.clearTimeout(warningTimer)
      window.clearTimeout(idleTimer)
      for (const event of events) window.removeEventListener(event, onActivity)
    }
  }, [admin, endSession])

  const canWrite = admin?.role === "admin"

  return (
    <AdminContext.Provider
      value={{ admin, ready, mustChange, canWrite, login, logout, setMustChange }}
    >
      {children}
    </AdminContext.Provider>
  )
}
