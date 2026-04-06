import { useFilterStore } from '@/stores/filterStore';
import { useQuery } from '@tanstack/react-query';
import { mdQuery, MD, COL, CAND_ANOS, BENS_ANOS, COMP_ANOS } from '@/lib/motherduck';
import { supabase } from '@/integrations/supabase/client';

type Filters = {
  ano: number | null; turno: number | null; cargo: string | null;
  municipio: string | null; partido: string | null; genero: string | null;
  escolaridade: string | null; ocupacao: string | null; situacao: string | null;
  searchText: string;
};

function useFilters(): Filters {
  const s = useFilterStore();
  return {
    ano: s.ano, turno: s.turno, cargo: s.cargo, municipio: s.municipio,
    partido: s.partido, genero: s.genero, escolaridade: s.escolaridade,
    ocupacao: s.ocupacao, situacao: s.situacao, searchText: s.searchText,
  };
}

// buildWhere now does NOT include ano (table selection handles it)
function buildWhere(f: Filters, extra?: string, includeAno = false): string {
  const c: string[] = [];
  if (includeAno && f.ano) c.push(`${COL.ano} = ${f.ano}`);
  if (f.turno) c.push(`${COL.turno} = ${f.turno}`);
  if (f.cargo) c.push(`${COL.cargo} ILIKE '%${f.cargo}%'`);
  if (f.municipio) c.push(`${COL.municipio} = '${f.municipio}'`);
  if (f.partido) c.push(`${COL.partido} = '${f.partido}'`);
  if (f.genero) c.push(`${COL.genero} = '${f.genero}'`);
  if (f.escolaridade) c.push(`${COL.escolaridade} = '${f.escolaridade}'`);
  if (f.ocupacao) c.push(`${COL.ocupacao} = '${f.ocupacao}'`);
  if (f.situacao) c.push(`${COL.situacaoFinal} ILIKE '%${f.situacao}%'`);
  if (f.searchText) c.push(`(${COL.nomeUrna} ILIKE '%${f.searchText}%' OR ${COL.nomeCompleto} ILIKE '%${f.searchText}%')`);
  if (extra) c.push(extra);
  return c.length ? `WHERE ${c.join(' AND ')}` : '';
}

// Helper: get candidatos table for current filter
function candTable(f: Filters) { return MD.candidatos(f.ano); }
function bensTable(f: Filters) { return MD.bens(f.ano); }

