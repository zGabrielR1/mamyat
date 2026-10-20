"use client"

import * as React from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { useAdmin } from "@/components/admin/admin-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

type CouponRow = {
  code: string
  type: "percent" | "fixed"
  value: string
  min: string
  label: string
  active: boolean
}

type Settings = {
  store_name: string
  tagline: string
  announcement: string
  email: string
  whatsapp: string
  instagram: string
  cnpj: string
  city: string
  shipping_flat_minor: number
  free_shipping_minor: number
  pickup_enabled: boolean
  delivery_days: string
  pickup_address: string
  coupons: Record<string, {
    type: string
    value: string | number
    active: boolean
    min_minor: number
    label: string
  }>
}

type Health = {
  storage: string
  payment: string
  mail: string
  captcha: string
  version: string
}

function reais(minor: number) {
  return (minor / 100).toFixed(2).replace(".", ",")
}

function cents(value: string) {
  const raw = String(value || "").replace(/[^\d.,]/g, "").trim()
  if (!raw) return 0
  let normal = raw
  if (raw.includes(",")) {
    normal = raw.replace(/\./g, "").replace(",", ".")
  } else if ((raw.match(/\./g) || []).length > 1) {
    normal = raw.replace(/\./g, "")
  } else if (raw.includes(".") && raw.split(".")[1].length === 3) {
    normal = raw.replace(".", "")
  }
  const number = Number.parseFloat(normal)
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

export default function AdminSettingsPage() {
  const { admin, setMustChange } = useAdmin()
  const [form, setForm] = React.useState<Settings | null>(null)
  const [coupons, setCoupons] = React.useState<CouponRow[]>([])
  const [shipping, setShipping] = React.useState({ flat: "18,00", free: "250,00" })
  const [health, setHealth] = React.useState<Health | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [passwords, setPasswords] = React.useState({ current: "", next: "", confirm: "" })
  const [passwordBusy, setPasswordBusy] = React.useState(false)

  React.useEffect(() => {
    if (!admin) return
    Promise.all([
      api<{ settings: Settings; payment_mode: string }>("/api/admin/settings"),
      api<Health>("/api/health"),
    ])
      .then(([settingsAnswer, healthAnswer]) => {
        const settings = settingsAnswer.settings
        setForm(settings)
        setShipping({
          flat: reais(settings.shipping_flat_minor ?? 0),
          free: reais(settings.free_shipping_minor ?? 0),
        })
        setCoupons(
          Object.entries(settings.coupons || {}).map(([code, coupon]) => ({
            code,
            type: coupon.type === "fixed" ? "fixed" : "percent",
            value: coupon.type === "fixed" ? reais(cents(String(coupon.value))).replace(",00", "") : String(coupon.value),
            min: reais(Number(coupon.min_minor) || 0),
            label: coupon.label || code,
            active: coupon.active !== false,
          })),
        )
        setHealth(healthAnswer)
      })
      .catch((failure: Error) => toast.error(failure.message))
      .finally(() => setLoading(false))
  }, [admin])

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form) return
    setBusy(true)
    const couponMap: Settings["coupons"] = {}
    for (const coupon of coupons) {
      const code = coupon.code.trim().toUpperCase()
      if (!code) continue
      couponMap[code] = {
        type: coupon.type,
        value: coupon.type === "fixed" ? coupon.value.trim() : Number(coupon.value) || 0,
        active: coupon.active,
        min_minor: cents(coupon.min),
        label: coupon.label || code,
      }
    }
    const payload = {
      ...form,
      shipping_flat_minor: cents(shipping.flat),
      free_shipping_minor: cents(shipping.free),
      coupons: couponMap,
    }
    try {
      const answer = await api<{ settings: Settings }>("/api/admin/settings", {
        method: "PATCH",
        body: payload,
      })
      setForm(answer.settings)
      toast.success("Configurações salvas")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível salvar")
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (passwords.next !== passwords.confirm) {
      toast.error("As duas senhas precisam ser iguais")
      return
    }
    setPasswordBusy(true)
    try {
      await api("/api/admin/password", {
        body: { current: passwords.current, password: passwords.next },
      })
      setPasswords({ current: "", next: "", confirm: "" })
      setMustChange(false)
      toast.success("Senha do painel atualizada")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível trocar a senha")
    } finally {
      setPasswordBusy(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Loja</p>
        <h1 className="mt-1 font-serif text-3xl">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Textos, frete, cupons e senha do painel.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-serif text-xl">Identidade</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="store_name">Nome da loja</Label>
              <Input id="store_name" value={form.store_name} onChange={(event) => set("store_name", event.target.value)} />
            </div>
            <div>
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" value={form.city} onChange={(event) => set("city", event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="tagline">Frase da marca</Label>
              <Input id="tagline" value={form.tagline} onChange={(event) => set("tagline", event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="announcement">Aviso no topo da loja</Label>
              <Input id="announcement" value={form.announcement} onChange={(event) => set("announcement", event.target.value)} />
            </div>
            <div>
              <Label htmlFor="email">Email de contato</Label>
              <Input id="email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp (com DDD)</Label>
              <Input id="whatsapp" value={form.whatsapp} onChange={(event) => set("whatsapp", event.target.value)} placeholder="11999999999" />
            </div>
            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <Input id="instagram" value={form.instagram} onChange={(event) => set("instagram", event.target.value)} placeholder="@atelieda_mamy" />
            </div>
            <div>
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={form.cnpj} onChange={(event) => set("cnpj", event.target.value)} placeholder="00.000.000/0000-00" />
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-serif text-xl">Frete e retirada</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="flat">Frete fixo (R$)</Label>
              <Input
                id="flat"
                value={shipping.flat}
                onChange={(event) => setShipping({ ...shipping, flat: event.target.value })}
                inputMode="decimal"
              />
            </div>
            <div>
              <Label htmlFor="free">Frete grátis acima de (R$)</Label>
              <Input
                id="free"
                value={shipping.free}
                onChange={(event) => setShipping({ ...shipping, free: event.target.value })}
                inputMode="decimal"
              />
            </div>
            <div>
              <Label htmlFor="days">Prazo de entrega (texto)</Label>
              <Input id="days" value={form.delivery_days} onChange={(event) => set("delivery_days", event.target.value)} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.pickup_enabled}
                  onChange={(event) => set("pickup_enabled", event.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Permitir retirada no ateliê
              </label>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="pickup">Endereço / instruções de retirada</Label>
              <Textarea id="pickup" value={form.pickup_address} onChange={(event) => set("pickup_address", event.target.value)} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl">Cupons</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCoupons((current) => [
                ...current,
                { code: "", type: "percent", value: "10", min: "0,00", label: "", active: true },
              ])}
            >
              <Plus className="size-3.5" /> Novo cupom
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {coupons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cupom ativo.</p>
            ) : (
              coupons.map((coupon, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[7rem_7rem_6rem_7rem_1fr_auto]">
                  <Input
                    value={coupon.code}
                    onChange={(event) => setCoupons((current) => current.map((row, position) => position === index ? { ...row, code: event.target.value.toUpperCase() } : row))}
                    placeholder="CÓDIGO"
                    aria-label="Código do cupom"
                  />
                  <select
                    value={coupon.type}
                    onChange={(event) => setCoupons((current) => current.map((row, position) => position === index ? { ...row, type: event.target.value as "percent" | "fixed" } : row))}
                    className="h-11 rounded-lg border border-input bg-transparent px-2 text-sm"
                    aria-label="Tipo"
                  >
                    <option value="percent">%</option>
                    <option value="fixed">R$</option>
                  </select>
                  <Input
                    value={coupon.value}
                    onChange={(event) => setCoupons((current) => current.map((row, position) => position === index ? { ...row, value: event.target.value } : row))}
                    placeholder={coupon.type === "percent" ? "10" : "18,00"}
                    aria-label="Valor"
                  />
                  <Input
                    value={coupon.min}
                    onChange={(event) => setCoupons((current) => current.map((row, position) => position === index ? { ...row, min: event.target.value } : row))}
                    placeholder="mínimo"
                    aria-label="Mínimo"
                  />
                  <Input
                    value={coupon.label}
                    onChange={(event) => setCoupons((current) => current.map((row, position) => position === index ? { ...row, label: event.target.value } : row))}
                    placeholder="Descrição para o cliente"
                    aria-label="Descrição"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={coupon.active}
                        onChange={(event) => setCoupons((current) => current.map((row, position) => position === index ? { ...row, active: event.target.checked } : row))}
                        className="size-4 accent-[var(--primary)]"
                      />
                      ativo
                    </label>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setCoupons((current) => current.filter((_, position) => position !== index))}
                      aria-label="Remover cupom"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar configurações
          </Button>
        </div>
      </form>

      <Separator />

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-serif text-xl">Senha do painel</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use uma senha longa e única. Ela não é a mesma da sua conta de cliente.
        </p>
        <form onSubmit={changePassword} className="mt-4 grid max-w-lg gap-4">
          <div>
            <Label htmlFor="current">Senha atual</Label>
            <Input
              id="current"
              type="password"
              value={passwords.current}
              onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <Label htmlFor="next">Nova senha</Label>
            <Input
              id="next"
              type="password"
              value={passwords.next}
              onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm">Repetir a nova senha</Label>
            <Input
              id="confirm"
              type="password"
              value={passwords.confirm}
              onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={passwordBusy}>
            {passwordBusy ? <Loader2 className="size-4 animate-spin" /> : "Trocar senha"}
          </Button>
        </form>
      </section>

      {health ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-serif text-xl">Diagnóstico</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">versão {health.version}</Badge>
            <Badge variant="outline">dados: {health.storage}</Badge>
            <Badge variant="outline">pagamento: {health.payment}</Badge>
            <Badge variant="outline">email: {health.mail}</Badge>
            <Badge variant="outline">captcha: {health.captcha}</Badge>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Se pagamento estiver “demo”, configure as variáveis do Asaas no Render.
            Se email estiver “console”, configure o Resend para enviar de verdade.
          </p>
        </section>
      ) : null}
    </div>
  )
}
