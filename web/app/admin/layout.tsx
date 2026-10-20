import { AdminProviders } from "@/components/admin/admin-shell"

export const metadata = {
  title: "Painel · Mamy Ateliê",
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminProviders>{children}</AdminProviders>
}