// ═══ DATA AVAILABILITY ═══
export function useDataAvailability() {
  return useQuery({
    queryKey: ['dataAvailability'],
    queryFn: async () => {
      const [cand] = await mdQuery<{total: string}>(`SELECT count(*) as total FROM ${MD.candidatos(2024)} LIMIT 1`);
      return {
        candidatos: Number(cand?.total || 0) > 0,
        bens: true, votacao: true, votacaoPartido: true,
        comparecimento: true, comparecimentoSecao: true, locais: true,
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ═══ FILTER OPTIONS ═══
export function useFilterOptions() {
  return useQuery({
    queryKey: ['filterOptions'],
    queryFn: async () => {
      const t = MD.candidatos(2024);
      const [generos, escolaridades, ocupacoes, situacoes] = await Promise.all([
        mdQuery<{v:string}>(`SELECT DISTINCT ${COL.genero} as v FROM ${t} WHERE ${COL.genero} IS NOT NULL ORDER BY v`),
        mdQuery<{v:string}>(`SELECT DISTINCT ${COL.escolaridade} as v FROM ${t} WHERE ${COL.escolaridade} IS NOT NULL ORDER BY v`),
        mdQuery<{v:string}>(`SELECT DISTINCT ${COL.ocupacao} as v FROM ${t} WHERE ${COL.ocupacao} IS NOT NULL ORDER BY v LIMIT 100`),
        mdQuery<{v:string}>(`SELECT DISTINCT ${COL.situacaoFinal} as v FROM ${t} WHERE ${COL.situacaoFinal} IS NOT NULL ORDER BY v`),
      ]);
      return {
        generos: generos.map(r => r.v),
        escolaridades: escolaridades.map(r => r.v),
        ocupacoes: ocupacoes.map(r => r.v),
        situacoes: situacoes.map(r => r.v),
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ═══ CHECK EMPTY ═══
export function useCheckEmpty() {
  return useQuery({
    queryKey: ['checkEmpty'],
    queryFn: async () => {
      const [r] = await mdQuery<{total: string}>(`SELECT count(*) as total FROM ${MD.candidatos(2024)}`);
      return Number(r?.total || 0) === 0;
    },
  });
}

// ═══ KPIs DASHBOARD ═══
export function useKPIs() {
  const f = useFilters();
  return useQuery({
    queryKey: ['kpis', f],
    queryFn: async () => {
      const t = candTable(f);
      const w = buildWhere(f);
      const sql = `SELECT
        count(*) as total,
        count(CASE WHEN ${COL.situacaoFinal} ILIKE '%ELEITO%' AND ${COL.situacaoFinal} NOT ILIKE '%NÃO ELEITO%' THEN 1 END) as eleitos,
        count(CASE WHEN ${COL.genero} = 'FEMININO' THEN 1 END) as mulheres,
        count(DISTINCT ${COL.partido}) as partidos,
        count(DISTINCT ${COL.municipio}) as municipios,
        count(DISTINCT ${COL.cargo}) as cargos
        FROM ${t} ${w}`;
      const [r] = await mdQuery(sql);
      const totalCandidatos = Number(r?.total || 0);
      const totalMulheres = Number(r?.mulheres || 0);
      return {
        totalCandidatos,
        totalEleitos: Number(r?.eleitos || 0),
        totalMulheres,
        pctMulheres: totalCandidatos > 0 ? (totalMulheres / totalCandidatos) * 100 : 0,
        totalPartidos: Number(r?.partidos || 0),
        totalMunicipios: Number(r?.municipios || 0),
        totalCargos: Number(r?.cargos || 0),
      };
    },
  });
}

// ═══ CANDIDATOS POR PARTIDO ═══
export function useCandidatosPorPartido() {
  const f = useFilters();
  return useQuery({
    queryKey: ['candidatosPorPartido', f],
    queryFn: async () => {
      const w = buildWhere(f);
      return mdQuery<{partido: string; total: string}>(
        `SELECT ${COL.partido} as partido, count(*) as total FROM ${candTable(f)} ${w} GROUP BY ${COL.partido} ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ partido: r.partido, total: Number(r.total) })));
    },
  });
}

// ═══ DISTRIBUIÇÃO POR GÊNERO ═══
export function useDistribuicaoGenero() {
  const f = useFilters();
  return useQuery({
    queryKey: ['genero', f],
    queryFn: async () => {
      const w = buildWhere(f);
      return mdQuery<{nome: string; total: string}>(
        `SELECT COALESCE(${COL.genero}, 'NÃO INFORMADO') as nome, count(*) as total FROM ${candTable(f)} ${w} GROUP BY nome ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ nome: r.nome, total: Number(r.total) })));
    },
  });
}

// ═══ DISTRIBUIÇÃO POR ESCOLARIDADE ═══
export function useDistribuicaoEscolaridade() {
  const f = useFilters();
  return useQuery({
    queryKey: ['escolaridade', f],
    queryFn: async () => {
      const w = buildWhere(f);
      return mdQuery<{nome: string; total: string}>(
        `SELECT COALESCE(${COL.escolaridade}, 'NÃO INFORMADO') as nome, count(*) as total FROM ${candTable(f)} ${w} GROUP BY nome ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ nome: r.nome, total: Number(r.total) })));
    },
  });
}

// ═══ TOP OCUPAÇÕES ═══
export function useTopOcupacoes() {
  const f = useFilters();
  return useQuery({
    queryKey: ['ocupacoes', f],
    queryFn: async () => {
      const w = buildWhere(f);
      return mdQuery<{nome: string; total: string}>(
        `SELECT COALESCE(${COL.ocupacao}, 'NÃO INFORMADO') as nome, count(*) as total FROM ${candTable(f)} ${w} GROUP BY nome ORDER BY total DESC LIMIT 15`
      ).then(rows => rows.map(r => ({ nome: r.nome, total: Number(r.total) })));
    },
  });
}

// ═══ SITUAÇÃO FINAL ═══
export function useSituacaoFinal() {
  const f = useFilters();
  return useQuery({
    queryKey: ['situacao', f],
    queryFn: async () => {
      const w = buildWhere(f);
      return mdQuery<{nome: string; total: string}>(
        `SELECT COALESCE(${COL.situacaoFinal}, 'NÃO DEFINIDO') as nome, count(*) as total FROM ${candTable(f)} ${w} GROUP BY nome ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ nome: r.nome, total: Number(r.total) })));
    },
  });
}

// ═══ EVOLUÇÃO POR ANO ═══
export function useEvolucaoPorAno() {
  const f = useFilters();
  return useQuery({
    queryKey: ['evolucaoAno', { ...f, ano: null }],
    queryFn: async () => {
      const w = buildWhere({ ...f, ano: null });
      return mdQuery<{ano: string; total: string; mulheres: string; eleitos: string}>(
        `SELECT ${COL.ano} as ano, count(*) as total,
          count(CASE WHEN ${COL.genero} = 'FEMININO' THEN 1 END) as mulheres,
          count(CASE WHEN ${COL.situacaoFinal} ILIKE '%ELEITO%' AND ${COL.situacaoFinal} NOT ILIKE '%NÃO ELEITO%' THEN 1 END) as eleitos
        FROM ${MD.candidatos(null)} ${w} GROUP BY ${COL.ano} ORDER BY ano`
      ).then(rows => rows.map(r => {
        const total = Number(r.total);
        const mulheres = Number(r.mulheres);
        return { ano: Number(r.ano), total, mulheres, eleitos: Number(r.eleitos), pctMulheres: total > 0 ? Math.round(mulheres / total * 100) : 0 };
      }));
    },
  });
}

// ═══ TOP PATRIMÔNIO ═══
export function useTopPatrimonio() {
  const f = useFilters();
  return useQuery({
    queryKey: ['topPatrimonio', f],
    queryFn: async () => {
      const ano = f.ano || 2024;
      return mdQuery<{nome: string; partido: string; cargo: string; patrimonio: string; qtd: string}>(
        `SELECT c.${COL.nomeUrna} as nome, c.${COL.partido} as partido, c.${COL.cargo} as cargo,
          sum(${COL.valorBemNum}) as patrimonio, count(*) as qtd
        FROM ${MD.bens(ano)} b
        JOIN ${MD.candidatos(ano)} c ON b.${COL.sequencial} = c.${COL.sequencial}
        ${buildWhere(f)}
        GROUP BY c.${COL.nomeUrna}, c.${COL.partido}, c.${COL.cargo}
        ORDER BY patrimonio DESC LIMIT 20`
      ).then(rows => rows.map(r => ({
        sequencial: '', nome: r.nome, partido: r.partido, cargo: r.cargo,
        foto_url: null, patrimonio: Number(r.patrimonio),
      })));
    },
  });
}

// ═══ FAIXA ETÁRIA ═══ (calculated from dt_nascimento)
export function useFaixaEtaria() {
  const f = useFilters();
  return useQuery({
    queryKey: ['faixaEtaria', f],
    queryFn: async () => {
      const w = buildWhere(f, `${COL.nascimento} IS NOT NULL AND ${COL.nascimento} != ''`);
      return mdQuery<{faixa: string; total: string}>(
        `SELECT CASE
          WHEN age <= 25 THEN '18-25'
          WHEN age <= 35 THEN '26-35'
          WHEN age <= 45 THEN '36-45'
          WHEN age <= 55 THEN '46-55'
          WHEN age <= 65 THEN '56-65'
          ELSE '66+'
        END as faixa, count(*) as total
        FROM (
          SELECT CAST(EXTRACT(YEAR FROM AGE(CURRENT_DATE, TRY_CAST(${COL.nascimento} AS DATE))) AS INT) as age
          FROM ${candTable(f)} ${w}
        ) sub WHERE age BETWEEN 18 AND 120
        GROUP BY faixa ORDER BY faixa`
      ).then(rows => rows.map(r => ({ faixa: r.faixa, total: Number(r.total) })));
    },
  });
}

// ═══ CANDIDATOS POR CARGO ═══
export function useCandidatosPorCargo() {
  const f = useFilters();
  return useQuery({
    queryKey: ['porCargo', { ...f, cargo: null }],
    queryFn: async () => {
      const w = buildWhere({ ...f, cargo: null });
      return mdQuery<{cargo: string; total: string}>(
        `SELECT COALESCE(${COL.cargo}, 'NÃO DEFINIDO') as cargo, count(*) as total FROM ${candTable(f)} ${w} GROUP BY cargo ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ cargo: r.cargo, total: Number(r.total) })));
    },
  });
}

// ═══ ELEITOS TABLE ═══
export function useEleitos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['eleitos', f],
    queryFn: async () => {
      const w = buildWhere(f, `${COL.situacaoFinal} ILIKE '%ELEITO%' AND ${COL.situacaoFinal} NOT ILIKE '%NÃO ELEITO%'`);
      return mdQuery(
        `SELECT ${COL.nomeUrna} as nome_urna, ${COL.nomeCompleto} as nome_completo, ${COL.partido} as sigla_partido,
          ${COL.cargo} as cargo, ${COL.municipio} as municipio, ${COL.situacaoFinal} as situacao_final,
          ${COL.genero} as genero, ${COL.numero} as numero_urna, ${COL.ano} as ano
        FROM ${candTable(f)} ${w} ORDER BY ${COL.nomeUrna} LIMIT 30`
      );
    },
  });
}

// ═══ PATRIMÔNIO EVOLUÇÃO POR ANO ═══
export function usePatrimonioEvolucaoAno() {
  return useQuery({
    queryKey: ['patrimonioEvolucao'],
    queryFn: async () => {
      const results = await Promise.all(BENS_ANOS.map(async ano => {
        try {
          const [r] = await mdQuery<{total: string; media: string; registros: string}>(
            `SELECT sum(${COL.valorBemNum}) as total, avg(${COL.valorBemNum}) as media, count(*) as registros
            FROM ${MD.bens(ano)}`
          );
          return { ano, total: Number(r?.total || 0), media: Number(r?.media || 0), registros: Number(r?.registros || 0) };
        } catch { return { ano, total: 0, media: 0, registros: 0 }; }
      }));
      return results.filter(r => r.registros > 0);
    },
  });
}

// ═══ PATRIMÔNIO DISTRIBUIÇÃO ═══
export function usePatrimonioDistribuicao() {
  const f = useFilters();
  return useQuery({
    queryKey: ['patrimonioDistrib', f],
    queryFn: async () => {
      const ano = f.ano || 2024;
      return mdQuery<{faixa: string; total: string}>(
        `WITH patri AS (
          SELECT ${COL.sequencial}, sum(${COL.valorBemNum}) as total
          FROM ${MD.bens(ano)}
          GROUP BY ${COL.sequencial}
        )
        SELECT CASE
          WHEN total <= 10000 THEN 'Até R$10k'
          WHEN total <= 50000 THEN 'R$10k-50k'
          WHEN total <= 100000 THEN 'R$50k-100k'
          WHEN total <= 500000 THEN 'R$100k-500k'
          WHEN total <= 1000000 THEN 'R$500k-1M'
          WHEN total <= 5000000 THEN 'R$1M-5M'
          ELSE 'Acima R$5M'
        END as faixa, count(*) as total
        FROM patri GROUP BY faixa ORDER BY min(total)`
      ).then(rows => rows.map(r => ({ faixa: r.faixa, total: Number(r.total) })));
    },
  });
}

// ═══ RANKING ═══
export function useRanking(search: string, page: number, sortBy: string, sortAsc: boolean, pageSize = 30) {
  const f = useFilters();
  return useQuery({
    queryKey: ['ranking', f, search, page, sortBy, sortAsc],
    queryFn: async () => {
      const searchExtra = search ? `(${COL.nomeUrna} ILIKE '%${search}%' OR ${COL.nomeCompleto} ILIKE '%${search}%')` : undefined;
      const w = buildWhere(f, searchExtra, !f.ano);
      const sortMap: Record<string, string> = {
        nome_urna: COL.nomeUrna, nome_completo: COL.nomeCompleto, numero_urna: COL.numero,
        sigla_partido: COL.partido, cargo: COL.cargo, municipio: COL.municipio, ano: COL.ano,
      };
      const orderCol = sortMap[sortBy] || COL.nomeUrna;
      const dir = sortAsc ? 'ASC' : 'DESC';
      const offset = page * pageSize;

      const [countResult, dataResult] = await Promise.all([
        mdQuery<{total: string}>(`SELECT count(*) as total FROM ${candTable(f)} ${w}`),
        mdQuery(
          `SELECT ${COL.sequencial} as id, ${COL.nomeUrna} as nome_urna, ${COL.nomeCompleto} as nome_completo,
            ${COL.numero} as numero_urna, ${COL.partido} as sigla_partido, ${COL.cargo} as cargo,
            ${COL.municipio} as municipio, ${COL.ano} as ano, ${COL.genero} as genero,
            ${COL.escolaridade} as grau_instrucao, ${COL.situacaoFinal} as situacao_final,
            ${COL.ocupacao} as ocupacao
          FROM ${candTable(f)} ${w}
          ORDER BY ${orderCol} ${dir} LIMIT ${pageSize} OFFSET ${offset}`
        ),
      ]);

      return {
        data: dataResult.map((c: any) => ({ ...c, total_votos: 0 })),
        count: Number(countResult[0]?.total || 0),
        pageSize,
        hasVotos: false,
      };
    },
  });
}

// ═══ CANDIDATO PERFIL ═══
export function useCandidato(id: string) {
  return useQuery({
    queryKey: ['candidato', id],
    queryFn: async () => {
      // Search across all years
      const rows = await mdQuery(
        `SELECT ${COL.sequencial} as id, ${COL.sequencial} as sequencial_candidato,
          ${COL.nomeUrna} as nome_urna, ${COL.nomeCompleto} as nome_completo,
          ${COL.numero} as numero_urna, ${COL.partido} as sigla_partido, nm_partido as nome_partido,
          ${COL.cargo} as cargo, ${COL.municipio} as municipio, ${COL.ano} as ano,
          ${COL.genero} as genero, ${COL.escolaridade} as grau_instrucao,
          ${COL.ocupacao} as ocupacao, ${COL.situacaoFinal} as situacao_final,
          ${COL.nascimento} as data_nascimento, ${COL.nacionalidade} as nacionalidade,
          ${COL.turno} as turno
        FROM ${MD.candidatos(null)}
        WHERE CAST(${COL.sequencial} AS VARCHAR) = '${id}'
        LIMIT 1`
      );
      return rows[0] || null;
    },
    enabled: !!id,
  });
}

export function usePatrimonioCandidato(sequencialCandidato: string) {
  return useQuery({
    queryKey: ['patrimonio', sequencialCandidato],
    queryFn: async () => {
      return mdQuery(
        `SELECT ${COL.ordemBem} as ordem_bem, ${COL.tipoBem} as tipo_bem,
          ${COL.descBem} as descricao_bem, ${COL.valorBemNum} as valor_bem
        FROM ${MD.bens(null)}
        WHERE CAST(${COL.sequencial} AS VARCHAR) = '${sequencialCandidato}'
        ORDER BY ${COL.ordemBem}`
      );
    },
    enabled: !!sequencialCandidato,
  });
}

export function useEvolucaoPatrimonio(nomeUrna: string) {
  return useQuery({
    queryKey: ['evolucaoPatrimonio', nomeUrna],
    queryFn: async () => {
      if (!nomeUrna) return [];
      const results = await Promise.all(BENS_ANOS.map(async ano => {
        try {
          const [r] = await mdQuery<{patrimonio: string}>(
            `SELECT sum(${COL.valorBemNum}) as patrimonio
            FROM ${MD.bens(ano)} b
            JOIN ${MD.candidatos(ano)} c ON CAST(b.${COL.sequencial} AS VARCHAR) = CAST(c.${COL.sequencial} AS VARCHAR)
            WHERE c.${COL.nomeUrna} = '${nomeUrna.replace(/'/g, "''")}'`
          );
          const p = Number(r?.patrimonio || 0);
          return p > 0 ? { ano, patrimonio: p } : null;
        } catch { return null; }
      }));
      return results.filter(Boolean).sort((a: any, b: any) => a.ano - b.ano);
    },
    enabled: !!nomeUrna,
  });
}

