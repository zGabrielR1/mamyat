interface FreeEnv { ASSETS: Fetcher; API_URL: string; SHOP_ORIGIN_SECRET: string }
export default {
  async fetch(request: Request, env: FreeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (!env.SHOP_ORIGIN_SECRET) return Response.json({ error: "A loja está iniciando", code: "unavailable" }, { status: 503 });
      const headers = new Headers(request.headers);
      headers.set("X-Shop-Origin-Secret", env.SHOP_ORIGIN_SECRET);
      headers.set("X-Shop-Client-IP", request.headers.get("CF-Connecting-IP") || "unknown");
      headers.set("X-Shop-Path", url.pathname + url.search);
      headers.delete("host");
      try {
        const upstream = await fetch(env.API_URL, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual", signal: AbortSignal.timeout(25000) });
        if (upstream.status >= 300 && upstream.status < 400) throw new Error("Unexpected API redirect");
        const response = new Response(upstream.body, upstream);
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
        return response;
      } catch (error) { console.error("shop upstream failed", error instanceof Error ? error.message : "network"); return Response.json({ error: "A loja está temporariamente indisponível. Tente de novo.", code: "unavailable" }, { status: 503 }); }
    }
    if (/^\/(produto|pedido)\/[^/]+\/?$/.test(url.pathname)) {
      const section = url.pathname.split("/")[1];
      const asset = new URL(`/${section}/_/`, url);
      return env.ASSETS.fetch(new Request(asset, request));
    }
    const response = await env.ASSETS.fetch(request);
    const secured = new Response(response.body, response);
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return secured;
  },
};
