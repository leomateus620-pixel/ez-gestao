import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { to, subject, html } = await req.json();
  const provider = (Deno.env.get("EMAIL_PROVIDER") ?? "resend").toLowerCase();
  const from = Deno.env.get("FATOR_R_EMAIL_FROM");
  if (!from) return Response.json({ ok: false, error: "FATOR_R_EMAIL_FROM não configurado." }, { status: 400 });

  if (provider === "resend") {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return Response.json({ ok: false, error: "RESEND_API_KEY não configurada." }, { status: 400 });
    const rs = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!rs.ok) return Response.json({ ok: false, error: await rs.text() }, { status: 502 });
    return Response.json({ ok: true, provider, result: await rs.json() });
  }

  if (provider === "sendgrid") {
    const key = Deno.env.get("SENDGRID_API_KEY");
    if (!key) return Response.json({ ok: false, error: "SENDGRID_API_KEY não configurada." }, { status: 400 });
    const sg = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: from },
        personalizations: [{ to: Array.isArray(to) ? to.map((e: string) => ({ email: e })) : [{ email: to }] }],
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });
    if (!sg.ok) return Response.json({ ok: false, error: await sg.text() }, { status: 502 });
    return Response.json({ ok: true, provider });
  }

  return Response.json({ ok: false, error: `Provider não suportado: ${provider}` }, { status: 400 });
});