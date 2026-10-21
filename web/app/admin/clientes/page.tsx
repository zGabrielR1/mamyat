"use client"

import * as React from "react"
import {
  Ban,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Mail,
  Search,
  ShieldOff,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { AdminCustomerDetail, Customer } from "@/lib/types"
import { useAdmin } from "@/components/admin/admin-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { brl, formatPhone, orderStatusTone } from "@/lib/utils"

function csvCell(value: string) {
  return `"${(value || "").replace(/"/g, '""')}"`
}

type EditForm = {
  name: string
  username: string
  email: string
  phone: string
  cpf: string
  active: boolean
  marketing: boolean
}

function toForm(customer: Customer): EditForm {
  return {
    name: customer.name,
    username: customer.username,
    email: customer.email,
    phone: customer.phone,
    cpf: customer.cpf,
    active: customer.active,
    marketing: customer.marketing,
  }
}

function CustomerEditor({
  customerId,
  open,
  onOpenChange,
  onChanged,
}: {
  customerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [detail, setDetail] = React.useState<AdminCustomerDetail | null>(null)
  const [form, setForm] = React.useState<EditForm | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState("")
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  React.useEffect(() => {
    if (!open || !customerId) return
    setLoading(true)
    setDetail(null)
    setForm(null)
    setConfirmDelete(false)
    api<AdminCustomerDetail>(`/api/admin/customers/${encodeURIComponent(customerId)}`)
      .then((answer) => {
        setDetail(answer)
        setForm(toForm(answer.customer))
      })
      .catch((failure: Error) => {
        toast.error(failure.message)
        onOpenChange(false)
      })
      .finally(() => setLoading(false))
  }, [open, customerId, onOpenChange])

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))

  const save = async (overrides: Partial<EditForm> = {}) => {
    if (!form || !detail) return
    setBusy("save")
    try {
      const answer = await api<{ customer: Customer }>(
        `/api/admin/customers/${encodeURIComponent(detail.customer.id)}`,
        { method: "PATCH", body: { ...form, ...overrides } },
      )
      setDetail((current) => (current ? { ...current, customer: answer.customer } : current))
      setForm(toForm(answer.customer))
      toast.success("Cliente atualizado")
      onChanged()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível salvar")
    } finally {
      setBusy("")
    }
  }

  const sendReset = async () => {
    if (!detail) return
    setBusy("reset")
    try {
      const answer = await api<{ sent: boolean; email: string; mail: string }>(
        `/api/admin/customers/${encodeURIComponent(detail.customer.id)}/reset`,
        { body: {} },
      )
      toast.success(
        answer.sent
          ? `Link de redefinição enviado para ${answer.email}`
          : "Não foi possível gerar o link",
      )
      if (answer.mail === "console") {
        toast.message("Email em modo console: o link foi impresso no log do servidor.")
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível enviar")
    } finally {
      setBusy("")
    }
  }

  const anonymize = async () => {
    if (!detail) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      toast.message("Isso apaga os dados pessoais e mantém os pedidos. Clique de novo para confirmar.")
      return
    }
    setBusy("delete")
    try {
      await api(`/api/admin/customers/${encodeURIComponent(detail.customer.id)}`, {
        method: "DELETE",
      })
      toast.success("Conta anonimizada; os pedidos foram mantidos")
      onChanged()
      onOpenChange(false)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível remover")
    } finally {
      setBusy("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        {loading || !detail || !form ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-serif text-2xl">
                {detail.customer.name}
                <Badge variant={detail.customer.active ? "secondary" : "destructive"}>
                  {detail.customer.active ? "ativa" : "bloqueada"}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                @{detail.customer.username} · conta desde{" "}
                {detail.customer.created_at
                  ? new Date(detail.customer.created_at).toLocaleDateString("pt-BR")
                  : "—"}
                {detail.customer.provider ? ` · login ${detail.customer.provider}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedidos</p>
                <p className="mt-1 text-xl font-medium">{detail.stats.orders}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagos</p>
                <p className="mt-1 text-xl font-medium">{detail.stats.paid}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total gasto</p>
                <p className="mt-1 text-xl font-medium">{detail.stats.spent}</p>
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="c-name">Nome</Label>
                  <Input id="c-name" value={form.name} onChange={(event) => set("name", event.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="c-user">Usuário</Label>
                  <Input id="c-user" value={form.username} onChange={(event) => set("username", event.target.value.toLowerCase())} required />
                </div>
                <div>
                  <Label htmlFor="c-email">Email</Label>
                  <Input id="c-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="c-phone">Telefone</Label>
                  <Input id="c-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <Label htmlFor="c-cpf">CPF</Label>
                  <Input id="c-cpf" value={form.cpf} onChange={(event) => set("cpf", event.target.value)} placeholder="000.000.000-00" />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => set("active", event.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Conta ativa (consegue entrar)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.marketing}
                      onChange={(event) => set("marketing", event.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Aceita novidades por email
                  </label>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={form.active ? "outline" : "secondary"}
                    size="sm"
                    disabled={Boolean(busy)}
                    onClick={() => save({ active: !form.active })}
                  >
                    {form.active ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                    {form.active ? "Bloquear conta" : "Desbloquear"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={sendReset}>
                    {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                    Enviar redefinição
                  </Button>
                  <Button type="button" variant="destructive" size="sm" disabled={Boolean(busy)} onClick={anonymize}>
                    {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
                    {confirmDelete ? "Confirmar anonimização" : "Anonimizar"}
                  </Button>
                </div>
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
                </Button>
              </DialogFooter>
            </form>

            <Separator />

            <div>
              <h3 className="font-serif text-lg">Pedidos</h3>
              {detail.orders.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nenhum pedido com esta conta.</p>
              ) : (
                <div className="mt-2 overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.orders.slice(0, 12).map((order) => (
                        <TableRow key={order.number}>
                          <TableCell className="font-medium">{order.number}</TableCell>
                          <TableCell>
                            <Badge className={orderStatusTone(order.status)}>{order.status_label}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right">{order.total || brl(order.total_minor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

type NewForm = {
  username: string
  name: string
  email: string
  phone: string
  cpf: string
  password: string
}

function emptyNew(): NewForm {
  return { username: "", name: "", email: "", phone: "", cpf: "", password: "" }
}

function NewCustomerDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [form, setForm] = React.useState<NewForm>(emptyNew())
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [temporary, setTemporary] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setForm(emptyNew())
    setError("")
    setTemporary("")
  }, [open])

  const set = <K extends keyof NewForm>(key: K, value: NewForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const answer = await api<{ temporary_password: string }>("/api/admin/customers", {
        body: form,
      })
      toast.success("Cliente criado")
      onChanged()
      if (answer.temporary_password) {
        setTemporary(answer.temporary_password)
      } else {
        onOpenChange(false)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível criar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Novo cliente</DialogTitle>
          <DialogDescription>
            Cria uma conta com senha. Se você deixar a senha em branco, uma é gerada
            e mostrada uma única vez.
          </DialogDescription>
        </DialogHeader>

        {temporary ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <p className="font-medium">Senha temporária</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-2 py-1.5 font-mono text-sm">
                  {temporary}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(temporary)
                    toast.success("Senha copiada")
                  }}
                >
                  <Copy className="size-4" /> Copiar
                </Button>
              </div>
              <p className="mt-2 text-xs">
                Anote agora: ela não aparece de novo. Peça para a cliente trocar em
                Minha conta.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="n-name">Nome</Label>
                <Input id="n-name" value={form.name} onChange={(event) => set("name", event.target.value)} required />
              </div>
              <div>
                <Label htmlFor="n-user">Usuário</Label>
                <Input id="n-user" value={form.username} onChange={(event) => set("username", event.target.value.toLowerCase())} required />
              </div>
              <div>
                <Label htmlFor="n-email">Email</Label>
                <Input id="n-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required />
              </div>
              <div>
                <Label htmlFor="n-phone">Telefone (opcional)</Label>
                <Input id="n-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
              </div>
              <div>
                <Label htmlFor="n-cpf">CPF (opcional)</Label>
                <Input id="n-cpf" value={form.cpf} onChange={(event) => set("cpf", event.target.value)} />
              </div>
              <div>
                <Label htmlFor="n-pass">Senha (opcional)</Label>
                <Input id="n-pass" value={form.password} onChange={(event) => set("password", event.target.value)} placeholder="8+ com letra e número" />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Criar cliente"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AdminCustomersPage() {
  const { admin } = useAdmin()
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [selectedId, setSelectedId] = React.useState("")
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const search = new URLSearchParams()
      if (status) search.set("status", status)
      const answer = await api<{ customers: Customer[] }>(
        `/api/admin/customers?${search.toString()}`,
      )
      setCustomers(answer.customers)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível carregar")
    } finally {
      setLoading(false)
    }
  }, [status])

  React.useEffect(() => {
    if (admin) void load()
  }, [admin, load])

  const filtered = customers.filter((customer) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${customer.name} ${customer.username} ${customer.email} ${customer.phone}`
      .toLowerCase()
      .includes(needle)
  })

  const exportCsv = () => {
    const rows = [
      ["Nome", "Usuário", "Email", "Telefone", "CPF", "Status", "Cadastro"],
      ...filtered.map((customer) => [
        customer.name,
        customer.username,
        customer.email,
        customer.phone,
        customer.cpf,
        customer.active ? "ativa" : "bloqueada",
        customer.created_at ? new Date(customer.created_at).toLocaleDateString("pt-BR") : "",
      ]),
    ]
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "clientes-mamyatelie.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const openCustomer = (id: string) => {
    setSelectedId(id)
    setEditorOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Pessoas</p>
          <h1 className="mt-1 font-serif text-3xl">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customers.length} conta(s) nesta visão. Contas de convidados não aparecem aqui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, usuário ou email"
              className="w-64 pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-sm"
            aria-label="Filtrar contas"
          >
            <option value="">Todas</option>
            <option value="active">Ativas</option>
            <option value="blocked">Bloqueadas</option>
          </select>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="size-4" /> CSV
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Novo cliente</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Contas</p>
          <p className="mt-2 text-2xl font-medium">{customers.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ativas</p>
          <p className="mt-2 text-2xl font-medium">
            {customers.filter((customer) => customer.active).length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Com senha</p>
          <p className="mt-2 text-2xl font-medium">
            {customers.filter((customer) => customer.has_password).length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Login social</p>
          <p className="mt-2 text-2xl font-medium">
            {customers.filter((customer) => customer.provider).length}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-16 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {customers.length === 0 ? "Nenhuma conta criada ainda." : "Ninguém com esse filtro."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer"
                  onClick={() => openCustomer(customer.id)}
                >
                  <TableCell>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">@{customer.username}</p>
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{customer.email}</TableCell>
                  <TableCell>{customer.phone ? formatPhone(customer.phone) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={customer.active ? "secondary" : "destructive"}>
                      {customer.active ? "ativa" : "bloqueada"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {customer.provider ? customer.provider : "email"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {customer.created_at ? new Date(customer.created_at).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">gerenciar</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        CPF é validado quando informado. Anonimizar apaga os dados pessoais e mantém
        o histórico de pedidos no caixa.
      </p>

      <CustomerEditor
        customerId={selectedId}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onChanged={load}
      />
      <NewCustomerDialog open={createOpen} onOpenChange={setCreateOpen} onChanged={load} />
    </div>
  )
}
