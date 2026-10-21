"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { AdminProvider, useAdmin } from "@/components/admin/admin-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toaster } from "@/components/ui/sonner"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/admin/produtos", label: "Produtos", icon: Package },
  { href: "/admin/categorias", label: "Categorias", icon: Tags },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/contatos", label: "Contatos", icon: MessageSquare },
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
        <p className="mt-5 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
          A senha inicial está no arquivo{" "}
          <code className="rounded bg-muted px-1">data/runtime/admin_initial_password.txt</code>{" "}
          ou na variável <code className="rounded bg-muted px-1">ADMIN_PASSWORD</code>.
        </p>
        <Link href="/" className="mt-4 block text-center text-xs text-muted-foreground hover:underline">
          Voltar para a loja
        </Link>
      </div>
    </div>
  )
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin, ready, mustChange, logout } = useAdmin()
  const pathname = usePathname()

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
          <nav className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:overflow-visible lg:px-3 lg:py-4">
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
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2 lg:px-5">
            <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <div className="hidden px-5 py-4 text-xs text-muted-foreground lg:block">
            <p>Conectada como</p>
            <p className="mt-0.5 font-medium text-foreground">@{admin.username}</p>
            <p className="mt-1 capitalize">{admin.role}</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
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
