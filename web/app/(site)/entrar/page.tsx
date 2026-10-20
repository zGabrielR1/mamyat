"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { useAuth, useConfig } from "@/components/providers"
import { Turnstile } from "@/components/turnstile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

type Provider = { id: string; label: string }

export default function LoginPage() {
  const router = useRouter()
  const { login, customer } = useAuth()
  const config = useConfig()
  const [identifier, setIdentifier] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [remember, setRemember] = React.useState(true)
  const [captcha, setCaptcha] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [providers, setProviders] = React.useState<Provider[]>([])
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (customer) router.replace("/conta")
  }, [customer, router])

  React.useEffect(() => {
    if (!config.features.social_login) return
    api<{ providers: Provider[] }>("/api/betterauth/providers")
      .then((answer) => setProviders(answer.providers || []))
      .catch(() => undefined)
  }, [config.features.social_login])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setBusy(true)
    try {
      await login({ identifier, password, remember, turnstile_token: captcha })
      toast.success("Bem-vinda de volta")
      router.push("/conta")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível entrar")
    } finally {
      setBusy(false)
    }
  }

  const social = async (provider: string) => {
    setBusy(true)
    try {
      const origin = window.location.origin
      const answer = await api<{ url: string }>("/api/betterauth/sign-in/social", {
        body: {
          provider,
          callbackURL: `${origin}/api/betterauth/bridge?return=${encodeURIComponent(origin)}`,
        },
      })
      if (!answer.url) throw new Error("O provedor não devolveu um endereço")
      window.location.href = answer.url
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Login social indisponível")
      setBusy(false)
    }
  }

  return (
    <div className="container-page max-w-md py-14 md:py-20">
      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Sua conta</p>
      <h1 className="mt-2 font-serif text-4xl">Entrar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Acompanhe pedidos, salve seus dados e volte quando quiser.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <Label htmlFor="identifier">Email ou nome de usuário</Label>
          <Input
            id="identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link href="/recuperar-senha" className="text-xs text-muted-foreground hover:underline">
              Esqueci a senha
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Continuar conectada por 30 dias
        </label>
        {config.turnstile.enabled ? (
          <Turnstile siteKey={config.turnstile.site_key} action="login" onToken={setCaptcha} />
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className="text-foreground underline">Criar conta</Link>
      </p>

      {providers.length > 0 ? (
        <>
          <div className="my-7 flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> ou <Separator className="flex-1" />
          </div>
          <div className="grid gap-2">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={() => social(provider.id)}
              >
                Continuar com {provider.label}
              </Button>
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
        Ao entrar, você concorda com as{" "}
        <Link href="/politicas" className="underline">políticas de privacidade</Link>.
      </p>
    </div>
  )
}
