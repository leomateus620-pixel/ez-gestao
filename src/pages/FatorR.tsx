import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export default function FatorR() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [c, r, l] = await Promise.all([
        supabase.from('fator_r_companies').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('fator_r_monthly_results').select('*').order('reference_year', { ascending: false }).limit(50),
        supabase.from('fator_r_processing_logs').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      setCompanies(c.data ?? []); setResults(r.data ?? []); setLogs(l.data ?? []);
    };
    load();
  }, []);

  const stats = useMemo(() => ({
    monitored: companies.length,
    attention: results.filter((r) => r.status === 'attention').length,
    critical: results.filter((r) => r.status === 'critical').length,
    safe: results.filter((r) => r.status === 'safe').length,
  }), [companies, results]);

  return <div className="space-y-6 animate-fade-in">
    <PageHeader title="Monitoramento de Fator R" subtitle="Acompanhamento automático dos extratos PGDAS e alertas preventivos por e-mail.">
      <Button variant="outline">Rodar verificação agora</Button>
    </PageHeader>

    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {[
        ['Empresas monitoradas', stats.monitored], ['Em atenção', stats.attention], ['Críticas', stats.critical], ['Seguras', stats.safe], ['Resultados', results.length],
      ].map(([k,v]) => <Card key={String(k)}><CardHeader><CardTitle className="text-sm">{k}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{String(v)}</CardContent></Card>)}
    </div>

    <Card><CardHeader><CardTitle>Status da integração</CardTitle></CardHeader><CardContent className="flex gap-2 flex-wrap">
      <Badge>Drive configurável</Badge><Badge variant="secondary">E-mail configurável</Badge><Badge variant="outline">Automação ativa por agendamento</Badge>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Empresas monitoradas</CardTitle></CardHeader><CardContent className="space-y-2">
      {companies.map((company) => <div key={company.id} className="flex justify-between border-b pb-2 text-sm"><span>{company.name}</span><span>{company.cnpj ?? '—'}</span></div>)}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Logs de processamento</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      {logs.map((log) => <div key={log.id} className="flex justify-between"><span>{log.event_type}: {log.message}</span><span>{new Date(log.created_at).toLocaleString('pt-BR')}</span></div>)}
    </CardContent></Card>
  </div>;
}
