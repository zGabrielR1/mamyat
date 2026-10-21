import ClientPage from "./client"

export function generateStaticParams() { return [{ number: "_" }] }

export default function OrderPage() { return <ClientPage /> }
