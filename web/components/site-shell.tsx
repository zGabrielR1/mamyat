"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { Instagram, Mail, Menu, ShoppingBag, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth, useCart, useConfig } from "@/components/providers"
import { CartSheet } from "@/components/cart-sheet"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/loja", label: "Loja" },
  { href: "/encomendas", label: "Encomendas" },
  { href: "/sobre", label: "O ateliê" },
  { href: "/contato", label: "Contato" },
]

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-serif text-2xl font-semibold tracking-tight">Mamy</span>
      <span className="text-[0.62rem] uppercase tracking-[0.28em] text-muted-foreground">
        Ateliê
      </span>
    </span>
  )
}

export function SiteHeader() {
  const config = useConfig()
  const { count, hydrated, setOpen } = useCart()
  const { customer } = useAuth()
  const pathname = usePathname()
  const [menu, setMenu] = React.useState(false)

  React.useEffect(() => {
    setMenu(false)
  }, [pathname])

  return (
    <>
      {config.store.announcement ? (
        <div className="bg-primary px-4 py-2 text-center text-[0.7rem] uppercase tracking-[0.18em] text-primary-foreground">
          {config.store.announcement}
        </div>
      ) : null}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4 md:h-20">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={menu} onOpenChange={setMenu}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <SheetHeader>
                  <SheetTitle asChild>
                    <Link href="/" onClick={() => setMenu(false)}>
                      <Wordmark />
                    </Link>
                  </SheetTitle>
                  <SheetDescription>Feito à mão, feito para durar.</SheetDescription>
                </SheetHeader>
                <nav className="mt-8 flex flex-col gap-1 px-4">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-lg px-3 py-3 text-base hover:bg-muted"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Link href="/pedido" className="rounded-lg px-3 py-3 text-base hover:bg-muted">
                    Acompanhar pedido
                  </Link>
                  <Link href={customer ? "/conta" : "/entrar"} className="rounded-lg px-3 py-3 text-base hover:bg-muted">
                    {customer ? "Minha conta" : "Entrar"}
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          <Link href="/" className="shrink-0" aria-label="Mamy Ateliê, início">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-7 text-sm md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "transition-colors hover:text-foreground",
                  pathname.startsWith(item.href) ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Minha conta">
              <Link href={customer ? "/conta" : "/entrar"}>
                <UserRound className="size-5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label="Abrir sacola"
              onClick={() => setOpen(true)}
            >
              <ShoppingBag className="size-5" />
              {hydrated && count > 0 ? (
                <Badge className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center rounded-full px-1 text-[0.65rem]">
                  {count}
                </Badge>
              ) : null}
            </Button>
          </div>
        </div>
      </header>
      <CartSheet />
    </>
  )
}

export function SiteFooter() {
  const config = useConfig()
  return (
    <footer className="mt-24 border-t border-border bg-secondary/40">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {config.store.tagline} Peças de crochê, bordado e amigurumi feitas no ateliê,
            uma por uma.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">{config.store.city}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Navegar</p>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="w-fit hover:underline">
                {item.label}
              </Link>
            ))}
            <Link href="/pedido" className="w-fit hover:underline">
              Acompanhar pedido
            </Link>
            <Link href="/politicas" className="w-fit hover:underline">
              Trocas e privacidade
            </Link>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Falar com a Mamy</p>
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <a href={`mailto:${config.store.email}`} className="flex items-center gap-2 hover:underline">
              <Mail className="size-4" /> {config.store.email}
            </a>
            <a
              href={`https://instagram.com/${config.store.instagram.replace("@", "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 hover:underline"
            >
              <Instagram className="size-4" /> {config.store.instagram}
            </a>
            {config.store.whatsapp ? (
              <a
                href={`https://wa.me/${config.store.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </div>
      <div className="border-t border-border/70 py-5">
        <div className="container-page flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} Mamy Ateliê · CNPJ {config.store.cnpj || "a informar"}</p>
          <p>Pix à vista · Envio para todo o Brasil</p>
        </div>
      </div>
    </footer>
  )
}
