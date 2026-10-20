"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function OrderLookupPage() {
  const router = useRouter()
  const [number, setNumber] = React.useState("")
  const [email, setEmail] = React.useState("")

  return (
    <div className="container-page max-w-md py-14 md:py-20">
      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Acompanhar</p>
      <h1 className="mt-2 font-serif text-4xl">Consultar pedido</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Informe o número do pedido (ex.: MA-1001) e o email usado na compra.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          router.push(`/pedido/${encodeURIComponent(number.trim().toUpperCase())}?email=${encodeURIComponent(email.trim())}`)
        }}
      >
        <div>
          <Label htmlFor="number">Número do pedido</Label>
          <Input
            id="number"
            value={number}
            onChange={(event) => setNumber(event.target.value.toUpperCase())}
            placeholder="MA-1001"
            required
          />
        </div>
        <div>
          <Label htmlFor="email">Email do pedido</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <Button type="submit" size="lg" className="w-full">
          <Search className="size-4" /> Ver pedido
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Tem uma conta? Os pedidos também ficam em{" "}
        <a href="/conta" className="underline">Minha conta</a>.
      </p>
    </div>
  )
}
