"use client"

import * as React from "react"
import { Archive, Loader2, Pencil, Plus, RotateCcw, Search, Tags } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { Category, Product } from "@/lib/types"
import { useAdmin } from "@/components/admin/admin-context"
import { CategoryManager } from "@/components/admin/category-manager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { brl } from "@/lib/utils"

type VariantRow = { id?: string; name: string; sku: string; stock: number }

type FormState = {
  name: string
  slug: string
  description: string
  details: string
  category: string
  price: string
  compare_at: string
  images: string
  featured: boolean
  active: boolean
  made_to_order: boolean
  production_days: number
  variants: VariantRow[]
}

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    description: "",
    details: "",
    category: "Bolsas",
    price: "",
    compare_at: "",
    images: "/produtos/",
    featured: false,
    active: true,
    made_to_order: false,
    production_days: 0,
    variants: [{ name: "Único", sku: "", stock: 0 }],
  }
}

function toForm(product: Product): FormState {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    details: (product.details || []).join("\n"),
    category: product.category,
    price: (product.price_minor / 100).toFixed(2).replace(".", ","),
    compare_at: product.compare_at_minor ? (product.compare_at_minor / 100).toFixed(2).replace(".", ",") : "",
    images: (product.images || []).join("\n"),
    featured: Boolean(product.featured),
    active: Boolean(product.active),
    made_to_order: Boolean(product.made_to_order),
    production_days: product.production_days || 0,
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku || "",
      stock: variant.stock,
    })),
  }
}

