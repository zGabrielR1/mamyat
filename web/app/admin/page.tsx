"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Banknote, Package, ShoppingBag, Users } from "lucide-react"

import { api } from "@/lib/api"
import type { Dashboard } from "@/lib/types"
import { useAdmin } from "@/components/admin/admin-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { brl, orderStatusTone } from "@/lib/utils"

export default function AdminDashboardPage() {
  const { admin } = useAdmin()
  const [data, setData] = React.useState<Dashboard | null>(null)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!admin) return
    api<Dashboard>("/api/admin/dashboard")
      .then(setData)
      .catch((failure: Error) => setError(failure.message))
  }, [admin])

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-52" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Painel</p>
          <h1 className="mt-1 font-serif text-3xl">Bom te ver, {admin?.username}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.payment_mode === "demo"
              ? "Pagamentos em modo demonstração — confirme pedidos manualmente."
              : "Pagamentos Asaas ativos."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/" target="_blank">Ver a loja <ArrowUpRight className="size-3.5" /></Link></Button>
          <Button asChild size="sm"><Link href="/admin/pedidos">Ver pedidos</Link></Button>
        </div>
      </div>

      {error ? <p className="rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

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
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-serif text-xl">Estoque baixo</h2>
              <AlertTriangle className="size-4 text-amber-600" />
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
