"use client"

import * as React from "react"
import { Check, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function CategoryManager({
  categories,
  onChanged,
}: {
  categories: Category[]
  onChanged: () => void | Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState("")
  const [editing, setEditing] = React.useState("")
  const [draft, setDraft] = React.useState("")

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    setBusy("new")
    try {
      await api("/api/admin/categories", { body: { name: value } })
      toast.success(`Categoria “${value}” criada`)
      setName("")
      await onChanged()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível criar")
    } finally {
      setBusy("")
    }
  }

  const rename = async (current: string) => {
    const value = draft.trim()
    if (!value || value === current) {
      setEditing("")
      return
    }
    setBusy(current)
    try {
      const answer = await api<{ renamed: number }>(
        `/api/admin/categories/${encodeURIComponent(current)}`,
        { method: "PATCH", body: { name: value } },
      )
      toast.success(
        answer.renamed
          ? `Categoria renomeada · ${answer.renamed} produto(s) movido(s)`
          : "Categoria renomeada",
      )
      setEditing("")
      await onChanged()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível renomear")
    } finally {
      setBusy("")
    }
  }

  const remove = async (current: string) => {
    if (!window.confirm(`Excluir a categoria “${current}”?`)) return
    setBusy(current)
    try {
      await api(`/api/admin/categories/${encodeURIComponent(current)}`, { method: "DELETE" })
      toast.success("Categoria excluída")
      await onChanged()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível excluir")
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nova categoria (ex.: Crochê)"
          maxLength={40}
          className="max-w-xs"
          aria-label="Nova categoria"
        />
        <Button type="submit" disabled={busy === "new" || !name.trim()}>
          {busy === "new" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Criar
        </Button>
      </form>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed px-5 py-10 text-center">
          <Tags className="size-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma categoria ainda.</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {categories.map((category) => {
            const isEditing = editing === category.name
            const isBusy = busy === category.name
            return (
              <div key={category.name} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                {isEditing ? (
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={40}
                    autoFocus
                    className="h-9 max-w-xs"
                    aria-label={`Novo nome para ${category.name}`}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {category.name}
                  </span>
                )}
                <Badge variant="outline">
                  {category.count} produto{category.count === 1 ? "" : "s"}
                </Badge>
                {isEditing ? (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => rename(category.name)}
                      aria-label="Salvar nome"
                    >
                      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditing("")}
                      aria-label="Cancelar"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(category.name)
                        setDraft(category.name)
                      }}
                      aria-label="Renomear"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => remove(category.name)}
                      aria-label="Excluir"
                    >
                      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Renomear move os produtos junto. Uma categoria com produtos não pode ser
        excluída — mova as peças antes.
      </p>
    </div>
  )
}
