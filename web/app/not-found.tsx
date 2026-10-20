import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">404</p>
      <h1 className="mt-3 font-serif text-4xl">Essa página não existe</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Talvez o endereço tenha mudado ou a peça tenha saído do catálogo. A loja
        continua ali.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild><Link href="/">Ir para o início</Link></Button>
        <Button asChild variant="outline"><Link href="/loja">Ver a loja</Link></Button>
      </div>
    </div>
  )
}
