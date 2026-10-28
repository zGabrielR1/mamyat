import postgres from "npm:postgres@3.4.7";
import { createHandler } from "./core.mjs";

const env = Object.fromEntries(["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_NOTIFICATION_SECRET", "DATABASE_URL", "SHOP_ORIGIN_SECRET", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_HOSTNAMES", "PUBLIC_BASE_URL", "MAIL_DELIVERY", "RESEND_API_KEY", "MAIL_FROM", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].map(key => [key, Deno.env.get(key) || ""]));
if (!env.DATABASE_URL || !env.SHOP_ORIGIN_SECRET || !env.TURNSTILE_SECRET_KEY) throw new Error("Missing shop configuration");
if (env.MERCADOPAGO_ACCESS_TOKEN && (!env.MERCADOPAGO_ACCESS_TOKEN.startsWith('APP_USR-') || env.MERCADOPAGO_NOTIFICATION_SECRET.length < 32 || !env.PUBLIC_BASE_URL.startsWith('https://'))) throw new Error('Invalid production payment configuration');
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1, idle_timeout: 15, connect_timeout: 10, ssl: "require" });
Deno.serve(createHandler(sql, env));
