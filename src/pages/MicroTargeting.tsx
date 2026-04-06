import { useState } from 'react';
import { useMotherDuckQuery } from '@/hooks/useMotherDuckQuery';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Target, Users, UserCheck, UserX, type LucideIcon } from 'lucide-react';

const MUNICIPIOS = ['GOIÂNIA', 'APARECIDA DE GOIÂNIA'] as const;
type Municipio = typeof MUNICIPIOS[number];
type Tone = 'primary' | 'success' | 'destructive';

type ListRow = {
  label: string;
  value: number;
};

function fmt(n: number | string | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-BR');
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1).replace('.', ',')}%`;
}

function toneClasses(tone: Tone) {
  if (tone === 'success') {
    return {
      icon: 'bg-success/10 text-success',
      value: 'text-foreground',
      border: 'border-border/50',
      sub: 'text-muted-foreground',
    };
  }

  if (tone === 'destructive') {
    return {
      icon: 'bg-destructive/10 text-destructive',
      value: 'text-destructive',
      border: 'border-destructive/30',
      sub: 'text-destructive',
    };
  }

  return {
    icon: 'bg-primary/10 text-primary',
    value: 'text-foreground',
    border: 'border-border/50',
    sub: 'text-muted-foreground',
  };
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <span>{message}</span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  const styles = toneClasses(tone);

  return (
    <div className={`rounded-xl border bg-card p-4 ${styles.border}`}>
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
      </div>

      <p className={`metric-value text-3xl font-semibold ${styles.value}`}>{value}</p>
      {subtitle ? <p className={`mt-1 text-sm ${styles.sub}`}>{subtitle}</p> : null}
    </div>
  );
}

function KpiSection({ cidade }: { cidade: Municipio }) {
  const sql = `SELECT sum(qt_aptos) as aptos, sum(qt_comparecimento) as comparecimento, sum(qt_abstencoes) as abstencao FROM my_db.comparecimento_munzona_2024_GO WHERE nm_municipio = '${cidade}'`;
  const { data, isLoading, error } = useMotherDuckQuery(sql, ['micro-kpis', cidade]);

  if (error) {
    return <ErrorState message={`Não foi possível carregar os indicadores de ${cidade}.`} />;
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="rounded-xl border border-border/50 bg-card p-4">
            <Skeleton className="mb-3 h-5 w-24" />
            <Skeleton className="mb-2 h-9 w-36" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const row = data?.rows?.[0];
  const aptos = row ? Number(row.aptos) : 0;
  const comparecimento = row ? Number(row.comparecimento) : 0;
  const abstencao = row ? Number(row.abstencao) : 0;

  const taxaComparecimento = aptos > 0 ? (comparecimento / aptos) * 100 : 0;
  const taxaAbstencao = aptos > 0 ? (abstencao / aptos) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <KpiCard title="Eleitorado apto" value={fmt(aptos)} icon={Users} tone="primary" />
      <KpiCard title="Comparecimento" value={fmt(comparecimento)} subtitle={fmtPct(taxaComparecimento)} icon={UserCheck} tone="success" />
      <KpiCard title="Abstenção" value={fmt(abstencao)} subtitle={fmtPct(taxaAbstencao)} icon={UserX} tone="destructive" />
    </div>
  );
}

function BreakdownCard({
  title,
  description,
  sql,
  queryKey,
}: {
  title: string;
  description: string;
  sql: string;
  queryKey: string[];
}) {
  const { data, isLoading, error } = useMotherDuckQuery(sql, queryKey);

  const rows: ListRow[] = (data?.rows || []).map((r: any) => ({
    label: String(r.categoria || 'Não informado'),
    value: Number(r.total || 0),
  }));

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = rows.reduce((sum, row) => Math.max(sum, row.value), 0);

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      {error ? (
        <ErrorState message={`Não foi possível carregar ${title.toLowerCase()}.`} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados disponíveis.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const share = total > 0 ? (row.value / total) * 100 : 0;
            const width = max > 0 ? (row.value / max) * 100 : 0;

            return (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-foreground">{row.label}</span>
                  <div className="shrink-0 text-right">
                    <div className="metric-value font-medium text-foreground">{fmt(row.value)}</div>
                    <div className="text-xs text-muted-foreground">{fmtPct(share)}</div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary/70" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MicroTargeting() {
  const [cidade, setCidade] = useState<Municipio>('GOIÂNIA');

  const generoSql = `SELECT ds_genero as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_genero ORDER BY total DESC`;
  const faixaEtariaSql = `SELECT ds_faixa_etaria as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_faixa_etaria ORDER BY total DESC LIMIT 4`;
  const escolaridadeSql = `SELECT ds_grau_escolaridade as categoria, sum(qt_eleitores_perfil) as total FROM my_db.perfil_eleitorado_2024_GO WHERE nm_municipio = '${cidade}' GROUP BY ds_grau_escolaridade ORDER BY total DESC LIMIT 4`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-2xl border border-border/50 bg-card p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Painel territorial</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Comparecimento e perfil do eleitorado de 2024 para Goiânia e Aparecida de Goiânia.
            </p>
          </div>

          <div className="inline-flex w-full rounded-xl border border-border bg-muted p-1 md:w-auto">
            {MUNICIPIOS.map((m) => {
              const active = cidade === m;
              return (
                <button
                  key={m}
                  onClick={() => setCidade(m)}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors md:flex-none ${
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m === 'GOIÂNIA' ? 'Goiânia' : 'Aparecida'}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <KpiSection cidade={cidade} />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <BreakdownCard
          title="Gênero"
          description="Distribuição do eleitorado por gênero."
          sql={generoSql}
          queryKey={['micro-genero', cidade]}
        />
        <BreakdownCard
          title="Faixa etária"
          description="Quatro maiores grupos etários do município."
          sql={faixaEtariaSql}
          queryKey={['micro-faixa', cidade]}
        />
        <BreakdownCard
          title="Escolaridade"
          description="Níveis de escolaridade com maior volume."
          sql={escolaridadeSql}
          queryKey={['micro-escolaridade', cidade]}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        Fonte: MotherDuck · comparecimento_munzona_2024_GO e perfil_eleitorado_2024_GO.
      </p>
    </div>
  );
}
