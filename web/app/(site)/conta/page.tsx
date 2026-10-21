"use client"

import * as React from "react"

import { useRouter } from "next/navigation"
import { ChevronRight, LogOut, Package } from "lucide-react"
import { toast } from "sonner"

import { api, writeCustomerToken } from "@/lib/api"
import type { Customer, Order } from "@/lib/types"
import { useAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { brl, formatCpf, formatPhone, orderStatusTone } from "@/lib/utils"

type Tab = "pedidos" | "dados" | "seguranca"

export default function AccountPage() {
  const router = useRouter()
  const { customer, ready, setCustomer, logout, refresh } = useAuth()
  const [orders, setOrders] = React.useState<Order[]>([])
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<Tab>("pedidos")
  const [profile, setProfile] = React.useState({ name: "", phone: "", cpf: "" })
  const [passwords, setPasswords] = React.useState({ current: "", next: "", confirm: "" })
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (ready && !customer) router.replace("/entrar")
  }, [ready, customer, router])

  React.useEffect(() => {
    if (!customer) return
    setProfile({
      name: customer.name || "",
      phone: customer.phone || "",
      cpf: customer.cpf ? formatCpf(customer.cpf) : "",
    })
    api<{ customer: Customer; orders: Order[] }>("/api/auth/me")
      .then((answer) => setOrders(answer.orders || []))
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [customer])

  if (!ready || !customer) {
    return (
      <div className="container-page max-w-3xl space-y-4 py-16">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const answer = await api<{ customer: Customer }>("/api/auth/me", {
        method: "PATCH",
        body: profile,
      })
      setCustomer(answer.customer)
      toast.success("Dados atualizados")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível salvar")
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (passwords.next !== passwords.confirm) {
      toast.error("As duas senhas precisam ser iguais")
      return
    }
    setBusy(true)
    try {
      const answer = await api<{ token: string }>("/api/auth/password", {
        body: { current: passwords.current, password: passwords.next },
      })
      writeCustomerToken(answer.token)
      await refresh()
      setPasswords({ current: "", next: "", confirm: "" })
      toast.success("Senha atualizada")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível trocar a senha")
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await logout()
    router.push("/")
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "pedidos", label: "Meus pedidos" },
    { id: "dados", label: "Meus dados" },
    { id: "seguranca", label: "Segurança" },
  ]

  return (
    <div className="container-page py-10 md:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Minha conta</p>
          <h1 className="mt-2 font-serif text-4xl">Oi, {customer.name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">@{customer.username} · {customer.email}</p>
        </div>
        <Button variant="outline" onClick={signOut}>
          <LogOut className="size-4" /> Sair
        </Button>
      </div>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm transition-colors ${
              tab === item.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "pedidos" ? (
        <section className="mt-8">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border bg-card py-16 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
                <Package className="size-6 text-muted-foreground" />
              </span>
              <h2 className="mt-4 font-serif text-2xl">Nenhum pedido ainda</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Quando você fizer um pedido, ele aparece aqui com o status do ateliê.
              </p>
              <Button asChild className="mt-5"><a href="/loja">Ver a loja</a></Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {orders.map((order) => (
                <li key={order.number}>
                  <a
                    href={`/pedido/${order.number}${order.email ? `?email=${encodeURIComponent(order.email)}` : ""}`}
                    className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{order.number}</p>
                        <Badge className={orderStatusTone(order.status)}>{order.status_label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("pt-BR", { dateStyle: "long" })}
                        {order.item_count ? ` · ${order.item_count} ${order.item_count === 1 ? "peça" : "peças"}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{order.total || brl(order.total_minor)}</p>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "dados" ? (
        <section className="mt-8 max-w-xl">
          <form onSubmit={saveProfile} className="space-y-4 rounded-xl border bg-card p-5">
            <div>
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={customer.email} disabled />
              <p className="mt-1 text-xs text-muted-foreground">Para trocar o email, fale com o ateliê.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: formatPhone(event.target.value) })}
                  inputMode="tel"
                />
              </div>
              <div>
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={profile.cpf}
                  onChange={(event) => setProfile({ ...profile, cpf: formatCpf(event.target.value) })}
                  inputMode="numeric"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy}>Salvar dados</Button>
          </form>
        </section>
      ) : null}

      {tab === "seguranca" ? (
        <section className="mt-8 max-w-xl">
          <form onSubmit={savePassword} className="space-y-4 rounded-xl border bg-card p-5">
            <div>
              <h2 className="font-serif text-xl">Trocar senha</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {customer.has_password
                  ? "Sua sessão continua ativa neste dispositivo."
                  : "Sua conta foi criada com login social; defina uma senha para entrar também por email."}
              </p>
            </div>
            {customer.has_password ? (
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
            ) : null}
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
              <p className="mt-1 text-xs text-muted-foreground">8+ caracteres, com letras e números.</p>
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
            <Button type="submit" disabled={busy}>Salvar nova senha</Button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
