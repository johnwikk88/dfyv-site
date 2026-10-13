export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function siteOrigin(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost || request.headers.get("host") || "").split(",")[0].trim();
  if (!host) return "https://dfyv-site.vercel.app";
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"))
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}
