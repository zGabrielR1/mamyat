"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react"

import { api } from "@/lib/api"
import type { Quote } from "@/lib/types"
import { useCart, useConfig } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { brl } from "@/lib/utils"

export default function CartPage() {
  const { items, setQty, remove, hydrated, clear } = useCart()
  const config = useConfig()
  const [method, setMethod] = React.useState<"delivery" | "pickup">("delivery")
  const [coupon, setCoupon] = React.useState("")
  const [applied, setApplied] = React.useState("")
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!hydrated) return
    if (items.length === 0) {
      setQuote(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    api<Quote>("/api/cart/quote", {
      body: {
        items: items.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId,
          qty: item.qty,
        })),
        shipping_method: method,
        coupon: applied,
      },
    })
      .then(setQuote)
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setLoading(false))
  }, [items, method, applied, hydrated])

  if (!hydrated) {
    return <div className="container-page py-20 text-sm text-muted-foreground">Abrindo a sacola...</div>
  }

  if (items.length === 0) {
    return (
      <div className="container-page flex flex-col items-center py-24 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-secondary">
          <ShoppingBag className="size-8 text-muted-foreground" />
        </span>
        <h1 className="mt-6 font-serif text-3xl">Sua sacola está vazia</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Comece pelas peças em destaque ou conte para o ateliê o que você procura.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link href="/loja">Ver a loja</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/encomendas">Encomendar</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container-page py-10 md:py-14">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Sacola</p>
          <h1 className="mt-2 font-serif text-4xl">Quase lá</h1>
        </div>
        <button type="button" onClick={clear} className="text-xs text-muted-foreground hover:underline">
          Esvaziar sacola
        </button>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <ul className="divide-y border-y">
            {items.map((item) => (
              <li key={`${item.productId}:${item.variantId}`} className="flex gap-4 py-5">
                <Link
                  href={`/produto/${item.slug}`}
                  className="size-24 shrink-0 overflow-hidden rounded-lg bg-secondary sm:size-28"
                >
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt={item.name} className="size-full object-cover" />
                  ) : null}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/produto/${item.slug}`} className="font-medium hover:underline">
                        {item.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.variantName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.productId, item.variantId)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remover ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                    <div className="flex items-center rounded-full border">
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
                        onClick={() => setQty(item.productId, item.variantId, item.qty - 1)}
                        aria-label="Diminuir"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm">{item.qty}</span>
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
                        onClick={() => setQty(item.productId, item.variantId, item.qty + 1)}
                        aria-label="Aumentar"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <p className="text-sm font-medium">{brl(item.priceMinor * item.qty)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border bg-card p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Truck className="size-4" /> Como quer receber?
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMethod("delivery")}
                className={`rounded-lg border p-4 text-left text-sm ${
                  method === "delivery" ? "border-primary bg-secondary/40" : "border-border"
                }`}
              >
                <span className="font-medium">Entrega</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {quote?.shipping_minor === 0 && quote?.ok
                    ? "Frete grátis"
                    : `a partir de ${brl(config.shipping.flat_minor)}`} · {config.shipping.delivery_days}
                </span>
              </button>
              <button
                type="button"
                disabled={!config.shipping.pickup_enabled}
                onClick={() => setMethod("pickup")}
                className={`rounded-lg border p-4 text-left text-sm disabled:opacity-50 ${
                  method === "pickup" ? "border-primary bg-secondary/40" : "border-border"
                }`}
              >
                <span className="font-medium">Retirada</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Combinada com o ateliê · sem frete
                </span>
              </button>
            </div>
          </div>

          {quote?.problems?.length ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {quote.problems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </div>
          ) : null}
          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        </div>

        <aside className="h-fit rounded-xl border bg-card p-5 lg:sticky lg:top-28">
          <h2 className="font-serif text-xl">Resumo</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{brl(quote?.subtotal_minor ?? items.reduce((sum, item) => sum + item.priceMinor * item.qty, 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frete</span>
              <span>{method === "pickup" ? "Retirada" : quote?.shipping_minor === 0 ? "Grátis" : brl(quote?.shipping_minor ?? config.shipping.flat_minor)}</span>
            </div>
            {quote?.discount_minor ? (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Cupom {quote.coupon}</span>
                <span>− {brl(quote.discount_minor)}</span>
              </div>
            ) : null}
            <Separator className="my-3" />
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Total</span>
              <span className="text-xl font-medium">
                {brl(quote?.total_minor ?? items.reduce((sum, item) => sum + item.priceMinor * item.qty, 0))}
              </span>
            </div>
          </div>

          {config.features.coupons ? (
            <div className="mt-5">
              <div className="flex gap-2">
                <Input
                  value={coupon}
                  onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                  placeholder="Cupom"
                  className="uppercase"
                  aria-label="Cupom de desconto"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApplied(coupon.trim())}
                  disabled={!coupon.trim()}
                >
                  Aplicar
                </Button>
              </div>
              {applied ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-muted-foreground hover:underline"
                  onClick={() => {
                    setApplied("")
                    setCoupon("")
                  }}
                >
                  Remover cupom {applied}
                </button>
              ) : null}
            </div>
          ) : null}

          <Button asChild size="lg" className="mt-6 w-full" disabled={loading || !quote?.ok}>
            <Link href={`/checkout${applied ? `?cupom=${encodeURIComponent(applied)}` : ""}`}>
              Ir para o checkout <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Pagamento por Pix · ambiente {config.payment.environment}
          </p>
          {config.payment.mode === "demo" ? (
            <Badge variant="outline" className="mt-3 w-full justify-center py-1">
              Modo demonstração
            </Badge>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
