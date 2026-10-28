"use client"

import * as React from "react"
import { api } from "@/lib/api"
import type { Review } from "@/lib/types"
import { useAdmin } from "@/components/admin/admin-context"
import { Button } from "@/components/ui/button"

export default function ReviewsPage() {
  const { ready, admin, canWrite } = useAdmin()
  const [reviews, setReviews] = React.useState<Review[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState("")
  const [error, setError] = React.useState("")
  const [retry, setRetry] = React.useState(0)

  React.useEffect(() => {
    if (!ready || !admin) return
    const controller = new AbortController()
    setLoading(true)
    setError("")
    api<{ reviews: Review[] }>("/api/admin/reviews", { signal: controller.signal })
      .then(answer => { if (!controller.signal.aborted) setReviews(answer.reviews) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível carregar as avaliações.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [ready, admin, retry])

  const moderate = async (review: Review, action: "approve" | "reject" | "delete") => {
    if (action === "delete" && !window.confirm("Excluir esta avaliação definitivamente?")) return
    setBusy(review.id)
    setError("")
    try {
      const answer = await api<{ review: Review }>(`/api/admin/reviews/${encodeURIComponent(review.id)}${action === "delete" ? "" : `/${action}`}`, { method: action === "delete" ? "DELETE" : "POST" })
      setReviews(rows => action === "delete" ? rows.filter(row => row.id !== review.id) : rows.map(row => row.id === review.id ? { ...row, ...answer.review } : row))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível atualizar a avaliação.")
    } finally { setBusy("") }
  }

  return <div className="space-y-6">
    <div><h1 className="font-serif text-3xl">Avaliações</h1><p className="mt-2 text-sm text-muted-foreground">Confira os comentários antes de publicar na loja.</p></div>
    {error ? <p role="alert" className="text-sm text-destructive">{error} <button className="underline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p> : null}
    {loading ? <p role="status">Carregando avaliações...</p> : !error && !reviews.length ? <p className="text-muted-foreground">Nenhuma avaliação recebida.</p> : null}
    {reviews.map(review => <article key={review.id} className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3"><h2 className="font-medium">{review.name}</h2><span className="text-sm">{review.rating}/5 estrelas</span><span className="text-sm text-muted-foreground">{review.status === "approved" ? "Aprovada" : review.status === "rejected" ? "Rejeitada" : "Pendente"}</span></div>
      <p className="break-words text-sm">{review.comment || "Sem comentário."}</p>
      <p className="text-sm text-muted-foreground">{review.product_name || "Produto indisponível"}</p>
      {canWrite ? <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!!busy || review.status === "approved"} onClick={() => moderate(review, "approve")}>Aprovar</Button>
        <Button size="sm" variant="outline" disabled={!!busy || review.status === "rejected"} onClick={() => moderate(review, "reject")}>Rejeitar</Button>
        <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => moderate(review, "delete")}>Excluir</Button>
      </div> : null}
    </article>)}
  </div>
}
