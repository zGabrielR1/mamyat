"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Search } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { Order } from "@/lib/types"
import { useAdmin } from "@/components/admin/admin-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { brl, orderStatusTone } from "@/lib/utils"

const STATUSES = [
  { value: "", label: "Todos" },
  { value: "awaiting_payment", label: "Aguardando Pix" },
  { value: "paid", label: "Pago" },
  { value: "packing", label: "Em produção" },
  { value: "shipped", label: "Enviado" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
  { value: "refunded", label: "Reembolsado" },
]

const NEXT: Record<string, string[]> = {
  awaiting_payment: ["cancelled"],
  paid: ["packing", "cancelled", "refunded"],
  packing: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
}

function label(status: string) {
  return STATUSES.find((row) => row.value === status)?.label || status
}

function AdminOrders() {
  const { admin } = useAdmin()
  const params = useSearchParams()
  const [status, setStatus] = React.useState("")
  const [query, setQuery] = React.useState(params.get("q") || "")
  const [debounced, setDebounced] = React.useState(params.get("q") || "")
  const [orders, setOrders] = React.useState<Order[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<Order | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [tracking, setTracking] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const search = new URLSearchParams()
      if (status) search.set("status", status)
      if (debounced) search.set("q", debounced)
      const answer = await api<{ orders: Order[] }>(`/api/admin/orders?${search.toString()}`)
      setOrders(answer.orders)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível carregar")
    } finally {
      setLoading(false)
    }
  }, [status, debounced])

  React.useEffect(() => {
    if (admin) void load()
  }, [admin, load])

  const open = async (number: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setSelected(null)
    try {
      const answer = await api<{ order: Order }>(`/api/admin/orders/${number}`)
      setSelected(answer.order)
      setTracking(answer.order.tracking_code || "")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Pedido não encontrado")
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const act = async (action: "paid" | "status", nextStatus?: string) => {
    if (!selected) return
    setBusy(true)
    try {
      const answer = action === "paid"
        ? await api<{ order: Order }>(`/api/admin/orders/${selected.number}/paid`, { body: {} })
        : await api<{ order: Order }>(`/api/admin/orders/${selected.number}/status`, {
            body: { status: nextStatus, tracking_code: tracking },
          })
      setSelected(answer.order)
      toast.success(action === "paid" ? "Pagamento confirmado" : `Status: ${label(answer.order.status)}`)
      void load()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível atualizar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Vendas</p>
          <h1 className="mt-1 font-serif text-3xl">Pedidos</h1>
          <p className="mt-1 text-sm text-muted-foreground">{orders.length} pedido(s) nesta visão.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Número, nome ou email"
              className="w-64 pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm"
            aria-label="Filtrar status"
          >
            {STATUSES.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : orders.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">Nenhum pedido com esses filtros.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.number} className="cursor-pointer" onClick={() => open(order.number)}>
                  <TableCell className="font-medium">{order.number}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <p className="max-w-44 truncate">{order.name}</p>
                    <p className="max-w-44 truncate text-xs text-muted-foreground">{order.email}</p>
                  </TableCell>
                  <TableCell><Badge className={orderStatusTone(order.status)}>{order.status_label}</Badge></TableCell>
                  <TableCell>{order.item_count ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{order.total || brl(order.total_minor)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">abrir</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {detailLoading || !selected ? (
            <div className="space-y-3 py-6">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 font-serif text-2xl">
                  Pedido {selected.number}
                  <Badge className={orderStatusTone(selected.status)}>{selected.status_label}</Badge>
                </DialogTitle>
                <DialogDescription>
                  {new Date(selected.created_at).toLocaleString("pt-BR")} · {selected.name} · {selected.email}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="rounded-lg border">
                  {selected.items.map((item) => (
                    <div key={`${item.product_id}:${item.variant_id}`} className="flex items-center justify-between gap-3 border-b px-3 py-2.5 text-sm last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate">{item.qty}× {item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.variant_name} · {item.sku}</p>
                      </div>
                      <span>{brl(item.line_total_minor)}</span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Entrega</p>
                    {selected.shipping_method === "pickup" ? (
                      <p className="mt-1 text-muted-foreground">Retirada no ateliê</p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        {selected.shipping.street}, {selected.shipping.number}<br />
                        {selected.shipping.district} · {selected.shipping.city}/{selected.shipping.state}<br />
                        CEP {selected.shipping.cep}
                      </p>
                    )}
                    {selected.shipping.notes ? (
                      <p className="mt-2 text-xs text-muted-foreground">Obs.: {selected.shipping.notes}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagamento</p>
                    <p className="mt-1 capitalize">{selected.payment.provider} · {selected.payment.status}</p>
                    <p className="text-xs text-muted-foreground">{selected.payment.provider_ref || "sem referência"}</p>
                    <Separator className="my-3" />
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(selected.subtotal_minor)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{selected.shipping_method === "pickup" ? "—" : brl(selected.shipping_minor)}</span></div>
                      {selected.discount_minor ? <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>− {brl(selected.discount_minor)}</span></div> : null}
                      <div className="flex justify-between pt-1 font-medium"><span>Total</span><span>{selected.total}</span></div>
                    </div>
                  </div>
                </div>

                <Separator />

                {selected.status === "awaiting_payment" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground">
                      Confirmar manualmente só quando o valor estiver na conta.
                    </p>
                    <Button size="sm" onClick={() => act("paid")} disabled={busy}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : "Confirmar pagamento"}
                    </Button>
                  </div>
                ) : null}

                {NEXT[selected.status]?.length ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-40 flex-1">
                        <label htmlFor="tracking" className="text-xs text-muted-foreground">Código de rastreio (ao enviar)</label>
                        <Input id="tracking" value={tracking} onChange={(event) => setTracking(event.target.value.toUpperCase())} placeholder="BR123456789BR" />
                      </div>
                      {NEXT[selected.status].map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === "cancelled" || next === "refunded" ? "outline" : "default"}
                          disabled={busy}
                          onClick={() => act("status", next)}
                        >
                          {label(next)}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[0.7rem] text-muted-foreground">
                      Status atual: {selected.status_label}. O cliente recebe email quando o pagamento confirma e quando o pedido é enviado.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Este pedido não tem próximas ações.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function AdminOrdersPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <AdminOrders />
    </React.Suspense>
  )
}
