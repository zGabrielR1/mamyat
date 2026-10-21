"use client"

import * as React from "react"
import { ArrowUpRight, Instagram, Loader2, Mail, MapPin } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { useConfig } from "@/components/providers"
import { Turnstile } from "@/components/turnstile"
import { WhatsAppIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatWhatsapp, whatsappHref } from "@/lib/utils"

const WHATSAPP_MESSAGE = "Olá! Vim pelo site do Mamy Ateliê e gostaria de falar sobre uma peça."

export default function ContactPage() {
  const config = useConfig()
  const [form, setForm] = React.useState({ name: "", email: "", message: "" })
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
      await api("/api/contact", {
        body: { ...form, turnstile_token: captcha },
      })
      setSent(true)
      toast.success("Mensagem enviada")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível enviar agora")
    } finally {
      setCaptcha("")
      setCaptchaVersion((value) => value + 1)
      setBusy(false)
    }
  }

  return (
    <div className="container-page grid gap-12 py-14 md:grid-cols-[1fr_1fr] md:py-20">
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">Contato</p>
        <h1 className="mt-3 font-serif text-5xl leading-[1.05]">Falar com a Mamy</h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          Dúvida sobre uma peça, prazo de encomenda, troca ou só uma ideia para
          conversar. Respondemos em até dois dias úteis.
        </p>
        <div className="mt-8 space-y-3 text-sm">
          {config.store.whatsapp ? (
            <a
              href={whatsappHref(config.store.whatsapp, WHATSAPP_MESSAGE)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[#1a7f45] dark:text-[#5fd88c]">
                <WhatsAppIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  WhatsApp
                </span>
                <span className="mt-0.5 block font-medium">
                  {formatWhatsapp(config.store.whatsapp)}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          ) : null}
          <a
            href={`mailto:${config.store.email}`}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Mail className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs uppercase tracking-[0.15em] text-muted-foreground">
                Email
              </span>
              <span className="mt-0.5 block truncate font-medium">{config.store.email}</span>
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
          <a
            href={`https://instagram.com/${config.store.instagram.replace("@", "")}`}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Instagram className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs uppercase tracking-[0.15em] text-muted-foreground">
                Instagram
              </span>
              <span className="mt-0.5 block font-medium">{config.store.instagram}</span>
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
          <p className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-muted-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <MapPin className="size-4" />
            </span>
            <span>
              <span className="block text-xs uppercase tracking-[0.15em]">Ateliê</span>
              <span className="mt-0.5 block font-medium text-foreground">{config.store.city}</span>
              <span className="text-xs">Retirada combinada com antecedência.</span>
            </span>
          </p>
        </div>
      </div>

      <div>
        {sent ? (
          <div className="rounded-2xl border bg-card p-8">
            <h2 className="font-serif text-3xl">Recebido!</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Sua mensagem chegou no ateliê. Respondemos no email que você deixou,
              em até dois dias úteis.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => { setSent(false); setForm({ name: "", email: "", message: "" }) }}>
              Escrever outra mensagem
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl border bg-card p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Seu nome</Label>
                <Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </div>
              <div>
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  value={form.message}
                  onChange={(event) => setForm({ ...form, message: event.target.value })}
                  minLength={10}
                  maxLength={2000}
                  required
                  placeholder="Conte o que você precisa..."
                />
              </div>
              {config.turnstile.enabled ? (
                <Turnstile resetKey={captchaVersion} siteKey={config.turnstile.site_key} action="contact" onToken={setCaptcha} />
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Enviar mensagem"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
