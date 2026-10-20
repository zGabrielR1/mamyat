"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Product } from "@/lib/types"
import { brl, cn } from "@/lib/utils"

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const soldOut = product.available <= 0
  return (
    <Link
      href={`/produto/${product.slug}`}
      className={cn("group flex flex-col", className)}
      aria-label={`Ver ${product.name}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-secondary">
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
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {product.made_to_order ? (
            <Badge variant="secondary">Sob encomenda</Badge>
          ) : soldOut ? (
            <Badge variant="outline" className="bg-background/90">Esgotado</Badge>
          ) : product.compare_at_minor ? (
            <Badge className="bg-primary">Presente</Badge>
          ) : null}
        </div>
        <span className="absolute bottom-3 right-3 flex size-9 translate-y-1 items-center justify-center rounded-full bg-background/95 opacity-0 shadow-sm transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
      <div className="pt-3">
        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
          {product.category}
        </p>
        <h3 className="mt-1 font-serif text-lg leading-snug">{product.name}</h3>
        <div className="mt-1 flex items-baseline gap-2 text-sm">
          <span className="font-medium">{brl(product.price_minor)}</span>
          {product.compare_at_minor ? (
            <span className="text-xs text-muted-foreground line-through">
              {brl(product.compare_at_minor)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
