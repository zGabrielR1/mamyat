"use client"

import * as React from "react"
import { Star } from "lucide-react"
import Link from "next/link"
import { api, readCustomerToken } from "@/lib/api"
import type { Order, Review, ReviewStats } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ProductReviewsProps {
  productId: string
  productName: string
}

export function ProductReviews({ productId, productName }: ProductReviewsProps) {
  const [reviews, setReviews] = React.useState<Review[]>([])
  const [stats, setStats] = React.useState<ReviewStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [rating, setRating] = React.useState(0)
  const [comment, setComment] = React.useState("")
  const [name, setName] = React.useState("")
  const [orders, setOrders] = React.useState<Order[]>([])
  const [orderId, setOrderId] = React.useState("")
  const [checkingOrders, setCheckingOrders] = React.useState(false)
  const [error, setError] = React.useState("")
  const [retry, setRetry] = React.useState(0)
  const [signedIn, setSignedIn] = React.useState(false)

  const openForm = async () => {
    setCheckingOrders(true)
    setError("")
    try {
      const answer = await api<{ orders: Order[] }>("/api/orders")
      const eligible = answer.orders.filter(order =>
        ["paid", "packing", "shipped", "delivered"].includes(order.status) &&
        order.items.some(item => item.product_id === productId))
      setOrders(eligible)
      setOrderId(eligible[0]?.id || "")
      setShowForm(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível consultar seus pedidos.")
    } finally {
      setCheckingOrders(false)
    }
  }

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setSignedIn(Boolean(readCustomerToken()))
    setError("")
    setReviews([])
    setStats(null)
    setShowForm(false)
    api<{ reviews: Review[] }>(`/api/reviews?product_id=${encodeURIComponent(productId)}`, { signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return
        setReviews(answer.reviews)
        // Calculate stats from reviews
        const count = answer.reviews.length
        if (count > 0) {
          const sum = answer.reviews.reduce((acc, r) => acc + r.rating, 0)
          const average = Math.round((sum / count) * 10) / 10
          const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          answer.reviews.forEach((r) => {
            if (r.rating in distribution) {
              distribution[r.rating as keyof typeof distribution]++
            }
          })
          setStats({ count, average, distribution })
        } else {
          setStats({ count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Não foi possível carregar as avaliações.")
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [productId, retry])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0 || !orderId) {
      toast.error("Selecione uma avaliação")
      return
    }
    setSubmitting(true)
    try {
      await api<{ review: Review; message: string }>("/api/reviews", {
        method: "POST",
        body: {
          product_id: productId,
          order_id: orderId,
          rating,
          comment,
          name,
        },
      })
      toast.success("Avaliação enviada! Será publicada após aprovação.")
      setShowForm(false)
      setRating(0)
      setComment("")
      setName("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar avaliação")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="mt-12 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-12">
      <h2 className="font-serif text-2xl">Avaliações</h2>

      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p> : stats && stats.count > 0 ? (
        <div className="mt-6 grid gap-8 md:grid-cols-[200px_1fr]">
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-4xl font-medium">{stats.average}</p>
              <div className="mt-2 flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`size-5 ${
                      star <= Math.round(stats.average)
                        ? "fill-primary text-primary"
                        : "text-muted-foreground"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {stats.count} {stats.count === 1 ? "avaliação" : "avaliações"}
              </p>
            </div>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-8">{star}</span>
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: stats.count > 0
                          ? `${(stats.distribution[star as keyof typeof stats.distribution] / stats.count) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                  <span className="w-8 text-muted-foreground">
                    {stats.distribution[star as keyof typeof stats.distribution]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {reviews.map((review) => (
              <div key={review.id} className="border-b pb-6 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`size-4 ${
                          star <= review.rating
                            ? "fill-primary text-primary"
                            : "text-muted-foreground"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-medium">{review.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Este produto ainda não tem avaliações. Seja o primeiro a avaliar!
        </p>
      )}

      {!showForm ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-muted-foreground">Avaliações de clientes com compra paga, publicadas após aprovação.</p>
          {signedIn ? <Button variant="outline" onClick={openForm} disabled={checkingOrders}>
            {checkingOrders ? "Consultando pedidos..." : "Escrever uma avaliação"}
          </Button> : <Link href="/entrar" className="text-sm underline">Entre na sua conta para avaliar</Link>}
        </div>
      ) : !orders.length ? <p className="mt-6 text-sm text-muted-foreground">Você precisa de uma compra paga deste produto na sua conta para avaliar.</p> : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 border rounded-xl p-6">
          <h3 className="font-medium">Avaliar {productName}</h3>
          <label className="block text-sm font-medium" htmlFor="review-order">Pedido</label>
          <select id="review-order" className="w-full rounded-md border bg-background px-3 py-2" value={orderId} onChange={event => setOrderId(event.target.value)} disabled={submitting}>
            {orders.map(order => <option key={order.id} value={order.id}>{order.number}</option>)}
          </select>
          <div>
            <label className="text-sm font-medium">Sua avaliação</label>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} ${star === 1 ? "estrela" : "estrelas"}`}
                  aria-pressed={rating === star}
                  disabled={submitting}
                  onClick={() => setRating(star)}
                  className="p-1 transition-colors hover:text-primary"
                >
                  <Star
                    className={`size-6 ${
                      star <= rating ? "fill-primary text-primary" : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="name" className="text-sm font-medium">
              Seu nome (opcional)
            </label>
            <input
              id="name"
              type="text"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(
                "mt-1 w-full rounded-md border border-input px-3 py-2 text-sm transition-colors",
                "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              )}
              placeholder="Cliente anônimo"
            />
          </div>
          <div>
            <label htmlFor="comment" className="text-sm font-medium">
              Comentário (opcional)
            </label>
            <Textarea
              id="comment"
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte sua experiência com este produto..."
              className="mt-1 min-h-[100px]"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar avaliação"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
