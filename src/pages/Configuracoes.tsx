import { useTabelas } from '@/hooks/useBigQuery';
import { useDataAvailability } from '@/hooks/useEleicoes';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { formatNumber } from '@/lib/eleicoes';
import { Database, CheckCircle, XCircle, Loader2, Settings, Server, HardDrive } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function BigQueryStatus() {
  const { data: tabelas, isLoading, error } = useTabelas();

  if (isLoading) return (
    <div className="bg-card rounded-lg border border-border/50 p-6 flex items-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Conectando ao BigQuery...</span>
    </div>
  );

  if (error) return (
    <div className="bg-card rounded-lg border border-destructive/30 p-6">
      <div className="flex items-center gap-3">
        <XCircle className="w-5 h-5 text-destructive" />
        <div>
          <p className="text-sm font-semibold text-destructive">Erro na conexão BigQuery</p>
          <p className="text-xs text-muted-foreground mt-1">{(error as any).message}</p>
        </div>
      </div>
    </div>
  );

  if (!tabelas || tabelas.length === 0) return (
    <div className="bg-card rounded-lg border border-warning/30 p-6">
      <div className="flex items-center gap-3">
        <Database className="w-5 h-5 text-warning" />
        <p className="text-sm text-muted-foreground">Nenhuma tabela encontrada no BigQuery</p>
      </div>
    </div>
  );

  const totalLinhas = tabelas.reduce((s, t) => s + Number(t.linhas), 0);
  const totalMB = tabelas.reduce((s, t) => s + Number(t.tamanho_mb), 0);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border border-success/30 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">BigQuery Conectado</p>
            <p className="text-xs text-muted-foreground">
              {tabelas.length} tabelas • {formatNumber(totalLinhas)} registros • {totalMB.toFixed(0)} MB
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30 bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tabela</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Registros</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Tamanho (MB)</th>
            </tr>
          </thead>
          <tbody>
            {tabelas.map((t) => (
              <tr key={t.nome} className="border-b border-border/20 last:border-0">
                <td className="px-4 py-2 font-mono text-foreground">{t.nome}</td>
                <td className="px-4 py-2 text-right metric-value">{Number(t.linhas).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{Number(t.tamanho_mb).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupabaseStatus() {
  const { data: availability, isLoading } = useDataAvailability();

  const tables = [
    { key: 'candidatos', label: 'Candidatos', table: 'bd_eleicoes_candidatos' },
    { key: 'votacao', label: 'Votação', table: 'bd_eleicoes_votacao' },
    { key: 'comparecimento', label: 'Comparecimento', table: 'bd_eleicoes_comparecimento' },
    { key: 'bens', label: 'Bens', table: 'bd_eleicoes_bens_candidatos' },
    { key: 'partido', label: 'Votação Partido', table: 'bd_eleicoes_votacao_partido' },
    { key: 'locais', label: 'Locais de Votação', table: 'bd_eleicoes_locais_votacao' },
    { key: 'secao', label: 'Comparecimento Seção', table: 'bd_eleicoes_comparecimento_secao' },
  ];

  if (isLoading) return (
    <div className="bg-card rounded-lg border border-border/50 p-6 flex items-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Verificando tabelas Supabase...</span>
    </div>
  );

  return (
    <div className="bg-card rounded-lg border border-border/50 p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status das Tabelas Supabase</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {tables.map((t) => {
          const hasData = (availability as any)?.[t.key];
          return (
            <div key={t.key} className={`rounded-lg border p-3 ${hasData ? 'border-success/30 bg-success/5' : 'border-border/30'}`}>
              <div className="flex items-center gap-2 mb-1">
                {hasData ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground/50" />}
                <span className="text-xs font-medium">{t.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{t.table}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Configuracoes() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" /> Configurações do Sistema
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Painel administrativo — conexões, importação e status</p>
      </div>

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status"><Server className="w-3.5 h-3.5 mr-1" /> Status</TabsTrigger>
          <TabsTrigger value="bigquery"><HardDrive className="w-3.5 h-3.5 mr-1" /> BigQuery</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          <SupabaseStatus />
        </TabsContent>

        <TabsContent value="bigquery" className="space-y-4">
          <BigQueryStatus />
        </TabsContent>
      </Tabs>
    </div>
  );
}
