"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ChevronRight, Minus, Plus, ShieldCheck, Sparkles, Truck } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { Product } from "@/lib/types"
import { useCart, useConfig } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductCard } from "@/components/product-card"
import { WhatsAppIcon } from "@/components/icons"
import { brl, cn, formatWhatsapp, whatsappHref } from "@/lib/utils"

export default function ProductPage() {
  const params = useParams<{ slug: string }>()
  const slug = typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) || "") : params?.slug
  const { add } = useCart()
  const config = useConfig()
  const [product, setProduct] = React.useState<Product | null>(null)
  const [related, setRelated] = React.useState<Product[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [variantId, setVariantId] = React.useState("")
  const [qty, setQty] = React.useState(1)

  React.useEffect(() => {
    if (!slug) return
    setLoading(true)
    setError("")
    api<{ product: Product; related: Product[] }>(`/api/products/${slug}`)
      .then((answer) => {
        setProduct(answer.product)
        setRelated(answer.related)
        const first = answer.product.variants.find((variant) => variant.available > 0) ||
          answer.product.variants[0]
        setVariantId(first?.id || "")
        setQty(1)
      })
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setLoading(false))
  }, [slug])

  const variant = product?.variants.find((row) => row.id === variantId)
  const soldOut = !product || product.available <= 0
  const max = product?.made_to_order ? 99 : Math.max(0, variant?.available || 0)

  if (loading) {
    return (
      <div className="container-page grid gap-10 py-10 md:grid-cols-2">
        <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-serif text-3xl">Peça não encontrada</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          {error || "Essa peça pode ter saído do catálogo."}
        </p>
        <Button asChild className="mt-6">
          <Link href="/loja">Voltar para a loja</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container-page py-8 md:py-12">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Trilha">
        <Link href="/loja" className="hover:underline">Loja</Link>
        <ChevronRight className="size-3" />
        <Link href={`/loja?categoria=${encodeURIComponent(product.category)}`} className="hover:underline">
          {product.category}
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-[1.05fr_1fr] md:gap-14">
        <div>
          <div className="overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[0]}
                alt={product.name}
                className="aspect-[4/5] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted-foreground">
                foto em breve
              </div>
            )}
          </div>
          {product.images.length > 1 ? (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {product.images.slice(1).map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image}
                  src={image}
                  alt=""
                  className="aspect-square w-full rounded-lg bg-secondary object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="md:pt-2">
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
            {product.category}
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{product.name}</h1>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-medium">{brl(product.price_minor)}</span>
            {product.compare_at_minor ? (
              <span className="text-base text-muted-foreground line-through">
                {brl(product.compare_at_minor)}
              </span>
            ) : null}
            {product.made_to_order ? (
              <Badge variant="secondary">Sob encomenda · {product.production_days} dias</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {config.payment.mode === "demo" ? "Loja em demonstração · nenhum pagamento será cobrado" : "Pix à vista"}
          </p>

          <Separator className="my-6" />

          <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>

          {product.variants.length > 1 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Escolha a variação</p>
                {variant ? (
                  <p className="text-xs text-muted-foreground">
                    {product.made_to_order
                      ? "feita sob encomenda"
                      : variant.available > 0
                        ? `${variant.available} em estoque`
                        : "esgotada"}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {product.variants.map((row) => {
                  const disabled = row.available <= 0 && !product.made_to_order
                  return (
                    <button
                      key={row.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setVariantId(row.id)
                        setQty(1)
                      }}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition-colors",
                        variantId === row.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary/40",
                        disabled && "cursor-not-allowed opacity-40 line-through",
                      )}
                    >
                      {row.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex h-11 items-center rounded-full border">
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
                onClick={() => setQty((value) => Math.max(1, value - 1))}
                aria-label="Diminuir"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center text-sm">{qty}</span>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
                onClick={() => setQty((value) => Math.min(max, value + 1))}
                aria-label="Aumentar"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <Button
              size="lg"
              className="flex-1 sm:flex-none sm:min-w-56"
              disabled={soldOut || !variant || max <= 0}
              onClick={() => {
                if (!variant) return
                add(product, variant, qty)
                toast.success(`${product.name} foi para a sacola`)
              }}
            >
              {soldOut ? "Esgotado" : product.made_to_order ? "Encomendar" : "Adicionar à sacola"}
            </Button>
          </div>

          {config.store.whatsapp ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Dúvida sobre esta peça?{" "}
              <a
                href={whatsappHref(
                  config.store.whatsapp,
                  `Olá! Vim pelo site e tenho uma dúvida sobre a peça ${product.name}.`,
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
              >
                <WhatsAppIcon className="size-3.5" />
                fale no WhatsApp {formatWhatsapp(config.store.whatsapp)}
              </a>
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 rounded-xl bg-secondary/50 p-4 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <Truck className="size-4" />
              {config.shipping.flat_minor === 0
                ? "Frete grátis"
                : `Frete fixo de ${brl(config.shipping.flat_minor)} · grátis acima de ${brl(config.shipping.free_minor)}`}
            </p>
            <p className="flex items-center gap-2">
              <Sparkles className="size-4" />
              {product.made_to_order
                ? `Produção artesanal em cerca de ${product.production_days} dias`
                : "Pronta para embalar"}
            </p>
            <p className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              Peça única, feita à mão — pequenas diferenças fazem parte
            </p>
          </div>

          <details className="mt-6 border-t pt-4" open>
            <summary className="cursor-pointer text-sm font-medium">Detalhes da peça</summary>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {product.details.map((detail) => (
                <li key={detail} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {detail}
                </li>
              ))}
            </ul>
          </details>
          <details className="mt-4 border-t pt-4">
            <summary className="cursor-pointer text-sm font-medium">Cuidados e trocas</summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Lavar à mão com sabão neutro e secar na sombra. Peças sob encomenda
              são feitas para você; trocas por defeito são aceitas em até 7 dias
              após o recebimento. Veja as{" "}
              <Link href="/politicas" className="underline">políticas completas</Link>.
            </p>
          </details>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-20">
          <h2 className="font-serif text-2xl">Você também pode gostar</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
            {related.map((row) => (
              <ProductCard key={row.id} product={row} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
