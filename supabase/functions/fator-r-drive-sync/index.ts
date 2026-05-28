import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const reqEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
};

serve(async () => {
  try {
    reqEnv("SUPABASE_URL");
    reqEnv("SUPABASE_SERVICE_ROLE_KEY");
    reqEnv("GOOGLE_DRIVE_FOLDER_ID");
    reqEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    reqEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");

    const supabase = createClient(reqEnv("SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"));
    await supabase.from("fator_r_processing_logs").insert({
      event_type: "processing_started",
      message: "Execução iniciada (modo base).",
      payload: { note: "Implementação inicial sem OCR/PDF full parser." },
    });

    return Response.json({ ok: true, message: "Sincronização iniciada. Estrutura pronta para integração com Drive/PDF." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
});
