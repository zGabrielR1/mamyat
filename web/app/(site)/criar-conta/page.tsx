"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { useAuth, useConfig } from "@/components/providers"
import { Turnstile } from "@/components/turnstile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCpf, formatPhone } from "@/lib/utils"

export default function SignupPage() {
  const router = useRouter()
  const { signup, customer } = useAuth()
  const config = useConfig()
  const [form, setForm] = React.useState({
    username: "", name: "", email: "", phone: "", cpf: "",
    password: "", confirm: "",
  })
  const [captcha, setCaptcha] = React.useState("")
  const [captchaVersion, setCaptchaVersion] = React.useState(0)
  const [accepted, setAccepted] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (customer) router.replace("/conta")
  }, [customer, router])

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = event.target.value
    if (key === "username") value = value.toLowerCase().replace(/[^a-z0-9._-]/g, "")
    if (key === "phone") value = formatPhone(value)
    if (key === "cpf") value = formatCpf(value)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    if (form.password !== form.confirm) {
      setError("As duas senhas precisam ser iguais")
      return
    }
    if (!accepted) {
      setError("Aceite as políticas para criar a conta")
      return
    }
    setBusy(true)
    try {
      await signup({
        username: form.username,
        name: form.name,
        email: form.email,
        phone: form.phone,
        cpf: form.cpf,
        password: form.password,
        turnstile_token: captcha,
        remember: true,
      })
      toast.success("Conta criada com carinho")
      router.push("/conta")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível criar a conta")
    } finally {
      setCaptcha("")
      setCaptchaVersion((value) => value + 1)
      setBusy(false)
    }
  }

  return (
    <div className="container-page max-w-md py-14 md:py-20">
      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Primeira vez</p>
      <h1 className="mt-2 font-serif text-4xl">Criar conta</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Um lugar para suas sacolas, pedidos e encomendas.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <Label htmlFor="username">Nome de usuário</Label>
          <Input
            id="username"
            value={form.username}
            onChange={set("username")}
            autoComplete="username"
            minLength={3}
            maxLength={20}
            required
            placeholder="anasouza"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            3 a 20 caracteres: letras, números, ponto, hífen ou sublinhado.
          </p>
        </div>
        <div>
          <Label htmlFor="name">Nome completo</Label>
          <Input id="name" value={form.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={form.phone} onChange={set("phone")} autoComplete="tel" />
          </div>
          <div>
            <Label htmlFor="cpf">CPF (opcional)</Label>
            <Input id="cpf" value={form.cpf} onChange={set("cpf")} inputMode="numeric" />
          </div>
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">Ao menos 8 caracteres, com letras e números.</p>
        </div>
        <div>
          <Label htmlFor="confirm">Repetir a senha</Label>
          <Input
            id="confirm"
            type="password"
            value={form.confirm}
            onChange={set("confirm")}
            autoComplete="new-password"
            required
          />
        </div>
        {config.turnstile.enabled ? (
          <Turnstile resetKey={captchaVersion} siteKey={config.turnstile.site_key} action="signup" onToken={setCaptcha} />
        ) : null}
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            Li e aceito as <Link href="/politicas" className="underline">políticas de privacidade e compra</Link>.
          </span>
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Criar minha conta"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Já tem conta? <Link href="/entrar" className="text-foreground underline">Entrar</Link>
      </p>
    </div>
  )
}
