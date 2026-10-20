import { Providers } from "@/components/providers"
import { SiteFooter, SiteHeader } from "@/components/site-shell"

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </Providers>
  )
}
