"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { api } from "@/lib/api"
import { useConfig } from "@/components/providers"
import { Turnstile } from "@/components/turnstile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const config = useConfig()
  const [email, setEmail] = React.useState("")
  const [captcha, setCaptcha] = React.useState("")
  const [captchaVersion, setCaptchaVersion] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await api("/api/auth/password/request", { body: { email, turnstile_token: captcha } })
      setSent(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível enviar agora")
    } finally {
      setCaptcha("")
      setCaptchaVersion((value) => value + 1)
      setBusy(false)
    }
  }

  return (
    <div className="container-page max-w-md py-14 md:py-20">
      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Acesso</p>
      <h1 className="mt-2 font-serif text-4xl">Recuperar senha</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {config.features.email === false ? "Para recuperar o acesso, fale com o ateliê pelo WhatsApp na página de contato." : "Informe o email da conta. Se ele estiver cadastrado, enviamos um link para criar uma nova senha."}
      </p>

      {config.features.email === false ? (
        <Button asChild className="mt-6"><Link href="/contato">Falar com o ateliê</Link></Button>
      ) : sent ? (
        <div className="mt-6 rounded-xl border bg-card p-5 text-sm">
          <p className="font-medium">Confira sua caixa de entrada</p>
          <p className="mt-2 text-muted-foreground">
            O link vale por 30 minutos. Se não encontrar, olhe também no spam ou escreva para o ateliê.
          </p>
          <Button asChild variant="outline" className="mt-4"><Link href="/entrar">Voltar para entrar</Link></Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email da conta</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          {config.turnstile.enabled ? (
            <Turnstile resetKey={captchaVersion} siteKey={config.turnstile.site_key} action="reset" onToken={setCaptcha} />
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Enviar link"}
          </Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Lembrou? <Link href="/entrar" className="text-foreground underline">Entrar</Link>
      </p>
    </div>
  )
}
