"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Search, SlidersHorizontal } from "lucide-react"

import { api } from "@/lib/api"
import type { Category, Product } from "@/lib/types"
import { ProductCard } from "@/components/product-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Sort = "featured" | "price-asc" | "price-desc" | "name"

function Catalog() {
  const params = useSearchParams()
  const category = params.get("categoria") || ""
  const [query, setQuery] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [sort, setSort] = React.useState<Sort>("featured")
  const [products, setProducts] = React.useState<Product[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  React.useEffect(() => {
    setLoading(true)
    setError("")
    const search = new URLSearchParams()
    if (category) search.set("category", category)
    if (debounced) search.set("q", debounced)
    api<{ products: Product[]; categories: Category[] }>(`/api/products?${search.toString()}`)
      .then((answer) => {
        setProducts(answer.products)
        setCategories(answer.categories)
      })
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setLoading(false))
  }, [category, debounced])

  const sorted = React.useMemo(() => {
    const rows = [...products]
    switch (sort) {
      case "price-asc":
        return rows.sort((a, b) => a.price_minor - b.price_minor)
      case "price-desc":
        return rows.sort((a, b) => b.price_minor - a.price_minor)
      case "name":
        return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      default:
        return rows
    }
  }, [products, sort])

  return (
    <div className="container-page py-10 md:py-14">
      <div className="max-w-2xl">
        <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">A loja</p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl">
          {category || "Todas as peças"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Crochê, bordado e amigurumi feitos no ateliê. Se uma peça estiver esgotada,
          ela pode voltar sob encomenda.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar uma peça..."
              className="pl-9"
              aria-label="Buscar produtos"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Ordenar"
            >
              <option value="featured">Destaques</option>
              <option value="price-asc">Menor preço</option>
              <option value="price-desc">Maior preço</option>
              <option value="name">Nome</option>
            </select>
          </div>
        </div>

        <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
          <Button asChild size="sm" variant={!category ? "default" : "outline"}>
            <Link href="/loja">Tudo</Link>
          </Button>
          {categories.map((item) => (
            <Button
              key={item.name}
              asChild
              size="sm"
              variant={category === item.name ? "default" : "outline"}
              className="shrink-0"
            >
              <Link href={`/loja?categoria=${encodeURIComponent(item.name)}`}>
                {item.name}
                <span className="text-xs opacity-60">{item.count}</span>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mt-10 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className={cn("mt-8 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4")}>
        {loading
          ? Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <Skeleton className="aspect-[4/5] w-full rounded-xl" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))
          : sorted.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>

      {!loading && !error && sorted.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <Badge variant="outline">Nada por aqui</Badge>
          <h2 className="font-serif text-2xl">Não encontramos essa peça</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Tente outra palavra ou veja todas as categorias. Se for uma ideia
            específica, o ateliê pode fazer sob encomenda.
          </p>
          <Button asChild variant="outline">
            <Link href="/loja">Limpar filtros</Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default function CatalogPage() {
  return (
    <React.Suspense fallback={<div className="container-page py-20"><Skeleton className="h-8 w-48" /></div>}>
      <Catalog />
    </React.Suspense>
  )
}
