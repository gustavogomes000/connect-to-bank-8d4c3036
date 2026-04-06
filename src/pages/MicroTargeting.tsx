import { useState, useEffect } from 'react';
import { useMotherDuckQuery } from '@/hooks/useMotherDuckQuery';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Users, UserX, UserCheck, Target } from 'lucide-react';

const MUNICIPIOS = ['GOIÂNIA', 'APARECIDA DE GOIÂNIA'] as const;
type Municipio = typeof MUNICIPIOS[number];

const SARELLI_RED = 'hsl(0, 72%, 50%)';
const BAR_FG = 'hsl(0, 0%, 40%)';
const BAR_BG = 'hsl(0, 0%, 16%)';

function fmt(n: number | string | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-BR');
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1).replace('.', ',')}%`;
}

// ── KPIs Section ──
function KPIAbstencao({ cidade }: { cidade: Municipio }) {
  const sql = `SELECT sum(qt_aptos) as aptos, sum(qt_comparecimento) as comparecimento, sum(qt_abstencoes) as abstencao FROM my_db.comparecimento_munzona_2024_GO WHERE nm_municipio = '${cidade}'`;
  const { data, isLoading, error } = useMotherDuckQuery(sql, ['kpi-abstencao', cidade]);

  useEffect(() => {
    if (error) toast.error(`Erro nos KPIs: ${error.message}`);
  }, [error]);

  const row = data?.rows?.[0];
  const aptos = row ? Number(row.aptos) : 0;
  const comparecimento = row ? Number(row.comparecimento) : 0;
  const abstencao = row ? Number(row.abstencao) : 0;
  const taxaAbstencao = aptos > 0 ? (abstencao / aptos) * 100 : 0;
  const taxaComparecimento = aptos > 0 ? (comparecimento / aptos) * 100 : 0;

  const cards = [
    { label: 'Eleitorado Apto', value: fmt(aptos), icon: Users, color: 'text-[hsl(var(--info))]', bg: 'bg-[hsl(var(--info))]/10' },
    { label: 'Comparecimento', value: fmt(comparecimento), sub: fmtPct(taxaComparecimento), icon: UserCheck, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Abstenção', value: fmt(abstencao), sub: fmtPct(taxaAbstencao), icon: UserX, color: 'text-destructive', bg: 'bg-destructive/10', highlight: true },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map((kpi) => (
        <div
          key={kpi.label}
          className={`bg-card rounded-lg border p-4 transition-all ${
            kpi.highlight ? 'border-destructive/40 shadow-[0_0_20px_-5px_hsl(0,72%,50%,0.25)]' : 'border-border/50'
          }`}
        >
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-md ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{kpi.label}</span>
              </div>
              <p className={`font-bold metric-value ${kpi.highlight ? 'text-3xl' : 'text-2xl'}`} style={kpi.highlight ? { color: SARELLI_RED } : undefined}>
                {kpi.value}
              </p>
              {kpi.sub && (
                <p className={`text-sm font-semibold mt-0.5 ${kpi.highlight ? 'text-destructive' : 'text-muted-foreground'}`} style={kpi.highlight ? { color: SARELLI_RED } : undefined}>
                  {kpi.highlight ? `Taxa: ${kpi.sub}` : kpi.sub}
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── High-density BarList block ──
function DenseBlock({
  title,
  sql,
  queryKey,
}: {
  title: string;
  sql: string;
  queryKey: string[];
}) {
  const { data, isLoading, error } = useMotherDuckQuery(sql, queryKey);

  useEffect(() => {
    if (error) toast.error(`Erro em ${title}: ${error.message}`);
  }, [error, title]);

  const rows = (data?.rows || []).map((r: any) => ({
    label: r.categoria as string,
    value: Number(r.total),
  }));

  const maxVal = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const totalVal = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="bg-card rounded-lg border border-border/50 p-4">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">{title}</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const pct = totalVal > 0 ? (r.value / totalVal) * 100 : 0;
            const barWidth = maxVal > 0 ? (r.value / maxVal) * 100 : 0;
            return (
              <div key={r.label}>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[11px] text-foreground/80 truncate mr-2 font-medium">{r.label}</span>
                  <div className="flex items-baseline gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground tabular-nums">{fmtPct(pct)}</span>
                    <span className="text-xs font-bold text-foreground tabular-nums metric-value">{fmt(r.value)}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: BAR_BG }}>
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${barWidth}%`, backgroundColor: BAR_FG }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export default function MicroTargeting() {
  const [cidade, setCidade] = useState<Municipio>('GOIÂNIA');

  const generoSql = `SELECT ds_genero as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_genero ORDER BY total DESC`;
  const faixaEtariaSql = `SELECT ds_faixa_etaria as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_faixa_etaria ORDER BY total DESC LIMIT 4`;
  const escolaridadeSql = `SELECT ds_grau_escolaridade as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_grau_escolaridade ORDER BY total DESC LIMIT 4`;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-5 h-5" style={{ color: SARELLI_RED }} />
            Painel Tático Territorial
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Micro-targeting — Dados reais 2024 via MotherDuck
          </p>
        </div>

        {/* Municipality Toggle */}
        <div className="flex items-center bg-card border border-border/50 rounded-lg p-0.5">
          {MUNICIPIOS.map((m) => (
            <button
              key={m}
              onClick={() => setCidade(m)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                cidade === m
                  ? 'text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              style={cidade === m ? { backgroundColor: SARELLI_RED } : undefined}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <KPIAbstencao cidade={cidade} />

      {/* Demographic Density Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DenseBlock title="Gênero" sql={generoSql} queryKey={['dense-genero', cidade]} />
        <DenseBlock title="Faixa Etária · Top 4" sql={faixaEtariaSql} queryKey={['dense-faixa', cidade]} />
        <DenseBlock title="Escolaridade · Top 4" sql={escolaridadeSql} queryKey={['dense-escolaridade', cidade]} />
      </div>
    </div>
  );
}
