const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers: corsHeaders });
  }

  try {
    const { videoId } = await request.json();
    if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId)) {
      return Response.json({ error: "Identificador de video inválido." }, { status: 400, headers: corsHeaders });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", videoUrl);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return Response.json({ available: false, error: "YouTube no encontró un video público para esta URL." }, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const metadata = await response.json();
    return Response.json({ available: true, title: metadata.title || "Video disponible" }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar YouTube." }, {
      status: 502,
      headers: corsHeaders,
    });
  }
});
