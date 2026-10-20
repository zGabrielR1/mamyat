import Link from "next/link"

import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Encomendas personalizadas",
  description:
    "Encomende uma peça de crochê, bordado ou amigurumi feita sob medida no Mamy Ateliê.",
}

const STEPS = [
  {
    title: "Conte a ideia",
    text: "Cor, tamanho, ocasião, uma referência que você viu. Pode ser uma foto, um desenho ou só uma descrição.",
  },
  {
    title: "Combinamos os detalhes",
    text: "O ateliê responde com sugestão de fio, prazo e valor. Ajustamos até ficar do jeito que você imaginou.",
  },
  {
    title: "Confirmação e sinal",
    text: "Metade do valor confirma a encomenda e reserva o tempo na agenda do ateliê.",
  },
  {
    title: "Feito e enviado",
    text: "Você acompanha o processo por mensagem e recebe a peça embalada, com o restante do pagamento na entrega.",
  },
]

export default function CustomOrdersPage() {
  return (
    <div>
      <section className="container-page grid gap-10 py-14 md:grid-cols-[1.1fr_1fr] md:items-center md:py-20">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">Sob medida</p>
          <h1 className="mt-4 text-balance font-serif text-5xl leading-[1.05] md:text-6xl">
            Tem uma ideia guardada? A gente faz junto.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            Encomendas são o coração do ateliê. Um presente de nascimento, uma
            bolsa em outra cor, uma peça para combinar com a sala. Conte o que
            você imaginou e a Mamy responde com prazo, fio e valor.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/produto/encomenda-personalizada">Abrir uma encomenda</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contato">Falar com o ateliê</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Prazo médio: a partir de 14 dias, conforme a peça.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/produtos/encomenda-personalizada.svg"
            alt="Novelo de lã, agulha e etiqueta de encomenda"
            className="aspect-[4/5] w-full object-cover"
          />
        </div>
      </section>

      <section className="border-y bg-card/60 py-14">
        <div className="container-page">
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Como funciona</p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <div key={step.title} className="rounded-xl border bg-background p-5">
                <p className="text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
                <p className="mt-4 font-serif text-xl">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page grid gap-10 py-16 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-3xl">O que ajuda a contar</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li>· Para que ocasião é a peça (presente, casa, uso diário).</li>
            <li>· Cores que você gosta — ou uma foto de referência.</li>
            <li>· Medidas aproximadas, se for para um móvel ou pessoa.</li>
            <li>· Data em que precisa receber, se houver.</li>
            <li>· Orçamento que você tem em mente, para combinarmos o fio.</li>
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h2 className="font-serif text-2xl">Antes de encomendar</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Peças artesanais têm pequenas variações de ponto, cor e medida — isso
            não é defeito, é o que diferencia uma peça feita à mão. O prazo começa
            a contar depois da confirmação do sinal e do combinado de fio.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Encomendas personalizadas não entram na política de troca por
            arrependimento, mas qualquer defeito de confecção é resolvido pelo
            ateliê. Veja os detalhes nas{" "}
            <Link href="/politicas" className="underline">políticas</Link>.
          </p>
          <Button asChild className="mt-5">
            <Link href="/produto/encomenda-personalizada">Começar minha encomenda</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
