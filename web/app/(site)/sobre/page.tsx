import Link from "next/link"
import { MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"

export const metadata = {
  title: "O ateliê",
  description:
    "A história do Mamy Ateliê: crochê, bordado e amigurumi feitos à mão, um ponto de cada vez.",
}

export default function AboutPage() {
  return (
    <div className="paper-texture">
      <section className="container-page grid gap-12 py-14 md:grid-cols-[1fr_1.05fr] md:items-center md:py-20">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">O ateliê</p>
          <h1 className="mt-4 text-balance font-serif text-5xl leading-[1.05] md:text-6xl">
            Uma mesa, muitos fios e a paciência de quem gosta do processo.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            O Mamy Ateliê começou em casa, entre linhas, tecidos e a vontade de
            fazer coisas que durassem mais do que uma estação. Cada bolsa,
            amigurumi ou bordado continua sendo feito pela Mamy, do primeiro
            ponto ao último acabamento.
          </p>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            Não temos uma linha de produção: temos uma mesa, boa luz e o tempo
            que cada peça pede. É por isso que duas peças nunca saem exatamente
            iguais — e é isso que faz cada uma ser sua.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
              <MapPin className="size-4" />
            </span>
            Ateliê em Concórdia, Santa Catarina · envio para todo o Brasil
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/loja">Ver as peças</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/encomendas">Encomendar</Link></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/produtos/toalha-lavanda.svg" alt="Toalha bordada com lavanda" className="aspect-[3/4] w-full rounded-xl bg-card object-cover ring-1 ring-border" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/produtos/coelhinho-nino.svg" alt="Coelhinho de crochê" className="mt-8 aspect-[3/4] w-full rounded-xl bg-card object-cover ring-1 ring-border" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/produtos/sousplats-renda.svg" alt="Sousplats de crochê" className="aspect-[3/4] w-full rounded-xl bg-card object-cover ring-1 ring-border" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/produtos/necessaire-petala.svg" alt="Nécessaire de crochê" className="mt-8 aspect-[3/4] w-full rounded-xl bg-card object-cover ring-1 ring-border" />
        </div>
      </section>

      <section className="border-y bg-card/60">
        <div className="container-page grid gap-8 py-14 md:grid-cols-3">
          {[
            {
              title: "Feito à mão",
              text: "Crochê, bordado e costura feitos pela própria Mamy. Sem terceirizar o que dá alma à peça.",
            },
            {
              title: "Materiais escolhidos",
              text: "Fios de algodão, linho e enchimento siliconado. Materiais que envelhecem bem e podem ser lavados.",
            },
            {
              title: "Pequenas séries",
              text: "Cada peça é única ou feita em poucas unidades. Quando esgota, pode voltar sob encomenda.",
            },
          ].map((item) => (
            <div key={item.title}>
              <p className="font-serif text-2xl">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page max-w-3xl py-16 text-center">
        <p className="font-serif text-2xl leading-relaxed md:text-3xl">
          “Acho que presente bom é aquele que a gente reconhece na mão: o ponto,
          o peso, o cheiro do algodão. É isso que tento colocar em cada peça.”
        </p>
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Mamy · ateliê</p>
      </section>
    </div>
  )
}
