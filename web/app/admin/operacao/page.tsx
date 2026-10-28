"use client"
import * as React from "react"
import Link from "next/link"
import { Download, Printer, RefreshCw, ArrowUpRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Order, Product } from "@/lib/types"
import { brl, downloadCsv } from "@/lib/utils"
import { useAdmin } from "@/components/admin/admin-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type Lane = "paid" | "packing" | "shipped"
const LANES: { id: Lane; title: string; action: string; next: string }[] = [
  { id: "paid", title: "Separar e produzir", action: "Iniciar produção", next: "packing" },
  { id: "packing", title: "Preparar entrega", action: "Registrar envio", next: "shipped" },
  { id: "shipped", title: "Acompanhar entrega", action: "Confirmar entrega", next: "delivered" },
]
const PAID = new Set(["paid", "packing", "shipped", "delivered"])
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR")
const keyDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`

export default function AtelierOperations() {
  const { admin, canWrite } = useAdmin()
  const [orders, setOrders] = React.useState<Order[]>([])
  const [products, setProducts] = React.useState<Product[]>([])
  const [tab, setTab] = React.useState("queue")
  const [query, setQuery] = React.useState("")
  const [method, setMethod] = React.useState("")
  const [days, setDays] = React.useState("30")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [updated, setUpdated] = React.useState<Date | null>(null)
  const [chosen, setChosen] = React.useState<string[]>([])
  const [printing, setPrinting] = React.useState(false)
  const [printOrders, setPrintOrders] = React.useState<Order[]>([])
  const [pending, setPending] = React.useState<{ order: Order; next: string } | null>(null)
  const [tracking, setTracking] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true); setError("")
    try {
      const [o, p] = await Promise.all([api<{orders:Order[]}>("/api/admin/orders"), api<{products:Product[]}>("/api/admin/products")])
      setOrders(o.orders); setProducts(p.products); setUpdated(new Date())
      setChosen(v => v.filter(n => o.orders.some(row => row.number === n && ["paid","packing"].includes(row.status))))
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar a operação") }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { if (admin) void load() }, [admin,load])
  const needle = query.trim().toLocaleLowerCase("pt-BR")
  const visible = orders.filter(o => (!method || o.shipping_method === method) && (!needle || `${o.number} ${o.name} ${o.email} ${o.items.map(i => i.name).join(" ")}`.toLocaleLowerCase("pt-BR").includes(needle))).sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at))
  const queue = visible.filter(o => LANES.some(l => l.id === o.status))
  const stock = products.filter(p => p.active && !p.made_to_order).flatMap(p => p.variants.map(v => ({ product:p, variant:v, available:v.available ?? v.stock }))).filter(r => r.available <= 3).sort((a,b) => a.available-b.available || a.product.name.localeCompare(b.product.name,"pt-BR"))
  const inventory = products.filter(p => p.active && !p.made_to_order).flatMap(p => p.variants.map(v => ({ product:p, variant:v })))
  const since = Date.now() - Number(days)*86400000
  const period = orders.filter(o => !Number(days) || Date.parse(o.created_at) >= since)
  const paid = period.filter(o => PAID.has(o.status))
  const revenue = paid.reduce((n,o) => n+o.total_minor,0)
  const pendingValue = period.filter(o => o.status === "awaiting_payment").reduce((n,o) => n+o.total_minor,0)
  const week = Array.from({length:7},(_,i) => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-6+i)
    const rows = orders.filter(o => PAID.has(o.status) && keyDate(new Date(o.created_at)) === keyDate(d))
    return { date:d, value:rows.reduce((n,o) => n+o.total_minor,0), count:rows.length }
  })
  const peak = Math.max(1,...week.map(d => d.value))
  const print = async () => {
    setPrinting(true)
    try {
      // Fetch full snapshots only for explicitly selected paid/packing orders.
      const snapshots:Order[] = []
      for (const number of chosen) {
        const {order} = await api<{order:Order}>(`/api/admin/orders/${encodeURIComponent(number)}`)
        if (!["paid","packing"].includes(order.status)) throw new Error(`Pedido ${number} mudou de etapa. Atualize a fila antes de imprimir.`)
        snapshots.push(order)
      }
      setPrintOrders(snapshots)
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    } catch(e) { toast.error(e instanceof Error ? e.message : "Não foi possível preparar a impressão") }
    finally { setPrinting(false) }
  }
  const advance = async () => {
    if (!pending || !canWrite) return
    if (pending.next === "shipped" && pending.order.shipping_method !== "pickup" && !tracking.trim()) { toast.error("Informe o código de rastreio antes de enviar."); return }
    setBusy(true)
    try {
      await api(`/api/admin/orders/${encodeURIComponent(pending.order.number)}/status`, {body:{status:pending.next,tracking_code:tracking.trim()}})
      toast.success("Pedido atualizado"); setPending(null); await load()
    } catch(e) { toast.error(e instanceof Error ? e.message : "Não foi possível atualizar") }
    finally { setBusy(false) }
  }
  const exportStock = () => downloadCsv("reposicao-mamy.csv",[["Produto","Variação","SKU","Estoque físico","Disponível","Preço unitário"],...stock.map(r => [r.product.name,r.variant.name,r.variant.sku,r.variant.stock,r.available,brl(r.product.price_minor)])])
  const exportSales = () => downloadCsv("vendas-mamy.csv",[["Pedido","Criação","Status","Cliente","Total confirmado"],...paid.map(o => [o.number,date(o.created_at),o.status_label,o.name,brl(o.total_minor)])])
  return <div className="ops-workspace">
    <div className="ops-heading"><div><h1>Operação do ateliê</h1><p>{updated ? `Atualizado às ${updated.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}.` : "Pedidos, peças e próximos passos."} {loading ? "Atualizando…" : `${queue.length} pedidos na fila atual.`}</p></div><div className="ops-actions"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Atualizar</Button><Button asChild><Link href="/admin/produtos">Gerenciar catálogo <ArrowUpRight size={16}/></Link></Button></div></div>
    {error ? <div className="ops-note" role="alert">{error} {updated ? "Os últimos dados carregados continuam visíveis." : "Tente atualizar para carregar os dados."}<button onClick={() => void load()} className="ml-3 underline">Tentar novamente</button></div> : null}
    <div className="ops-tabs" aria-label="Áreas da operação">{[{id:"queue",label:"Fila de produção"},{id:"stock",label:"Estoque e reposição"},{id:"sales",label:"Vendas e receita"}].map(t => <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    {tab === "queue" ? <>
      <div className="ops-toolbar"><Input aria-label="Buscar na fila" placeholder="Pedido, cliente ou peça" value={query} onChange={e => setQuery(e.target.value)} /><label>Entrega<select value={method} onChange={e => setMethod(e.target.value)}><option value="">Todas</option><option value="delivery">Envio</option><option value="pickup">Retirada</option></select></label><Button variant="outline" disabled={!chosen.length || printing || loading} onClick={() => void print()}>{printing ? <Loader2 size={16} className="animate-spin"/> : <Printer size={16}/>}Imprimir separação ({chosen.length})</Button></div>
      <p className="mb-4 text-xs text-muted-foreground">Pedidos mais antigos primeiro. Selecione pedidos pagos ou em produção para preparar a lista de separação.</p>
      <div className="ops-queue">{LANES.map(lane => {
        const rows = queue.filter(o => o.status === lane.id)
        return <section className="ops-column" key={lane.id}><header><h2>{lane.title}</h2><span>{rows.length}</span></header>{rows.length === 0 ? <p className="ops-empty">{loading ? "Carregando pedidos…" : "Nenhum pedido nesta etapa com os filtros atuais."}</p> : rows.map(o => <article className="ops-order" key={o.number}>
          <div className="ops-order-top"><span>{o.number}</span><span>{date(o.created_at)}</span></div><h3>{o.name}</h3><p>{o.shipping_method === "pickup" ? "Retirada no ateliê" : "Envio"} · {o.total || brl(o.total_minor)}</p>
          <ul>{o.items.map((item,i) => <li key={i}>{item.qty} × {item.name} <span className="text-muted-foreground">{item.variant_name}</span></li>)}</ul>
          {["paid","packing"].includes(o.status) ? <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" aria-label={`Separar ${o.number}`} checked={chosen.includes(o.number)} onChange={() => setChosen(v => v.includes(o.number) ? v.filter(n => n !== o.number) : [...v,o.number])}/>Incluir na separação</label> : o.tracking_code ? <p>Rastreio: {o.tracking_code}</p> : null}
          <div className="ops-order-footer"><Link href={`/admin/pedidos?q=${encodeURIComponent(o.number)}`}>Detalhes</Link>{canWrite ? <Button size="sm" variant="outline" disabled={loading} onClick={() => {setPending({order:o,next:lane.next});setTracking(o.tracking_code || "")}}>{lane.action}</Button> : null}</div>
        </article>)}</section>
      })}</div>
    </> : null}
    {tab === "stock" ? <>
      <div className="ops-metrics"><div><p>Variações para revisar</p><strong>{stock.length}</strong><small>Até 3 unidades disponíveis</small></div><div><p>Esgotadas</p><strong>{stock.filter(r => r.available <= 0).length}</strong><small>Variações ativas sem disponibilidade</small></div><div><p>Unidades em estoque</p><strong>{inventory.reduce((n,r) => n+r.variant.stock,0)}</strong><small>Estoque físico de peças ativas</small></div><div><p>Peças sob encomenda</p><strong>{products.filter(p => p.active && p.made_to_order).length}</strong><small>Fora da lista de reposição</small></div></div>
      <section className="ops-panel"><header><div><h2>Prioridades de reposição</h2><p className="mt-2 text-xs text-muted-foreground">Disponibilidade considera reservas; estoque físico é o total cadastrado.</p></div><Button variant="outline" onClick={exportStock} disabled={!stock.length}><Download size={16}/>CSV</Button></header><div className="ops-table-wrap"><table className="ops-stock-table"><thead><tr><th>Peça e variação</th><th>SKU</th><th className="num">Físico</th><th className="num">Disponível</th><th>Ação</th></tr></thead><tbody>{stock.map(r => <tr key={`${r.product.id}:${r.variant.id}`}><td><div className="ops-stock-name">{r.product.images[0] ? <img src={r.product.images[0]} alt=""/> : null}<div>{r.product.name}<span>{r.variant.name}</span></div></div></td><td>{r.variant.sku || "—"}</td><td className="num">{r.variant.stock}</td><td className={`num ${r.available <= 0 ? "ops-alert" : ""}`}>{r.available}</td><td><Link className="underline" href={`/admin/produtos?q=${encodeURIComponent(r.product.name)}`}>{canWrite ? "Revisar" : "Consultar"}</Link></td></tr>)}</tbody></table>{!stock.length ? <p className="ops-empty">{loading ? "Carregando estoque…" : "Nenhuma variação ativa com disponibilidade baixa."}</p> : null}</div></section>
    </> : null}
    {tab === "sales" ? <>
      <div className="ops-toolbar"><label>Período de criação<select value={days} onChange={e => setDays(e.target.value)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="0">Todo o período</option></select></label><Button variant="outline" onClick={exportSales} disabled={!paid.length}><Download size={16}/>Exportar confirmados</Button></div>
      <div className="ops-metrics"><div><p>Valor confirmado</p><strong>{brl(revenue)}</strong><small>{paid.length} pedidos no período</small></div><div><p>Ticket médio</p><strong>{brl(paid.length ? Math.round(revenue/paid.length) : 0)}</strong><small>Somente pedidos confirmados</small></div><div><p>Aguardando pagamento</p><strong>{brl(pendingValue)}</strong><small>Fora do valor confirmado</small></div><div><p>Cancelados e reembolsados</p><strong>{period.filter(o => ["cancelled","refunded"].includes(o.status)).length}</strong><small>Fora do valor confirmado</small></div></div>
      <p className="ops-note">Valores brutos dos pedidos atualmente pagos, em produção, enviados ou entregues; incluem frete e descontos. O período usa a data de criação do pedido. Taxas do provedor e custos de produção não são descontados.</p>
      <section className="ops-panel"><header><div><h2>Últimos 7 dias</h2><p className="mt-2 text-xs text-muted-foreground">Valor confirmado por data de criação, independente do filtro acima.</p></div></header><div className="ops-chart" role="img" aria-label={week.map(d => `${date(d.date.toISOString())}: ${brl(d.value)}, ${d.count} pedidos`).join("; ")}>{week.map(d => <div key={d.date.toISOString()} className="ops-bar"><span>{brl(d.value)}</span><i style={{height:`${d.value/peak*145}px`,"--bar-size":`${d.value/peak*100}%`} as React.CSSProperties}/><span>{d.date.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}</span></div>)}</div></section>
      <section className="ops-panel"><header><h2>Composição dos pedidos</h2></header><div className="ops-table-wrap"><table><thead><tr><th>Status atual</th><th className="num">Pedidos</th><th className="num">Valor bruto</th></tr></thead><tbody>{[...new Set(period.map(o => o.status))].map(status => { const rows = period.filter(o => o.status === status); return <tr key={status}><td>{rows[0].status_label}</td><td className="num">{rows.length}</td><td className="num">{brl(rows.reduce((n,o) => n+o.total_minor,0))}</td></tr> })}</tbody></table>{!period.length ? <p className="ops-empty">Nenhum pedido criado neste período.</p> : null}</div></section>
    </> : null}
    <Dialog open={!!pending} onOpenChange={v => { if (!v && !busy) setPending(null) }}><DialogContent><DialogHeader><DialogTitle>Atualizar {pending?.order.number}</DialogTitle><DialogDescription>{pending?.next === "packing" ? "Confirme que a equipe vai começar a separar ou produzir este pedido." : pending?.next === "shipped" ? "Registre o rastreio após despachar. Para retirada, confirme que o pedido está pronto para a cliente." : "Confirme somente depois de verificar que a cliente recebeu o pedido."}</DialogDescription></DialogHeader>{pending?.next === "shipped" ? <label className="space-y-2 text-sm">{pending.order.shipping_method === "pickup" ? "Referência da retirada (opcional)" : "Código de rastreio"}<Input value={tracking} onChange={e => setTracking(e.target.value.toUpperCase())} placeholder="Código da transportadora"/></label> : null}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>Voltar</Button><Button disabled={busy} onClick={() => void advance()}>{busy ? "Salvando…" : "Confirmar atualização"}</Button></div></DialogContent></Dialog>
    <div className="ops-print"><h2>Mamy Ateliê · Lista de separação</h2><p>{new Date().toLocaleString("pt-BR")} · {printOrders.length} pedidos</p>{printOrders.map(o => <section key={o.number}><h3>{o.number} · {o.name}</h3><p>{o.shipping_method === "pickup" ? "Retirada no ateliê" : "Envio"}</p><table><thead><tr><th>Conferir</th><th>Peça</th><th>Variação / SKU</th><th>Quantidade</th></tr></thead><tbody>{o.items.map((i,n) => <tr key={n}><td>□</td><td>{i.name}</td><td>{i.variant_name} / {i.sku || "—"}</td><td>{i.qty}</td></tr>)}</tbody></table></section>)}</div>
  </div>
}
