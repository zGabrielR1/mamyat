"use client"

import * as React from "react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import { useAdmin } from "@/components/admin/admin-context"
import { CategoryManager } from "@/components/admin/category-manager"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminCategoriesPage() {
  const { admin } = useAdmin()
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try {
      const answer = await api<{ categories: Category[] }>("/api/admin/categories")
      setCategories(answer.categories)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (admin) void load()
  }, [admin, load])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Catálogo</p>
        <h1 className="mt-1 font-serif text-3xl">Categorias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {categories.length} categoria(s). Elas aparecem como filtros na loja e nas
          opções de cada produto.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-11 w-72" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : (
          <CategoryManager categories={categories} onChanged={load} />
        )}
      </div>
    </div>
  )
}
