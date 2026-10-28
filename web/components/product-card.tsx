"use client"

import { ArrowUpRight, Heart } from "lucide-react"

import { useSaved } from "@/lib/saved"
import { Badge } from "@/components/ui/badge"
import type { Product } from "@/lib/types"
import { brl, cn } from "@/lib/utils"

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const soldOut = product.available <= 0
  const { saved, toggle } = useSaved()
  return (
    <article
      data-product-id={product.id}
      className={cn("piece-card group flex flex-col", className)}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-secondary">
        <a href={`/produto/${product.slug}`} aria-label={`Ver ${product.name}`} className="piece-image block size-full">
        {product.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            sem foto
          </div>
        )}
        </a>
        <button className="save-piece" onClick={() => toggle(product.id)} aria-label={`${saved.includes(product.id) ? "Remover" : "Salvar"} ${product.name}`} aria-pressed={saved.includes(product.id)}><Heart size={17} fill={saved.includes(product.id) ? "currentColor" : "none"} /></button>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
          {product.made_to_order ? (
            <Badge variant="secondary">Sob encomenda</Badge>
          ) : soldOut ? (
            <Badge variant="outline" className="bg-background/90">Esgotado</Badge>
          ) : product.compare_at_minor ? (
            <Badge className="bg-primary">Presente</Badge>
          ) : null}
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 flex size-9 translate-y-1 items-center justify-center rounded-full bg-background/95 opacity-0 shadow-sm transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
      <div className="pt-3">
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
          {product.category}
        </p>
        <a href={`/produto/${product.slug}`}><h3 className="mt-1 font-serif text-lg leading-snug">{product.name}</h3></a>
        <div className="mt-1 flex items-baseline gap-2 text-sm">
          <span className="font-medium">{brl(product.price_minor)}</span>
          {product.compare_at_minor ? (
            <span className="text-xs text-muted-foreground line-through">
              {brl(product.compare_at_minor)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