export function useCandidatoVotos(nomeUrna: string, ano: number) {
  return useQuery({
    queryKey: ['candidatoVotos', nomeUrna, ano],
    queryFn: async () => {
      if (!nomeUrna || !ano) return [];
      try {
        return await mdQuery(
          `SELECT nm_municipio as municipio, nr_zona as zona, qt_votos_nominais as total_votos, ds_cargo as cargo
          FROM ${MD.votacao(ano)}
          WHERE nm_urna_candidato = '${nomeUrna.replace(/'/g, "''")}'
          ORDER BY total_votos DESC LIMIT 500`
        );
      } catch { return []; }
    },
    enabled: !!nomeUrna && !!ano,
  });
}

// ═══ MUNICÍPIO ═══
export function useMunicipioResumo(municipio: string | null) {
  return useQuery({
    queryKey: ['municipioResumo', municipio],
    queryFn: async () => {
      if (!municipio) return null;
      const anos = COMP_ANOS;
      const queries = anos.map(ano =>
        mdQuery<{ano: string; apto: string; comp: string; abst: string}>(
          `SELECT ${ano} as ano, sum(qt_aptos) as apto, sum(qt_comparecimento) as comp, sum(qt_abstencoes) as abst
          FROM ${MD.comparecimento(ano)} WHERE nm_municipio = '${municipio}'`
        ).catch(() => [])
      );
      const results = await Promise.all(queries);
      const historico = results.flat().filter(r => r && Number(r.apto) > 0).map(r => ({
        ano: Number(r.ano), apto: Number(r.apto), comp: Number(r.comp), abst: Number(r.abst),
      }));
      const totals = historico.reduce((acc, r) => ({ apto: acc.apto + r.apto, comp: acc.comp + r.comp, abst: acc.abst + r.abst }), { apto: 0, comp: 0, abst: 0 });
      return { totals, historico };
    },
    enabled: !!municipio,
  });
}

