import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEscolas } from '@/hooks/useEscolas';
import { useFilterStore } from '@/stores/filterStore';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Users, School, MapPin, ChevronDown, ChevronRight, HandHelping } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingKPIs, LoadingCards } from '@/components/eleicoes/LoadingSection';

const fmt = (n: number) => n.toLocaleString('pt-BR');

function estimarIdade(faixa: string | null): number | null {
  if (!faixa) return null;
  const map: Record<string, number> = {
    '16 anos': 16, '17 anos': 17, '18 anos': 18, '19 anos': 19, '20 anos': 20,
    '21 a 24 anos': 22, '25 a 29 anos': 27, '30 a 34 anos': 32,
    '35 a 39 anos': 37, '40 a 44 anos': 42, '45 a 49 anos': 47,
    '50 a 54 anos': 52, '55 a 59 anos': 57, '60 a 64 anos': 62,
    '65 a 69 anos': 67, '70 a 74 anos': 72, '75 a 79 anos': 77,
    '80 a 84 anos': 82, '85 a 89 anos': 87, '90 a 94 anos': 92,
    '95 a 99 anos': 97, '100 anos ou mais': 100,
  };
  for (const [k, v] of Object.entries(map)) {
    if (faixa.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return null;
}

function useMesariosData() {
  const ano = useFilterStore((s) => s.ano);
  const municipio = useFilterStore((s) => s.municipio);
  const zona = useFilterStore((s) => s.zona);

  const mesarios = useQuery({
    queryKey: ['mesarios-all', ano, municipio, zona],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_mesarios').select('*').eq('ano', ano).eq('municipio', municipio);
      if (zona) q = q.eq('zona', zona);
      const { data, error } = await q.order('zona');
      if (error) throw error;
      return data || [];
    },
    enabled: !!municipio,
    staleTime: 10 * 60_000,
  });

  const funcoes = useQuery({
    queryKey: ['funcoes-all', ano, municipio, zona],
    queryFn: async () => {
      let q = supabase.from('bd_eleicoes_mesarios_funcoes_especiais').select('*').eq('ano', ano).eq('municipio', municipio);
      if (zona) q = q.eq('zona', zona);
      const { data, error } = await q.order('zona');
      if (error) throw error;
      return data || [];
    },
    enabled: !!municipio,
    staleTime: 10 * 60_000,
  });

  return { mesarios, funcoes };
}

interface EscolaCard {
  escola: string;
  bairro: string;
  zona: number;
  secoes: number;
  eleitores: number;
  totalMesarios: number;
  totalFuncoes: number;
  idadeMedia: number | null;
  generoResumo: { masc: number; fem: number; outro: number };
  voluntarios: number;
  compareceram: number;
  mesariosRaw: any[];
  funcoesRaw: any[];
}

export default function Mesarios() {
  const { data: escolasData, isLoading: loadEscolas } = useEscolas();
  const { mesarios: { data: mesarios, isLoading: loadM }, funcoes: { data: funcoes, isLoading: loadF } } = useMesariosData();
  const { municipio, ano, zona: zonaFiltro } = useFilterStore();
  const [busca, setBusca] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);

  const escolasReady = !loadEscolas;
  const mesariosReady = !loadM;

  const cards = useMemo(() => {
    const escolasList = escolasData?.dados || [];
    if (!escolasList.length) return [];

    const mesPorZona = new Map<number, any[]>();
    for (const m of (mesarios || [])) {
      const z = m.zona || 0;
      if (!mesPorZona.has(z)) mesPorZona.set(z, []);
      mesPorZona.get(z)!.push(m);
    }
    const funPorZona = new Map<number, any[]>();
    for (const f of (funcoes || [])) {
      const z = f.zona || 0;
      if (!funPorZona.has(z)) funPorZona.set(z, []);
      funPorZona.get(z)!.push(f);
    }

    return escolasList.map((e): EscolaCard => {
      const mes = mesPorZona.get(e.zona) || [];
      const fun = funPorZona.get(e.zona) || [];

      const totalMes = mes.reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
      const totalFun = fun.reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);

      let somaIdade = 0, pesoIdade = 0;
      for (const r of mes) {
        const idade = estimarIdade(r.faixa_etaria);
        if (idade !== null) {
          somaIdade += idade * (r.qt_convocados || 1);
          pesoIdade += (r.qt_convocados || 1);
        }
      }

      let masc = 0, fem = 0, outro = 0;
      for (const r of mes) {
        const g = (r.genero || '').toUpperCase();
        const qt = r.qt_convocados || 0;
        if (g === 'MASCULINO' || g === 'M') masc += qt;
        else if (g === 'FEMININO' || g === 'F') fem += qt;
        else outro += qt;
      }

      const vol = mes.filter((r: any) => r.voluntario === 'S' || r.voluntario === 'SIM').reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
      const comp = mes.filter((r: any) => r.comparecimento === 'S' || r.comparecimento === 'SIM').reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);

      return {
        escola: e.escola,
        bairro: e.setor || '',
        zona: e.zona,
        secoes: e.qtd_secoes || 0,
        eleitores: e.eleitores || 0,
        totalMesarios: totalMes,
        totalFuncoes: totalFun,
        idadeMedia: pesoIdade > 0 ? Math.round(somaIdade / pesoIdade) : null,
        generoResumo: { masc, fem, outro },
        voluntarios: vol,
        compareceram: comp,
        mesariosRaw: mes,
        funcoesRaw: fun,
      };
    }).sort((a, b) => b.totalMesarios - a.totalMesarios);
  }, [escolasData, mesarios, funcoes]);

  const filtered = useMemo(() => {
    if (!busca) return cards;
    const q = busca.toLowerCase();
    return cards.filter(e =>
      e.escola.toLowerCase().includes(q) ||
      e.bairro.toLowerCase().includes(q) ||
      e.zona.toString().includes(q)
    );
  }, [cards, busca]);

  const totalGeral = cards.reduce((s, e) => s + e.totalMesarios, 0);
  const totalEleitores = cards.reduce((s, e) => s + e.eleitores, 0);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-foreground">Mesários por Escola</h1>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            {municipio}{zonaFiltro ? ` • Zona ${zonaFiltro}` : ''} — {ano} • Fonte: TSE
          </p>
        </div>
        {escolasReady && mesariosReady && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{filtered.length} escolas</Badge>
            <Badge variant="outline" className="text-[10px]">{fmt(totalGeral)} mesários</Badge>
            <Badge variant="outline" className="text-[10px]">{fmt(totalEleitores)} eleitores</Badge>
          </div>
        )}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar escola, bairro ou zona..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9 h-9 text-sm w-full"
        />
      </div>

      {/* Loading state per section */}
      {loadEscolas ? (
        <LoadingCards count={6} />
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <School className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma escola encontrada.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e, idx) => {
            const key = `${e.escola}__${e.zona}`;
            const open = expandido === key;
            const totalGenero = e.generoResumo.masc + e.generoResumo.fem + e.generoResumo.outro;
            const pctFem = totalGenero > 0 ? Math.round((e.generoResumo.fem / totalGenero) * 100) : 0;
            const pctMasc = totalGenero > 0 ? Math.round((e.generoResumo.masc / totalGenero) * 100) : 0;

            const isMesariosLoading = loadM;

            return (
              <Card key={key} className="border-border/50 overflow-hidden animate-fade-in" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                <button onClick={() => setExpandido(open ? null : key)} className="w-full text-left">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <School className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate">{e.escola}</p>
                          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                          {e.bairro && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{e.bairro}</span>}
                          <span>Zona {e.zona}</span>
                          <span>{e.secoes} seções</span>
                          <span>{fmt(e.eleitores)} eleitores</span>
                        </div>

                        {isMesariosLoading ? (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-primary" />
                                <span className="text-sm font-bold text-primary">{fmt(e.totalMesarios)}</span>
                                <span className="text-[10px] text-muted-foreground">mesários</span>
                              </div>
                              {e.idadeMedia && (
                                <div className="text-[10px] text-muted-foreground">
                                  Idade média: <span className="font-semibold text-foreground">{e.idadeMedia} anos</span>
                                </div>
                              )}
                              {e.voluntarios > 0 && (
                                <div className="flex items-center gap-1 text-[10px]">
                                  <HandHelping className="w-3 h-3 text-green-500" />
                                  <span className="text-green-600 font-semibold">{fmt(e.voluntarios)} vol.</span>
                                </div>
                              )}
                              {e.totalFuncoes > 0 && (
                                <Badge variant="outline" className="text-[8px] h-4">{fmt(e.totalFuncoes)} funções esp.</Badge>
                              )}
                            </div>

                            {totalGenero > 0 && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[10px] mb-1">
                                  <span className="font-medium text-pink-500">♀ Feminino {pctFem}%</span>
                                  <span className="text-muted-foreground">{fmt(e.generoResumo.fem)} / {fmt(totalGenero)}</span>
                                  <span className="font-medium text-blue-500">♂ Masculino {pctMasc}%</span>
                                </div>
                                <div className="h-2 rounded-full overflow-hidden flex bg-muted">
                                  <div className="bg-pink-400 transition-all" style={{ width: `${pctFem}%` }} />
                                  <div className="bg-blue-400 transition-all" style={{ width: `${pctMasc}%` }} />
                                  {e.generoResumo.outro > 0 && (
                                    <div className="bg-muted-foreground/30 transition-all" style={{ width: `${100 - pctFem - pctMasc}%` }} />
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </button>
                {open && <Detalhe escola={e} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detalhe({ escola }: { escola: EscolaCard }) {
  const { mesariosRaw: mesarios, funcoesRaw: funcoes } = escola;

  const turnos = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const m of mesarios) {
      const t = m.turno || 0;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [mesarios]);

  const turnosFuncoes = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const f of funcoes) {
      const t = f.turno || 0;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(f);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [funcoes]);

  function resumoTurno(rows: any[]) {
    const total = rows.reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
    const vol = rows.filter((r: any) => r.voluntario === 'S' || r.voluntario === 'SIM').reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
    const comp = rows.filter((r: any) => r.comparecimento === 'S' || r.comparecimento === 'SIM').reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
    return { total, vol, comp, pctVol: total > 0 ? Math.round((vol / total) * 100) : 0, pctComp: total > 0 ? Math.round((comp / total) * 100) : 0 };
  }

  return (
    <div className="bg-muted/10 border-t border-border/30 p-4 space-y-4 animate-fade-in">
      {mesarios.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados de mesários para esta zona.</p>
      ) : (
        turnos.map(([turno, rows]) => {
          const r = resumoTurno(rows);
          return (
            <div key={turno} className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="text-[10px]">
                  {turno === 0 ? 'Turno não informado' : `${turno}º Turno`}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  <strong>{fmt(r.total)}</strong> convocados •
                  <span className="text-green-600 font-medium"> {fmt(r.vol)} voluntários ({r.pctVol}%)</span> •
                  <span className="text-primary font-medium"> {fmt(r.comp)} compareceram ({r.pctComp}%)</span>
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/30 max-h-[350px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-[10px]">Tipo</TableHead>
                      <TableHead className="text-[10px]">Atividade</TableHead>
                      <TableHead className="text-[10px]">Gênero</TableHead>
                      <TableHead className="text-[10px]">Faixa Etária</TableHead>
                      <TableHead className="text-[10px]">Instrução</TableHead>
                      <TableHead className="text-[10px]">Cor/Raça</TableHead>
                      <TableHead className="text-[10px]">Voluntário</TableHead>
                      <TableHead className="text-[10px]">Compareceu</TableHead>
                      <TableHead className="text-[10px] text-right">Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((m: any, i: number) => (
                      <TableRow key={i} className="border-border/20">
                        <TableCell className="text-xs">{m.tipo_mesario || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate">{m.atividade_eleitoral || '-'}</TableCell>
                        <TableCell className="text-xs">{m.genero || '-'}</TableCell>
                        <TableCell className="text-xs">{m.faixa_etaria || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[110px] truncate">{m.grau_instrucao || '-'}</TableCell>
                        <TableCell className="text-xs">{m.cor_raca || '-'}</TableCell>
                        <TableCell className="text-xs"><SimNao val={m.voluntario} /></TableCell>
                        <TableCell className="text-xs"><SimNao val={m.comparecimento} /></TableCell>
                        <TableCell className="text-xs text-right font-bold">{fmt(m.qt_convocados || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })
      )}

      {turnosFuncoes.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border/20">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">⭐ Funções Especiais</p>
          {turnosFuncoes.map(([turno, rows]) => (
            <div key={turno} className="space-y-2">
              <Badge variant="outline" className="text-[10px]">
                {turno === 0 ? 'Turno não informado' : `${turno}º Turno`} — {fmt(rows.reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0))} convocados
              </Badge>
              <div className="overflow-x-auto rounded-lg border border-border/30 max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-[10px]">Função</TableHead>
                      <TableHead className="text-[10px]">Gênero</TableHead>
                      <TableHead className="text-[10px]">Faixa Etária</TableHead>
                      <TableHead className="text-[10px] text-right">Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((f: any, i: number) => (
                      <TableRow key={i} className="border-border/20">
                        <TableCell className="text-xs font-medium">{f.funcao_especial || '-'}</TableCell>
                        <TableCell className="text-xs">{f.genero || '-'}</TableCell>
                        <TableCell className="text-xs">{f.faixa_etaria || '-'}</TableCell>
                        <TableCell className="text-xs text-right font-bold">{fmt(f.qt_convocados || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimNao({ val }: { val: string | null }) {
  if (!val) return <span className="text-muted-foreground">—</span>;
  const sim = val === 'S' || val === 'SIM';
  return (
    <span className={cn('text-[10px] font-semibold', sim ? 'text-green-600' : 'text-muted-foreground')}>
      {sim ? '✓ Sim' : 'Não'}
    </span>
  );
}
