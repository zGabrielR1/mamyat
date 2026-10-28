const CUSTOMER_KEY = "mamyat.customer.token"
const ADMIN_KEY = "mamyat.admin.token"

export class ApiFailure extends Error {
  status: number
  code: string

  constructor(message: string, status = 0, code = "error") {
    super(message)
    this.status = status
    this.code = code
  }
}

export function readCustomerToken(): string {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(CUSTOMER_KEY) || ""
}

export function writeCustomerToken(token: string): void {
  if (typeof window === "undefined") return
  if (token) window.localStorage.setItem(CUSTOMER_KEY, token)
  else window.localStorage.removeItem(CUSTOMER_KEY)
}

export function readAdminToken(): string {
  if (typeof window === "undefined") return ""
  return window.sessionStorage.getItem(ADMIN_KEY) || ""
}

export function writeAdminToken(token: string): void {
  if (typeof window === "undefined") return
  if (token) window.sessionStorage.setItem(ADMIN_KEY, token)
  else window.sessionStorage.removeItem(ADMIN_KEY)
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  token?: string
  adminToken?: string
  signal?: AbortSignal
  headers?: Record<string, string>
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(options.headers || {}) }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"
  const token = options.token ?? readCustomerToken()
  if (token) headers["X-Customer-Token"] = token
  const adminToken = options.adminToken ?? readAdminToken()
  if (adminToken) headers["X-Admin-Token"] = adminToken

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method || (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: "no-store",
    })
  } catch {
    throw new ApiFailure("Sem conexão com a loja. Confira sua internet e tente de novo.", 0, "network")
  }

  const text = await response.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = {}
    }
  }
  if (!response.ok) {
    const quietAuth = path === "/api/admin/logout" || path === "/api/admin/me"
    if (response.status === 401 && adminToken && !quietAuth) {
      writeAdminToken("")
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("mamyat:admin-unauthorized"))
      }
    }
    throw new ApiFailure(
      String(data.error || `Não foi possível concluir (${response.status}).`),
      response.status,
      String(data.code || "error"),
    )
  }
  return data as T
}

/** Upload already-compressed image bytes to the admin media endpoint. */
export async function uploadAdminMedia(file: Blob): Promise<{ url: string; key: string }> {
  const token = readAdminToken()
  if (!token) throw new ApiFailure("Entre novamente no painel", 401, "unauthorized")

  let response: Response
  try {
    response = await fetch("/api/admin/media", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Admin-Token": token,
      },
      body: file,
      cache: "no-store",
    })
  } catch {
    throw new ApiFailure("Sem conexão com a loja. Confira sua internet e tente de novo.", 0, "network")
  }

  const text = await response.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = {}
    }
  }
  if (!response.ok) {
    if (response.status === 401) {
      writeAdminToken("")
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("mamyat:admin-unauthorized"))
      }
    }
    throw new ApiFailure(
      String(data.error || `Não foi possível enviar a foto (${response.status}).`),
      response.status,
      String(data.code || "error"),
    )
  }
  return data as { url: string; key: string }
}

export async function cepLookup(cep: string) {
  return api<{ cep: string; street: string; district: string; city: string; state: string }>(
    `/api/cep/${cep.replace(/\D/g, "")}`,
  )
}