export function useMunicipioCandidatos(municipio: string | null) {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['municipioCandidatos', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      return mdQuery(
        `SELECT ${COL.sequencial} as id, ${COL.nomeUrna} as nome_urna, ${COL.partido} as sigla_partido,
          ${COL.cargo} as cargo, ${COL.situacaoFinal} as situacao_final, ${COL.numero} as numero_urna,
          ${COL.genero} as genero, ${COL.escolaridade} as grau_instrucao
        FROM ${MD.candidatos(ano || 2024)} WHERE ${COL.municipio} = '${municipio}'
        ORDER BY ${COL.nomeUrna} LIMIT 500`
      );
    },
    enabled: !!municipio,
  });
}

export function useMunicipioVotos(municipio: string | null) {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['municipioVotos', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      const anoVal = ano || 2024;
      try {
        return await mdQuery(
          `SELECT nm_urna_candidato as nome_candidato, sg_partido as partido, ds_cargo as cargo,
            sum(qt_votos_nominais) as total_votos, nr_candidato as numero_urna
          FROM ${MD.votacao(anoVal)} WHERE nm_municipio = '${municipio}'
          GROUP BY nm_urna_candidato, sg_partido, ds_cargo, nr_candidato
          ORDER BY total_votos DESC LIMIT 200`
        );
      } catch { return []; }
    },
    enabled: !!municipio,
  });
}

