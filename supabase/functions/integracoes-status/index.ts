import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const status = {
    google_drive: Boolean(Deno.env.get("GOOGLE_DRIVE_API_KEY")),
    gmail: Boolean(Deno.env.get("GOOGLE_MAIL_API_KEY")),
    whatsapp: Boolean(
      Deno.env.get("WHATSAPP_ACCESS_TOKEN") &&
      Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") &&
      Deno.env.get("WHATSAPP_API_VERSION"),
    ),
    whatsapp_provider: 'meta_cloud_api',
    whatsapp_waba_id_configured: Boolean(Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID")),
    whatsapp_test_to_configured: Boolean(Deno.env.get("WHATSAPP_TEST_TO")),
    whatsapp_webhook_configured: Boolean(Deno.env.get("WHATSAPP_VERIFY_TOKEN")),
    whatsapp_api_version: Deno.env.get("WHATSAPP_API_VERSION") || null,
    // Leitura nativa de PDF: módulo interno, sempre disponível.
    pdf_native_reader: true,
  };
  return new Response(JSON.stringify(status), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});