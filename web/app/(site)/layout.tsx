import { Providers } from "@/components/providers"
import { SiteFooter, SiteHeader } from "@/components/site-shell"
import { WhatsAppButton } from "@/components/whatsapp-button"

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Ir para o conteúdo
      </a>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main id="conteudo" className="flex-1">{children}</main>
        <SiteFooter />
      </div>
      <WhatsAppButton />
    </Providers>
  )
}
