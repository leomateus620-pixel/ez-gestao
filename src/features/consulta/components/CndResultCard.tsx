import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { result?: any }

const CND_STATUS_LABELS: Record<string, { label: string; tone: "default" | "destructive" | "secondary" | "outline" }> = {
  negativa: { label: "Negativa de Débitos", tone: "default" },
  positiva_com_efeitos: { label: "Positiva c/ Efeitos de Negativa", tone: "secondary" },
  positiva: { label: "Positiva", tone: "destructive" },
  nao_emitida: { label: "Não Emitida", tone: "destructive" },
  indisponivel: { label: "Indisponível", tone: "outline" },
  captcha: { label: "Captcha", tone: "outline" },
  manual_required: { label: "Ação Manual", tone: "outline" },
};

export function CndResultCard({ result }: Props) {
  const [loadingPdf, setLoadingPdf] = useState(false);
  if (!result) return null;
  const m = CND_STATUS_LABELS[result.cnd_status] || { label: result.cnd_status, tone: "outline" as const };
  const pdfPath: string | null = result.pdf_path
    || result.parsed_payload?.certificate_pdf_path
    || result.raw_payload?.pdf_artifact_path
    || null;

  const openPdf = async () => {
    if (!pdfPath) return;
    setLoadingPdf(true);
    try {
      const { data, error } = await supabase.storage
        .from("automation-artifacts")
        .createSignedUrl(pdfPath, 60 * 10);
      if (error || !data?.signedUrl) throw error || new Error("no_url");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error("Não foi possível abrir o PDF", { description: String(e?.message || e) });
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Certidão (CND)
          <Badge variant={m.tone} className="ml-auto">{m.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><div className="text-[10px] uppercase text-muted-foreground">Código de Controle</div><div className="text-sm font-mono">{result.certificate_number || "—"}</div></div>
        <div><div className="text-[10px] uppercase text-muted-foreground">Emissão</div><div className="text-sm">{result.issued_at ? new Date(result.issued_at).toLocaleString("pt-BR") : "—"}</div></div>
        <div><div className="text-[10px] uppercase text-muted-foreground">Validade</div><div className="text-sm">{result.valid_until ? new Date(result.valid_until).toLocaleDateString("pt-BR") : "—"}</div></div>
        <div><div className="text-[10px] uppercase text-muted-foreground">Cache válido até</div><div className="text-sm">{result.cache_valid_until ? new Date(result.cache_valid_until).toLocaleString("pt-BR") : "—"}</div></div>
        {pdfPath && (
          <div className="md:col-span-2">
            <Button onClick={openPdf} disabled={loadingPdf} variant="default" size="sm" className="w-full md:w-auto">
              {loadingPdf ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Download className="h-3 w-3 mr-2" />}
              Baixar PDF da Certidão
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}