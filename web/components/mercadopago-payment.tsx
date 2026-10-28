"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, Clock3, CreditCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react"

import { api, ApiFailure } from "@/lib/api"
import type { Order } from "@/lib/types"
import { whatsappHref } from "@/lib/utils"
import { useConfig } from "@/components/providers"
import { Button } from "@/components/ui/button"

export function MercadoPagoPayment({ order, email, returnedPaymentId, onUpdate, onRetry, retrying }: {
  order: Order
  email: string
  returnedPaymentId: string
  onUpdate: (order: Order) => void
  onRetry: () => void
  retrying: boolean
}) {
  const config = useConfig()
  const payment = order.payment
  const validReturn = /^[0-9]{1,30}$/.test(returnedPaymentId) ? returnedPaymentId : ""
  const paymentId = validReturn || payment.payment_id || ""
  const canCheck = /^[0-9]{1,30}$/.test(paymentId)
  const [checking, setChecking] = React.useState(!!validReturn)
  const [error, setError] = React.useState("")
  const checkedReturn = React.useRef("")
  const processing = ["pending", "in_process", "authorized", "in_mediation"].includes(payment.provider_status || "")
  const rejected = ["rejected", "cancelled"].includes(payment.provider_status || "")

  const check = React.useCallback(async () => {
    if (!canCheck) return
    setChecking(true)
    setError("")
    try {
      onUpdate(await api<Order>(`/api/orders/${encodeURIComponent(order.number)}/payment-status`, {
        body: { email, payment_id: paymentId },
      }))
    } catch (failure) {
      setError(failure instanceof ApiFailure && failure.code === "payment_mismatch"
        ? "Este pagamento não corresponde ao pedido. Confira os dados ou fale com o ateliê."
        : "Não foi possível consultar agora. Seu pedido está salvo; tente novamente em instantes.")
    } finally {
      setChecking(false)
    }
  }, [canCheck, email, onUpdate, order.number, paymentId])

  React.useEffect(() => {
    if (!/^[0-9]{1,30}$/.test(returnedPaymentId) || checkedReturn.current === returnedPaymentId) return
    checkedReturn.current = returnedPaymentId
    void check()
  }, [returnedPaymentId, check])

  return (
    <div className="space-y-5" aria-busy={checking}>
      <div className="flex items-start gap-3" aria-live="polite">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary"><CreditCard className="size-5" /></span>
        <div>
          <h2 className="font-serif text-xl">{payment.review_required || error ? "Vamos conferir seu pagamento" : checking ? "Conferindo seu pagamento" : processing ? "Aguardando a confirmação" : payment.expired ? "Sua reserva expirou" : "Pague no Mercado Pago"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {payment.review_required
              ? "Recebemos um pagamento que precisa de conferência pelo ateliê. Não pague novamente."
              : checking
                ? "Estamos consultando o Mercado Pago. Você não precisa refazer o pagamento."
                : error
                  ? "Seu pedido continua salvo. Confira o pagamento antes de tentar pagar novamente."
                : processing
                  ? "O Mercado Pago está processando seu pagamento. Aguarde a confirmação antes de tentar novamente."
                  : payment.expired
                    ? "As peças deixaram de ficar reservadas. Se você já pagou, confira o status ou fale com o ateliê antes de fazer outro pedido."
                    : rejected
                      ? "O pagamento não foi aprovado. Você pode escolher outra forma de pagar no Mercado Pago enquanto a reserva estiver ativa."
                      : "Escolha Pix ou cartão no checkout seguro. Depois, volte aqui para acompanhar a confirmação."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {payment.review_required || error ? (
          <Button asChild variant="outline"><a href={whatsappHref(config.store.whatsapp, `Olá! Preciso conferir o pagamento do pedido ${order.number}.`)} target="_blank" rel="noreferrer">Falar com o ateliê <ArrowUpRight className="size-4" /></a></Button>
        ) : !checking && !processing && !payment.expired ? (
          payment.checkout_url ? <Button asChild><a href={payment.checkout_url}>Continuar para o Mercado Pago <ArrowUpRight className="size-4" /></a></Button>
            : <Button onClick={onRetry} disabled={retrying}>{retrying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Tentar novamente</Button>
        ) : null}
        {canCheck ? (
          <Button type="button" variant="outline" onClick={() => void check()} disabled={checking || retrying}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {checking ? "Consultando..." : "Verificar pagamento"}
          </Button>
        ) : null}
        {payment.expired && !processing && !payment.review_required ? <Button asChild variant="outline"><Link href="/loja">Voltar à loja</Link></Button> : null}
      </div>

      <div className="text-xs text-muted-foreground">
        {error ? <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive">{error}</p> : null}
        {!payment.expired && !payment.review_required && payment.expires_at ? <p className="flex items-center gap-2"><Clock3 className="size-3.5" /> Reserva até {new Date(payment.expires_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p> : null}
        <p className="mt-2 flex items-center gap-2"><ShieldCheck className="size-3.5" /> Seus dados de cartão ficam no Mercado Pago.</p>
      </div>
    </div>
  )
}