// ═══ BAIRRO ═══
export function useVotosPorBairro(municipio: string, ano?: number) {
  return useQuery({
    queryKey: ['votosBairro', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      const anoVal = ano || 2024;
      try {
        return await mdQuery<{bairro: string; apto: string; comp: string; abst: string}>(
          `SELECT nm_bairro as bairro, sum(qt_aptos) as apto, sum(qt_comparecimento) as comp, sum(qt_abstencoes) as abst
          FROM ${MD.comparecimentoSecao(anoVal)} WHERE nm_municipio = '${municipio}'
          GROUP BY nm_bairro ORDER BY apto DESC`
        ).then(rows => rows.map(r => ({ bairro: r.bairro || 'NÃO INFORMADO', apto: Number(r.apto), comp: Number(r.comp), abst: Number(r.abst) })));
      } catch { return []; }
    },
    enabled: !!municipio,
  });
}

export function useVotosPorLocal(municipio: string, ano?: number, bairro?: string) {
  return useQuery({
    queryKey: ['votosLocal', municipio, ano, bairro],
    queryFn: async () => {
      if (!municipio) return [];
      const anoVal = ano || 2024;
      const bairroFilter = bairro ? `AND nm_bairro = '${bairro}'` : '';
      try {
        return await mdQuery(
          `SELECT nm_local_votacao as local, nm_bairro as bairro, sum(qt_aptos) as apto, sum(qt_comparecimento) as comp
          FROM ${MD.comparecimentoSecao(anoVal)} WHERE nm_municipio = '${municipio}' ${bairroFilter}
          GROUP BY nm_local_votacao, nm_bairro ORDER BY apto DESC`
        ).then(rows => rows.map((r: any) => ({ local: r.local, bairro: r.bairro, apto: Number(r.apto), comp: Number(r.comp) })));
      } catch { return []; }
    },
    enabled: !!municipio,
  });
}

