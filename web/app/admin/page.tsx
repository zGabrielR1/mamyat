"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  ExternalLink,
  Package,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  Tags,
  Users,
} from "lucide-react"

import { api } from "@/lib/api"
import type { Dashboard } from "@/lib/types"
import { useAdmin } from "@/components/admin/admin-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { brl, orderStatusTone, storefrontHref } from "@/lib/utils"

const PIPELINE = [
  { value: "awaiting_payment", label: "Aguardando pagamento" },
  { value: "paid", label: "Pago" },
  { value: "packing", label: "Em produção" },
  { value: "shipped", label: "Enviado" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
  { value: "refunded", label: "Reembolsado" },
]

export default function AdminDashboardPage() {
  const { admin, canWrite } = useAdmin()
  const [data, setData] = React.useState<Dashboard | null>(null)
  const [error, setError] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const answer = await api<Dashboard>("/api/admin/dashboard")
      setData(answer)
      setUpdatedAt(new Date())
      setError("")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível carregar")
    } finally {
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    if (admin) void load(true)
  }, [admin, load])

  if (!data) {
    if (error) return <div role="alert" className="ops-note"><h1>Visão geral</h1><p className="my-4">{error}</p><Button variant="outline" onClick={() => void load()} disabled={refreshing}>Tentar novamente</Button></div>
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-52" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const cards = [
    { label: "Receita confirmada", value: brl(data.revenue_minor), icon: Banknote, hint: `${data.paid_orders} pedidos pagos` },
    { label: "Pedidos", value: String(data.orders), icon: ShoppingBag, hint: `${data.awaiting} aguardando Pix` },
    { label: "Ticket médio", value: brl(data.average_ticket_minor), icon: Package, hint: "pedidos pagos" },
    { label: "Clientes", value: String(data.customers), icon: Users, hint: "contas criadas" },
  ]

  const alerts = [
    data.awaiting > 0
      ? {
          key: "awaiting",
          icon: ShoppingBag,
          text: `${data.awaiting} pedido(s) aguardando confirmação de pagamento.`,
          href: "/admin/pedidos?status=awaiting_payment",
          action: "Ver pedidos",
        }
      : null,
    data.low_stock.length > 0
      ? {
          key: "stock",
          icon: AlertTriangle,
          text: `${data.low_stock.length} variação(ões) com estoque baixo ou esgotado.`,
          href: "/admin/produtos",
          action: "Repor estoque",
        }
      : null,
    data.default_admin
      ? {
          key: "password",
          icon: ShieldAlert,
          text: "A senha inicial do painel ainda está ativa.",
          href: "/admin/configuracoes",
          action: "Trocar senha",
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string
    icon: typeof AlertTriangle
    text: string
    href: string
    action: string
  }>

  const quickActions = [
    { href: "/admin/produtos", label: "Novo produto", icon: Plus, show: canWrite },
    { href: "/admin/categorias", label: "Categorias", icon: Tags, show: canWrite },
    { href: "/admin/clientes", label: "Clientes", icon: Users, show: true },
    { href: "/admin/configuracoes", label: "Configurações", icon: Settings2, show: true },
  ].filter((action) => action.show)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Painel</p>
          <h1 className="mt-1 font-serif text-3xl">Bom te ver, {admin?.username}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.payment_mode === "demo"
              ? "Pagamentos em modo demonstração — confirme pedidos manualmente."
              : "Pagamentos ativos."}
            {updatedAt ? ` Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={storefrontHref("/")} target="_blank" rel="noreferrer">
              Ver a loja <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button asChild size="sm"><Link href="/admin/operacao">Abrir operação <ArrowUpRight className="size-3.5" /></Link></Button>
        </div>
      </div>

      {error ? <p className="rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      {alerts.length > 0 ? (
        <div className="grid gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
            >
              <p className="flex items-center gap-2">
                <alert.icon className="size-4 shrink-0" />
                {alert.text}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={alert.href}>{alert.action}</Link>
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
                <card.icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-medium">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-serif text-xl">Fluxo de pedidos</h2>
          <Link href="/admin/pedidos" className="text-xs text-muted-foreground hover:underline">
            Ver todos
          </Link>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {PIPELINE.map((stage) => {
            const count = data.by_status[stage.value] ?? 0
            return (
              <Link
                key={stage.value}
                href={`/admin/pedidos?status=${stage.value}`}
                className="group bg-card px-4 py-4 transition-colors hover:bg-secondary/50"
              >
                <p className="text-2xl font-medium">{count}</p>
                <p className="mt-1 text-xs text-muted-foreground group-hover:text-foreground">
                  {stage.label}
                </p>
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-serif text-xl">Pedidos recentes</h2>
            <Link href="/admin/pedidos" className="text-xs text-muted-foreground hover:underline">Ver todos</Link>
          </div>
          {data.recent_orders.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_orders.map((order) => (
                  <TableRow key={order.number}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/pedidos?q=${order.number}`} className="hover:underline">{order.number}</Link>
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{order.name}</TableCell>
                    <TableCell><Badge className={orderStatusTone(order.status)}>{order.status_label}</Badge></TableCell>
                    <TableCell className="text-right">{order.total || brl(order.total_minor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-serif text-xl">Ações rápidas</h2>
            </div>
            <div className="grid gap-2 p-4">
              {quickActions.map((action) => (
                <Button key={action.href} asChild variant="outline" className="justify-start">
                  <Link href={action.href}>
                    <action.icon className="size-4" /> {action.label}
                  </Link>
                </Button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-serif text-xl">Estoque baixo</h2>
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="divide-y">
              {data.low_stock.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Tudo abastecido.</p>
              ) : (
                data.low_stock.slice(0, 6).map((item) => (
                  <div key={`${item.product_id}:${item.variant}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{item.product}</p>
                      <p className="text-xs text-muted-foreground">{item.variant} · {item.sku || "sem SKU"}</p>
                    </div>
                    <Badge variant={item.stock === 0 ? "destructive" : "outline"}>{item.stock}</Badge>
                  </div>
                ))
              )}
            </div>
            <div className="border-t px-5 py-3">
              <Link href="/admin/produtos" className="text-xs text-muted-foreground hover:underline">Gerenciar produtos</Link>
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-serif text-xl">Mais vendidos</h2>
            </div>
            <div className="divide-y">
              {data.top_products.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Aparece quando houver pedidos pagos.
                </p>
              ) : (
                data.top_products.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.qty} un.</p>
                    </div>
                    <span>{brl(item.revenue_minor)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
