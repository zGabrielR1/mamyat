import { isMediaPath, serveMedia } from "./media";
import { proxyShopApi, securePage } from "./shop-proxy";

interface FreeEnv {
  ASSETS: Fetcher;
  API_URL: string;
  SHOP_ORIGIN_SECRET: string;
  ADMIN_URL?: string;
  MEDIA_URL?: string;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function adminTarget(requestUrl: URL, adminUrl: string): string {
  const base = new URL(adminUrl);
  const path = requestUrl.pathname === "/admin" ? "/admin/" : requestUrl.pathname;
  const normalized = /\.[a-z0-9]+$/i.test(path) ? path : path.replace(/\/?$/, "/");
  return new URL(`${normalized}${requestUrl.search}`, base).toString();
}

export default {
  async fetch(request: Request, env: FreeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (isMediaPath(url.pathname)) return serveMedia(request, env);
    if (url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/")) {
      return Response.json({ error: "Rota não encontrada", code: "not_found" }, { status: 404 });
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyShopApi(request, env);
    }
    if (isAdminPath(url.pathname)) {
      if (!env.ADMIN_URL) {
        return new Response("O painel é servido em um endereço separado.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return Response.redirect(adminTarget(url, env.ADMIN_URL), 308);
    }
    if (/^\/(produto|pedido)\/[^/]+\/?$/.test(url.pathname)) {
      const section = url.pathname.split("/")[1];
      const asset = new URL(`/${section}/_/`, url);
      return env.ASSETS.fetch(new Request(asset, request));
    }
    return securePage(await env.ASSETS.fetch(request));
  },
};
