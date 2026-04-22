import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download } from "lucide-react";

export default function ConsultaRelatorio() {
  const { id } = useParams();
  const path = decodeURIComponent(id || "");

  const { data, isLoading } = useQuery({
    queryKey: ["dry-run-report", path],
    queryFn: async () => {
      const { data: signed } = await supabase.storage
        .from("automation-artifacts")
        .createSignedUrl(path, 600);
      if (!signed?.signedUrl) return null;
      const r = await fetch(signed.signedUrl);
      if (!r.ok) return null;
      return { url: signed.signedUrl, body: await r.json() };
    },
    enabled: !!path,
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/consulta/saude"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Relatório do dry-run
            {data?.url && (
              <Button asChild size="sm" variant="outline">
                <a href={data.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" /> Baixar JSON</a>
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {data?.body && (
            <pre className="text-[10px] bg-muted/50 rounded-md p-3 overflow-auto max-h-[60vh]">{JSON.stringify(data.body, null, 2)}</pre>
          )}
          {!isLoading && !data?.body && <p className="text-sm text-muted-foreground italic">Relatório não encontrado.</p>}
        </CardContent>
      </Card>
    </div>
  );
}