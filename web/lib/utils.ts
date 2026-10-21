export { cn } from "cn"

export function brl(minor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((minor || 0) / 100)
}

export function digits(value: string): string {
  return (value || "").replace(/\D+/g, "")
}

export function formatCep(value: string): string {
  const raw = digits(value).slice(0, 8)
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw
}

export function formatCpf(value: string): string {
  const raw = digits(value).slice(0, 11)
  return raw
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function formatPhone(value: string): string {
  const raw = digits(value).slice(0, 11)
  if (raw.length <= 10) {
    return raw.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
  }
  return raw.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2")
}

/** Digits only, with the Brazilian country code so wa.me always resolves. */
export function whatsappNumber(value: string): string {
  const raw = digits(value)
  if (!raw) return ""
  return raw.startsWith("55") ? raw : `55${raw}`
}

/** A wa.me shortcut for a stored number, optionally pre-filling the message. */
export function whatsappHref(value: string, message?: string): string {
  const number = whatsappNumber(value)
  if (!number) return "#"
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`
}

/** +55 47 99666-9607, parsed from whatever the panel stored. */
export function formatWhatsapp(value: string): string {
  const raw = whatsappNumber(value)
  if (!raw) return ""
  const local = raw.startsWith("55") ? raw.slice(2) : raw
  const area = local.slice(0, 2)
  const rest = local.slice(2)
  if (rest.length === 9) return `+55 (${area}) ${rest.slice(0, 5)}-${rest.slice(5)}`
  if (rest.length === 8) return `+55 (${area}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  return value
}

export function orderStatusTone(status: string): string {
  switch (status) {
    case "paid":
    case "delivered":
      return "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200"
    case "packing":
      return "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200"
    case "shipped":
      return "border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-200"
    case "cancelled":
    case "refunded":
      return "border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200"
    default:
      return "border-stone-200 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-800/70 dark:text-stone-200"
  }
}
