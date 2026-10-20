import Link from "next/link"

export const metadata = {
  title: "Políticas",
  description: "Políticas de compra, envio, troca e privacidade do Mamy Ateliê.",
}

const SECTIONS = [
  {
    id: "pedidos",
    title: "Pedidos e pagamento",
    body: [
      "Os pedidos são confirmados após o pagamento via Pix. As peças ficam reservadas por 30 minutos enquanto o Pix está em aberto; se o pagamento não cair nesse prazo, a reserva pode ser liberada automaticamente.",
      "Os preços são em reais e já incluem o valor da peça. Frete e cupons aparecem no checkout antes da confirmação. Peças sob encomenda têm prazo de produção informado na página do produto.",
      "Pagamentos são processados pelo Asaas. O ateliê não armazena dados de cartão.",
    ],
  },
  {
    id: "envio",
    title: "Envio e retirada",
    body: [
      "Enviamos para todo o Brasil por transportadora ou Correios, com prazo estimado de 3 a 7 dias úteis após a postagem. O código de rastreio aparece na página do pedido.",
      "A retirada no ateliê é combinada por email ou WhatsApp depois da confirmação do pagamento. Não há frete para retirada.",
      "Embalagens são pensadas para proteger peças de crochê e bordado. Se a embalagem chegar danificada, fotografe antes de abrir e fale com o ateliê.",
    ],
  },
  {
    id: "trocas",
    title: "Trocas e devoluções",
    body: [
      "Peças prontas podem ser trocadas ou devolvidas em até 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor, desde que não tenham sido usadas e estejam na embalagem original.",
      "Peças sob encomenda são feitas especialmente para você e não entram na devolução por arrependimento. Defeitos de confecção, no entanto, são sempre resolvidos pelo ateliê — envie fotos e descreva o problema.",
      "O custo do envio de devolução por arrependimento é do cliente; em caso de defeito ou erro do ateliê, cuidamos de tudo.",
    ],
  },
  {
    id: "privacidade",
    title: "Privacidade",
    body: [
      "Coletamos apenas os dados necessários para atender o pedido: nome, email, telefone, CPF (para emissão da cobrança Pix) e endereço. Esses dados são compartilhados somente com os serviços de pagamento e envio envolvidos na compra.",
      "Sua senha é guardada com hash forte; não temos acesso a ela. Você pode solicitar a exclusão da conta e dos dados a qualquer momento pelo email do ateliê.",
      "Não vendemos dados e não enviamos marketing sem consentimento.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies e sessão",
    body: [
      "Usamos armazenamento local do navegador para manter sua sacola, sua sessão de login e preferências básicas. Não usamos cookies de publicidade de terceiros.",
      "O Cloudflare Turnstile pode definir cookies técnicos para diferenciar pessoas de robôs nos formulários de login, cadastro e contato.",
    ],
  },
]

export default function PoliciesPage() {
  return (
    <div className="container-page max-w-3xl py-14 md:py-20">
      <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">Mamy Ateliê</p>
      <h1 className="mt-3 font-serif text-5xl">Políticas</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Última atualização: outubro de 2026. Em caso de dúvida,{" "}
        <Link href="/contato" className="underline">fale com o ateliê</Link>.
      </p>

      <nav className="mt-8 flex flex-wrap gap-2 text-xs">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="rounded-full border px-3 py-1.5 hover:bg-muted">
            {section.title}
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-28">
            <h2 className="font-serif text-2xl">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-xl border bg-card p-5 text-sm">
        <p className="font-medium">Precisa de ajuda com um pedido?</p>
        <p className="mt-1 text-muted-foreground">
          Escreva para o ateliê informando o número do pedido. Respondemos em até dois dias úteis.
        </p>
        <Link href="/contato" className="mt-3 inline-block underline">Abrir contato</Link>
      </div>
    </div>
  )
}
