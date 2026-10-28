export interface MediaEnv {
  MEDIA_URL?: string;
}

const KEY = /^[a-f0-9]{32}\.(?:jpg|png|webp)$/;

export function isMediaPath(pathname: string): boolean {
  return pathname === "/media" || pathname.startsWith("/media/");
}

function mediaResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

export async function serveMedia(request: Request, env: MediaEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const response = mediaResponse("Método não permitido", 405);
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }
  const key = new URL(request.url).pathname.match(/^\/media\/(.+)$/)?.[1] || "";
  if (!KEY.test(key) || !env.MEDIA_URL) return mediaResponse("Imagem não encontrada", 404);
  let upstream: Response;
  try {
    upstream = await fetch(`${env.MEDIA_URL.replace(/\/$/, "")}/${key}`, {
      method: request.method,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return mediaResponse("Imagem indisponível", 503);
  }
  if (!upstream.ok) return mediaResponse("Imagem não encontrada", 404);
  const response = new Response(request.method === "HEAD" ? null : upstream.body, upstream);
  response.headers.delete("Content-Encoding");
  response.headers.delete("Content-Length");
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