function ProductEditor({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  categories: string[]
  onSaved: () => void
}) {
  const [form, setForm] = React.useState<FormState>(emptyForm())
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    const next = product ? toForm(product) : emptyForm()
    if (!categories.includes(next.category) && categories[0]) {
      next.category = categories[0]
    }
    setForm(next)
    setError("")
  }, [open, product, categories])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const setVariant = (index: number, patch: Partial<VariantRow>) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    const payload = {
      name: form.name,
      slug: form.slug || undefined,
      description: form.description,
      details: form.details.split("\n").map((line) => line.trim()).filter(Boolean),
      category: form.category,
      price: form.price,
      compare_at: form.compare_at || "",
      images: form.images.split("\n").map((line) => line.trim()).filter(Boolean),
      featured: form.featured,
      active: form.active,
      made_to_order: form.made_to_order,
      production_days: form.production_days,
      variants: form.variants.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        stock: Number(row.stock) || 0,
      })),
    }
    try {
      if (product) {
        await api(`/api/admin/products/${product.id}`, { method: "PATCH", body: payload })
        toast.success("Produto atualizado")
      } else {
        await api("/api/admin/products", { body: payload })
        toast.success("Produto criado")
      }
      onOpenChange(false)
      onSaved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>
            Tudo que aparece na loja vem daqui. Preço em reais, com vírgula.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="p-name">Nome</Label>
              <Input id="p-name" value={form.name} onChange={(event) => set("name", event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="p-slug">Endereço (slug)</Label>
              <Input id="p-slug" value={form.slug} onChange={(event) => set("slug", event.target.value)} placeholder="gerado pelo nome" />
            </div>
            <div>
              <Label htmlFor="p-category">Categoria</Label>
              <select
                id="p-category"
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {(categories.includes(form.category)
                  ? categories
                  : [...categories, form.category]
                ).map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="p-price">Preço (R$)</Label>
              <Input id="p-price" value={form.price} onChange={(event) => set("price", event.target.value)} placeholder="189,00" required inputMode="decimal" />
            </div>
            <div>
              <Label htmlFor="p-compare">Preço comparativo (opcional)</Label>
              <Input id="p-compare" value={form.compare_at} onChange={(event) => set("compare_at", event.target.value)} placeholder="219,00" inputMode="decimal" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="p-description">Descrição</Label>
              <Textarea id="p-description" value={form.description} onChange={(event) => set("description", event.target.value)} minLength={20} required />
            </div>
            <div>
              <Label htmlFor="p-details">Detalhes (um por linha)</Label>
              <Textarea id="p-details" value={form.details} onChange={(event) => set("details", event.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-images">Imagens (uma por linha)</Label>
              <Textarea id="p-images" value={form.images} onChange={(event) => set("images", event.target.value)} placeholder="/produtos/minha-foto.svg" />
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.featured} onChange={(event) => set("featured", event.target.checked)} className="size-4 accent-[var(--primary)]" />
              Destaque na home
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(event) => set("active", event.target.checked)} className="size-4 accent-[var(--primary)]" />
              Ativo na loja
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.made_to_order} onChange={(event) => set("made_to_order", event.target.checked)} className="size-4 accent-[var(--primary)]" />
              Sob encomenda
            </label>
            {form.made_to_order ? (
              <div className="sm:col-span-3">
                <Label htmlFor="p-days">Prazo de produção (dias)</Label>
                <Input id="p-days" type="number" min={0} max={90} value={form.production_days} onChange={(event) => set("production_days", Number(event.target.value))} />
              </div>
            ) : null}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Variações e estoque</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set("variants", [...form.variants, { name: "", sku: "", stock: 0 }])}
              >
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {form.variants.map((variant, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-2">
                  <Input
                    value={variant.name}
                    onChange={(event) => setVariant(index, { name: event.target.value })}
                    placeholder="Cor / tamanho"
                    required
                  />
                  <Input
                    value={variant.sku}
                    onChange={(event) => setVariant(index, { sku: event.target.value.toUpperCase() })}
                    placeholder="SKU"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={variant.stock}
                    onChange={(event) => setVariant(index, { stock: Number(event.target.value) })}
                    aria-label="Estoque"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={form.variants.length === 1}
                    onClick={() => set("variants", form.variants.filter((_, position) => position !== index))}
                    aria-label="Remover variação"
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : product ? "Salvar alterações" : "Criar produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminProductsPage() {
  const { admin } = useAdmin()
  const [products, setProducts] = React.useState<Product[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState("")
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [categoriesOpen, setCategoriesOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Product | null>(null)
  const [busyId, setBusyId] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [productAnswer, categoryAnswer] = await Promise.all([
        api<{ products: Product[] }>("/api/admin/products"),
        api<{ categories: Category[] }>("/api/admin/categories"),
      ])
      setProducts(productAnswer.products)
      setCategories(categoryAnswer.categories)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  const categoryNames = React.useMemo(
    () => categories.map((category) => category.name),
    [categories],
  )

  React.useEffect(() => {
    if (admin) void load()
  }, [admin, load])

  const filtered = products.filter((product) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${product.name} ${product.slug} ${product.category}`.toLowerCase().includes(needle)
  })

  const toggleActive = async (product: Product) => {
    setBusyId(product.id)
    try {
      await api(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: { active: !product.active },
      })
      toast.success(product.active ? "Produto arquivado" : "Produto reativado")
      void load()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível atualizar")
    } finally {
      setBusyId("")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Catálogo</p>
          <h1 className="mt-1 font-serif text-3xl">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">{products.length} peças no catálogo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto" className="w-56 pl-9" />
          </div>
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <Tags className="size-4" /> Categorias
          </Button>
          <Button onClick={() => { setEditing(null); setEditorOpen(true) }}>
            <Plus className="size-4" /> Novo produto
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => {
                const stock = product.variants.reduce((total, variant) => total + (variant.stock || 0), 0)
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="size-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                          {product.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.images[0]} alt="" className="size-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-56 truncate font-medium">{product.name}</p>
                          <p className="max-w-56 truncate text-xs text-muted-foreground">/{product.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{brl(product.price_minor)}</TableCell>
                    <TableCell>{product.made_to_order ? "sob encomenda" : stock}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={product.active ? "secondary" : "outline"}>
                          {product.active ? "ativo" : "arquivado"}
                        </Badge>
                        {product.featured ? <Badge variant="outline">destaque</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon-sm" variant="ghost" onClick={() => { setEditing(product); setEditorOpen(true) }} aria-label="Editar">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={busyId === product.id}
                          onClick={() => toggleActive(product)}
                          aria-label={product.active ? "Arquivar" : "Reativar"}
                        >
                          {busyId === product.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : product.active ? (
                            <Archive className="size-3.5" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <ProductEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editing}
        categories={categoryNames}
        onSaved={load}
      />

      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Categorias</DialogTitle>
            <DialogDescription>
              A lista que aparece na loja e no seletor de cada produto.
            </DialogDescription>
          </DialogHeader>
          <CategoryManager categories={categories} onChanged={load} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
