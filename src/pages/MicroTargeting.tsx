import { useState, useEffect } from 'react';
import { useMotherDuckQuery } from '@/hooks/useMotherDuckQuery';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Users, UserX, UserCheck, Target, GraduationCap } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const MUNICIPIOS = ['GOIÂNIA', 'APARECIDA DE GOIÂNIA'] as const;
type Municipio = typeof MUNICIPIOS[number];

const SARELLI_RED = 'hsl(0, 72%, 50%)';
const CHART_PALETTE = [
  'hsl(190, 80%, 45%)',
  'hsl(338, 72%, 60%)',
  'hsl(45, 93%, 50%)',
  'hsl(156, 72%, 40%)',
  'hsl(280, 60%, 55%)',
  'hsl(200, 80%, 55%)',
];

function fmt(n: number | string | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-BR');
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1).replace('.', ',')}%`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0];
  return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground">{d.name}</p>
      <p style={{ color: d.payload.fill }}>{fmt(d.value)}</p>
    </div>
  );
};

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

// ── Donut Chart Card ──
function DonutCard({
  title,
  icon: Icon,
  sql,
  queryKey,
}: {
  title: string;
  icon: React.ElementType;
  sql: string;
  queryKey: string[];
}) {
  const { data, isLoading, error } = useMotherDuckQuery(sql, queryKey);

  useEffect(() => {
    if (error) toast.error(`Erro: ${error.message}`);
  }, [error]);

  const chartData = (data?.rows || []).map((r: any, i: number) => ({
    name: r.categoria,
    value: Number(r.total),
    fill: CHART_PALETTE[i % CHART_PALETTE.length],
  }));

  return (
    <div className="bg-card rounded-lg border border-border/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Skeleton className="w-44 h-44 rounded-full" />
          <div className="space-y-1 w-full">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sem dados disponíveis</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
                strokeWidth={0}
              >
                {chartData.map((entry: any, i: number) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>

          <div className="mt-3 space-y-1.5">
            {chartData.map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="font-semibold metric-value ml-2 shrink-0">{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ──
export default function MicroTargeting() {
  const [cidade, setCidade] = useState<Municipio>('GOIÂNIA');

  const generoSql = `SELECT ds_genero as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_genero`;
  const escolaridadeSql = `SELECT ds_grau_escolaridade as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_grau_escolaridade ORDER BY total DESC LIMIT 5`;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
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

      {/* Demographics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutCard
          title="Gênero do Eleitorado"
          icon={Users}
          sql={generoSql}
          queryKey={['donut-genero', cidade]}
        />
        <DonutCard
          title="Escolaridade (Top 5)"
          icon={GraduationCap}
          sql={escolaridadeSql}
          queryKey={['donut-escolaridade', cidade]}
        />
      </div>
    </div>
  );
}
