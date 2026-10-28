"use client"

import * as React from "react"

import { useParams, useSearchParams } from "next/navigation"
import { Check, Copy, Loader2, Package, RefreshCw, Truck } from "lucide-react"
import { toast } from "sonner"

import { api, ApiFailure } from "@/lib/api"
import type { Order } from "@/lib/types"
import { useAuth, useConfig } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { MercadoPagoPayment } from "@/components/mercadopago-payment"
import { brl, orderStatusTone } from "@/lib/utils"

const FLOW = [
  { status: "awaiting_payment", label: "Pedido aberto" },
  { status: "paid", label: "Pagamento confirmado" },
  { status: "packing", label: "Em produção" },
  { status: "shipped", label: "Enviado" },
  { status: "delivered", label: "Entregue" },
]

function OrderView() {
  const params = useParams<{ number: string }>()
  const search = useSearchParams()
  const number = typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) || "") : params?.number || ""
  const { customer } = useAuth()
  const config = useConfig()
  const [order, setOrder] = React.useState<Order | null>(null)
  const [email, setEmail] = React.useState(
    search.get("email") || (typeof window !== "undefined"
      ? window.sessionStorage.getItem(`mamyat.order.${number}`) || ""
      : ""),
  )
  const [loading, setLoading] = React.useState(true)
  const [needsEmail, setNeedsEmail] = React.useState(false)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async (withEmail = email) => {
    if (!number) return
    setLoading(true)
    setError("")
    try {
      const answer = await api<Order>(
        `/api/orders/${encodeURIComponent(number)}${withEmail ? `?email=${encodeURIComponent(withEmail)}` : ""}`,
      )
      setOrder(answer)
      setNeedsEmail(false)
      if (withEmail) window.sessionStorage.setItem(`mamyat.order.${number}`, withEmail)
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.status === 403) {
        setNeedsEmail(true)
      } else {
        setError(failure instanceof Error ? failure.message : "Pedido não encontrado")
      }
    } finally {
      setLoading(false)
    }
  }, [number, email])

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number])

  React.useEffect(() => {
    if (!order || order.status !== "awaiting_payment") return
    const timer = window.setInterval(() => {
      void load()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [order, load])

  const copyPix = async () => {
    const code = order?.payment?.qr_code
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      toast.success("Código Pix copiado")
    } catch {
      toast.error("Não foi possível copiar; selecione o código manualmente")
    }
  }

  const retry = async () => {
    if (!order) return
    setBusy(true)
    try {
      const updated = await api<Order>(`/api/orders/${encodeURIComponent(order.number)}/pay`, {
        body: { email },
      })
      setOrder(updated)
      toast.success("Pagamento atualizado")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Tente novamente")
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!order) return
    if (!window.confirm("Cancelar este pedido? A reserva das peças será liberada.")) return
    setBusy(true)
    try {
      const updated = await api<Order>(`/api/orders/${encodeURIComponent(order.number)}/cancel`, {
        body: { email },
      })
      setOrder(updated)
      toast.success("Pedido cancelado")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível cancelar")
    } finally {
      setBusy(false)
    }
  }

  if (loading && !order) {
    return (
      <div className="container-page py-14">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (needsEmail) {
    return (
      <div className="container-page max-w-md py-20">
        <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Pedido {number}</p>
        <h1 className="mt-2 font-serif text-3xl">Confirme seu email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Para sua segurança, informe o email usado no pedido.
        </p>
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void load(email)
          }}
        >
          <div>
            <Label htmlFor="lookup-email">Email do pedido</Label>
            <Input id="lookup-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <Button type="submit" className="w-full">Ver pedido</Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {customer ? "Você está conectada; o pedido aparece também em Minha conta." : (
            <><a href="/entrar" className="underline">Entre na sua conta</a> para ver todos os pedidos.</>
          )}
        </p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-serif text-3xl">Pedido não encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild><a href="/pedido">Consultar outro</a></Button>
          <Button asChild variant="outline"><a href="/loja">Ver a loja</a></Button>
        </div>
      </div>
    )
  }

  const currentIndex = FLOW.findIndex((step) => step.status === order.status)
  const cancelled = ["cancelled", "refunded"].includes(order.status)
  const qr = order.payment?.qr_base64
  const qrSrc = qr ? (qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`) : ""

  return (
    <div className="container-page py-10 md:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
            Pedido {order.number}
          </p>
          <h1 className="mt-2 font-serif text-4xl">
            {order.status === "awaiting_payment" ? (
                order.payment.review_required ? "Pagamento em conferência" :
                ["pending", "in_process", "authorized", "in_mediation"].includes(order.payment.provider_status || "") ? "Aguardando confirmação" :
                order.payment.expired ? "Reserva expirada" : "Falta só o pagamento"
              ) :
              order.status === "paid" ? "Pagamento confirmado" :
              order.status === "packing" ? "Em produção no ateliê" :
              order.status === "shipped" ? "A caminho de você" :
              order.status === "delivered" ? "Entregue" :
              order.status === "cancelled" ? "Pedido cancelado" : "Pedido reembolsado"}
          </h1>
          <div className="mt-3 flex items-center gap-2">
            <Badge className={orderStatusTone(order.status)}>{order.status_label}</Badge>
            {order.payment?.provider === "demo" ? <Badge variant="outline">Modo demonstração</Badge> : null}
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-muted-foreground">Total</p>
          <p className="text-2xl font-medium">{order.total}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleDateString("pt-BR", { dateStyle: "long" })}
          </p>
        </div>
      </div>

      {!cancelled ? (
        <ol className="mt-8 grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-5">
          {FLOW.map((step, index) => {
            const done = currentIndex >= index
            return (
              <li key={step.status} className="flex items-center gap-2 sm:flex-col sm:items-start">
                <span className={`flex size-7 items-center justify-center rounded-full text-xs ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className={`text-xs ${done ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
              </li>
            )
          })}
        </ol>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {order.status === "awaiting_payment" ? (
            <section className="rounded-xl border border-primary/30 bg-card p-5">
              {order.payment?.provider === "mercadopago" ? (
                <MercadoPagoPayment order={order} email={email}
                  returnedPaymentId={search.get("payment_id") || search.get("collection_id") || ""}
                  onUpdate={setOrder} onRetry={retry} retrying={busy} />
              ) : <>
              <h2 className="font-serif text-xl">Pague com Pix</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                O pedido confirma sozinho assim que o pagamento cai. A reserva dura 30 minutos.
              </p>
              <div className="mt-5 flex flex-col gap-5 sm:flex-row">
                <div className="flex size-44 shrink-0 items-center justify-center rounded-xl border bg-white p-2">
                  {qrSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrSrc} alt="QR Code Pix" className="size-full object-contain" />
                  ) : (
                    <div className="px-3 text-center text-xs text-muted-foreground">
                      {order.payment?.provider === "demo"
                        ? "Pagamento simulado: confirme pelo painel."
                        : "QR indisponível; use o código abaixo ou o link da fatura."}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {order.payment?.qr_code ? (
                    <>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pix copia e cola</p>
                      <textarea
                        readOnly
                        value={order.payment.qr_code}
                        className="mt-2 h-24 w-full resize-none rounded-lg border bg-background p-3 font-mono text-xs"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" onClick={copyPix}>
                          <Copy className="size-4" /> Copiar código
                        </Button>
                        {order.payment.invoice_url ? (
                          <Button asChild variant="outline">
                            <a href={order.payment.invoice_url} target="_blank" rel="noreferrer">Abrir fatura</a>
                          </Button>
                        ) : null}
                        <Button type="button" variant="ghost" onClick={retry} disabled={busy}>
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                          Gerar novo Pix
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p>O Pix ainda não foi gerado.</p>
                      <Button className="mt-3" onClick={retry} disabled={busy}>Gerar Pix</Button>
                    </div>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Celular: abra o app do banco, escolha Pix e cole o código. Também aceitamos o link da fatura.
                  </p>
                </div>
              </div>
              </>}
              {order.payment?.error ? (
                <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-xs text-destructive">
                  {order.payment.error}
                </p>
              ) : null}
            </section>
          ) : null}

          {order.status === "shipped" || order.status === "delivered" ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="flex items-center gap-2 font-serif text-xl"><Truck className="size-5" /> Envio</h2>
              {order.tracking_code ? (
                <p className="mt-3 text-sm">Rastreio: <strong>{order.tracking_code}</strong></p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">O código de rastreio aparece aqui quando postarmos.</p>
              )}
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 font-serif text-xl"><Package className="size-5" /> Itens</h2>
            <ul className="mt-4 divide-y">
              {order.items.map((item) => (
                <li key={`${item.product_id}:${item.variant_id}`} className="flex gap-3 py-3">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <a href={`/produto/${item.slug}`} className="text-sm font-medium hover:underline">{item.name}</a>
                    <p className="text-xs text-muted-foreground">{item.variant_name} · {item.qty}x</p>
                  </div>
                  <p className="text-sm">{brl(item.line_total_minor)}</p>
                </li>
              ))}
            </ul>
            <Separator className="my-3" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(order.subtotal_minor)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{order.shipping_method === "pickup" ? "Retirada" : brl(order.shipping_minor)}</span></div>
              {order.discount_minor ? <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Cupom</span><span>− {brl(order.discount_minor)}</span></div> : null}
              <div className="flex justify-between pt-2 text-base font-medium"><span>Total</span><span>{order.total}</span></div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-5 text-sm">
            <h2 className="font-serif text-lg">Entrega</h2>
            {order.shipping_method === "pickup" ? (
              <p className="mt-2 text-muted-foreground">{order.shipping.pickup_address || config.shipping.pickup_address}</p>
            ) : (
              <address className="mt-2 not-italic leading-relaxed text-muted-foreground">
                {order.shipping.street}, {order.shipping.number}
                {order.shipping.complement ? ` · ${order.shipping.complement}` : ""}<br />
                {order.shipping.district} · {order.shipping.city}/{order.shipping.state}<br />
                CEP {order.shipping.cep}
              </address>
            )}
            <Separator className="my-3" />
            <p className="text-muted-foreground">Contato</p>
            <p className="mt-1">{order.name}</p>
            <p className="text-muted-foreground">{order.email}</p>
          </div>

          <div className="rounded-xl border bg-card p-5 text-sm">
            <h2 className="font-serif text-lg">Precisa de ajuda?</h2>
            <p className="mt-2 text-muted-foreground">
              Escreva para {config.store.email} com o número {order.number}.
            </p>
            {order.can_cancel ? (
              <Button variant="outline" className="mt-3 w-full" onClick={cancel} disabled={busy}>
                Cancelar pedido
              </Button>
            ) : null}
          </div>

          <Button asChild variant="ghost" className="w-full">
            <a href="/loja">Continuar comprando</a>
          </Button>
        </aside>
      </div>
    </div>
  )
}

export default function OrderPage() {
  return (
    <React.Suspense fallback={<div className="container-page py-20"><Skeleton className="h-8 w-40" /></div>}>
      <OrderView />
    </React.Suspense>
  )
}
