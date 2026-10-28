"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Copy, Download, Loader2, RefreshCw, Search } from "lucide-react"
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
import { brl, downloadCsv, orderStatusTone } from "@/lib/utils"

const STATUSES = [
  { value: "", label: "Todos" },
  { value: "awaiting_payment", label: "Aguardando pagamento" },
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

const RANGES = [
  { value: "all", label: "Todo o período", days: 0 },
  { value: "7", label: "Últimos 7 dias", days: 7 },
  { value: "30", label: "Últimos 30 dias", days: 30 },
  { value: "90", label: "Últimos 90 dias", days: 90 },
]

function label(status: string) {
  return STATUSES.find((row) => row.value === status)?.label || status
}

function money(minor: number) {
  return brl(minor || 0)
}

function addressOf(order: Order): string {
  if (order.shipping_method === "pickup") return "Retirada no ateliê"
  const s = order.shipping || {}
  return [
    `${s.street || ""}, ${s.number || ""}`.trim(),
    s.complement,
    s.district,
    `${s.city || ""}/${s.state || ""}`,
    s.cep ? `CEP ${s.cep}` : "",
    s.notes ? `Obs.: ${s.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function AdminOrders() {
  const { admin, canWrite } = useAdmin()
  const params = useSearchParams()
  const [status, setStatus] = React.useState(params.get("status") || "")
  const [query, setQuery] = React.useState(params.get("q") || "")
  const [range, setRange] = React.useState("all")
  const [orders, setOrders] = React.useState<Order[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [selected, setSelected] = React.useState<Order | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [tracking, setTracking] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const answer = await api<{ orders: Order[] }>("/api/admin/orders")
      setOrders(
        [...answer.orders].sort(
          (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
        ),
      )
      setUpdatedAt(new Date())
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível carregar")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    if (admin) void load(true)
  }, [admin, load])

  const scoped = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const days = RANGES.find((row) => row.value === range)?.days || 0
    const since = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0
    return orders.filter((order) => {
      if (since && Date.parse(order.created_at) < since) return false
      if (needle) {
        const haystack = `${order.number} ${order.name} ${order.email} ${order.phone || ""} ${order.tracking_code || ""}`
        if (!haystack.toLowerCase().includes(needle)) return false
      }
      return true
    })
  }, [orders, range, query])
  const filtered = scoped.filter(order => !status || order.status === status)

  const counts = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const order of scoped) map[order.status] = (map[order.status] || 0) + 1
    return map
  }, [scoped])

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
    if (nextStatus === "refunded" && !window.confirm(`Registrar ${selected.number} como reembolsado? Confirme o reembolso no provedor antes de continuar. Esta ação registra o status e não devolve o pagamento automaticamente.`)) return
    if (nextStatus === "cancelled" && !window.confirm(`Cancelar o pedido ${selected.number}? Verifique o pagamento e combine a devolução com a cliente quando necessário.`)) return
    setBusy(true)
    try {
      const answer = action === "paid"
        ? await api<{ order: Order }>(`/api/admin/orders/${selected.number}/paid`, { body: {} })
        : await api<{ order: Order }>(`/api/admin/orders/${selected.number}/status`, {
            body: { status: nextStatus, tracking_code: tracking },
          })
      setSelected(answer.order)
      toast.success(action === "paid" ? "Pagamento confirmado" : `Status: ${label(answer.order.status)}`)
      void load(true)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível atualizar")
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    downloadCsv("pedidos-mamyatelie.csv", [
      ["Pedido", "Data", "Status", "Cliente", "Email", "Telefone", "Itens", "Subtotal", "Frete", "Desconto", "Total", "Pagamento", "Rastreio", "Entrega"],
      ...filtered.map((order) => [
        order.number,
        new Date(order.created_at).toLocaleString("pt-BR"),
        label(order.status),
        order.name,
        order.email,
        order.phone || "",
        order.item_count ?? order.items.reduce((total, item) => total + item.qty, 0),
        money(order.subtotal_minor),
        order.shipping_method === "pickup" ? "—" : money(order.shipping_minor),
        money(order.discount_minor),
        money(order.total_minor),
        `${order.payment?.provider || ""} ${order.payment?.status || ""}`.trim(),
        order.tracking_code || "",
        addressOf(order).replace(/\n/g, " · "),
      ]),
    ])
    toast.success(`${filtered.length} pedido(s) exportado(s)`)
  }

  const copyAddress = async () => {
    if (!selected) return
    const text = `${selected.name}\n${addressOf(selected)}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Endereço copiado")
    } catch {
      toast.error("Não foi possível copiar")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Vendas</p>
          <h1 className="mt-1 font-serif text-3xl">Pedidos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length} de {orders.length} pedido(s)
            {updatedAt ? ` · atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Número, nome, email ou rastreio"
              className="w-72 pl-9"
            />
          </div>
          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm"
            aria-label="Período"
          >
            {RANGES.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
          </select>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((row) => {
          const count = row.value ? counts[row.value] || 0 : scoped.length
          return (
            <Button
              key={row.value || "all"}
              type="button"
              size="sm"
              variant={status === row.value ? "default" : "outline"}
              onClick={() => setStatus(row.value)}
            >
              {row.label}
              <span className={status === row.value ? "text-primary-foreground/70" : "text-muted-foreground"}>
                {count}
              </span>
            </Button>
          )
        })}
      </div>

      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filtered.length === 0 ? (
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
              {filtered.map((order) => (
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
                  <TableCell className="text-right font-medium">{order.total || money(order.total_minor)}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" aria-label={`Abrir pedido ${order.number}`} onClick={event => { event.stopPropagation(); void open(order.number) }}>Abrir</Button></TableCell>
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
                      <span>{money(item.line_total_minor)}</span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Entrega</p>
                      <Button size="icon-sm" variant="ghost" onClick={copyAddress} aria-label="Copiar endereço">
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                    {selected.shipping_method === "pickup" ? (
                      <p className="mt-1 whitespace-pre-line text-muted-foreground">Retirada no ateliê</p>
                    ) : (
                      <p className="mt-1 whitespace-pre-line text-muted-foreground">
                        {addressOf(selected)}
                      </p>
                    )}
                    {selected.phone ? (
                      <p className="mt-2 text-xs text-muted-foreground">Telefone: {selected.phone}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagamento</p>
                    <p className="mt-1 capitalize">{selected.payment.provider} · {selected.payment.status}</p>
                    <p className="text-xs text-muted-foreground">{selected.payment.payment_id || selected.payment.provider_ref || "sem referência"}</p>
                    {selected.payment.review_required ? <p className="mt-2 text-sm text-destructive">Pagamento requer conferência. Verifique no Mercado Pago e combine a entrega ou o reembolso com o cliente.</p> : null}
                    <Separator className="my-3" />
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(selected.subtotal_minor)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{selected.shipping_method === "pickup" ? "—" : money(selected.shipping_minor)}</span></div>
                      {selected.discount_minor ? <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>− {money(selected.discount_minor)}</span></div> : null}
                      <div className="flex justify-between pt-1 font-medium"><span>Total</span><span>{selected.total}</span></div>
                    </div>
                  </div>
                </div>

                <Separator />

                {!canWrite ? (
                  <p className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
                    Esta conta é somente leitura: o histórico do pedido pode ser consultado,
                    mas o status não pode ser alterado.
                  </p>
                ) : (
                  <>
                    {selected.status === "awaiting_payment" && selected.payment.provider !== "mercadopago" ? (
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
                  </>
                )}

                {selected.history?.length ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Histórico</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {selected.history.map((entry, index) => (
                        <li key={`${entry.status}-${index}`}>
                          {new Date(entry.at).toLocaleString("pt-BR")} · {label(entry.status)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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
