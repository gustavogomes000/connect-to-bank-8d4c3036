import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { mdQuery, getTableName, getAnosDisponiveis, isEleicaoGeral } from '@/lib/motherduck';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Search, User, Landmark, GraduationCap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { traduzirSituacao } from '@/lib/eleicoes';

/**
 * Busca candidatos de TODOS os anos (2014-2024) via UNION ALL.
 * Para eleições gerais (2014,2018,2022), não filtra por município na tabela de candidatos.
 * Deduplica por nome completo, mantendo a entrada mais recente.
 */
function useCandidatos() {
  const municipio = useFilterStore((s) => s.municipio);
  const cargo = useFilterStore((s) => s.cargo);
  const partido = useFilterStore((s) => s.partido);

  return useQuery({
    queryKey: ['candidatos-md-todos', municipio, cargo, partido],
    queryFn: async () => {
      const anos = getAnosDisponiveis('candidatos'); // [2014,2016,2018,2020,2022,2024]
      const unions: string[] = [];

      for (const ano of anos) {
        const tab = getTableName('candidatos', ano);
        const geral = isEleicaoGeral(ano);
        const conds: string[] = [`SG_UF = 'GO'`];

        // Eleições municipais: filtrar por município. Gerais: não filtrar.
        if (!geral) conds.push(`NM_UE = '${municipio}'`);
        conds.push(`NR_TURNO = 1`);
        if (cargo) conds.push(`DS_CARGO = '${cargo}'`);
        if (partido) conds.push(`SG_PARTIDO = '${partido}'`);

        unions.push(`
          SELECT
            SQ_CANDIDATO AS id,
            NM_CANDIDATO AS nome_completo,
            NM_URNA_CANDIDATO AS nome_urna,
            DS_CARGO AS cargo,
            NR_CANDIDATO AS numero_urna,
            SG_PARTIDO AS sigla_partido,
            DS_SIT_TOT_TURNO AS situacao_final,
            DS_GRAU_INSTRUCAO AS grau_instrucao,
            DS_GENERO AS genero,
            DS_COR_RACA AS cor_raca,
            DS_OCUPACAO AS ocupacao,
            DT_NASCIMENTO AS data_nascimento,
            NM_PARTIDO AS nome_partido,
            ${ano} AS ano_eleicao
          FROM ${tab}
          WHERE ${conds.join(' AND ')}
        `);
      }

      const sql = `
        WITH todos AS (${unions.join(' UNION ALL ')})
        SELECT DISTINCT ON (nome_completo) *
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY nome_completo ORDER BY ano_eleicao DESC) AS rn
          FROM todos
        )
        WHERE rn = 1
        ORDER BY nome_urna
      `;

      const rows = await mdQuery<any>(sql);
      return rows;
    },
    enabled: !!municipio,
    staleTime: 5 * 60_000,
  });
}

export default function PerfilCandidatos() {
  const { data: candidatos, isLoading, isError } = useCandidatos();
  const { municipio } = useFilterStore();
  const [busca, setBusca] = useState('');

  const filtered = useMemo(() => {
    if (!candidatos) return [];
    if (!busca) return candidatos;
    const q = busca.toLowerCase();
    return candidatos.filter((c: any) =>
      c.nome_completo?.toLowerCase().includes(q) ||
      c.nome_urna?.toLowerCase().includes(q) ||
      c.sigla_partido?.toLowerCase().includes(q) ||
      c.cargo?.toLowerCase().includes(q) ||
      c.numero_urna?.toString().includes(q)
    );
  }, [candidatos, busca]);

  const porCargo = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const c of filtered) {
      const cargo = c.cargo || 'Outros';
      if (!map.has(cargo)) map.set(cargo, []);
      map.get(cargo)!.push(c);
    }
    const order = ['PREFEITO', 'VICE-PREFEITO', 'VEREADOR', 'DEPUTADO ESTADUAL', 'DEPUTADO FEDERAL', 'SENADOR', 'GOVERNADOR'];
    return Array.from(map.entries()).sort((a, b) => {
      const ia = order.indexOf(a[0].toUpperCase());
      const ib = order.indexOf(b[0].toUpperCase());
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold text-foreground">Painel de Candidatos</h1>
        <Card><CardContent className="p-8 text-center">
          <User className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Erro ao carregar candidatos. Tente novamente.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Painel de Candidatos</h1>
          <p className="text-xs text-muted-foreground">{municipio} — Todos os anos (2014–2024) • Fonte: TSE / MotherDuck</p>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {filtered.length} candidatos
        </Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, partido, cargo ou número..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {porCargo.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <User className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum candidato encontrado.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {porCargo.map(([cargo, lista]) => (
            <div key={cargo}>
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{cargo}</h2>
                <Badge variant="outline" className="text-[9px] h-4">{lista.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {lista.map((c: any) => (
                  <CandidatoCard key={`${c.id}-${c.ano_eleicao}`} c={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getSitColor(sit: string | null) {
  if (!sit) return 'bg-muted text-muted-foreground';
  const s = sit.toUpperCase();
  if (s.includes('ELEIT') || s.includes('MÉDIA')) return 'bg-green-100 text-green-700 border-green-200';
  if (s.includes('TURNO') || s.includes('2º')) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (s.includes('SUPLENTE')) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (s.includes('NÃO ELEIT')) return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-muted text-muted-foreground';
}

function calcIdade(nasc: string | null): number | null {
  if (!nasc) return null;
  try {
    const parts = nasc.split('/');
    if (parts.length === 3) {
      const dt = new Date(+parts[2], +parts[1] - 1, +parts[0]);
      return Math.floor((Date.now() - dt.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    }
    const dt = new Date(nasc);
    if (!isNaN(dt.getTime())) return Math.floor((Date.now() - dt.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return null;
  } catch { return null; }
}

function CandidatoCard({ c }: { c: any }) {
  const idade = calcIdade(c.data_nascimento);

  return (
    <Link to={`/candidato/${c.id}/${c.ano_eleicao}`} className="block">
      <Card className="border-border/50 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <User className="w-5 h-5 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-xs font-bold truncate group-hover:text-primary transition-colors">
                  {c.nome_urna || c.nome_completo}
                </p>
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {c.nome_urna && c.nome_completo && c.nome_completo !== c.nome_urna && (
                <p className="text-[10px] text-muted-foreground truncate">{c.nome_completo}</p>
              )}

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[9px] h-4 font-bold">{c.sigla_partido}</Badge>
                <span className="text-[10px] text-muted-foreground font-mono">Nº {c.numero_urna}</span>
                {c.ano_eleicao && (
                  <Badge variant="outline" className="text-[8px] h-4 font-mono">{c.ano_eleicao}</Badge>
                )}
                {c.situacao_final && (
                  <Badge className={cn("text-[8px] h-4 border", getSitColor(c.situacao_final))}>
                    {traduzirSituacao(c.situacao_final)}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                {c.genero && <span>{c.genero}</span>}
                {idade && <span>• {idade} anos</span>}
                {c.grau_instrucao && (
                  <span className="flex items-center gap-0.5">
                    <GraduationCap className="w-3 h-3" />{c.grau_instrucao}
                  </span>
                )}
              </div>
              {c.ocupacao && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.ocupacao}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