// ═══ POR PARTIDO ═══
export function usePartidoResumo() {
  const f = useFilters();
  return useQuery({
    queryKey: ['partidosResumo', f],
    queryFn: async () => {
      const w = buildWhere(f);
      const candidatos = await mdQuery<{partido: string; candidatos: string; eleitos: string; mulheres: string}>(
        `SELECT ${COL.partido} as partido, count(*) as candidatos,
          count(CASE WHEN ${COL.situacaoFinal} ILIKE '%ELEITO%' AND ${COL.situacaoFinal} NOT ILIKE '%NÃO ELEITO%' THEN 1 END) as eleitos,
          count(CASE WHEN ${COL.genero} = 'FEMININO' THEN 1 END) as mulheres
        FROM ${candTable(f)} ${w} GROUP BY ${COL.partido} ORDER BY candidatos DESC`
      );
      return {
        partidos: candidatos.map(r => ({ partido: r.partido, candidatos: Number(r.candidatos), votos: 0, eleitos: Number(r.eleitos), mulheres: Number(r.mulheres) })),
        hasVotos: false,
      };
    },
  });
}

export function usePartidoDetalhe(partido: string | null) {
  const f = useFilters();
  return useQuery({
    queryKey: ['partidoDetalhe', partido, f],
    queryFn: async () => {
      if (!partido) return [];
      return mdQuery(
        `SELECT ${COL.sequencial} as id, ${COL.nomeUrna} as nome_urna, ${COL.cargo} as cargo,
          ${COL.municipio} as municipio, ${COL.partido} as sigla_partido,
          ${COL.situacaoFinal} as situacao_final
        FROM ${candTable(f)} WHERE ${COL.partido} = '${partido}'
        ORDER BY ${COL.nomeUrna} LIMIT 50`
      );
    },
    enabled: !!partido,
  });
}

// ═══ LISTS ═══
export function useMunicipios() {
  return useQuery({
    queryKey: ['municipiosLista'],
    queryFn: async () => {
      const rows = await mdQuery<{m: string}>(`SELECT DISTINCT ${COL.municipio} as m FROM ${MD.candidatos(2024)} WHERE ${COL.municipio} IS NOT NULL ORDER BY m`);
      return rows.map(r => r.m);
    },
  });
}

export function usePartidos() {
  return useQuery({
    queryKey: ['partidosLista'],
    queryFn: async () => {
      const rows = await mdQuery<{p: string}>(`SELECT DISTINCT ${COL.partido} as p FROM ${MD.candidatos(2024)} WHERE ${COL.partido} IS NOT NULL ORDER BY p`);
      return rows.map(r => r.p);
    },
  });
}

export function useImportLogs() {
  return useQuery({
    queryKey: ['importLogs'],
    queryFn: async () => {
      const { data } = await (supabase.from('bd_eleicoes_importacoes_log' as any) as any).select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
  });
}

// ═══ PERFIL CANDIDATOS ═══
export function usePerfilCandidatos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['perfilCandidatos', f],
    queryFn: async () => {
      const t = candTable(f);
      const w = buildWhere(f);
      const [total, generos, instrucoes, ocupacoes] = await Promise.all([
        mdQuery<{total: string}>(`SELECT count(*) as total FROM ${t} ${w}`),
        mdQuery<{nome: string; total: string}>(`SELECT COALESCE(${COL.genero}, 'NÃO INFORMADO') as nome, count(*) as total FROM ${t} ${w} GROUP BY nome ORDER BY total DESC`),
        mdQuery<{nome: string; total: string}>(`SELECT COALESCE(${COL.escolaridade}, 'NÃO INFORMADO') as nome, count(*) as total FROM ${t} ${w} GROUP BY nome ORDER BY total DESC`),
        mdQuery<{nome: string; total: string}>(`SELECT COALESCE(${COL.ocupacao}, 'NÃO INFORMADO') as nome, count(*) as total FROM ${t} ${w} GROUP BY nome ORDER BY total DESC LIMIT 15`),
      ]);
      return {
        total: Number(total[0]?.total || 0),
        generos: generos.map(r => ({ nome: r.nome, total: Number(r.total) })),
        instrucoes: instrucoes.map(r => ({ nome: r.nome, total: Number(r.total) })),
        ocupacoes: ocupacoes.map(r => ({ nome: r.nome, total: Number(r.total) })),
      };
    },
  });
}

// ═══ PATRIMÔNIO POR PARTIDO ═══
export function usePatrimonioPorPartido() {
  const f = useFilters();
  return useQuery({
    queryKey: ['patrimonioPorPartido', f],
    queryFn: async () => {
      const ano = f.ano || 2024;
      return mdQuery<{partido: string; total: string; media: string}>(
        `SELECT c.${COL.partido} as partido, sum(${COL.valorBemNum}) as total, avg(${COL.valorBemNum}) as media
        FROM ${MD.bens(ano)} b
        JOIN ${MD.candidatos(ano)} c ON CAST(b.${COL.sequencial} AS VARCHAR) = CAST(c.${COL.sequencial} AS VARCHAR)
        ${buildWhere(f)}
        GROUP BY c.${COL.partido} ORDER BY total DESC LIMIT 15`
      ).then(rows => rows.map(r => ({ partido: r.partido, total: Number(r.total), media: Number(r.media) })));
    },
  });
}

