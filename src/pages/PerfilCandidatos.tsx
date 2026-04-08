import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { mdQuery, getTableName, getAnosDisponiveis } from '@/lib/motherduck';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Search, User, MapPin, Landmark, GraduationCap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function useBuscaCandidatos() {
  const ano = useFilterStore((s) => s.ano);
  const municipio = useFilterStore((s) => s.municipio);

  return useQuery({
    queryKey: ['candidatos-busca', ano, municipio],
    queryFn: async () => {
      if (!getAnosDisponiveis('candidatos').includes(ano)) return [];
      const tab = getTableName('candidatos', ano);
      const rows = await mdQuery<any>(`
        SELECT
          SQ_CANDIDATO AS id,
          NM_CANDIDATO AS nome,
          NM_URNA_CANDIDATO AS nome_urna,
          DS_CARGO AS cargo,
          NR_CANDIDATO AS numero,
          SG_PARTIDO AS partido,
          DS_SIT_TOT_TURNO AS situacao,
          DS_GRAU_INSTRUCAO AS instrucao,
          DS_GENERO AS genero,
          DS_COR_RACA AS cor_raca,
          DS_OCUPACAO AS ocupacao,
          DT_NASCIMENTO AS nascimento
        FROM ${tab}
        WHERE SG_UF = 'GO'
          AND NM_MUNICIPIO = '${municipio}'
          AND NR_TURNO = 1
        ORDER BY NM_URNA_CANDIDATO
      `);
      return rows;
    },
    enabled: !!municipio,
    staleTime: 5 * 60_000,
  });
}

export default function PerfilCandidatos() {
  const { data: candidatos, isLoading } = useBuscaCandidatos();
  const { municipio, ano } = useFilterStore();
  const [busca, setBusca] = useState('');

  const filtered = useMemo(() => {
    if (!candidatos) return [];
    if (!busca) return candidatos;
    const q = busca.toLowerCase();
    return candidatos.filter((c: any) =>
      c.nome?.toLowerCase().includes(q) ||
      c.nome_urna?.toLowerCase().includes(q) ||
      c.partido?.toLowerCase().includes(q) ||
      c.cargo?.toLowerCase().includes(q) ||
      c.numero?.toString().includes(q)
    );
  }, [candidatos, busca]);

  // Agrupa por cargo
  const porCargo = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const c of filtered) {
      const cargo = c.cargo || 'Outros';
      if (!map.has(cargo)) map.set(cargo, []);
      map.get(cargo)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Perfil de Candidatos</h1>
          <p className="text-xs text-muted-foreground">{municipio} — {ano} • Fonte: TSE</p>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {filtered.length} candidatos
        </Badge>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, partido, cargo ou número..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Lista por cargo */}
      {porCargo.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <User className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum candidato encontrado.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {porCargo.map(([cargo, candidatosCargo]) => (
            <div key={cargo}>
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{cargo}</h2>
                <Badge variant="outline" className="text-[9px] h-4">{candidatosCargo.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {candidatosCargo.map((c: any) => (
                  <CandidatoCard key={c.id} candidato={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getSituacaoColor(sit: string | null) {
  if (!sit) return 'bg-muted text-muted-foreground';
  const s = sit.toUpperCase();
  if (s.includes('ELEIT') || s.includes('MÉDIA')) return 'bg-green-100 text-green-700 border-green-200';
  if (s.includes('TURNO') || s.includes('2º')) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (s.includes('SUPLENTE')) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (s.includes('NÃO ELEIT')) return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-muted text-muted-foreground';
}

function CandidatoCard({ candidato: c }: { candidato: any }) {
  const idade = c.nascimento ? calcularIdade(c.nascimento) : null;

  return (
    <Link to={`/candidato/${c.id}`} className="block">
      <Card className="border-border/50 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <User className="w-5 h-5 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              {/* Nome e número */}
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold truncate group-hover:text-primary transition-colors">
                  {c.nome_urna || c.nome}
                </p>
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {c.nome_urna && c.nome !== c.nome_urna && (
                <p className="text-[10px] text-muted-foreground truncate">{c.nome}</p>
              )}

              {/* Partido e número */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[9px] h-4 font-bold">{c.partido}</Badge>
                <span className="text-[10px] text-muted-foreground font-mono">Nº {c.numero}</span>
                {c.situacao && (
                  <Badge className={cn("text-[8px] h-4 border", getSituacaoColor(c.situacao))}>
                    {c.situacao}
                  </Badge>
                )}
              </div>

              {/* Detalhes */}
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                {c.genero && <span>{c.genero}</span>}
                {idade && <span>• {idade} anos</span>}
                {c.instrucao && (
                  <span className="flex items-center gap-0.5">
                    <GraduationCap className="w-3 h-3" />{c.instrucao}
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

function calcularIdade(nascimento: string): number | null {
  try {
    const parts = nascimento.split('/');
    if (parts.length === 3) {
      const dt = new Date(+parts[2], +parts[1] - 1, +parts[0]);
      const diff = Date.now() - dt.getTime();
      return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    }
    return null;
  } catch { return null; }
}
