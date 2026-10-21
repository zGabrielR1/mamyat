import ClientPage from "./client"

export function generateStaticParams() { return [{ slug: "_" }] }

export default function ProductPage() { return <ClientPage /> }
