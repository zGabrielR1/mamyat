"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

import { api, writeCustomerToken } from "@/lib/api"
import type { Customer } from "@/lib/types"
import { useAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function SocialHandoff() {
  const router = useRouter()
  const params = useSearchParams()
  const { setCustomer } = useAuth()
  const token = params.get("token") || ""
  const returnedError = params.get("error") || ""
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (returnedError) {
      setError(returnedError)
      return
    }
    if (!token) {
      setError("O login social não devolveu um código. Tente novamente.")
      return
    }
    let cancelled = false
    api<{ customer: Customer; token: string }>("/api/auth/social/exchange", {
      body: { token },
    })
      .then((answer) => {
        if (cancelled) return
        writeCustomerToken(answer.token)
        setCustomer(answer.customer)
        router.replace("/conta")
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message)
      })
    return () => {
      cancelled = true
    }
  }, [token, returnedError, router, setCustomer])

  return (
    <div className="container-page flex max-w-md flex-col items-center py-24 text-center">
      {error ? (
        <>
          <h1 className="font-serif text-3xl">Não foi possível entrar</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <div className="mt-6 flex gap-3">
            <Button asChild><Link href="/entrar">Tentar de novo</Link></Button>
            <Button asChild variant="outline"><Link href="/">Ir para a loja</Link></Button>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <h1 className="mt-5 font-serif text-3xl">Entrando...</h1>
          <p className="mt-2 text-sm text-muted-foreground">Só um instante, estamos preparando sua conta.</p>
        </>
      )}
    </div>
  )
}

export default function SocialPage() {
  return (
    <React.Suspense fallback={<div className="container-page py-24"><Skeleton className="mx-auto h-8 w-40" /></div>}>
      <SocialHandoff />
    </React.Suspense>
  )
}
