"use client"

import { useConfig } from "@/components/providers"
import { WhatsAppIcon } from "@/components/icons"
import { cn, whatsappHref } from "@/lib/utils"

const MESSAGE = "Olá! Vim pelo site do Mamy Ateliê e gostaria de falar com o ateliê."

export function WhatsAppButton({ className }: { className?: string }) {
  const config = useConfig()
  if (!config.store.whatsapp) return null

  return (
    <a
      href={whatsappHref(config.store.whatsapp, MESSAGE)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Falar no WhatsApp ${config.store.whatsapp}`}
      className={cn(
        "fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-[#25D366] text-[#0b2e1a] shadow-lg shadow-black/20 ring-1 ring-black/5 transition-transform hover:-translate-y-0.5 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40 md:bottom-5 md:right-5 md:size-13 print:hidden",
        className,
      )}
    >
      <WhatsAppIcon className="size-6" />
    </a>
  )
}
