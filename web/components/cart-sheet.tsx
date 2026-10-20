"use client"

import Link from "next/link"
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { useCart, useConfig } from "@/components/providers"
import { brl } from "@/lib/utils"

export function CartSheet() {
  const { items, open, setOpen, count, subtotal, setQty, remove } = useCart()
  const config = useConfig()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="font-serif text-xl">Sua sacola</SheetTitle>
          <SheetDescription>
            {count === 0
              ? "Ainda está vazia — escolha uma peça na loja."
              : `${count} ${count === 1 ? "peça" : "peças"} separadas com carinho.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-secondary">
                <ShoppingBag className="size-7 text-muted-foreground" />
              </span>
              <p className="max-w-[16rem] text-sm text-muted-foreground">
                Quando uma peça encontrar você, ela aparece aqui.
              </p>
              <Button asChild onClick={() => setOpen(false)}>
                <Link href="/loja">Ver a loja</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-5">
              {items.map((item) => (
                <li key={`${item.productId}:${item.variantId}`} className="flex gap-3">
                  <Link
                    href={`/produto/${item.slug}`}
                    onClick={() => setOpen(false)}
                    className="size-20 shrink-0 overflow-hidden rounded-lg bg-secondary"
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt={item.name} className="size-full object-cover" />
                    ) : null}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/produto/${item.slug}`}
                          onClick={() => setOpen(false)}
                          className="text-sm font-medium hover:underline"
                        >
                          {item.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{item.variantName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(item.productId, item.variantId)}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Remover ${item.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center rounded-full border">
                        <button
                          type="button"
                          className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
                          onClick={() => setQty(item.productId, item.variantId, item.qty - 1)}
                          aria-label="Diminuir quantidade"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm">{item.qty}</span>
                        <button
                          type="button"
                          className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
                          onClick={() => setQty(item.productId, item.variantId, item.qty + 1)}
                          aria-label="Aumentar quantidade"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <p className="text-sm font-medium">{brl(item.priceMinor * item.qty)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 ? (
          <SheetFooter className="border-t">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{brl(subtotal)}</span>
              </div>
              {config.shipping.free_minor > 0 && subtotal < config.shipping.free_minor ? (
                <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  Faltam {brl(config.shipping.free_minor - subtotal)} para o frete grátis.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Frete e cupom são calculados no checkout.
              </p>
              <Separator />
              <div className="grid gap-2">
                <Button asChild size="lg" onClick={() => setOpen(false)}>
                  <Link href="/checkout">Fechar pedido</Link>
                </Button>
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link href="/carrinho">Ver a sacola</Link>
                </Button>
              </div>
            </div>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
