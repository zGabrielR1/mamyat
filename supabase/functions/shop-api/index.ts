import postgres from "npm:postgres@3.4.7";
import { createHandler } from "./core.mjs";

const env = Object.fromEntries(["DATABASE_URL", "SHOP_ORIGIN_SECRET", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_HOSTNAMES", "PUBLIC_BASE_URL", "MAIL_DELIVERY", "RESEND_API_KEY", "MAIL_FROM"].map(key => [key, Deno.env.get(key) || ""]));
if (!env.DATABASE_URL || !env.SHOP_ORIGIN_SECRET || !env.TURNSTILE_SECRET_KEY) throw new Error("Missing shop configuration");
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1, idle_timeout: 15, connect_timeout: 10, ssl: "require" });
Deno.serve(createHandler(sql, env));
