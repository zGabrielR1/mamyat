"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, HeartHandshake, PackageCheck, Scissors, Sparkles } from "lucide-react"

import { api } from "@/lib/api"
import type { Category, Product } from "@/lib/types"
import { ProductCard } from "@/components/product-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfig } from "@/components/providers"
import { brl } from "@/lib/utils"

const VALUES = [
  {
    icon: Scissors,
    title: "Um ponto de cada vez",
    text: "Cada peça passa pelas mãos da Mamy, do primeiro ponto ao acabamento.",
  },
  {
    icon: Sparkles,
    title: "Materiais que duram",
    text: "Algodão, linho e fios escolhidos para envelhecer bem, não para durar uma estação.",
  },
  {
    icon: PackageCheck,
    title: "Embalado para chegar",
    text: "Envio para todo o Brasil, com embalagem pensada para viajar sem pressa.",
  },
  {
    icon: HeartHandshake,
    title: "Feito para alguém",
    text: "Encomendas personalizadas para um quarto, uma mesa ou uma lembrança.",
  },
]

export default function HomePage() {
  const config = useConfig()
  const [products, setProducts] = React.useState<Product[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api<{ products: Product[]; categories: Category[] }>("/api/products?featured=1")
      .then((answer) => {
        setProducts(answer.products.slice(0, 4))
        setCategories(answer.categories)
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="paper-texture">
      <section className="container-page grid items-center gap-12 py-14 md:grid-cols-[1.05fr_1fr] md:py-20">
        <div className="max-w-xl">
          <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">
            Ateliê de crochê e bordado
          </p>
          <h1 className="mt-5 text-balance font-serif text-5xl leading-[1.04] tracking-tight md:text-6xl">
            Feito à mão, feito para durar.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            Bolsas, amigurumis e peças de casa que saem do ateliê uma por uma.
            Sem pressa, com fio de algodão e com o cuidado de quem faz para a
            própria família.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/loja">
                Ver a loja <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/encomendas">Encomendar uma peça</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>Pix à vista</span>
            <span aria-hidden>·</span>
            <span>Envio para todo o Brasil</span>
            <span aria-hidden>·</span>
            <span>{config.shipping.delivery_days}</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-secondary/70" />
          <div className="overflow-hidden rounded-[1.6rem] bg-card shadow-sm ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/produtos/bolsa-aurora.svg"
              alt="Bolsa Aurora de crochê em tom areia"
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-5 left-5 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-sm">
            <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              Peça de ateliê
            </p>
            <p className="font-serif text-lg">Bolsa Aurora</p>
            <p className="text-sm text-muted-foreground">{brl(18900)}</p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/60">
        <div className="container-page grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value) => (
            <div key={value.title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                <value.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">{value.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{value.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
              Escolhidas do ateliê
            </p>
            <h2 className="mt-2 font-serif text-3xl">Peças em destaque</h2>
          </div>
          <Link href="/loja" className="hidden text-sm text-muted-foreground hover:underline sm:block">
            Ver tudo
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-3">
                  <Skeleton className="aspect-[4/5] w-full rounded-xl" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))
            : products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
        </div>
        <div className="mt-10 sm:hidden">
          <Button asChild variant="outline" className="w-full">
            <Link href="/loja">Ver todas as peças</Link>
          </Button>
        </div>
      </section>

      <section className="bg-secondary/40 py-16">
        <div className="container-page">
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
            Por categoria
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {categories.slice(0, 8).map((category, index) => (
              <Link
                key={category.name}
                href={`/loja?categoria=${encodeURIComponent(category.name)}`}
                className="group rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary/40"
              >
                <p className="text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-6 font-serif text-xl">{category.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {category.count} {category.count === 1 ? "peça" : "peças"}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page grid gap-10 py-20 md:grid-cols-2 md:items-center">
        <div className="order-2 md:order-1">
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
            O ateliê
          </p>
          <h2 className="mt-3 max-w-md font-serif text-3xl leading-tight md:text-4xl">
            Uma mesa, muitos fios e a paciência de quem gosta do processo.
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground">
            O Mamy Ateliê nasceu em casa, entre linhas e tecidos. Hoje cada peça
            continua sendo feita no mesmo ritmo: escolher o fio, testar o ponto,
            desmanchar quando não ficou bom e começar de novo. É por isso que
            duas peças nunca saem exatamente iguais.
          </p>
          <Button asChild variant="outline" className="mt-7">
            <Link href="/sobre">Conhecer a história</Link>
          </Button>
        </div>
        <div className="order-1 grid grid-cols-2 gap-3 md:order-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/produtos/coelhinho-nino.svg"
            alt="Coelhinho de crochê"
            className="aspect-[3/4] w-full rounded-xl bg-card object-cover ring-1 ring-border"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/produtos/sousplats-renda.svg"
            alt="Sousplats de crochê"
            className="mt-8 aspect-[3/4] w-full rounded-xl bg-card object-cover ring-1 ring-border"
          />
        </div>
      </section>

      <section className="container-page pb-20">
        <div className="rounded-2xl bg-primary px-6 py-12 text-primary-foreground md:px-12">
          <div className="grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-center">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-primary-foreground/60">
                Encomendas
              </p>
              <h2 className="mt-3 max-w-lg font-serif text-3xl leading-tight md:text-4xl">
                Tem uma ideia guardada? A gente faz junto.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-primary-foreground/70">
                Cores, medidas, um presente de nascimento ou uma peça para a casa.
                Conte o que você imaginou e o ateliê responde com prazo e valor.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Button asChild size="lg" variant="secondary" className="w-full md:w-auto">
                <Link href="/encomendas">Começar uma encomenda</Link>
              </Button>
              <a
                href={`mailto:${config.store.email}`}
                className="text-center text-xs text-primary-foreground/60 hover:underline md:text-right"
              >
                ou escreva para {config.store.email}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
