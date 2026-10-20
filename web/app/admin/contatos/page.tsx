"use client"

import * as React from "react"
import { Mail, MessageSquare, Search } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { useAdmin } from "@/components/admin/admin-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

type Contact = {
  id: string
  name: string
  email: string
  message: string
  created_at: string
  answered?: boolean
}

export default function AdminContactsPage() {
  const { admin } = useAdmin()
  const [contacts, setContacts] = React.useState<Contact[]>([])
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!admin) return
    api<{ contacts: Contact[] }>("/api/admin/contacts")
      .then((answer) => setContacts(answer.contacts))
      .catch((failure: Error) => toast.error(failure.message))
      .finally(() => setLoading(false))
  }, [admin])

  const filtered = contacts.filter((contact) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${contact.name} ${contact.email} ${contact.message}`.toLowerCase().includes(needle)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Atendimento</p>
          <h1 className="mt-1 font-serif text-3xl">Contatos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mensagens enviadas pelo formulário do site. Responda pelo email da pessoa.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mensagem"
            className="w-64 pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border bg-card px-5 py-16 text-center">
          <MessageSquare className="size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {contacts.length === 0 ? "Nenhuma mensagem recebida ainda." : "Nada com esse filtro."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((contact) => (
            <article key={contact.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">{contact.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {contact.answered ? <Badge variant="secondary">respondido</Badge> : <Badge variant="outline">novo</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(contact.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {contact.message}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-4">
                <a href={`mailto:${contact.email}?subject=${encodeURIComponent("Re: sua mensagem para o Mamy Ateliê")}`}>
                  <Mail className="size-3.5" /> Responder por email
                </a>
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
