"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ExternalLink,
  Eye,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Users,
  ClipboardList,
  Menu,
} from "lucide-react"
import { toast } from "sonner"

import { AdminProvider, useAdmin } from "@/components/admin/admin-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toaster } from "@/components/ui/sonner"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn, storefrontHref } from "@/lib/utils"

const NAV = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/operacao", label: "Operação do ateliê", icon: ClipboardList },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/admin/produtos", label: "Produtos", icon: Package },
  { href: "/admin/categorias", label: "Categorias", icon: Tags },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/contatos", label: "Contatos", icon: MessageSquare },
  { href: "/admin/avaliacoes", label: "Avaliações", icon: MessageSquare },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
]

function LoginCard() {
  const { login } = useAdmin()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await login(username, password)
      toast.success("Bem-vinda ao painel")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível entrar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm">
        <div className="absolute right-2 top-2">
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Store className="size-4" />
          </span>
          <div>
            <p className="font-serif text-xl leading-none">Mamy Ateliê</p>
            <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
              painel
            </p>
          </div>
        </div>
        <h1 className="mt-7 font-serif text-2xl">Entrar no painel</h1>
        <p className="mt-1 text-xs text-muted-foreground">Use o usuário e a senha de administração.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="admin-user">Usuário</Label>
            <Input
              id="admin-user"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <Label htmlFor="admin-pass">Senha</Label>
            <Input
              id="admin-pass"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm leading-relaxed text-muted-foreground">Acesso exclusivo para a equipe do ateliê.</p>
        <Link href={storefrontHref("/")} className="mt-4 block text-center text-xs text-muted-foreground hover:underline">
          Voltar para a loja
        </Link>
      </div>
    </div>
  )
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin, ready, mustChange, canWrite, logout } = useAdmin()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = React.useState(false)
  React.useEffect(() => setMenuOpen(false), [pathname])

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!admin) return <LoginCard />

  return (
    <div className="min-h-svh bg-secondary/30">
      <div className="mx-auto flex max-w-[100rem] flex-col lg:flex-row">
        <aside className="border-b bg-card lg:min-h-svh lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2 px-4 py-4 lg:block lg:border-b lg:px-5 lg:py-5">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Store className="size-4" />
              </span>
              <span>
                <span className="block font-serif text-lg leading-none">Mamy Ateliê</span>
                <span className="mt-1 block text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                  painel
                </span>
              </span>
            </Link>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu do painel" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><Menu className="size-5" /></Button>
            <Button
              variant="ghost"
              size="sm"
              className="lg:mt-4 lg:w-full lg:justify-start"
              onClick={async () => {
                await logout()
                toast.success("Saiu do painel")
              }}
            >
              <LogOut className="size-4" /> Sair
            </Button>
          </div>
          <nav aria-label="Painel" className={cn("flex-col gap-1 px-3 py-4 lg:flex", menuOpen ? "flex" : "hidden")}>
            {NAV.map((item) => {
              const active = item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className={cn("items-center justify-between gap-2 border-t px-4 py-2 lg:flex lg:px-5", menuOpen ? "flex" : "hidden")}>
            <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <div className="hidden space-y-3 px-5 py-4 text-xs text-muted-foreground lg:block">
            <div>
              <p>Conectada como</p>
              <p className="mt-0.5 font-medium text-foreground">@{admin.username}</p>
              <p className="mt-1 flex items-center gap-1.5 capitalize">
                {canWrite ? <ShieldCheck className="size-3.5" /> : <Eye className="size-3.5" />}
                {canWrite ? "administradora" : "somente leitura"}
              </p>
            </div>
            <a
              href={storefrontHref("/")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              Abrir a loja <ExternalLink className="size-3" />
            </a>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          {!canWrite ? (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
              <p className="flex items-center gap-2">
                <Badge variant="outline">somente leitura</Badge>
                Esta conta pode consultar dados, mas não alterar a loja.
              </p>
            </div>
          ) : null}
          {mustChange ? (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <p>
                Você está usando a senha inicial do painel. Troque agora para proteger a loja.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/configuracoes">Trocar senha</Link>
              </Button>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}

export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminShell>{children}</AdminShell>
      <Toaster position="top-center" richColors closeButton />
    </AdminProvider>
  )
}
