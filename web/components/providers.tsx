"use client"

import * as React from "react"
import { Toaster } from "@/components/ui/sonner"
import { api, readCustomerToken, writeCustomerToken } from "@/lib/api"
import type { CartItem, Customer, Product, StoreConfig, Variant } from "@/lib/types"

const DEFAULT_CONFIG: StoreConfig = {
  version: "0.1.0",
  store: {
    name: "Mamy Ateliê",
    tagline: "Feito à mão, feito para durar.",
    announcement: "Frete grátis acima de R$ 250 · Encomendas com carinho",
    email: "taynaramelo45@gmail.com",
    whatsapp: "+55 47 99666-9607",
    instagram: "@atelieda_mamy",
    cnpj: "40.239.348/0001-50",
    city: "Concórdia · SC",
  },
  shipping: {
    flat_minor: 1800,
    free_minor: 25000,
    pickup_enabled: true,
    delivery_days: "3 a 7 dias úteis",
    pickup_address: "Retirada combinada com o ateliê",
  },
  payment: { mode: "demo", environment: "demonstração" },
  turnstile: { enabled: false, site_key: "" },
  categories: ["Bolsas", "Amigurumis", "Bordados", "Casa", "Acessórios", "Kits", "Encomendas"],
  features: { pickup: true, coupons: true, guest_checkout: true, social_login: false },
}

type ConfigValue = { config: StoreConfig; ready: boolean }
const ConfigContext = React.createContext<ConfigValue>({ config: DEFAULT_CONFIG, ready: false })

export function useConfig() {
  return React.useContext(ConfigContext).config
}

function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<StoreConfig>(DEFAULT_CONFIG)
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    api<StoreConfig>("/api/config")
      .then((value) => setConfig({ ...DEFAULT_CONFIG, ...value }))
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [])
  return <ConfigContext.Provider value={{ config, ready }}>{children}</ConfigContext.Provider>
}

type AuthValue = {
  customer: Customer | null
  ready: boolean
  login: (input: { identifier: string; password: string; remember?: boolean; turnstile_token?: string }) => Promise<Customer>
  signup: (input: Record<string, unknown>) => Promise<Customer>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setCustomer: (customer: Customer | null) => void
}

const AuthContext = React.createContext<AuthValue | null>(null)

export function useAuth() {
  const value = React.useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside Providers")
  return value
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [ready, setReady] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (!readCustomerToken()) {
      setCustomer(null)
      setReady(true)
      return
    }
    try {
      const answer = await api<{ customer: Customer }>("/api/auth/me")
      setCustomer(answer.customer)
    } catch {
      writeCustomerToken("")
      setCustomer(null)
    } finally {
      setReady(true)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const login = React.useCallback(async (input: {
    identifier: string
    password: string
    remember?: boolean
    turnstile_token?: string
  }) => {
    const answer = await api<{ customer: Customer; token: string }>("/api/auth/login", { body: input })
    writeCustomerToken(answer.token)
    setCustomer(answer.customer)
    return answer.customer
  }, [])

  const signup = React.useCallback(async (input: Record<string, unknown>) => {
    const answer = await api<{ customer: Customer; token: string }>("/api/auth/signup", { body: input })
    writeCustomerToken(answer.token)
    setCustomer(answer.customer)
    return answer.customer
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} })
    } catch {
      // the local token is cleared regardless
    }
    writeCustomerToken("")
    setCustomer(null)
  }, [])

  return (
    <AuthContext.Provider value={{ customer, ready, login, signup, logout, refresh, setCustomer }}>
      {children}
    </AuthContext.Provider>
  )
}

type CartValue = {
  items: CartItem[]
  count: number
  subtotal: number
  hydrated: boolean
  open: boolean
  setOpen: (open: boolean) => void
  add: (product: Product, variant: Variant, qty?: number) => void
  remove: (productId: string, variantId: string) => void
  setQty: (productId: string, variantId: string, qty: number) => void
  clear: () => void
}

const CartContext = React.createContext<CartValue | null>(null)
const CART_KEY = "mamyat.cart.v1"

export function useCart() {
  const value = React.useContext(CartContext)
  if (!value) throw new Error("useCart must be used inside Providers")
  return value
}

function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([])
  const [hydrated, setHydrated] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_KEY)
      const parsed = raw ? (JSON.parse(raw) as CartItem[]) : []
      if (Array.isArray(parsed)) {
        setItems(parsed.filter((item) => item && item.productId && item.qty > 0))
      }
    } catch {
      // a corrupt cart is simply empty
    }
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(CART_KEY, JSON.stringify(items))
  }, [items, hydrated])

  const add = React.useCallback((product: Product, variant: Variant, qty = 1) => {
    const max = product.made_to_order ? 9999 : Math.max(0, variant.available)
    if (max <= 0) return
    setItems((current) => {
      const existing = current.find(
        (item) => item.productId === product.id && item.variantId === variant.id,
      )
      if (existing) {
        return current.map((item) =>
          item === existing
            ? { ...item, qty: Math.min(max, item.qty + qty) }
            : item,
        )
      }
      return [
        ...current,
        {
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          variantName: variant.name,
          slug: product.slug,
          image: product.images[0] || "",
          priceMinor: product.price_minor,
          qty: Math.min(max, qty),
          max,
        },
      ]
    })
    setOpen(true)
  }, [])

  const remove = React.useCallback((productId: string, variantId: string) => {
    setItems((current) =>
      current.filter((item) => !(item.productId === productId && item.variantId === variantId)),
    )
  }, [])

  const setQty = React.useCallback((productId: string, variantId: string, qty: number) => {
    setItems((current) =>
      current
        .map((item) =>
          item.productId === productId && item.variantId === variantId
            ? { ...item, qty: Math.max(0, Math.min(item.max || 99, qty)) }
            : item,
        )
        .filter((item) => item.qty > 0),
    )
  }, [])

  const clear = React.useCallback(() => setItems([]), [])

  const count = items.reduce((total, item) => total + item.qty, 0)
  const subtotal = items.reduce((total, item) => total + item.priceMinor * item.qty, 0)

  return (
    <CartContext.Provider
      value={{ items, count, subtotal, hydrated, open, setOpen, add, remove, setQty, clear }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider>
      <AuthProvider>
        <CartProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </CartProvider>
      </AuthProvider>
    </ConfigProvider>
  )
}