// ═══ EXPLORADOR ═══
export function useExplorador(page: number, pageSize: number, sortBy: string, sortAsc: boolean) {
  const f = useFilters();
  return useQuery({
    queryKey: ['explorador', f, page, pageSize, sortBy, sortAsc],
    queryFn: async () => {
      const t = candTable(f);
      const w = buildWhere(f);
      const sortMap: Record<string, string> = {
        nome_urna: COL.nomeUrna, nome_completo: COL.nomeCompleto, numero_urna: COL.numero,
        sigla_partido: COL.partido, cargo: COL.cargo, municipio: COL.municipio, ano: COL.ano,
        genero: COL.genero, grau_instrucao: COL.escolaridade, ocupacao: COL.ocupacao,
        situacao_final: COL.situacaoFinal,
      };
      const orderCol = sortMap[sortBy] || COL.nomeUrna;
      const dir = sortAsc ? 'ASC' : 'DESC';
      const offset = page * pageSize;

      const [countRes, dataRes] = await Promise.all([
        mdQuery<{total: string}>(`SELECT count(*) as total FROM ${t} ${w}`),
        mdQuery(
          `SELECT ${COL.sequencial} as id, ${COL.nomeUrna} as nome_urna, ${COL.nomeCompleto} as nome_completo,
            ${COL.numero} as numero_urna, ${COL.partido} as sigla_partido, ${COL.cargo} as cargo,
            ${COL.municipio} as municipio, ${COL.ano} as ano, ${COL.genero} as genero,
            ${COL.escolaridade} as grau_instrucao, ${COL.ocupacao} as ocupacao,
            ${COL.situacaoFinal} as situacao_final
          FROM ${t} ${w}
          ORDER BY ${orderCol} ${dir} LIMIT ${pageSize} OFFSET ${offset}`
        ),
      ]);
      return { data: dataRes, count: Number(countRes[0]?.total || 0), pageSize };
    },
  });
}

