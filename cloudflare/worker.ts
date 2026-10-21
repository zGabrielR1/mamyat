import { Container } from "@cloudflare/containers";

interface Env {
  SHOP: DurableObjectNamespace<Shop>;
  [key: string]: unknown;
}

// Only these application settings may enter the container. Worker bindings
// and account-management tokens are never forwarded into the application.
const SETTINGS = [
  "APP_ENV", "DATABASE_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD",
  "CUSTOMER_SESSION_SECRET", "PUBLIC_BASE_URL", "RESEND_API_KEY",
  "MAIL_FROM", "MAIL_FROM_NAME", "TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY",
  "TURNSTILE_HOSTNAMES", "ASAAS_API_KEY", "ASAAS_CUSTOMER_ID",
  "ASAAS_WEBHOOK_SECRET", "ASAAS_BASE_URL", "BETTER_AUTH_SECRET",
  "BETTER_AUTH_BRIDGE_SECRET", "BETTER_AUTH_URL", "BETTER_AUTH_TRUSTED_ORIGINS",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FACEBOOK_CLIENT_ID",
  "FACEBOOK_CLIENT_SECRET", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
] as const;

export class Shop extends Container<Env> {
  defaultPort = 3000;
  requiredPorts = [3000, 8080];
  sleepAfter = "10m";
  envVars: Record<string, string>;

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = Object.fromEntries(SETTINGS.flatMap(key =>
      typeof env[key] === "string" ? [[key, env[key] as string]] : []));
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    return this.containerFetch(request, path === "/api" || path.startsWith("/api/") ? 8080 : 3000);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const canonical = new URL(String(env.PUBLIC_BASE_URL));
    if (url.hostname === `www.${canonical.hostname}`) {
      url.hostname = canonical.hostname;
      return Response.redirect(url.toString(), 308);
    }
    const headers = new Headers(request.headers);
    // Overwrite spoofable forwarding headers with Cloudflare's client address.
    headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
    headers.set("X-Forwarded-Proto", "https");
    try {
      const shop = env.SHOP.get(env.SHOP.idFromName("storefront"));
      return await shop.fetch(new Request(request, { headers }));
    } catch {
      return Response.json({ error: "A loja está iniciando. Tente novamente em instantes.", code: "unavailable" },
        { status: 503, headers: { "Retry-After": "10", "Cache-Control": "no-store" } });
    }
  },
};
