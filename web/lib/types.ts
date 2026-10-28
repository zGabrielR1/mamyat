export type Variant = {
  id: string
  name: string
  sku: string
  stock: number
  available: number
}

export type Product = {
  id: string
  slug: string
  name: string
  description: string
  details: string[]
  category: string
  price_minor: number
  compare_at_minor: number | null
  price: number
  compare_at: number | null
  images: string[]
  variants: Variant[]
  featured: boolean
  active: boolean
  made_to_order: boolean
  production_days: number
  available: number
  url: string
  created_at?: string
  updated_at?: string
  review_stats?: ReviewStats
}

export type Review = {
  id: string
  product_id: string
  product_name?: string
  order_id?: string
  rating: number
  comment: string
  name: string
  status?: "pending" | "approved" | "rejected"
  created_at: string
  updated_at?: string
}

export type ReviewStats = {
  count: number
  average: number
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number }
}

export type Category = { name: string; count: number }

export type StoreConfig = {
  version: string
  store: {
    name: string
    tagline: string
    announcement: string
    email: string
    whatsapp: string
    instagram: string
    cnpj: string
    city: string
  }
  shipping: {
    flat_minor: number
    free_minor: number
    pickup_enabled: boolean
    delivery_days: string
    pickup_address: string
  }
  payment: { mode: "asaas" | "mercadopago" | "demo"; environment: string }
  turnstile: { enabled: boolean; site_key: string }
  categories: string[]
  features: {
    pickup: boolean
    coupons: boolean
    guest_checkout: boolean
    social_login: boolean
    email?: boolean
  }
}

export type QuoteLine = {
  product_id: string
  variant_id: string
  slug: string
  name: string
  variant_name: string
  sku: string
  image: string
  unit_price_minor: number
  qty: number
  line_total_minor: number
  made_to_order: boolean
  production_days: number
}

export type Quote = {
  ok: boolean
  problems: string[]
  items: QuoteLine[]
  shipping_method?: "delivery" | "pickup"
  shipping_minor: number
  discount_minor: number
  coupon?: string
  subtotal_minor: number
  total_minor: number
  free_shipping?: boolean
}

export type OrderPayment = {
  checkout_url?: string
  review_required?: boolean
  payment_id?: string
  provider_status?: string
  last_checked_at?: string
  expired?: boolean
  provider: string
  status: string
  provider_ref?: string
  amount_minor?: number
  qr_code?: string
  qr_base64?: string
  invoice_url?: string
  expires_at?: string
  environment?: string
  error?: string
  retryable?: boolean
  notice?: string
}

export type Order = {
  id: string
  number: string
  status: string
  status_label: string
  created_at: string
  total_minor: number
  total: string
  email: string
  name: string
  phone?: string
  cpf?: string
  tracking_code: string
  shipping_method: string
  shipping: Record<string, string>
  items: QuoteLine[]
  subtotal_minor: number
  shipping_minor: number
  discount_minor: number
  coupon: string
  payment: OrderPayment
  paid_at: string | null
  shipped_at: string | null
  history: { status: string; at: string }[]
  can_cancel: boolean
  item_count?: number
}

export type Customer = {
  id: string
  username: string
  email: string
  name: string
  phone: string
  cpf: string
  created_at: string
  updated_at?: string | null
  active: boolean
  marketing: boolean
  deleted_at?: string | null
  has_password: boolean
  provider: string
}

export type AdminCustomerDetail = {
  customer: Customer
  orders: Order[]
  stats: { orders: number; paid: number; spent_minor: number; spent: string }
}

export type Admin = {
  id: string
  username: string
  role: "admin" | "viewer"
}

export type Dashboard = {
  revenue_minor: number
  revenue: string
  orders: number
  paid_orders: number
  average_ticket_minor: number
  customers: number
  awaiting: number
  by_status: Record<string, number>
  low_stock: {
    product_id: string
    product: string
    slug: string
    variant: string
    sku: string
    stock: number
  }[]
  top_products: { name: string; qty: number; revenue_minor: number }[]
  recent_orders: Order[]
  default_admin: boolean
  payment_mode: "asaas" | "mercadopago" | "demo"
}

export type CartItem = {
  productId: string
  variantId: string
  name: string
  variantName: string
  slug: string
  image: string
  priceMinor: number
  qty: number
  max: number
}
