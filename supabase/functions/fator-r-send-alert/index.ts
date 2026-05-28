import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const payload = await req.json();
  const provider = Deno.env.get("EMAIL_PROVIDER") ?? "resend";
  const from = Deno.env.get("FATOR_R_EMAIL_FROM");

  if (!from) {
    return Response.json({ ok: false, error: "FATOR_R_EMAIL_FROM não configurado." }, { status: 400 });
  }

  if (provider === "resend") {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return Response.json({ ok: false, error: "RESEND_API_KEY não configurada." }, { status: 400 });
  }

  return Response.json({ ok: true, provider, dryRun: true, payload });
});