// ═══ MUNICÍPIOS RANKING ═══
export function useMunicipiosRanking() {
  const f = useFilters();
  return useQuery({
    queryKey: ['municipiosRanking', f],
    queryFn: async () => {
      const w = buildWhere({ ...f, municipio: null });
      return mdQuery<{municipio: string; total: string; eleitos: string; mulheres: string}>(
        `SELECT ${COL.municipio} as municipio, count(*) as total,
          count(CASE WHEN ${COL.situacaoFinal} ILIKE '%ELEITO%' AND ${COL.situacaoFinal} NOT ILIKE '%NÃO ELEITO%' THEN 1 END) as eleitos,
          count(CASE WHEN ${COL.genero} = 'FEMININO' THEN 1 END) as mulheres
        FROM ${candTable(f)} ${w} GROUP BY ${COL.municipio} ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ municipio: r.municipio, total: Number(r.total), eleitos: Number(r.eleitos), mulheres: Number(r.mulheres) })));
    },
  });
}

// ═══ VOTOS BRANCOS/NULOS ═══
export function useVotosBrancosNulos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['votosBrancosNulos', f],
    queryFn: async () => {
      const targetAnos = f.ano ? [f.ano] : COMP_ANOS;
      const results = await Promise.all(targetAnos.map(async ano => {
        const munFilter = f.municipio ? `AND nm_municipio = '${f.municipio}'` : '';
        try {
          const [r] = await mdQuery<{brancos: string; nulos: string; comp: string}>(
            `SELECT sum(qt_votos_brancos) as brancos, sum(qt_votos_nulos) as nulos, sum(qt_comparecimento) as comp
            FROM ${MD.comparecimento(ano)} WHERE 1=1 ${munFilter}`
          );
          const comp = Number(r?.comp || 0);
          const brancos = Number(r?.brancos || 0);
          const nulos = Number(r?.nulos || 0);
          if (comp === 0) return null;
          return { ano, brancos, nulos, comp, pctBrancos: (brancos / comp) * 100, pctNulos: (nulos / comp) * 100 };
        } catch { return null; }
      }));
      return results.filter(Boolean).sort((a: any, b: any) => a.ano - b.ano);
    },
  });
}

// ═══ TAXA DE REELEIÇÃO ═══
export function useTaxaReeleicao() {
  return useQuery({
    queryKey: ['taxaReeleicao'],
    queryFn: async () => {
      const t = MD.candidatos(null);
      const rows = await mdQuery<{recandidatos: string; reeleitos: string}>(
        `WITH eleitos AS (
          SELECT ${COL.nomeUrna} as nome, ${COL.ano} as ano
          FROM ${t}
          WHERE ${COL.situacaoFinal} ILIKE '%ELEITO%' AND ${COL.situacaoFinal} NOT ILIKE '%NÃO ELEITO%'
        ),
        recand AS (
          SELECT c.${COL.nomeUrna} as nome, c.${COL.ano} as ano, c.${COL.situacaoFinal} as sit
          FROM ${t} c
          JOIN eleitos e ON c.${COL.nomeUrna} = e.nome AND c.${COL.ano} > e.ano
        )
        SELECT count(*) as recandidatos,
          count(CASE WHEN sit ILIKE '%ELEITO%' AND sit NOT ILIKE '%NÃO ELEITO%' THEN 1 END) as reeleitos
        FROM recand`
      );
      const r = rows[0] || { recandidatos: '0', reeleitos: '0' };
      const recandidatos = Number(r.recandidatos);
      const reeleitos = Number(r.reeleitos);
      return { recandidatos, reeleitos, taxa: recandidatos > 0 ? (reeleitos / recandidatos) * 100 : 0 };
    },
  });
}

// ═══ PATRIMÔNIO VS VOTOS ═══
export function usePatrimonioVsVotos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['patrimonioVsVotos', f],
    queryFn: async () => {
      const ano = f.ano || 2024;
      try {
        return await mdQuery(
          `SELECT c.${COL.nomeUrna} as nome, c.${COL.partido} as partido,
            sum(${COL.valorBemNum}) as patrimonio, COALESCE(sum(v.qt_votos_nominais), 0) as votos
          FROM ${MD.candidatos(ano)} c
          JOIN ${MD.bens(ano)} b ON CAST(c.${COL.sequencial} AS VARCHAR) = CAST(b.${COL.sequencial} AS VARCHAR)
          LEFT JOIN ${MD.votacao(ano)} v ON c.nm_urna_candidato = v.nm_urna_candidato AND c.nm_ue = v.nm_municipio
          GROUP BY c.${COL.nomeUrna}, c.${COL.partido}
          HAVING sum(${COL.valorBemNum}) > 0
          ORDER BY patrimonio DESC LIMIT 100`
        );
      } catch { return []; }
    },
  });
}

// ═══ COMPARATIVO ENTRE ANOS ═══
export function useComparativoAnos() {
  return useQuery({
    queryKey: ['comparativoAnos'],
    queryFn: async () => {
      const results = await Promise.all(CAND_ANOS.map(async ano => {
        try {
          const [r] = await mdQuery<{total: string; eleitos: string; mulheres: string; cargos: string}>(
            `SELECT count(*) as total,
              count(CASE WHEN ${COL.situacaoFinal} ILIKE '%ELEITO%' AND ${COL.situacaoFinal} NOT ILIKE '%NÃO ELEITO%' THEN 1 END) as eleitos,
              count(CASE WHEN ${COL.genero} = 'FEMININO' THEN 1 END) as mulheres,
              count(DISTINCT ${COL.cargo}) as cargos
            FROM ${MD.candidatos(ano)}`
          );
          const total = Number(r?.total || 0);
          const mulheres = Number(r?.mulheres || 0);
          const eleitos = Number(r?.eleitos || 0);
          return {
            ano, total, eleitos, mulheres,
            pctMulheres: total > 0 ? Math.round((mulheres / total) * 100) : 0,
            pctEleitos: total > 0 ? Math.round((eleitos / total) * 100) : 0,
            cargos: Number(r?.cargos || 0),
          };
        } catch { return null; }
      }));
      return results.filter(Boolean).sort((a: any, b: any) => a.ano - b.ano);
    },
  });
}

// ═══ VOTAÇÃO POR ZONA ELEITORAL ═══
export function useVotacaoPorZona(municipio?: string) {
  const f = useFilters();
  return useQuery({
    queryKey: ['votacaoZona', municipio || f.municipio, f.ano],
    queryFn: async () => {
      const mun = municipio || f.municipio;
      if (!mun) return [];
      const ano = f.ano || 2024;
      try {
        return await mdQuery<{zona: string; apto: string; comp: string; abst: string; brancos: string; nulos: string}>(
          `SELECT nr_zona as zona, sum(qt_aptos) as apto, sum(qt_comparecimento) as comp,
            sum(qt_abstencoes) as abst, sum(qt_votos_brancos) as brancos, sum(qt_votos_nulos) as nulos
          FROM ${MD.comparecimento(ano)} WHERE nm_municipio = '${mun}'
          GROUP BY nr_zona ORDER BY zona`
        ).then(rows => rows.map(r => ({
          zona: Number(r.zona), apto: Number(r.apto), comp: Number(r.comp),
          abst: Number(r.abst), brancos: Number(r.brancos), nulos: Number(r.nulos),
        })));
      } catch { return []; }
    },
    enabled: !!(municipio || f.municipio),
  });
}

// ═══ NACIONALIDADE ═══
export function useNacionalidade() {
  const f = useFilters();
  return useQuery({
    queryKey: ['nacionalidade', f],
    queryFn: async () => {
      const w = buildWhere(f);
      return mdQuery<{nome: string; total: string}>(
        `SELECT COALESCE(${COL.nacionalidade}, 'NÃO INFORMADO') as nome, count(*) as total
        FROM ${candTable(f)} ${w} GROUP BY nome ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ nome: r.nome, total: Number(r.total) })));
    },
  });
}
