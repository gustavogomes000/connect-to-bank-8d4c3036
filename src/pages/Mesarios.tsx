import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Users, ChevronDown, ChevronRight, School, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Busca mesários agrupados por zona */
function useMesariosPorZona() {
  const ano = useFilterStore((s) => s.ano);
  const municipio = useFilterStore((s) => s.municipio);

  return useQuery({
    queryKey: ['mesarios-zona', ano, municipio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bd_eleicoes_mesarios')
        .select('*')
        .eq('ano', ano)
        .eq('municipio', municipio)
        .order('zona', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!municipio,
    staleTime: 5 * 60_000,
  });
}

/** Busca funções especiais */
function useFuncoesEspeciaisPorZona() {
  const ano = useFilterStore((s) => s.ano);
  const municipio = useFilterStore((s) => s.municipio);

  return useQuery({
    queryKey: ['funcoes-esp-zona', ano, municipio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bd_eleicoes_mesarios_funcoes_especiais')
        .select('*')
        .eq('ano', ano)
        .eq('municipio', municipio)
        .order('zona', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!municipio,
    staleTime: 5 * 60_000,
  });
}

/** Busca locais de votação para mapear zona→escola */
function useLocaisVotacao() {
  const ano = useFilterStore((s) => s.ano);
  const municipio = useFilterStore((s) => s.municipio);

  return useQuery({
    queryKey: ['locais-votacao-mesarios', ano, municipio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bd_eleicoes_locais_votacao')
        .select('zona, local_votacao, bairro, endereco_local, eleitorado_apto')
        .eq('ano', ano)
        .eq('municipio', municipio)
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!municipio,
    staleTime: 5 * 60_000,
  });
}

interface EscolaGroup {
  escola: string;
  bairro: string;
  endereco: string;
  zona: number;
  eleitores: number;
  mesarios: any[];
  funcoesEspeciais: any[];
  totalConvocados: number;
}

export default function Mesarios() {
  const { data: mesarios, isLoading: loadM } = useMesariosPorZona();
  const { data: funcoes, isLoading: loadF } = useFuncoesEspeciaisPorZona();
  const { data: locais, isLoading: loadL } = useLocaisVotacao();
  const { municipio, ano } = useFilterStore();
  const [busca, setBusca] = useState('');
  const [expandedEscola, setExpandedEscola] = useState<string | null>(null);

  // Agrupa por escola (via zona → locais de votação)
  const escolasAgrupadas = useMemo(() => {
    if (!locais || !mesarios) return [];

    // Mapa zona → escolas
    const escolaMap = new Map<string, { escola: string; bairro: string; endereco: string; zona: number; eleitores: number }>();
    for (const l of locais) {
      const key = l.local_votacao || `Zona ${l.zona}`;
      if (!escolaMap.has(key)) {
        escolaMap.set(key, {
          escola: key,
          bairro: l.bairro || '',
          endereco: l.endereco_local || '',
          zona: l.zona || 0,
          eleitores: 0,
        });
      }
      const e = escolaMap.get(key)!;
      e.eleitores += l.eleitorado_apto || 0;
    }

    // Mapa zona → mesários
    const mesariosPorZona = new Map<number, any[]>();
    for (const m of mesarios) {
      const z = m.zona || 0;
      if (!mesariosPorZona.has(z)) mesariosPorZona.set(z, []);
      mesariosPorZona.get(z)!.push(m);
    }

    // Mapa zona → funções especiais
    const funcoesPorZona = new Map<number, any[]>();
    if (funcoes) {
      for (const f of funcoes) {
        const z = f.zona || 0;
        if (!funcoesPorZona.has(z)) funcoesPorZona.set(z, []);
        funcoesPorZona.get(z)!.push(f);
      }
    }

    const result: EscolaGroup[] = [];
    for (const [, info] of escolaMap) {
      const mes = mesariosPorZona.get(info.zona) || [];
      const fe = funcoesPorZona.get(info.zona) || [];
      const totalConv = mes.reduce((s, r) => s + (r.qt_convocados || 0), 0);
      result.push({
        ...info,
        mesarios: mes,
        funcoesEspeciais: fe,
        totalConvocados: totalConv,
      });
    }

    return result.sort((a, b) => a.escola.localeCompare(b.escola));
  }, [locais, mesarios, funcoes]);

  const filtered = useMemo(() => {
    if (!busca) return escolasAgrupadas;
    const q = busca.toLowerCase();
    return escolasAgrupadas.filter(e =>
      e.escola.toLowerCase().includes(q) ||
      e.bairro.toLowerCase().includes(q) ||
      e.zona.toString().includes(q)
    );
  }, [escolasAgrupadas, busca]);

  const totalMesarios = mesarios?.reduce((s, r) => s + (r.qt_convocados || 0), 0) || 0;
  const isLoading = loadM || loadF || loadL;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Mesários por Escola</h1>
          <p className="text-xs text-muted-foreground">{municipio} — {ano} • Fonte: TSE</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {filtered.length} escolas
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {totalMesarios.toLocaleString('pt-BR')} convocados
          </Badge>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar escola, bairro ou zona..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Nota sobre dados */}
      <p className="text-[10px] text-muted-foreground italic">
        ⚠️ Dados do TSE são agregados por zona — não contêm nomes individuais. Mostrando perfil demográfico dos mesários por escola.
      </p>

      {/* Lista de escolas */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <School className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma escola encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {filtered.map((escola) => {
            const isOpen = expandedEscola === escola.escola;
            return (
              <div key={escola.escola} className="border border-border/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedEscola(isOpen ? null : escola.escola)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors",
                    isOpen && "bg-muted/30"
                  )}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <School className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{escola.escola}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {escola.bairro && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{escola.bairro}</span>}
                      <span>Zona {escola.zona}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold">{escola.totalConvocados.toLocaleString('pt-BR')}</p>
                    <p className="text-[9px] text-muted-foreground">convocados</p>
                  </div>
                </button>

                {isOpen && (
                  <MesariosDetalhe escola={escola} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Detalhe expandido de uma escola — mostra mesários em tabela */
function MesariosDetalhe({ escola }: { escola: EscolaGroup }) {
  const { mesarios, funcoesEspeciais } = escola;

  if (mesarios.length === 0) {
    return (
      <div className="p-4 bg-muted/10 border-t border-border/30">
        <p className="text-xs text-muted-foreground">Sem dados de mesários para esta zona.</p>
      </div>
    );
  }

  return (
    <div className="bg-muted/10 border-t border-border/30 p-4 space-y-4">
      {escola.endereco && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {escola.endereco}
        </p>
      )}

      {/* Tabela de mesários */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          👥 Mesários Convocados — Zona {escola.zona} ({mesarios.length} registros)
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/30 max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-[10px] whitespace-nowrap">Turno</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Tipo</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Atividade</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Gênero</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Faixa Etária</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Instrução</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Cor/Raça</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Estado Civil</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Voluntário</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap">Compareceu</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap text-right">Qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mesarios.map((m: any, i: number) => (
                <TableRow key={i} className="border-border/20">
                  <TableCell className="text-xs">{m.turno || '-'}</TableCell>
                  <TableCell className="text-xs">{m.tipo_mesario || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate">{m.atividade_eleitoral || '-'}</TableCell>
                  <TableCell className="text-xs">{m.genero || '-'}</TableCell>
                  <TableCell className="text-xs">{m.faixa_etaria || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{m.grau_instrucao || '-'}</TableCell>
                  <TableCell className="text-xs">{m.cor_raca || '-'}</TableCell>
                  <TableCell className="text-xs">{m.estado_civil || '-'}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={m.voluntario === 'S' || m.voluntario === 'SIM' ? 'default' : 'outline'} className="text-[8px] h-4">
                      {m.voluntario === 'S' || m.voluntario === 'SIM' ? 'Sim' : 'Não'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={m.comparecimento === 'S' || m.comparecimento === 'SIM' ? 'default' : 'secondary'} className="text-[8px] h-4">
                      {m.comparecimento === 'S' || m.comparecimento === 'SIM' ? 'Sim' : 'Não'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold">{(m.qt_convocados || 0).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Funções especiais */}
      {funcoesEspeciais.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            ⭐ Funções Especiais — Zona {escola.zona} ({funcoesEspeciais.length} registros)
          </p>
          <div className="overflow-x-auto rounded-lg border border-border/30 max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-[10px] whitespace-nowrap">Função</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap">Turno</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap">Gênero</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap">Faixa Etária</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap">Instrução</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap">Cor/Raça</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap">Voluntário</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap">Compareceu</TableHead>
                  <TableHead className="text-[10px] whitespace-nowrap text-right">Qtd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funcoesEspeciais.map((f: any, i: number) => (
                  <TableRow key={i} className="border-border/20">
                    <TableCell className="text-xs font-medium">{f.funcao_especial || '-'}</TableCell>
                    <TableCell className="text-xs">{f.turno || '-'}</TableCell>
                    <TableCell className="text-xs">{f.genero || '-'}</TableCell>
                    <TableCell className="text-xs">{f.faixa_etaria || '-'}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{f.grau_instrucao || '-'}</TableCell>
                    <TableCell className="text-xs">{f.cor_raca || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={f.voluntario === 'S' || f.voluntario === 'SIM' ? 'default' : 'outline'} className="text-[8px] h-4">
                        {f.voluntario === 'S' || f.voluntario === 'SIM' ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={f.comparecimento === 'S' || f.comparecimento === 'SIM' ? 'default' : 'secondary'} className="text-[8px] h-4">
                        {f.comparecimento === 'S' || f.comparecimento === 'SIM' ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-bold">{(f.qt_convocados || 0).toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Resumo rápido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(() => {
          const total = mesarios.reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
          const vol = mesarios.filter((r: any) => r.voluntario === 'S' || r.voluntario === 'SIM').reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
          const comp = mesarios.filter((r: any) => r.comparecimento === 'S' || r.comparecimento === 'SIM').reduce((s: number, r: any) => s + (r.qt_convocados || 0), 0);
          return (
            <>
              <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
                <p className="text-[9px] text-muted-foreground">Total</p>
                <p className="text-sm font-bold">{total.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
                <p className="text-[9px] text-muted-foreground">Voluntários</p>
                <p className="text-sm font-bold text-green-600">{vol.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
                <p className="text-[9px] text-muted-foreground">Compareceram</p>
                <p className="text-sm font-bold text-primary">{comp.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-card rounded-lg border border-border/40 p-2 text-center">
                <p className="text-[9px] text-muted-foreground">Eleitores</p>
                <p className="text-sm font-bold">{escola.eleitores.toLocaleString('pt-BR')}</p>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
