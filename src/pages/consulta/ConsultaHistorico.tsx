import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLookupHistory } from "@/features/consulta/hooks/useLookup";
import { StatusBadge } from "@/features/consulta/components/StatusBadge";
import { maskCnpj } from "@/features/consulta/services/cnpj-utils";

export default function ConsultaHistorico() {
  const { data, isLoading } = useLookupHistory();

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header><h1 className="text-2xl font-bold tracking-tight">Histórico de consultas</h1></header>
      <Card>
        <CardHeader><CardTitle className="text-base">Últimas requisições</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="cnpj">
            <TabsList>
              <TabsTrigger value="cnpj">CNPJ ({data?.cnpj.length ?? 0})</TabsTrigger>
              <TabsTrigger value="cnd">CND ({data?.cnd.length ?? 0})</TabsTrigger>
            </TabsList>
            <TabsContent value="cnpj">
              <HistoryTable rows={data?.cnpj || []} loading={isLoading} />
            </TabsContent>
            <TabsContent value="cnd">
              <HistoryTable rows={data?.cnd || []} loading={isLoading} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>CNPJ</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Cache</TableHead>
          <TableHead>Solicitado</TableHead>
          <TableHead>Concluído</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && <TableRow><TableCell colSpan={5}>Carregando…</TableCell></TableRow>}
        {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5}>Sem registros.</TableCell></TableRow>}
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono">{maskCnpj(r.cnpj_normalized)}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
            <TableCell>{r.from_cache ? "Sim" : "—"}</TableCell>
            <TableCell>{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
            <TableCell>{r.finished_at ? new Date(r.finished_at).toLocaleString("pt-BR") : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}