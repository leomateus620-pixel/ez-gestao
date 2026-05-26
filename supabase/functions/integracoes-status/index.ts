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
    twilio_whatsapp: Boolean(Deno.env.get("TWILIO_API_KEY")),
    google_vision: Boolean(Deno.env.get("GOOGLE_VISION_API_KEY")),
  };
  return new Response(JSON.stringify(status), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});