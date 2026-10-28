"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Check, CreditCard, Loader2, MapPin, ShieldCheck, Store, Truck } from "lucide-react"
import { toast } from "sonner"

import { api, cepLookup, ApiFailure } from "@/lib/api"
import type { Order, Quote } from "@/lib/types"
import { useAuth, useCart, useConfig } from "@/components/providers"
import { Turnstile } from "@/components/turnstile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { brl, digits, formatCep, formatCpf, formatPhone } from "@/lib/utils"

const UF = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]

function Checkout() {

  const params = useSearchParams()
  const { items, hydrated, clear } = useCart()
  const { customer } = useAuth()
  const config = useConfig()
  const [method, setMethod] = React.useState<"delivery" | "pickup">("delivery")
  const [coupon, setCoupon] = React.useState(params.get("cupom") || "")
  const [applied, setApplied] = React.useState(params.get("cupom") || "")
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [loadingQuote, setLoadingQuote] = React.useState(true)
  const [quoteAttempt, setQuoteAttempt] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [cepLoading, setCepLoading] = React.useState(false)
  const [captcha, setCaptcha] = React.useState("")
  const [captchaVersion, setCaptchaVersion] = React.useState(0)
  const [accepted, setAccepted] = React.useState(false)
  const [error, setError] = React.useState("")
  const idempotency = React.useRef<string>("")
  const [form, setForm] = React.useState({
    name: "", email: "", phone: "", cpf: "",
    cep: "", street: "", number: "", complement: "", district: "", city: "", state: "", notes: "",
  })

  React.useEffect(() => {
    if (!idempotency.current) idempotency.current = crypto.randomUUID()
  }, [])

  React.useEffect(() => {
    if (!customer) return
    setForm((current) => ({
      ...current,
      name: current.name || customer.name,
      email: current.email || customer.email,
      phone: current.phone || customer.phone,
      cpf: current.cpf || customer.cpf,
    }))
  }, [customer])

  React.useEffect(() => {
    if (!hydrated || items.length === 0) {
      setLoadingQuote(false)
      return
    }
    let active = true
    setLoadingQuote(true)
    setQuote(null)
    setError("")
    api<Quote>("/api/cart/quote", {
      body: {
        items: items.map((item) => ({ product_id: item.productId, variant_id: item.variantId, qty: item.qty })),
        shipping_method: method,
        coupon: applied,
      },
    })
      .then((answer) => { if (active) setQuote(answer) })
      .catch((failure: Error) => { if (active) setError(failure.message) })
      .finally(() => { if (active) setLoadingQuote(false) })
    return () => { active = false }
  }, [items, method, applied, hydrated, quoteAttempt])

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let value = event.target.value
    if (key === "cep") value = formatCep(value)
    if (key === "cpf") value = formatCpf(value)
    if (key === "phone") value = formatPhone(value)
    if (key === "state") value = value.toUpperCase().slice(0, 2)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const lookupCep = async () => {
    const raw = digits(form.cep)
    if (raw.length !== 8) return
    setCepLoading(true)
    try {
      const answer = await cepLookup(raw)
      setForm((current) => ({
        ...current,
        street: answer.street || current.street,
        district: answer.district || current.district,
        city: answer.city || current.city,
        state: answer.state || current.state,
      }))
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "CEP não encontrado")
    } finally {
      setCepLoading(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    if (!accepted) {
      setError("Confirme que leu as políticas para continuar.")
      return
    }
    if (config.turnstile.enabled && !captcha) {
      setError("Aguarde a verificação de segurança e tente novamente.")
      return
    }
    setSubmitting(true)
    try {
      const order = await api<Order>("/api/orders", {
        body: {
          items: items.map((item) => ({ product_id: item.productId, variant_id: item.variantId, qty: item.qty })),
          shipping_method: method,
          coupon: applied,
          name: form.name,
          email: form.email,
          phone: form.phone,
          cpf: form.cpf,
          address: method === "delivery" ? {
            cep: digits(form.cep), street: form.street, number: form.number,
            complement: form.complement, district: form.district, city: form.city,
            state: form.state, notes: form.notes,
          } : { notes: form.notes },
          turnstile_token: captcha,
          idempotency_key: idempotency.current,
        },
      })
      clear()
      window.sessionStorage.setItem(`mamyat.order.${order.number}`, form.email)
      window.location.assign(order.payment.checkout_url || `/pedido/${order.number}?email=${encodeURIComponent(form.email)}`)
    } catch (failure) {
      const message = failure instanceof ApiFailure ? failure.message : "Não foi possível fechar o pedido"
      setError(message)
      setCaptcha("")
      setCaptchaVersion((value) => value + 1)
      toast.error(message)
      setSubmitting(false)
    }
  }

  if (!hydrated) {
    return <div className="container-page py-20"><Skeleton className="h-8 w-40" /></div>
  }

  if (items.length === 0 && !submitting) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-serif text-3xl">Sua sacola está vazia</h1>
        <p className="mt-2 text-sm text-muted-foreground">Escolha uma peça antes de fechar o pedido.</p>
        <Button asChild className="mt-6"><Link href="/loja">Ver a loja</Link></Button>
      </div>
    )
  }

  return (
    <div className="container-page checkout-page py-10 md:py-14">
      <Link href="/carrinho" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" /> Voltar para a sacola
      </Link>
      <div className="mt-4">
        <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Checkout</p>
        <h1 className="mt-2 font-serif text-4xl">Fechar o pedido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {customer ? `Você está conectada como ${customer.name.split(" ")[0]}.` : (
            <>Já tem conta? <Link href="/entrar" className="underline">Entre</Link> para preencher mais rápido.</>
          )}
        </p>
      </div>

      <form onSubmit={submit} aria-busy={submitting} className="mt-8 grid min-w-0 grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 font-serif text-xl">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
              Seus dados
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={form.name} onChange={set("name")} required autoComplete="name" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
              </div>
              <div>
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input id="phone" value={form.phone} onChange={set("phone")} required autoComplete="tel" inputMode="tel" />
              </div>
              <div>
                <Label htmlFor="cpf">CPF do titular</Label>
                <Input id="cpf" value={form.cpf} onChange={set("cpf")} required inputMode="numeric" placeholder="000.000.000-00" />
                <p className="mt-1 text-xs text-muted-foreground">{config.payment.mode === "demo" ? "Use dados de teste neste ambiente de demonstração." : "Necessário para o pagamento."}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 font-serif text-xl">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>
              Entrega
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMethod("delivery")}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left ${method === "delivery" ? "border-primary bg-secondary/30" : ""}`}
              >
                <Truck className="mt-0.5 size-4" />
                <span>
                  <span className="block text-sm font-medium">Receber em casa</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{config.shipping.delivery_days}</span>
                </span>
                {method === "delivery" ? <Check className="ml-auto size-4" /> : null}
              </button>
              <button
                type="button"
                disabled={!config.shipping.pickup_enabled}
                onClick={() => setMethod("pickup")}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left disabled:opacity-50 ${method === "pickup" ? "border-primary bg-secondary/30" : ""}`}
              >
                <Store className="mt-0.5 size-4" />
                <span>
                  <span className="block text-sm font-medium">Retirar no ateliê</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">Sem frete, horário combinado</span>
                </span>
                {method === "pickup" ? <Check className="ml-auto size-4" /> : null}
              </button>
            </div>

            {method === "delivery" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={form.cep}
                    onChange={set("cep")}
                    onBlur={lookupCep}
                    required
                    inputMode="numeric"
                    placeholder="00000-000"
                    autoComplete="postal-code"
                  />
                  {cepLoading ? <p className="mt-1 text-xs text-muted-foreground">Buscando endereço...</p> : null}
                </div>
                <div className="sm:col-span-4">
                  <Label htmlFor="street">Rua / avenida</Label>
                  <Input id="street" value={form.street} onChange={set("street")} required autoComplete="address-line1" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="number">Número</Label>
                  <Input id="number" value={form.number} onChange={set("number")} required />
                </div>
                <div className="sm:col-span-4">
                  <Label htmlFor="complement">Complemento</Label>
                  <Input id="complement" value={form.complement} onChange={set("complement")} placeholder="apartamento, bloco, referência" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="district">Bairro</Label>
                  <Input id="district" value={form.district} onChange={set("district")} required />
                </div>
                <div className="sm:col-span-3">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" value={form.city} onChange={set("city")} required autoComplete="address-level2" />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="state">UF</Label>
                  <Input id="state" value={form.state} onChange={set("state")} required list="uf-list" />
                  <datalist id="uf-list">
                    {UF.map((uf) => <option key={uf} value={uf} />)}
                  </datalist>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
                <MapPin className="mr-1 inline size-4" />
                {config.shipping.pickup_address}. Depois do pagamento, combinamos o dia por email ou WhatsApp.
              </p>
            )}

            <div className="mt-4">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={set("notes")}
                placeholder="Embalagem de presente, prazo especial, detalhes da peça..."
                maxLength={300}
              />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 font-serif text-xl">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>
              Pagamento
            </h2>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary bg-secondary/30 p-4">
              <CreditCard className="mt-0.5 size-4" />
              <div>
                <p className="text-sm font-medium">{config.payment.mode === "demo" ? "Pedido de demonstração" : config.payment.mode === "mercadopago" ? "Mercado Pago" : "Pix à vista"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {config.payment.mode === "demo" ? "Nenhuma cobrança será emitida. Para uma compra real, fale com o ateliê pelo WhatsApp." : config.payment.mode === "mercadopago" ? "Escolha Pix ou cartão no checkout seguro do Mercado Pago." : "O QR Code aparece na próxima tela. O pedido é confirmado automaticamente."}
                </p>
                {config.payment.mode === "mercadopago" ? <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">Pix</Badge><Badge variant="outline">Cartão de crédito</Badge></div> : null}
              </div>
              <Check className="ml-auto size-4" />
            </div>
            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {config.payment.mode === "demo" ? "Ambiente de demonstração. Nenhum pagamento será cobrado." : "Pagamento protegido. Não guardamos dados do seu cartão."}
            </div>
          </section>
        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-28">
          <div className="rounded-xl border bg-card p-5" aria-busy={loadingQuote}>
            <h2 className="font-serif text-xl">Seu pedido</h2>
            <p role="status" className="sr-only">{loadingQuote ? "Atualizando os valores do pedido." : quote ? "Valores do pedido atualizados." : "Não foi possível calcular o pedido."}</p>
            <ul className="mt-4 space-y-3">
              {items.map((item) => {
                const line = quote?.items.find((row) => row.product_id === item.productId && row.variant_id === item.variantId)
                return (
                <li key={`${item.productId}:${item.variantId}`} className="flex gap-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{line?.name || item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.variantName} · {item.qty}x</p>
                  </div>
                  <div className="text-sm">{loadingQuote ? <Skeleton className="h-4 w-16" /> : line ? brl(line.line_total_minor) : "—"}</div>
                </li>
                )
              })}
            </ul>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span>{loadingQuote ? <Skeleton className="h-4 w-16" /> : <span>{quote ? brl(quote.subtotal_minor) : "—"}</span>}</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frete</span>
                {loadingQuote ? <Skeleton className="h-4 w-16" /> : <span>{!quote ? "—" : method === "pickup" ? "Retirada" : quote.shipping_minor === 0 ? "Grátis" : brl(quote.shipping_minor)}</span>}
              </div>
              {quote?.discount_minor ? (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Cupom</span><span>− {brl(quote.discount_minor)}</span></div>
              ) : null}
              <Separator className="my-3" />
              <div className="flex items-baseline justify-between">
                <span className="font-medium">Total</span>
                {loadingQuote ? <Skeleton className="h-7 w-24" /> : <span className="text-xl font-medium">{quote ? brl(quote.total_minor) : "—"}</span>}
              </div>
            </div>

            {config.features.coupons ? (
              <>
              <div className="mt-4 flex gap-2">
                <Input
                  value={coupon}
                  onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                  placeholder="Cupom"
                  aria-label="Cupom"
                  className="uppercase"
                />
                <Button type="button" variant="outline" onClick={() => setApplied(coupon.trim())} disabled={!coupon.trim()}>
                  Ok
                </Button>
              </div>
              {applied ? <button type="button" className="mt-2 text-xs text-muted-foreground underline hover:text-foreground" onClick={() => { setApplied(""); setCoupon("") }}>Remover cupom {applied}</button> : null}
              </>
            ) : null}

            {quote?.problems?.length ? (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {quote.problems.map((problem) => <p key={problem}>{problem}</p>)}
              </div>
            ) : null}
            {!loadingQuote && !quote ? <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => setQuoteAttempt((value) => value + 1)}>Recalcular valores</Button> : null}
          </div>

          <div className="rounded-xl border bg-card p-5">
            {config.turnstile.enabled ? (
              <Turnstile resetKey={captchaVersion}
                siteKey={config.turnstile.site_key}
                action="checkout"
                onToken={setCaptcha}
                className="mb-4"
              />
            ) : null}
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                Li e aceito as <Link href="/politicas" className="underline">políticas de compra, troca e privacidade</Link>.
              </span>
            </label>
            {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="mt-4 h-auto min-h-12 w-full whitespace-normal px-3 py-3 text-center leading-snug" disabled={submitting || loadingQuote || !quote?.ok}>
              {submitting ? <><Loader2 className="size-4 animate-spin" /> {config.payment.mode === "mercadopago" ? "Preparando pagamento..." : "Criando pedido..."}</> : config.payment.mode === "demo" ? "Criar pedido de demonstração" : config.payment.mode === "mercadopago" ? "Continuar para o Mercado Pago" : "Fechar pedido e gerar Pix"}
            </Button>
            {config.payment.mode === "demo" ? (
              <Badge variant="outline" className="mt-3 w-full justify-center py-1">Modo demonstração</Badge>
            ) : null}
            <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
              {config.payment.mode === "demo" ? "A reserva de demonstração expira em 30 minutos." : "Ao fechar, reservamos as peças por 30 minutos enquanto o pagamento é concluído."}
            </p>
          </div>
        </aside>
      </form>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <React.Suspense fallback={<div className="container-page py-20"><Skeleton className="h-8 w-40" /></div>}>
      <Checkout />
    </React.Suspense>
  )
}
