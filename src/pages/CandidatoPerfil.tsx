import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Award, Bot, Building2, Coins, GraduationCap, Landmark, MapPinned, Search, Shield } from 'lucide-react';
import { useConsultaIA } from '@/hooks/useConsultaIA';
import { useQuery } from '@tanstack/react-query';
import {
  mdQuery,
  getTableName,
  getAnosDisponiveis,
  sqlPerfilCandidato,
  sqlPatrimonioCandidato,
  sqlHistoricoCandidato,
  sqlVotacaoTerritorialDetalhada,
} from '@/lib/motherduck';
import { useFilterStore } from '@/stores/filterStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatBRL } from '@/lib/eleicoes';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

type AnyRow = Record<string, any>;

function toTitle(key: string) {
  const k = key.replace(/[_\-]+/g, ' ').trim();
  if (!k) return key;
  return k
    .split(' ')
    .filter(Boolean)
    .map(p => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ');
}

function isNil(v: unknown) {
  return v === null || v === undefined || v === '';
}

function fmtValue(key: string, v: any) {
  if (isNil(v)) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';

  const keyL = key.toLowerCase();
  const asNumber = typeof v === 'number' ? v : (typeof v === 'string' && v.match(/^\d+([.,]\d+)?$/) ? Number(v.replace(',', '.')) : null);

  if (asNumber != null) {
    if (keyL.includes('valor') || keyL.includes('vr_') || keyL.includes('patrimonio') || keyL.includes('receita')) {
      return formatBRL(asNumber);
    }
    return asNumber.toLocaleString('pt-BR');
  }

  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function pickKey(row: AnyRow, candidates: string[]) {
  const keys = Object.keys(row);
  const lowerToActual = new Map(keys.map(k => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const actual = lowerToActual.get(c.toLowerCase());
    if (actual) return actual;
  }
  return null;
}

function RecordGrid({ row, title, icon: Icon }: { row: AnyRow; title: string; icon: any }) {
  const entries = Object.entries(row)
    .filter(([_, v]) => !isNil(v))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[#C8AA64]" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">{entries.length} campos</Badge>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{toTitle(k)}</div>
            <div className="text-sm text-slate-900 font-medium break-words">{fmtValue(k, v)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function aggregateVotos(rows: AnyRow[]) {
  if (!rows.length) return { byZona: [] as AnyRow[], byZonaLocal: [] as AnyRow[] };

  const municipioKey = pickKey(rows[0], ['nm_municipio', 'municipio', 'NM_MUNICIPIO']);
  const zonaKey = pickKey(rows[0], ['nr_zona', 'zona', 'NR_ZONA']);
  const localKey = pickKey(rows[0], ['nm_local_votacao', 'local_votacao', 'NM_LOCAL_VOTACAO', 'local']);
  const votosKey =
    pickKey(rows[0], ['qt_votos_nominais', 'total_votos', 'qt_votos', 'votos', 'QT_VOTOS_NOMINAIS']) ||
    pickKey(rows[0], ['qt_votos_candidato', 'QT_VOTOS_CANDIDATO']);

  const zonaAgg = new Map<string, number>();
  const zlAgg = new Map<string, number>();

  for (const r of rows) {
    const mun = municipioKey ? String(r[municipioKey] ?? '') : '';
    const zona = zonaKey ? String(r[zonaKey] ?? '') : '';
    const local = localKey ? String(r[localKey] ?? '') : '';
    const votos = votosKey ? Number(r[votosKey] ?? 0) : 0;
    const zKey = `${mun}||${zona}`;
    const zlKey = `${mun}||${zona}||${local}`;
    zonaAgg.set(zKey, (zonaAgg.get(zKey) || 0) + (Number.isFinite(votos) ? votos : 0));
    zlAgg.set(zlKey, (zlAgg.get(zlKey) || 0) + (Number.isFinite(votos) ? votos : 0));
  }

  const byZona = [...zonaAgg.entries()]
    .map(([k, total_votos]) => {
      const [municipio, zona] = k.split('||');
      return { municipio, zona, total_votos };
    })
    .sort((a, b) => b.total_votos - a.total_votos);

  const byZonaLocal = [...zlAgg.entries()]
    .map(([k, total_votos]) => {
      const [municipio, zona, local_votacao] = k.split('||');
      return { municipio, zona, local_votacao, total_votos };
    })
    .sort((a, b) => b.total_votos - a.total_votos);

  return { byZona, byZonaLocal };
}

// ═══════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════

function ProfileSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function CandidatoPerfil() {
  const { id } = useParams<{ id: string }>();
  const sq = id || null;

  const { ano } = useFilterStore();

  // Helper: datasets have explicit year availability; avoid hard-crash
  const canUseDataset = (dataset: string, year: number) => getAnosDisponiveis(dataset).includes(year);
  const safeTable = (dataset: string, year: number) => {
    if (!canUseDataset(dataset, year)) return null;
    try {
      return getTableName(dataset, year);
    } catch {
      return null;
    }
  };

  const candidatoQ = useQuery({
    queryKey: ['md', 'cand', ano, sq],
    enabled: !!sq,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('candidatos', ano);
      if (!t) return { table: null, row: null };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq}' LIMIT 1`);
      return { table: t, row: (rows[0] as AnyRow) || null };
    },
  });

  const complementarQ = useQuery({
    queryKey: ['md', 'cand_complementar', ano, sq],
    enabled: !!sq && canUseDataset('candidatos_complementar', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('candidatos_complementar', ano);
      if (!t) return { table: null, row: null };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq}' LIMIT 1`);
      return { table: t, row: (rows[0] as AnyRow) || null };
    },
  });

  const bensQ = useQuery({
    queryKey: ['md', 'bens', ano, sq],
    enabled: !!sq && canUseDataset('bens', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('bens', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const patrimonioQ = useQuery({
    queryKey: ['md', 'patrimonio', ano, sq],
    enabled: !!sq && canUseDataset('bens', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await mdQuery(sqlPatrimonioCandidato(ano, String(sq)));
      return rows[0] as AnyRow | null;
    },
  });

  const receitasQ = useQuery({
    queryKey: ['md', 'receitas', ano, sq],
    enabled: !!sq && canUseDataset('receitas', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('receitas', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const receitasDoadorOrigQ = useQuery({
    queryKey: ['md', 'receitas_doador_originario', ano, sq],
    enabled: !!sq && canUseDataset('receitas_doador', ano) && canUseDataset('receitas', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('receitas_doador', ano);
      const tRec = safeTable('receitas', ano);
      if (!t || !tRec) return { table: null, rows: [] as AnyRow[] };
      // receitas_doador_originario has NO SQ_CANDIDATO — join via SQ_PRESTADOR_CONTAS
      const rows = await mdQuery(`SELECT d.* FROM ${t} d WHERE d.SQ_PRESTADOR_CONTAS IN (SELECT DISTINCT SQ_PRESTADOR_CONTAS FROM ${tRec} WHERE SQ_CANDIDATO = '${sq}')`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const redesSociaisQ = useQuery({
    queryKey: ['md', 'rede_social', ano, sq],
    enabled: !!sq && canUseDataset('rede_social', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('rede_social', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const cassacoesQ = useQuery({
    queryKey: ['md', 'cassacoes', ano, sq],
    enabled: !!sq && canUseDataset('cassacoes', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('cassacoes', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const despesasContratadasQ = useQuery({
    queryKey: ['md', 'despesas_contratadas', ano, sq],
    enabled: !!sq && canUseDataset('despesas_contratadas', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('despesas_contratadas', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sq}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const despesasPagasQ = useQuery({
    queryKey: ['md', 'despesas_pagas', ano, sq],
    enabled: !!sq && canUseDataset('despesas_pagas', ano) && canUseDataset('despesas_contratadas', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('despesas_pagas', ano);
      const tDesp = safeTable('despesas_contratadas', ano);
      if (!t || !tDesp) return { table: null, rows: [] as AnyRow[] };
      // despesas_pagas has NO SQ_CANDIDATO — join via SQ_PRESTADOR_CONTAS from despesas_contratadas
      const rows = await mdQuery(`SELECT d.* FROM ${t} d WHERE d.SQ_PRESTADOR_CONTAS IN (SELECT DISTINCT SQ_PRESTADOR_CONTAS FROM ${tDesp} WHERE SQ_CANDIDATO = '${sq}')`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const votacaoTerritorialQ = useQuery({
    queryKey: ['md', 'votacao_territorial', ano, sq],
    enabled: !!sq && canUseDataset('votacao', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await mdQuery(sqlVotacaoTerritorialDetalhada(ano, String(sq), { municipio: 'GOIÂNIA' } as any));
      return rows as AnyRow[];
    },
  });

  const votacaoTerritorialAparecidaQ = useQuery({
    queryKey: ['md', 'votacao_territorial_aparecida', ano, sq],
    enabled: !!sq && canUseDataset('votacao', ano),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await mdQuery(sqlVotacaoTerritorialDetalhada(ano, String(sq), { municipio: 'APARECIDA DE GOIÂNIA' } as any));
      return rows as AnyRow[];
    },
  });

  const candidato = candidatoQ.data?.row;
  const complementar = complementarQ.data?.row;
  const bens = bensQ.data?.rows || [];
  const receitas = receitasQ.data?.rows || [];
  const receitasDoadorOrig = receitasDoadorOrigQ.data?.rows || [];
  const redesSociais = redesSociaisQ.data?.rows || [];
  const cassacoes = cassacoesQ.data?.rows || [];
  const despesasContratadas = despesasContratadasQ.data?.rows || [];
  const despesasPagas = despesasPagasQ.data?.rows || [];

  const patrimonioTotal = Number(patrimonioQ.data?.patrimonio_total || 0);

  const votacaoRows = useMemo(
    () => [...(votacaoTerritorialQ.data || []), ...(votacaoTerritorialAparecidaQ.data || [])],
    [votacaoTerritorialQ.data, votacaoTerritorialAparecidaQ.data],
  );

  const geo = useMemo(() => aggregateVotos(votacaoRows), [votacaoRows]);

  const isLoading =
    candidatoQ.isLoading ||
    complementarQ.isLoading ||
    bensQ.isLoading ||
    patrimonioQ.isLoading ||
    receitasQ.isLoading ||
    receitasDoadorOrigQ.isLoading ||
    redesSociaisQ.isLoading ||
    cassacoesQ.isLoading ||
    despesasContratadasQ.isLoading ||
    despesasPagasQ.isLoading ||
    votacaoTerritorialQ.isLoading ||
    votacaoTerritorialAparecidaQ.isLoading;

  const error =
    candidatoQ.error ||
    complementarQ.error ||
    bensQ.error ||
    patrimonioQ.error ||
    receitasQ.error ||
    receitasDoadorOrigQ.error ||
    redesSociaisQ.error ||
    cassacoesQ.error ||
    despesasContratadasQ.error ||
    despesasPagasQ.error ||
    votacaoTerritorialQ.error ||
    votacaoTerritorialAparecidaQ.error;

  const cpfKey = candidato ? pickKey(candidato, ['NR_CPF_CANDIDATO', 'cpf', 'nr_cpf_candidato']) : null;
  const cpf = cpfKey && candidato ? String(candidato[cpfKey] ?? '') : '';

  const historicoQ = useQuery({
    queryKey: ['md', 'historico', cpf],
    enabled: !!cpf && cpf.length >= 8, // cpf costuma vir BIGINT sem máscara
    staleTime: 10 * 60 * 1000,
    queryFn: async () => mdQuery(sqlHistoricoCandidato(cpf)),
  });

  const nome = (candidato && (candidato.NM_URNA_CANDIDATO || candidato.candidato || candidato.NM_CANDIDATO)) || 'Candidato';

  const linkedInRow = useMemo(() => {
    if (!candidato) return null;
    const allow = Object.keys({ ...candidato, ...(complementar || {}) }).filter(k => {
      const kl = k.toLowerCase();
      return (
        kl.includes('fili') ||
        kl.includes('partid') ||
        kl.includes('colig') ||
        kl.includes('escolar') ||
        kl.includes('instrucao') ||
        kl.includes('grau') ||
        kl.includes('ocup') ||
        kl.includes('cargo') ||
        kl.includes('federacao')
      );
    });
    const obj: AnyRow = {};
    for (const k of allow) obj[k] = (candidato as AnyRow)[k] ?? (complementar as AnyRow | null)?.[k];
    return obj;
  }, [candidato, complementar]);

  if (isLoading) return <ProfileSkeleton />;

  if (error) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="p-6 rounded-xl border border-border bg-white text-sm text-red-600">
          Erro ao carregar dossiê: {(error as Error).message}
        </div>
      </div>
    );
  }

  if (!candidato) {
    return (
      <div className="max-w-[1400px] mx-auto p-10 text-center space-y-3">
        <p className="text-sm text-slate-500">Candidato não encontrado no MotherDuck.</p>
        <Link to="/"><Button variant="outline" size="sm"><ArrowLeft className="w-3.5 h-3.5 mr-1" />Voltar</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Painel
      </Link>

      <section className="bg-white rounded-xl border border-border p-5">
        <div className="flex flex-col md:flex-row gap-4 md:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#C8AA64]" />
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 truncate">{String(nome)}</h1>
              <Badge className="ml-auto bg-[#EC4899] text-white hover:bg-[#EC4899]/90">Dossiê 360º</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Fonte: <span className="font-mono">{candidatoQ.data?.table}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 md:ml-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-slate-50">
              <Landmark className="w-4 h-4 text-[#C8AA64]" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Patrimônio total</div>
                <div className="text-sm font-semibold text-slate-900">{patrimonioTotal > 0 ? formatBRL(patrimonioTotal) : '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-slate-50">
              <Award className="w-4 h-4 text-[#C8AA64]" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Bens</div>
                <div className="text-sm font-semibold text-slate-900">{bens.length.toLocaleString('pt-BR')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#C8AA64]" />
          <h3 className="text-sm font-semibold text-slate-900">Histórico 2014–2024 (por CPF)</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            CPF: <span className="font-mono ml-1">{cpf ? cpf : '—'}</span>
          </Badge>
        </div>
        {!cpf ? (
          <div className="mt-3 text-sm text-slate-500">CPF não encontrado no registro deste ano, não dá para consolidar 2014–2024.</div>
        ) : historicoQ.isLoading ? (
          <div className="mt-3"><Skeleton className="h-24 w-full" /></div>
        ) : !historicoQ.data?.length ? (
          <div className="mt-3 text-sm text-slate-500">Sem histórico retornado para este CPF.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-[10px] text-slate-500 w-[70px]">Ano</TableHead>
                  <TableHead className="text-[10px] text-slate-500">Cargo</TableHead>
                  <TableHead className="text-[10px] text-slate-500">Município</TableHead>
                  <TableHead className="text-[10px] text-slate-500">Partido</TableHead>
                  <TableHead className="text-[10px] text-slate-500">SQ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicoQ.data.map((r: any, i: number) => (
                  <TableRow key={i} className="border-border/60">
                    <TableCell className="text-sm font-mono text-slate-900">{r.ano}</TableCell>
                    <TableCell className="text-xs text-slate-900">{r.cargo}</TableCell>
                    <TableCell className="text-xs text-slate-500">{r.municipio}</TableCell>
                    <TableCell className="text-xs text-slate-900">{r.partido}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">{r.sq_candidato}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {historicoQ.data?.length ? (
        <section className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#C8AA64]" />
            <h3 className="text-sm font-semibold text-slate-900">Visão Completa 2014–2024 (dossiês por ano)</h3>
            <Badge variant="outline" className="ml-auto text-[10px]">puxando tudo que existir</Badge>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Cada ano usa o <span className="font-mono">SQ_CANDIDATO</span> daquele pleito (derivado do CPF) para puxar bens, finanças, cassações, redes e geografia do voto.
          </div>

          <div className="mt-3">
            <Accordion type="multiple" className="w-full">
              {historicoQ.data
                .slice()
                .sort((a: any, b: any) => Number(b.ano) - Number(a.ano))
                .map((h: any) => (
                  <AccordionItem key={`${h.ano}_${h.sq_candidato}`} value={`${h.ano}_${h.sq_candidato}`}>
                    <AccordionTrigger className="text-sm text-slate-900 hover:no-underline">
                      <div className="flex flex-wrap items-center gap-2 w-full pr-2">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-50 border border-border">{h.ano}</span>
                        <span className="font-semibold">{h.cargo}</span>
                        <span className="text-slate-500">{h.municipio}</span>
                        <Badge variant="outline" className="text-[10px]">{h.partido}</Badge>
                        <span className="ml-auto text-[10px] text-slate-500 font-mono">SQ {h.sq_candidato}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <YearDossie ano={Number(h.ano)} sqCandidato={String(h.sq_candidato)} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
          </div>
        </section>
      ) : null}

      <RecordGrid row={candidato} title="Perfil (todas as colunas disponíveis - candidatos)" icon={Shield} />

      {complementar && <RecordGrid row={complementar} title="Perfil Complementar (todas as colunas - complementar)" icon={Shield} />}

      {linkedInRow && Object.keys(linkedInRow).length > 0 && (
        <RecordGrid row={linkedInRow} title="LinkedIn Político (filiações, coligações, escolaridade, etc.)" icon={GraduationCap} />
      )}

      <section className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#C8AA64]" />
          <h3 className="text-sm font-semibold text-slate-900">Patrimônio (lista completa de bens)</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Fonte: <span className="font-mono ml-1">{bensQ.data?.table}</span>
          </Badge>
        </div>
        {!bens.length ? (
          <div className="mt-3 text-sm text-slate-500">Sem bens encontrados para este candidato.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-[10px] text-slate-500">Bem</TableHead>
                  <TableHead className="text-[10px] text-slate-500">Tipo</TableHead>
                  <TableHead className="text-[10px] text-slate-500 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bens.map((r, idx) => {
                  const descKey = pickKey(r, ['ds_bem_candidato', 'descricao_bem', 'descricao', 'bem']);
                  const tipoKey = pickKey(r, ['ds_tipo_bem_candidato', 'tipo_bem', 'tipo']);
                  const valorKey = pickKey(r, ['vr_bem_candidato', 'valor_bem', 'valor']);
                  return (
                    <TableRow key={idx} className="border-border/60">
                      <TableCell className="text-sm text-slate-900">{fmtValue(descKey || 'bem', descKey ? r[descKey] : '')}</TableCell>
                      <TableCell className="text-xs text-slate-500">{fmtValue(tipoKey || 'tipo', tipoKey ? r[tipoKey] : '')}</TableCell>
                      <TableCell className="text-sm text-slate-900 text-right font-mono">
                        {valorKey ? fmtValue(valorKey, r[valorKey]) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2">
          <MapPinned className="w-4 h-4 text-[#C8AA64]" />
          <h3 className="text-sm font-semibold text-slate-900">Geografia do Voto (Goiânia e Aparecida de Goiânia)</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Fonte: <span className="font-mono ml-1">votacao_secao + eleitorado_local</span>
          </Badge>
        </div>

        {!geo.byZona.length ? (
          <div className="mt-3 text-sm text-slate-500">Sem registros de votação por seção para os municípios-alvo.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-border">
                Votos por Zona (agregado)
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-[10px] text-slate-500">Município</TableHead>
                    <TableHead className="text-[10px] text-slate-500">Zona</TableHead>
                    <TableHead className="text-[10px] text-slate-500 text-right">Votos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {geo.byZona.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className="border-border/60">
                      <TableCell className="text-xs text-slate-500">{r.municipio}</TableCell>
                      <TableCell className="text-sm text-slate-900 font-mono">{r.zona}</TableCell>
                      <TableCell className="text-sm text-slate-900 text-right font-mono">{Number(r.total_votos).toLocaleString('pt-BR')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-border">
                Votos por Zona e Local de Votação (Escolas)
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-[10px] text-slate-500">Município</TableHead>
                    <TableHead className="text-[10px] text-slate-500">Zona</TableHead>
                    <TableHead className="text-[10px] text-slate-500">Local</TableHead>
                    <TableHead className="text-[10px] text-slate-500 text-right">Votos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {geo.byZonaLocal.slice(0, 80).map((r, i) => (
                    <TableRow key={i} className="border-border/60">
                      <TableCell className="text-xs text-slate-500">{r.municipio}</TableCell>
                      <TableCell className="text-xs text-slate-900 font-mono">{r.zona}</TableCell>
                      <TableCell className="text-xs text-slate-900">{r.local_votacao || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-900 text-right font-mono">{Number(r.total_votos).toLocaleString('pt-BR')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-[#C8AA64]" />
          <h3 className="text-sm font-semibold text-slate-900">Finanças (receitas e doadores)</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Fonte: <span className="font-mono ml-1">{receitasQ.data?.table}</span>
          </Badge>
        </div>

        {!receitas.length ? (
          <div className="mt-3 text-sm text-slate-500">Sem receitas encontradas para este candidato.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-[10px] text-slate-500">Doador</TableHead>
                  <TableHead className="text-[10px] text-slate-500">Origem</TableHead>
                  <TableHead className="text-[10px] text-slate-500 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receitas.slice(0, 200).map((r, idx) => {
                  const doadorKey = pickKey(r, ['nm_doador', 'doador', 'nome_doador', 'NM_DOADOR']);
                  const origemKey = pickKey(r, ['ds_origem_receita', 'origem', 'origem_receita', 'DS_ORIGEM_RECEITA']);
                  const valorKey = pickKey(r, ['vr_receita', 'valor_receita', 'valor', 'VR_RECEITA']);
                  return (
                    <TableRow key={idx} className="border-border/60">
                      <TableCell className="text-sm text-slate-900">{fmtValue(doadorKey || 'doador', doadorKey ? r[doadorKey] : '')}</TableCell>
                      <TableCell className="text-xs text-slate-500">{fmtValue(origemKey || 'origem', origemKey ? r[origemKey] : '')}</TableCell>
                      <TableCell className="text-sm text-slate-900 text-right font-mono">{valorKey ? fmtValue(valorKey, r[valorKey]) : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {(receitasDoadorOrig.length > 0 || despesasContratadas.length > 0 || despesasPagas.length > 0) && (
        <section className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#C8AA64]" />
            <h3 className="text-sm font-semibold text-slate-900">Finanças (tabelas completas)</h3>
            <Badge variant="outline" className="ml-auto text-[10px]">MotherDuck</Badge>
          </div>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
            {receitasDoadorOrig.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Doadores (originário) • <span className="font-mono">{receitasDoadorOrigQ.data?.table}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{receitasDoadorOrig.length.toLocaleString('pt-BR')} registros</div>
              </div>
            )}
            {despesasContratadas.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Despesas contratadas • <span className="font-mono">{despesasContratadasQ.data?.table}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{despesasContratadas.length.toLocaleString('pt-BR')} registros</div>
              </div>
            )}
            {despesasPagas.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Despesas pagas • <span className="font-mono">{despesasPagasQ.data?.table}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{despesasPagas.length.toLocaleString('pt-BR')} registros</div>
              </div>
            )}
          </div>
        </section>
      )}

      {(redesSociais.length > 0 || cassacoes.length > 0) && (
        <section className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#C8AA64]" />
            <h3 className="text-sm font-semibold text-slate-900">Risco e Presença Digital</h3>
            <Badge variant="outline" className="ml-auto text-[10px]">MotherDuck</Badge>
          </div>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {redesSociais.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Redes sociais • <span className="font-mono">{redesSociaisQ.data?.table}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{redesSociais.length.toLocaleString('pt-BR')} registros</div>
              </div>
            )}
            {cassacoes.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Cassações/Processos • <span className="font-mono">{cassacoesQ.data?.table}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{cassacoes.length.toLocaleString('pt-BR')} registros</div>
              </div>
            )}
          </div>
        </section>
      )}

      <CandidateContextChat
        candidato={candidato}
        patrimonioTotal={patrimonioTotal}
        bensCount={bens.length}
        geoZonaTop={geo.byZona.slice(0, 10)}
      />
    </div>
  );
}

function YearDossie({ ano, sqCandidato }: { ano: number; sqCandidato: string }) {
  const canUseDataset = (dataset: string, year: number) => getAnosDisponiveis(dataset).includes(year);
  const safeTable = (dataset: string, year: number) => {
    if (!canUseDataset(dataset, year)) return null;
    try {
      return getTableName(dataset, year);
    } catch {
      return null;
    }
  };

  const perfilQ = useQuery({
    queryKey: ['md', 'year', ano, 'perfil', sqCandidato],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      if (!canUseDataset('candidatos', ano)) return null;
      const rows = await mdQuery(sqlPerfilCandidato(ano, { sq: sqCandidato }));
      return (rows[0] as AnyRow) || null;
    },
  });

  const bensQ = useQuery({
    queryKey: ['md', 'year', ano, 'bens', sqCandidato],
    enabled: canUseDataset('bens', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('bens', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sqCandidato}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const patrimonioQ = useQuery({
    queryKey: ['md', 'year', ano, 'patrimonio', sqCandidato],
    enabled: canUseDataset('bens', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const rows = await mdQuery(sqlPatrimonioCandidato(ano, sqCandidato));
      return (rows[0] as AnyRow) || null;
    },
  });

  const receitasQ = useQuery({
    queryKey: ['md', 'year', ano, 'receitas', sqCandidato],
    enabled: canUseDataset('receitas', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('receitas', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sqCandidato}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const despesasPagasQ = useQuery({
    queryKey: ['md', 'year', ano, 'despesas_pagas', sqCandidato],
    enabled: canUseDataset('despesas_pagas', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('despesas_pagas', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sqCandidato}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const cassacoesQ = useQuery({
    queryKey: ['md', 'year', ano, 'cassacoes', sqCandidato],
    enabled: canUseDataset('cassacoes', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('cassacoes', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sqCandidato}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const redesQ = useQuery({
    queryKey: ['md', 'year', ano, 'redes', sqCandidato],
    enabled: canUseDataset('rede_social', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const t = safeTable('rede_social', ano);
      if (!t) return { table: null, rows: [] as AnyRow[] };
      const rows = await mdQuery(`SELECT * FROM ${t} WHERE SQ_CANDIDATO = '${sqCandidato}'`);
      return { table: t, rows: (rows as AnyRow[]) || [] };
    },
  });

  const votoGoianiaQ = useQuery({
    queryKey: ['md', 'year', ano, 'voto_territorial_goiania', sqCandidato],
    enabled: canUseDataset('votacao_secao', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => mdQuery(sqlVotacaoTerritorialDetalhada(ano, sqCandidato, { municipio: 'GOIÂNIA' } as any)),
  });

  const votoAparecidaQ = useQuery({
    queryKey: ['md', 'year', ano, 'voto_territorial_aparecida', sqCandidato],
    enabled: canUseDataset('votacao_secao', ano),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => mdQuery(sqlVotacaoTerritorialDetalhada(ano, sqCandidato, { municipio: 'APARECIDA DE GOIÂNIA' } as any)),
  });

  const bensCount = bensQ.data?.rows?.length || 0;
  const receitasCount = receitasQ.data?.rows?.length || 0;
  const despesasCount = despesasPagasQ.data?.rows?.length || 0;
  const cassacoesCount = cassacoesQ.data?.rows?.length || 0;
  const redesCount = redesQ.data?.rows?.length || 0;
  const patrimonioTotal = Number(patrimonioQ.data?.patrimonio_total || 0);

  const votoRows = useMemo(() => ([...(votoGoianiaQ.data || []), ...(votoAparecidaQ.data || [])] as AnyRow[]), [votoGoianiaQ.data, votoAparecidaQ.data]);
  const geo = useMemo(() => aggregateVotos(votoRows), [votoRows]);

  const loading =
    perfilQ.isLoading ||
    bensQ.isLoading ||
    patrimonioQ.isLoading ||
    receitasQ.isLoading ||
    despesasPagasQ.isLoading ||
    cassacoesQ.isLoading ||
    redesQ.isLoading ||
    votoGoianiaQ.isLoading ||
    votoAparecidaQ.isLoading;

  if (loading) return <Skeleton className="h-28 w-full" />;

  return (
    <div className="space-y-3">
      {perfilQ.data ? (
        <RecordGrid row={perfilQ.data} title={`Perfil ${ano} (todas as colunas)`} icon={Shield} />
      ) : (
        <div className="rounded-lg border border-border p-3 text-sm text-slate-500">
          Sem perfil detalhado para {ano} (ou dataset não disponível).
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="rounded-lg border border-border p-3 bg-white">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Patrimônio</div>
          <div className="text-sm font-semibold text-slate-900 mt-1">{patrimonioTotal ? formatBRL(patrimonioTotal) : '—'}</div>
          <div className="text-[10px] text-slate-500 mt-1">{bensCount.toLocaleString('pt-BR')} bens</div>
        </div>
        <div className="rounded-lg border border-border p-3 bg-white">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Receitas</div>
          <div className="text-sm font-semibold text-slate-900 mt-1">{receitasCount.toLocaleString('pt-BR')} registros</div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">{receitasQ.data?.table || '—'}</div>
        </div>
        <div className="rounded-lg border border-border p-3 bg-white">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Despesas pagas</div>
          <div className="text-sm font-semibold text-slate-900 mt-1">{despesasCount.toLocaleString('pt-BR')} registros</div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">{despesasPagasQ.data?.table || '—'}</div>
        </div>
        <div className="rounded-lg border border-border p-3 bg-white">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Cassações</div>
          <div className="text-sm font-semibold text-slate-900 mt-1">{cassacoesCount.toLocaleString('pt-BR')} registros</div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">{cassacoesQ.data?.table || '—'}</div>
        </div>
        <div className="rounded-lg border border-border p-3 bg-white">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Redes</div>
          <div className="text-sm font-semibold text-slate-900 mt-1">{redesCount.toLocaleString('pt-BR')} registros</div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">{redesQ.data?.table || '—'}</div>
        </div>
      </div>

      {geo.byZonaLocal.length ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-border">
            Geografia do voto {ano} (top 40 por escola)
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-[10px] text-slate-500">Município</TableHead>
                  <TableHead className="text-[10px] text-slate-500">Zona</TableHead>
                  <TableHead className="text-[10px] text-slate-500">Local</TableHead>
                  <TableHead className="text-[10px] text-slate-500 text-right">Votos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {geo.byZonaLocal.slice(0, 40).map((r: any, i: number) => (
                  <TableRow key={i} className="border-border/60">
                    <TableCell className="text-xs text-slate-500">{r.municipio}</TableCell>
                    <TableCell className="text-xs text-slate-900 font-mono">{r.zona}</TableCell>
                    <TableCell className="text-xs text-slate-900">{r.local_votacao || '—'}</TableCell>
                    <TableCell className="text-sm text-slate-900 text-right font-mono">{Number(r.total_votos).toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CandidateContextChat({
  candidato,
  patrimonioTotal,
  bensCount,
  geoZonaTop,
}: {
  candidato: AnyRow;
  patrimonioTotal: number;
  bensCount: number;
  geoZonaTop: AnyRow[];
}) {
  const { messages, loading, consultar, limpar } = useConsultaIA();
  const [input, setInput] = useState('');

  const context = useMemo(() => {
    const id = candidato.sq_candidato ?? candidato.SQ_CANDIDATO ?? candidato.id ?? null;
    const nome = candidato.nome_urna ?? candidato.nm_urna_candidato ?? candidato.candidato ?? candidato.nome_candidato ?? null;
    const partido = candidato.sigla_partido ?? candidato.sg_partido ?? candidato.partido ?? null;
    const cargo = candidato.cargo ?? candidato.ds_cargo ?? null;
    const municipio = candidato.municipio ?? candidato.nm_ue ?? candidato.nm_municipio ?? null;

    return {
      id,
      nome,
      partido,
      cargo,
      municipio,
      patrimonioTotal,
      bensCount,
      geoZonaTop,
    };
  }, [candidato, patrimonioTotal, bensCount, geoZonaTop]);

  const onSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    const prompt = [
      'Você é um analista político. Responda com objetividade, em bullets curtos quando fizer sentido.',
      'Contexto do candidato (GO):',
      JSON.stringify(context),
      '',
      `Pergunta do usuário: ${q}`,
    ].join('\n');

    await consultar(prompt);
  };

  return (
    <section className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-[#C8AA64]" />
        <h3 className="text-sm font-semibold text-slate-900">Chat de Contexto (Inteligência Política Total)</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">IA + contexto do perfil</Badge>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Exemplos: <span className="font-medium text-slate-900">“Qual a maior fraqueza deste candidato em Aparecida?”</span> •{' '}
        <span className="font-medium text-slate-900">“Qual o patrimônio total declarado?”</span>
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pergunte algo estratégico sobre este candidato…"
          className="bg-white"
        />
        <Button onClick={onSend} disabled={loading || !input.trim()} className="bg-[#EC4899] hover:bg-[#EC4899]/90">
          <Search className="w-4 h-4 mr-2" />
          Perguntar
        </Button>
        <Button variant="outline" onClick={limpar} disabled={!messages.length}>
          Limpar
        </Button>
      </div>

      {!!messages.length && (
        <div className="mt-3 space-y-2">
          {messages.slice(-6).map(m => (
            <div key={m.id} className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                {m.role === 'user' ? 'Você' : 'IA'}
              </div>
              <div className="text-sm text-slate-900 whitespace-pre-wrap">{m.content || (m.status === 'loading' ? 'Pensando…' : '')}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
