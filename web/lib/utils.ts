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

export function orderStatusTone(status: string): string {
  switch (status) {
    case "paid":
    case "delivered":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "packing":
      return "bg-amber-100 text-amber-900 border-amber-200"
    case "shipped":
      return "bg-sky-100 text-sky-900 border-sky-200"
    case "cancelled":
    case "refunded":
      return "bg-rose-100 text-rose-900 border-rose-200"
    default:
      return "bg-stone-100 text-stone-700 border-stone-200"
  }
}
