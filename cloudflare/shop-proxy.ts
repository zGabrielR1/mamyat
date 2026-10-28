export interface ShopProxyEnv {
  API_URL: string;
  SHOP_ORIGIN_SECRET: string;
}

const PAGE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export async function proxyShopApi(request: Request, env: ShopProxyEnv): Promise<Response> {
  if (!env.SHOP_ORIGIN_SECRET) {
    return Response.json({ error: "A loja está iniciando", code: "unavailable" }, { status: 503 });
  }
  const headers = new Headers(request.headers);
  headers.set("X-Shop-Origin-Secret", env.SHOP_ORIGIN_SECRET);
  headers.set("X-Shop-Client-IP", request.headers.get("CF-Connecting-IP") || "unknown");
  headers.set("X-Shop-Path", new URL(request.url).pathname + new URL(request.url).search);
  headers.delete("host");
  try {
    const upstream = await fetch(env.API_URL, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
    });
    if (upstream.status >= 300 && upstream.status < 400) throw new Error("Unexpected API redirect");
    const response = new Response(upstream.body, upstream);
    response.headers.set("Cache-Control", "no-store");
    for (const [key, value] of Object.entries(PAGE_HEADERS)) response.headers.set(key, value);
    return response;
  } catch (error) {
    console.error("shop upstream failed", error instanceof Error ? error.message : "network");
    return Response.json(
      { error: "A loja está temporariamente indisponível. Tente de novo.", code: "unavailable" },
      { status: 503 },
    );
  }
}

export function securePage(response: Response, extra: Record<string, string> = {}): Response {
  const secured = new Response(response.body, response);
  for (const [key, value] of Object.entries({ ...PAGE_HEADERS, ...extra })) {
    secured.headers.set(key, value);
  }
  return secured;
}
