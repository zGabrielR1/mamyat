"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { api, writeCustomerToken } from "@/lib/api"
import { useAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { refresh } = useAuth()
  const token = params.get("token") || ""
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password !== confirm) {
      setError("As duas senhas precisam ser iguais")
      return
    }
    setBusy(true)
    setError("")
    try {
      const answer = await api<{ token: string }>("/api/auth/password/reset", {
        body: { token, password },
      })
      writeCustomerToken(answer.token)
      await refresh()
      toast.success("Senha criada; você já está conectada")
      router.push("/conta")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Link inválido ou expirado")
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="container-page max-w-md py-20">
        <h1 className="font-serif text-3xl">Link incompleto</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este endereço precisa do token enviado por email. Peça um novo link.
        </p>
        <Button asChild className="mt-5"><Link href="/recuperar-senha">Pedir novo link</Link></Button>
      </div>
    )
  }

  return (
    <div className="container-page max-w-md py-14 md:py-20">
      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Acesso</p>
      <h1 className="mt-2 font-serif text-4xl">Criar nova senha</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Escolha uma senha com pelo menos 8 caracteres, letras e números.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div>
          <Label htmlFor="confirm">Repetir a senha</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Salvar e entrar"}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        O link é de uso único e expira em 30 minutos.
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<div className="container-page py-20"><Skeleton className="h-8 w-48" /></div>}>
      <ResetForm />
    </React.Suspense>
  )
}
