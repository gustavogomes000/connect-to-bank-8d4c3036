import { useDataAvailability } from '@/hooks/useEleicoes';
import { useQuery } from '@tanstack/react-query';
import { mdQuery } from '@/lib/motherduck';
import { formatNumber } from '@/lib/eleicoes';
import { Database, CheckCircle, XCircle, Loader2, Settings, Server, HardDrive, Table2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

function MotherDuckStatus() {
  const { data: tabelas, isLoading, error } = useQuery({
    queryKey: ['md-status-tables'],
    queryFn: async () => {
      const rows = await mdQuery<{table_name: string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_catalog = 'my_db' ORDER BY table_name`);
      const counts: {name: string; count: number}[] = [];
      // Get counts for a sample of tables (first 20)
      for (const r of rows.slice(0, 20)) {
        try {
          const [c] = await mdQuery<{total: string}>(`SELECT count(*) as total FROM my_db.${r.table_name}`);
          counts.push({ name: r.table_name, count: Number(c?.total || 0) });
        } catch {
          counts.push({ name: r.table_name, count: 0 });
        }
      }
      return { total: rows.length, tabelas: counts, allNames: rows.map(r => r.table_name) };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="bg-card rounded-lg border border-border/50 p-6 flex items-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Conectando ao MotherDuck...</span>
    </div>
  );

  if (error) return (
    <div className="bg-card rounded-lg border border-destructive/30 p-6">
      <div className="flex items-center gap-3">
        <XCircle className="w-5 h-5 text-destructive" />
        <div>
          <p className="text-sm font-semibold text-destructive">Erro na conexão MotherDuck</p>
          <p className="text-xs text-muted-foreground mt-1">{(error as any).message}</p>
        </div>
      </div>
    </div>
  );

  if (!tabelas || tabelas.total === 0) return (
    <div className="bg-card rounded-lg border border-warning/30 p-6">
      <div className="flex items-center gap-3">
        <Database className="w-5 h-5 text-warning" />
        <p className="text-sm text-muted-foreground">Nenhuma tabela encontrada no MotherDuck</p>
      </div>
    </div>
  );

  const totalRegistros = tabelas.tabelas.reduce((s, t) => s + t.count, 0);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border border-success/30 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">MotherDuck Conectado</p>
            <p className="text-xs text-muted-foreground">
              {tabelas.total} tabelas • {formatNumber(totalRegistros)} registros (amostra)
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border/50 p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Categorias de Dados ({tabelas.total} tabelas)
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {['candidatos', 'bens_candidatos', 'votacao_munzona', 'votacao_partido', 'votacao_secao',
            'comparecimento_munzona', 'comparecimento_abstencao', 'perfil_eleitorado', 'perfil_eleitor_secao',
            'eleitorado_local', 'receitas', 'despesas', 'coligacoes', 'vagas', 'redes_sociais',
            'mesarios', 'boletim_urna', 'cassacoes', 'pesquisas'].map(cat => {
            const count = tabelas.allNames.filter(n => n.startsWith(cat)).length;
            return count > 0 ? (
              <Badge key={cat} variant="secondary" className="text-[10px] py-0.5">
                <Table2 className="w-2.5 h-2.5 mr-1" />
                {cat} <span className="ml-1 opacity-60">({count})</span>
              </Badge>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}

function SupabaseStatus() {
  const { data: availability, isLoading } = useDataAvailability();

  if (isLoading) return (
    <div className="bg-card rounded-lg border border-border/50 p-6 flex items-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Verificando Supabase...</span>
    </div>
  );

  return (
    <div className="bg-card rounded-lg border border-border/50 p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Supabase (Backend/Auth)</h3>
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-success" />
        <span className="text-sm text-foreground">Conectado — usado para autenticação e logs</span>
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
        <p className="text-xs text-muted-foreground mt-1">Painel administrativo — conexões e status</p>
      </div>

      <Tabs defaultValue="motherduck" className="space-y-4">
        <TabsList>
          <TabsTrigger value="motherduck"><HardDrive className="w-3.5 h-3.5 mr-1" /> MotherDuck</TabsTrigger>
          <TabsTrigger value="supabase"><Server className="w-3.5 h-3.5 mr-1" /> Supabase</TabsTrigger>
        </TabsList>

        <TabsContent value="motherduck" className="space-y-4">
          <MotherDuckStatus />
        </TabsContent>

        <TabsContent value="supabase" className="space-y-4">
          <SupabaseStatus />
        </TabsContent>
      </Tabs>
    </div>
  );
}
