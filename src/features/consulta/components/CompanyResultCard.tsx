import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

interface Props { result?: any }

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value || "—"}</div>
    </div>
  );
}

export function CompanyResultCard({ result }: Props) {
  if (!result) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" /> Dados Cadastrais
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Razão Social" value={result.official_name} />
        <Field label="Nome Fantasia" value={result.trade_name} />
        <Field label="Situação" value={result.registration_status} />
        <Field label="Abertura" value={result.opening_date} />
        <Field label="Natureza Jurídica" value={result.legal_nature} />
        <Field label="CNAE Principal" value={result.main_cnae} />
        <Field label="Confiança do Parser" value={`${Math.round((result.parsed_confidence || 0) * 100)}%`} />
        <Field label="Cache válido até" value={result.cache_valid_until ? new Date(result.cache_valid_until).toLocaleString("pt-BR") : null} />
      </CardContent>
    </Card>
  );
}