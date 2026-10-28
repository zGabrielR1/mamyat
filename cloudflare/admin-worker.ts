import { isMediaPath, serveMedia } from "./media";
import { proxyShopApi, securePage } from "./shop-proxy";

interface AdminEnv {
  ASSETS: Fetcher;
  API_URL: string;
  SHOP_ORIGIN_SECRET: string;
  MEDIA_URL?: string;
}

const ADMIN_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};

const STATIC_PREFIXES = ["/_next/", "/produtos/"];
const STATIC_FILES = new Set([
  "/favicon.ico",
  "/favicon.svg",
  "/icon.svg",
  "/robots.txt",
  "/site.webmanifest",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
]);

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminAsset(pathname: string): boolean {
  return isAdminPath(pathname) ||
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    STATIC_FILES.has(pathname);
}

export default {
  async fetch(request: Request, env: AdminEnv): Promise<Response> {
    const url = new URL(request.url);
    if (isMediaPath(url.pathname)) return serveMedia(request, env);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const allowed = url.pathname === "/api/health" || url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/");
      if (!allowed) {
        return securePage(
          new Response(JSON.stringify({ error: "Rota não encontrada", code: "not_found" }), {
            status: 404,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }),
          ADMIN_HEADERS,
        );
      }
      return proxyShopApi(request, env);
    }
    if (url.pathname === "/") {
      return Response.redirect(new URL("/admin/", url).toString(), 302);
    }
    if (url.pathname === "/admin") {
      return Response.redirect(new URL("/admin/", url).toString(), 302);
    }
    if (!isAdminAsset(url.pathname)) {
      return securePage(
        new Response("Esta origem serve apenas o painel administrativo.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
        ADMIN_HEADERS,
      );
    }
    return securePage(await env.ASSETS.fetch(request), ADMIN_HEADERS);
  },
};
