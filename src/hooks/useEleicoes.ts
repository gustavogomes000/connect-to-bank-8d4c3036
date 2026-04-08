import { useFilterStore } from '@/stores/filterStore';
import { useQuery } from '@tanstack/react-query';
import {
  mdQuery,
  getTableName,
  getAnosDisponiveis,
  sqlPainelCandidatos,
  sqlPerfilCandidato,
  sqlBensCandidato,
  sqlPatrimonioCandidato,
  sqlVotacaoPorZona,
  sqlHistoricoCandidato,
  sqlRankingPatrimonio,
  sqlComparecimento,
  sqlRankingPartidos,
  sqlDistribuicaoGenero,
  sqlDistribuicaoEscolaridade,
  sqlResumoEleicao,
  sqlEleitoresPorBairro,
  sqlEvolucaoComparecimento,
  sqlLocaisVotacao,
  sqlSecoesLocal,
} from '@/lib/motherduck';

// ═══════════════════════════════════════════════════════════════
// HELPER: lê filtros do Zustand
// ═══════════════════════════════════════════════════════════════

function useFilters() {
  const s = useFilterStore();
  return { ano: s.ano, municipio: s.municipio, cargo: s.cargo, turno: s.turno, partido: s.partido, zona: s.zona, bairro: s.bairro, escola: s.escola, searchText: s.searchText };
}

type Filtros = ReturnType<typeof useFilters>;

function toFiltrosPainel(f: Filtros) {
  return {
    ano: f.ano,
    municipio: f.municipio || undefined,
    cargo: f.cargo || undefined,
    turno: f.turno || undefined,
    partido: f.partido || undefined,
    zona: f.zona || undefined,
    bairro: f.bairro || undefined,
    escola: f.escola || undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. PAINEL GERAL — ranking de candidatos com votos
// ═══════════════════════════════════════════════════════════════

export function usePainelGeral(limite = 100) {
  const f = useFilters();
  return useQuery({
    queryKey: ['painelGeral', f, limite],
    queryFn: () => mdQuery(sqlPainelCandidatos({ ...toFiltrosPainel(f), limite })),
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. DOSSIÊ DO CANDIDATO — perfil + bens + votação por zona
// ═══════════════════════════════════════════════════════════════

export function useDossieCandidato(sq: string | null, ano?: number) {
  const { ano: anoStore } = useFilterStore();
  const anoFinal = ano || anoStore;

  const perfil = useQuery({
    queryKey: ['dossiePerfil', sq, anoFinal],
    queryFn: () => mdQuery(sqlPerfilCandidato(anoFinal, { sq: sq! })),
    enabled: !!sq,
    staleTime: 5 * 60 * 1000,
  });

  const bens = useQuery({
    queryKey: ['dossieBens', sq, anoFinal],
    queryFn: () => mdQuery(sqlBensCandidato(anoFinal, sq!)),
    enabled: !!sq,
    staleTime: 5 * 60 * 1000,
  });

  const patrimonio = useQuery({
    queryKey: ['dossiePatrimonio', sq, anoFinal],
    queryFn: () => mdQuery(sqlPatrimonioCandidato(anoFinal, sq!)),
    enabled: !!sq,
    staleTime: 5 * 60 * 1000,
  });

  const votacaoZona = useQuery({
    queryKey: ['dossieVotacaoZona', sq, anoFinal],
    queryFn: () => mdQuery(sqlVotacaoPorZona(anoFinal, sq!)),
    enabled: !!sq,
    staleTime: 5 * 60 * 1000,
  });

  return {
    perfil: perfil.data?.[0] || null,
    bens: bens.data || [],
    patrimonio: patrimonio.data?.[0] || null,
    votacaoZona: votacaoZona.data || [],
    isLoading: perfil.isLoading || bens.isLoading,
    error: perfil.error || bens.error,
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. HISTÓRICO DO CANDIDATO (múltiplas eleições por CPF)
// ═══════════════════════════════════════════════════════════════

export function useHistoricoCandidato(cpf: string | null) {
  return useQuery({
    queryKey: ['historicoCandidato', cpf],
    queryFn: () => mdQuery(sqlHistoricoCandidato(cpf!)),
    enabled: !!cpf,
    staleTime: 10 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 4. ZONAS ELEITORAIS — desempenho por zona
// ═══════════════════════════════════════════════════════════════

export function useZonasEleitorais(sqCandidato?: string) {
  const f = useFilters();
  return useQuery({
    queryKey: ['zonasEleitorais', sqCandidato, f],
    queryFn: () => mdQuery(sqlVotacaoPorZona(f.ano, sqCandidato!, toFiltrosPainel(f))),
    enabled: !!sqCandidato,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 5. ESCOLAS/LOCAIS DE VOTAÇÃO — logística eleitoral
// ═══════════════════════════════════════════════════════════════

export function useLocaisVotacao(municipio?: string) {
  const { ano, municipio: munStore } = useFilterStore();
  const mun = municipio || munStore;
  return useQuery({
    queryKey: ['locaisVotacao', mun, ano],
    queryFn: () => mdQuery(sqlLocaisVotacao(ano, mun)),
    enabled: !!mun,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSecoesLocal(localVotacao: string | null, municipio?: string) {
  const { ano, municipio: munStore } = useFilterStore();
  const mun = municipio || munStore;
  return useQuery({
    queryKey: ['secoesLocal', localVotacao, mun, ano],
    queryFn: () => mdQuery(sqlSecoesLocal(ano, mun, localVotacao!)),
    enabled: !!mun && !!localVotacao,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEscolasEleitorais(municipio?: string) {
  const { ano, municipio: munStore } = useFilterStore();
  const mun = municipio || munStore;
  return useQuery({
    queryKey: ['escolasEleitorais', mun, ano],
    queryFn: () => mdQuery(sqlEleitoresPorBairro(ano, mun)),
    enabled: !!mun,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 6. RESUMO / KPIs da eleição
// ═══════════════════════════════════════════════════════════════

export function useKPIs() {
  const f = useFilters();
  return useQuery({
    queryKey: ['kpis', f],
    queryFn: async () => {
      const rows = await mdQuery(sqlResumoEleicao(toFiltrosPainel(f)));
      const r = rows[0] as any || {};
      const total = Number(r.total_candidatos || 0);
      const mulheres = Number(r.mulheres || 0);
      return {
        totalCandidatos: total,
        totalEleitos: Number(r.eleitos || 0),
        totalMulheres: mulheres,
        pctMulheres: total > 0 ? (mulheres / total) * 100 : 0,
        totalPartidos: Number(r.partidos || 0),
        totalMunicipios: Number(r.municipios || 0),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 7. RANKING DE PATRIMÔNIO
// ═══════════════════════════════════════════════════════════════

export function useTopPatrimonio(limite = 20) {
  const f = useFilters();
  return useQuery({
    queryKey: ['topPatrimonio', f, limite],
    queryFn: () => mdQuery(sqlRankingPatrimonio({ ...toFiltrosPainel(f), limite })),
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 8. COMPARECIMENTO / ABSTENÇÃO
// ═══════════════════════════════════════════════════════════════

export function useComparecimento() {
  const f = useFilters();
  return useQuery({
    queryKey: ['comparecimento', f],
    queryFn: () => mdQuery(sqlComparecimento(toFiltrosPainel(f))),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEvolucaoComparecimento(municipio?: string) {
  const { municipio: munStore } = useFilterStore();
  const mun = municipio || munStore;
  return useQuery({
    queryKey: ['evolucaoComparecimento', mun],
    queryFn: () => mdQuery(sqlEvolucaoComparecimento(mun)),
    enabled: !!mun,
    staleTime: 10 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 9. RANKING DE PARTIDOS
// ═══════════════════════════════════════════════════════════════

export function useRankingPartidos(limite = 20) {
  const f = useFilters();
  return useQuery({
    queryKey: ['rankingPartidos', f, limite],
    queryFn: () => mdQuery(sqlRankingPartidos({ ...toFiltrosPainel(f), limite })),
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 10. DISTRIBUIÇÕES (gênero, escolaridade)
// ═══════════════════════════════════════════════════════════════

export function useDistribuicaoGenero() {
  const f = useFilters();
  return useQuery({
    queryKey: ['genero', f],
    queryFn: () => mdQuery(sqlDistribuicaoGenero(toFiltrosPainel(f))),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDistribuicaoEscolaridade() {
  const f = useFilters();
  return useQuery({
    queryKey: ['escolaridade', f],
    queryFn: () => mdQuery(sqlDistribuicaoEscolaridade(toFiltrosPainel(f))),
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 11. LISTAS PARA FILTROS (municípios, partidos)
// ═══════════════════════════════════════════════════════════════

export function useMunicipios() {
  return useQuery({
    queryKey: ['municipiosLista'],
    queryFn: async () => {
      const rows = await mdQuery<{ m: string }>(
        `SELECT DISTINCT NM_UE AS m FROM ${getTableName('candidatos', 2024)} WHERE NM_UE IS NOT NULL ORDER BY m`
      );
      return rows.map(r => r.m);
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function usePartidos() {
  return useQuery({
    queryKey: ['partidosLista'],
    queryFn: async () => {
      const rows = await mdQuery<{ p: string }>(
        `SELECT DISTINCT SG_PARTIDO AS p FROM ${getTableName('candidatos', 2024)} WHERE SG_PARTIDO IS NOT NULL ORDER BY p`
      );
      return rows.map(r => r.p);
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useCargos() {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['cargosLista', ano],
    queryFn: async () => {
      const rows = await mdQuery<{ c: string }>(
        `SELECT DISTINCT DS_CARGO AS c FROM ${getTableName('candidatos', ano)} WHERE DS_CARGO IS NOT NULL ORDER BY c`
      );
      return rows.map(r => r.c);
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ── Filtros geográficos em cascata: Zona → Bairro → Escola ──

export function useZonas() {
  const { ano, municipio } = useFilterStore();
  return useQuery({
    queryKey: ['zonasLista', municipio, ano],
    queryFn: async () => {
      const loc = getTableName('eleitorado_local', ano);
      const rows = await mdQuery<{ z: number }>(
        `SELECT DISTINCT NR_ZONA AS z FROM ${loc} WHERE SG_UF = 'GO' AND NM_MUNICIPIO = '${municipio}' ORDER BY z`
      );
      return rows.map(r => r.z);
    },
    enabled: !!municipio,
    staleTime: 30 * 60 * 1000,
  });
}

export function useBairros() {
  const { ano, municipio, zona } = useFilterStore();
  return useQuery({
    queryKey: ['bairrosLista', municipio, zona, ano],
    queryFn: async () => {
      const loc = getTableName('eleitorado_local', ano);
      const zonaCond = zona ? ` AND NR_ZONA = ${zona}` : '';
      const rows = await mdQuery<{ b: string }>(
        `SELECT DISTINCT NM_BAIRRO AS b FROM ${loc} WHERE SG_UF = 'GO' AND NM_MUNICIPIO = '${municipio}'${zonaCond} AND NM_BAIRRO IS NOT NULL AND NM_BAIRRO != '' ORDER BY b`
      );
      return rows.map(r => r.b);
    },
    enabled: !!municipio,
    staleTime: 30 * 60 * 1000,
  });
}

export function useEscolas() {
  const { ano, municipio, bairro } = useFilterStore();
  return useQuery({
    queryKey: ['escolasLista', municipio, bairro, ano],
    queryFn: async () => {
      const loc = getTableName('eleitorado_local', ano);
      const rows = await mdQuery<{ e: string }>(
        `SELECT DISTINCT NM_LOCAL_VOTACAO AS e FROM ${loc} WHERE SG_UF = 'GO' AND NM_MUNICIPIO = '${municipio}' AND NM_BAIRRO = '${bairro}' AND NM_LOCAL_VOTACAO IS NOT NULL ORDER BY e`
      );
      return rows.map(r => r.e);
    },
    enabled: !!municipio && !!bairro,
    staleTime: 30 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 12. EXPLORADOR / RANKING PAGINADO
// ═══════════════════════════════════════════════════════════════

export function useExplorador(page: number, pageSize: number, sortBy: string, sortAsc: boolean) {
  const f = useFilters();
  return useQuery({
    queryKey: ['explorador', f, page, pageSize, sortBy, sortAsc],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      if (f.partido) conds.push(`SG_PARTIDO = '${f.partido}'`);
      if (f.turno) conds.push(`NR_TURNO = ${f.turno}`);
      if (f.searchText) conds.push(`(NM_URNA_CANDIDATO ILIKE '%${f.searchText}%' OR NM_CANDIDATO ILIKE '%${f.searchText}%')`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      const sortMap: Record<string, string> = {
        nome_urna: 'NM_URNA_CANDIDATO', sigla_partido: 'SG_PARTIDO',
        cargo: 'DS_CARGO', municipio: 'NM_UE', numero_urna: 'NR_CANDIDATO',
      };
      const orderCol = sortMap[sortBy] || 'NM_URNA_CANDIDATO';
      const dir = sortAsc ? 'ASC' : 'DESC';
      const offset = page * pageSize;

      const [countRes, dataRes] = await Promise.all([
        mdQuery<{ total: string }>(`SELECT count(*) AS total FROM ${cand} ${where}`),
        mdQuery(
          `SELECT SQ_CANDIDATO AS id, NM_URNA_CANDIDATO AS nome_urna, NM_CANDIDATO AS nome_completo,
            NR_CANDIDATO AS numero_urna, SG_PARTIDO AS sigla_partido, DS_CARGO AS cargo,
            NM_UE AS municipio, DS_GENERO AS genero, DS_GRAU_INSTRUCAO AS grau_instrucao,
            DS_OCUPACAO AS ocupacao, DS_SIT_TOT_TURNO AS situacao_final
          FROM ${cand} ${where}
          ORDER BY ${orderCol} ${dir} LIMIT ${pageSize} OFFSET ${offset}`
        ),
      ]);
      return { data: dataRes, count: Number(countRes[0]?.total || 0), pageSize };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 13. RANKING (alias legado)
// ═══════════════════════════════════════════════════════════════

export function useRanking(search: string, page: number, sortBy: string, sortAsc: boolean, pageSize = 30) {
  const f = useFilters();
  return useQuery({
    queryKey: ['ranking', f, search, page, sortBy, sortAsc],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      if (f.partido) conds.push(`SG_PARTIDO = '${f.partido}'`);
      if (f.turno) conds.push(`NR_TURNO = ${f.turno}`);
      if (search) conds.push(`(NM_URNA_CANDIDATO ILIKE '%${search}%' OR NM_CANDIDATO ILIKE '%${search}%')`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const offset = page * pageSize;

      const sortMap: Record<string, string> = {
        nome_urna: 'NM_URNA_CANDIDATO', sigla_partido: 'SG_PARTIDO',
        cargo: 'DS_CARGO', municipio: 'NM_UE',
      };
      const orderCol = sortMap[sortBy] || 'NM_URNA_CANDIDATO';
      const dir = sortAsc ? 'ASC' : 'DESC';

      const [countRes, dataRes] = await Promise.all([
        mdQuery<{ total: string }>(`SELECT count(*) AS total FROM ${cand} ${where}`),
        mdQuery(
          `SELECT SQ_CANDIDATO AS id, NM_URNA_CANDIDATO AS nome_urna, NM_CANDIDATO AS nome_completo,
            NR_CANDIDATO AS numero_urna, SG_PARTIDO AS sigla_partido, DS_CARGO AS cargo,
            NM_UE AS municipio, DS_GENERO AS genero, DS_GRAU_INSTRUCAO AS grau_instrucao,
            DS_OCUPACAO AS ocupacao, DS_SIT_TOT_TURNO AS situacao_final
          FROM ${cand} ${where}
          ORDER BY ${orderCol} ${dir} LIMIT ${pageSize} OFFSET ${offset}`
        ),
      ]);
      return {
        data: dataRes.map((c: any) => ({ ...c, total_votos: 0 })),
        count: Number(countRes[0]?.total || 0),
        pageSize,
        hasVotos: false,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 14. CANDIDATO PERFIL (busca por SQ em todos os anos)
// ═══════════════════════════════════════════════════════════════

export function useCandidato(id: string) {
  return useQuery<Record<string, any> | null>({
    queryKey: ['candidato', id],
    queryFn: async (): Promise<Record<string, any> | null> => {
      const anos = getAnosDisponiveis('candidatos');
      for (const ano of [...anos].reverse()) {
        try {
          const rows = await mdQuery(sqlPerfilCandidato(ano, { sq: id }));
          if (rows.length > 0) return { ...rows[0], ano } as Record<string, any>;
        } catch { /* try next year */ }
      }
      return null;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 15. PATRIMÔNIO DE UM CANDIDATO
// ═══════════════════════════════════════════════════════════════

export function usePatrimonioCandidato(sq: string) {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['patrimonioCandidato', sq, ano],
    queryFn: () => mdQuery(sqlBensCandidato(ano, sq)),
    enabled: !!sq,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 16. CANDIDATOS POR PARTIDO (contagem)
// ═══════════════════════════════════════════════════════════════

export function useCandidatosPorPartido() {
  const f = useFilters();
  return useQuery({
    queryKey: ['candidatosPorPartido', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return mdQuery<{ partido: string; total: string }>(
        `SELECT SG_PARTIDO AS partido, count(*) AS total FROM ${cand} ${where} GROUP BY SG_PARTIDO ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ partido: r.partido, total: Number(r.total) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 17. SITUAÇÃO FINAL
// ═══════════════════════════════════════════════════════════════

export function useSituacaoFinal() {
  const f = useFilters();
  return useQuery({
    queryKey: ['situacao', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return mdQuery<{ nome: string; total: string }>(
        `SELECT COALESCE(DS_SIT_TOT_TURNO, 'NÃO DEFINIDO') AS nome, count(*) AS total FROM ${cand} ${where} GROUP BY nome ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ nome: r.nome, total: Number(r.total) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 18. TOP OCUPAÇÕES
// ═══════════════════════════════════════════════════════════════

export function useTopOcupacoes() {
  const f = useFilters();
  return useQuery({
    queryKey: ['ocupacoes', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return mdQuery<{ nome: string; total: string }>(
        `SELECT COALESCE(DS_OCUPACAO, 'NÃO INFORMADO') AS nome, count(*) AS total FROM ${cand} ${where} GROUP BY nome ORDER BY total DESC LIMIT 15`
      ).then(rows => rows.map(r => ({ nome: r.nome, total: Number(r.total) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 19. CANDIDATOS POR CARGO
// ═══════════════════════════════════════════════════════════════

export function useCandidatosPorCargo() {
  const f = useFilters();
  return useQuery({
    queryKey: ['porCargo', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.partido) conds.push(`SG_PARTIDO = '${f.partido}'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return mdQuery<{ cargo: string; total: string }>(
        `SELECT COALESCE(DS_CARGO, 'NÃO DEFINIDO') AS cargo, count(*) AS total FROM ${cand} ${where} GROUP BY cargo ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ cargo: r.cargo, total: Number(r.total) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 20. ELEITOS
// ═══════════════════════════════════════════════════════════════

export function useEleitos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['eleitos', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [
        "DS_SIT_TOT_TURNO ILIKE '%ELEITO%'",
        "DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%'",
      ];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      if (f.partido) conds.push(`SG_PARTIDO = '${f.partido}'`);
      const where = `WHERE ${conds.join(' AND ')}`;
      return mdQuery(
        `SELECT NM_URNA_CANDIDATO AS nome_urna, NM_CANDIDATO AS nome_completo, SG_PARTIDO AS sigla_partido,
          DS_CARGO AS cargo, NM_UE AS municipio, DS_SIT_TOT_TURNO AS situacao_final,
          DS_GENERO AS genero, NR_CANDIDATO AS numero_urna
        FROM ${cand} ${where} ORDER BY NM_URNA_CANDIDATO LIMIT 100`
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 21. MUNICÍPIO (resumo, candidatos, votos)
// ═══════════════════════════════════════════════════════════════

export function useMunicipioResumo(municipio: string | null) {
  return useQuery({
    queryKey: ['municipioResumo', municipio],
    queryFn: async () => {
      if (!municipio) return null;
      const anos = getAnosDisponiveis('detalhe_munzona');
      const queries = anos.map(async ano => {
        try {
          const rows = await mdQuery<{ apto: string; comp: string; abst: string }>(
            `SELECT SUM(QT_APTOS) AS apto, SUM(QT_COMPARECIMENTO) AS comp, SUM(QT_ABSTENCOES) AS abst
            FROM ${getTableName('detalhe_munzona', ano)} WHERE NM_MUNICIPIO = '${municipio}' AND NR_TURNO = 1`
          );
          const r = rows[0];
          const apto = Number(r?.apto || 0);
          return apto > 0 ? { ano, apto, comp: Number(r?.comp || 0), abst: Number(r?.abst || 0) } : null;
        } catch { return null; }
      });
      const historico = (await Promise.all(queries)).filter(Boolean) as { ano: number; apto: number; comp: number; abst: number }[];
      const totals = historico.reduce((acc, r) => ({ apto: acc.apto + r.apto, comp: acc.comp + r.comp, abst: acc.abst + r.abst }), { apto: 0, comp: 0, abst: 0 });
      return { totals, historico };
    },
    enabled: !!municipio,
    staleTime: 10 * 60 * 1000,
  });
}

export function useMunicipioCandidatos(municipio: string | null) {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['municipioCandidatos', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      return mdQuery(
        `SELECT SQ_CANDIDATO AS id, NM_URNA_CANDIDATO AS nome_urna, SG_PARTIDO AS sigla_partido,
          DS_CARGO AS cargo, DS_SIT_TOT_TURNO AS situacao_final, NR_CANDIDATO AS numero_urna,
          DS_GENERO AS genero, DS_GRAU_INSTRUCAO AS grau_instrucao
        FROM ${getTableName('candidatos', ano)} WHERE NM_UE = '${municipio}'
        ORDER BY NM_URNA_CANDIDATO LIMIT 500`
      );
    },
    enabled: !!municipio,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMunicipioVotos(municipio: string | null) {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['municipioVotos', municipio, ano],
    queryFn: async () => {
      if (!municipio) return [];
      try {
        return await mdQuery(
          `SELECT NM_URNA_CANDIDATO AS nome_candidato, SG_PARTIDO AS partido, DS_CARGO AS cargo,
            SUM(QT_VOTOS_NOMINAIS) AS total_votos, NR_CANDIDATO AS numero_urna
          FROM ${getTableName('votacao', ano)} WHERE NM_MUNICIPIO = '${municipio}'
          GROUP BY NM_URNA_CANDIDATO, SG_PARTIDO, DS_CARGO, NR_CANDIDATO
          ORDER BY total_votos DESC LIMIT 200`
        );
      } catch { return []; }
    },
    enabled: !!municipio,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 22. MUNICÍPIOS RANKING
// ═══════════════════════════════════════════════════════════════

export function useMunicipiosRanking() {
  const f = useFilters();
  return useQuery({
    queryKey: ['municipiosRanking', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      if (f.partido) conds.push(`SG_PARTIDO = '${f.partido}'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return mdQuery<{ municipio: string; total: string; eleitos: string; mulheres: string }>(
        `SELECT NM_UE AS municipio, count(*) AS total,
          count(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos,
          count(CASE WHEN DS_GENERO = 'FEMININO' THEN 1 END) AS mulheres
        FROM ${cand} ${where} GROUP BY NM_UE ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ municipio: r.municipio, total: Number(r.total), eleitos: Number(r.eleitos), mulheres: Number(r.mulheres) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 23. PARTIDO (resumo e detalhe)
// ═══════════════════════════════════════════════════════════════

export function usePartidoResumo() {
  const f = useFilters();
  return useQuery({
    queryKey: ['partidosResumo', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const candidatos = await mdQuery<{ partido: string; candidatos: string; eleitos: string; mulheres: string }>(
        `SELECT SG_PARTIDO AS partido, count(*) AS candidatos,
          count(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos,
          count(CASE WHEN DS_GENERO = 'FEMININO' THEN 1 END) AS mulheres
        FROM ${cand} ${where} GROUP BY SG_PARTIDO ORDER BY candidatos DESC`
      );
      return {
        partidos: candidatos.map(r => ({ partido: r.partido, candidatos: Number(r.candidatos), votos: 0, eleitos: Number(r.eleitos), mulheres: Number(r.mulheres) })),
        hasVotos: false,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePartidoDetalhe(partido: string | null) {
  const f = useFilters();
  return useQuery({
    queryKey: ['partidoDetalhe', partido, f],
    queryFn: async () => {
      if (!partido) return [];
      const cand = getTableName('candidatos', f.ano);
      const conds = [`SG_PARTIDO = '${partido}'`];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      const where = `WHERE ${conds.join(' AND ')}`;
      return mdQuery(
        `SELECT SQ_CANDIDATO AS id, NM_URNA_CANDIDATO AS nome_urna, DS_CARGO AS cargo,
          NM_UE AS municipio, SG_PARTIDO AS sigla_partido, DS_SIT_TOT_TURNO AS situacao_final
        FROM ${cand} ${where} ORDER BY NM_URNA_CANDIDATO LIMIT 50`
      );
    },
    enabled: !!partido,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 24. FILTER OPTIONS (gênero, escolaridade, ocupação, situação)
// ═══════════════════════════════════════════════════════════════

export function useFilterOptions() {
  return useQuery({
    queryKey: ['filterOptions'],
    queryFn: async () => {
      const t = getTableName('candidatos', 2024);
      const [generos, escolaridades, ocupacoes, situacoes] = await Promise.all([
        mdQuery<{ v: string }>(`SELECT DISTINCT DS_GENERO AS v FROM ${t} WHERE DS_GENERO IS NOT NULL ORDER BY v`),
        mdQuery<{ v: string }>(`SELECT DISTINCT DS_GRAU_INSTRUCAO AS v FROM ${t} WHERE DS_GRAU_INSTRUCAO IS NOT NULL ORDER BY v`),
        mdQuery<{ v: string }>(`SELECT DISTINCT DS_OCUPACAO AS v FROM ${t} WHERE DS_OCUPACAO IS NOT NULL ORDER BY v LIMIT 100`),
        mdQuery<{ v: string }>(`SELECT DISTINCT DS_SIT_TOT_TURNO AS v FROM ${t} WHERE DS_SIT_TOT_TURNO IS NOT NULL ORDER BY v`),
      ]);
      return {
        generos: generos.map(r => r.v),
        escolaridades: escolaridades.map(r => r.v),
        ocupacoes: ocupacoes.map(r => r.v),
        situacoes: situacoes.map(r => r.v),
      };
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 25. DATA AVAILABILITY / CHECK EMPTY (legado)
// ═══════════════════════════════════════════════════════════════

export function useDataAvailability() {
  return useQuery({
    queryKey: ['dataAvailability'],
    queryFn: async () => {
      const [r] = await mdQuery<{ total: string }>(`SELECT count(*) AS total FROM ${getTableName('candidatos', 2024)} LIMIT 1`);
      return {
        candidatos: Number(r?.total || 0) > 0,
        bens: true, votacao: true, votacaoPartido: true,
        comparecimento: true, comparecimentoSecao: true, locais: true,
      };
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useCheckEmpty() {
  return useQuery({
    queryKey: ['checkEmpty'],
    queryFn: async () => {
      const [r] = await mdQuery<{ total: string }>(`SELECT count(*) AS total FROM ${getTableName('candidatos', 2024)}`);
      return Number(r?.total || 0) === 0;
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 26. BAIRRO (comparecimento por bairro e local)
// ═══════════════════════════════════════════════════════════════

export function useComparecimentoPorBairro(municipio: string, ano?: number) {
  const { ano: anoStore } = useFilterStore();
  const anoFinal = ano || anoStore;
  return useQuery({
    queryKey: ['votosBairro', municipio, anoFinal],
    queryFn: async () => {
      if (!municipio) return [];
      try {
        return await mdQuery<{ bairro: string; apto: string; comp: string; abst: string }>(
          `SELECT NM_BAIRRO AS bairro, SUM(QT_APTOS) AS apto, SUM(QT_COMPARECIMENTO) AS comp, SUM(QT_ABSTENCOES) AS abst
          FROM ${getTableName('detalhe_secao', anoFinal)} WHERE NM_MUNICIPIO = '${municipio}'
          GROUP BY NM_BAIRRO ORDER BY apto DESC`
        ).then(rows => rows.map(r => ({ bairro: r.bairro || 'NÃO INFORMADO', apto: Number(r.apto), comp: Number(r.comp), abst: Number(r.abst) })));
      } catch { return []; }
    },
    enabled: !!municipio,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVotosPorLocal(municipio: string, ano?: number, bairro?: string) {
  const { ano: anoStore } = useFilterStore();
  const anoFinal = ano || anoStore;
  return useQuery({
    queryKey: ['votosLocal', municipio, anoFinal, bairro],
    queryFn: async () => {
      if (!municipio) return [];
      const bairroFilter = bairro ? `AND NM_BAIRRO = '${bairro}'` : '';
      try {
        return await mdQuery(
          `SELECT NM_LOCAL_VOTACAO AS local, NM_BAIRRO AS bairro, SUM(QT_APTOS) AS apto, SUM(QT_COMPARECIMENTO) AS comp
          FROM ${getTableName('detalhe_secao', anoFinal)} WHERE NM_MUNICIPIO = '${municipio}' ${bairroFilter}
          GROUP BY NM_LOCAL_VOTACAO, NM_BAIRRO ORDER BY apto DESC`
        ).then(rows => rows.map((r: any) => ({ local: r.local, bairro: r.bairro, apto: Number(r.apto), comp: Number(r.comp) })));
      } catch { return []; }
    },
    enabled: !!municipio,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 27. VOTOS POR ZONA ELEITORAL (comparecimento)
// ═══════════════════════════════════════════════════════════════

export function useVotacaoPorZona(municipio?: string) {
  const f = useFilters();
  const mun = municipio || f.municipio;
  return useQuery({
    queryKey: ['votacaoZona', mun, f.ano],
    queryFn: async () => {
      if (!mun) return [];
      try {
        return await mdQuery<{ zona: string; apto: string; comp: string; abst: string }>(
          `SELECT NR_ZONA AS zona, SUM(QT_APTOS) AS apto, SUM(QT_COMPARECIMENTO) AS comp, SUM(QT_ABSTENCOES) AS abst
          FROM ${getTableName('detalhe_munzona', f.ano)} WHERE NM_MUNICIPIO = '${mun}'
          GROUP BY NR_ZONA ORDER BY zona`
        ).then(rows => rows.map(r => ({
          zona: Number(r.zona), apto: Number(r.apto), comp: Number(r.comp), abst: Number(r.abst),
        })));
      } catch { return []; }
    },
    enabled: !!mun,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 28. PATRIMÔNIO (evolução, distribuição, por partido)
// ═══════════════════════════════════════════════════════════════

export function usePatrimonioEvolucaoAno() {
  return useQuery({
    queryKey: ['patrimonioEvolucao'],
    queryFn: async () => {
      const anos = getAnosDisponiveis('bens');
      const results = await Promise.all(anos.map(async ano => {
        try {
          const [r] = await mdQuery<{ total: string; media: string; registros: string }>(
            `SELECT SUM(CAST(REPLACE(VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS total,
              AVG(CAST(REPLACE(VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS media,
              count(*) AS registros
            FROM ${getTableName('bens', ano)}`
          );
          return { ano, total: Number(r?.total || 0), media: Number(r?.media || 0), registros: Number(r?.registros || 0) };
        } catch { return { ano, total: 0, media: 0, registros: 0 }; }
      }));
      return results.filter(r => r.registros > 0);
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function usePatrimonioDistribuicao() {
  const { ano } = useFilterStore();
  return useQuery({
    queryKey: ['patrimonioDistrib', ano],
    queryFn: async () => {
      return mdQuery<{ faixa: string; total: string }>(
        `WITH patri AS (
          SELECT SQ_CANDIDATO, SUM(CAST(REPLACE(VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS total
          FROM ${getTableName('bens', ano)} GROUP BY SQ_CANDIDATO
        )
        SELECT CASE
          WHEN total <= 10000 THEN 'Até R$10k'
          WHEN total <= 50000 THEN 'R$10k-50k'
          WHEN total <= 100000 THEN 'R$50k-100k'
          WHEN total <= 500000 THEN 'R$100k-500k'
          WHEN total <= 1000000 THEN 'R$500k-1M'
          WHEN total <= 5000000 THEN 'R$1M-5M'
          ELSE 'Acima R$5M'
        END AS faixa, count(*) AS total
        FROM patri GROUP BY faixa ORDER BY min(total)`
      ).then(rows => rows.map(r => ({ faixa: r.faixa, total: Number(r.total) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePatrimonioPorPartido() {
  const f = useFilters();
  return useQuery({
    queryKey: ['patrimonioPorPartido', f],
    queryFn: async () => {
      const bens = getTableName('bens', f.ano);
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`c.NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`c.DS_CARGO ILIKE '%${f.cargo}%'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return mdQuery<{ partido: string; total: string; media: string }>(
        `SELECT c.SG_PARTIDO AS partido,
          SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS total,
          AVG(CAST(REPLACE(b.VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS media
        FROM ${bens} b JOIN ${cand} c ON b.SQ_CANDIDATO = c.SQ_CANDIDATO
        ${where} GROUP BY c.SG_PARTIDO ORDER BY total DESC LIMIT 15`
      ).then(rows => rows.map(r => ({ partido: r.partido, total: Number(r.total), media: Number(r.media) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 29. EVOLUÇÃO POR ANO / COMPARATIVO
// ═══════════════════════════════════════════════════════════════

export function useEvolucaoPorAno() {
  return useQuery({
    queryKey: ['evolucaoAno'],
    queryFn: async () => {
      const anos = getAnosDisponiveis('candidatos');
      const results = await Promise.all(anos.map(async ano => {
        try {
          const [r] = await mdQuery<{ total: string; mulheres: string; eleitos: string }>(
            `SELECT count(*) AS total,
              count(CASE WHEN DS_GENERO = 'FEMININO' THEN 1 END) AS mulheres,
              count(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos
            FROM ${getTableName('candidatos', ano)}`
          );
          const total = Number(r?.total || 0);
          const mulheres = Number(r?.mulheres || 0);
          return { ano, total, mulheres, eleitos: Number(r?.eleitos || 0), pctMulheres: total > 0 ? Math.round(mulheres / total * 100) : 0 };
        } catch { return null; }
      }));
      return results.filter(Boolean).sort((a: any, b: any) => a.ano - b.ano);
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useComparativoAnos() {
  return useQuery({
    queryKey: ['comparativoAnos'],
    queryFn: async () => {
      const anos = getAnosDisponiveis('candidatos');
      const results = await Promise.all(anos.map(async ano => {
        try {
          const [r] = await mdQuery<{ total: string; eleitos: string; mulheres: string; cargos: string }>(
            `SELECT count(*) AS total,
              count(CASE WHEN DS_SIT_TOT_TURNO ILIKE '%ELEITO%' AND DS_SIT_TOT_TURNO NOT ILIKE '%NÃO ELEITO%' THEN 1 END) AS eleitos,
              count(CASE WHEN DS_GENERO = 'FEMININO' THEN 1 END) AS mulheres,
              count(DISTINCT DS_CARGO) AS cargos
            FROM ${getTableName('candidatos', ano)}`
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
    staleTime: 10 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 30. FAIXA ETÁRIA
// ═══════════════════════════════════════════════════════════════

export function useFaixaEtaria() {
  const f = useFilters();
  return useQuery({
    queryKey: ['faixaEtaria', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = ["DT_NASCIMENTO IS NOT NULL", "DT_NASCIMENTO != ''"];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      const where = `WHERE ${conds.join(' AND ')}`;
      return mdQuery<{ faixa: string; total: string }>(
        `SELECT CASE
          WHEN age <= 25 THEN '18-25'
          WHEN age <= 35 THEN '26-35'
          WHEN age <= 45 THEN '36-45'
          WHEN age <= 55 THEN '46-55'
          WHEN age <= 65 THEN '56-65'
          ELSE '66+'
        END AS faixa, count(*) AS total
        FROM (
          SELECT CAST(EXTRACT(YEAR FROM AGE(CURRENT_DATE, TRY_CAST(DT_NASCIMENTO AS DATE))) AS INT) AS age
          FROM ${cand} ${where}
        ) sub WHERE age BETWEEN 18 AND 120
        GROUP BY faixa ORDER BY faixa`
      ).then(rows => rows.map(r => ({ faixa: r.faixa, total: Number(r.total) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 31. PERFIL CANDIDATOS (resumo agregado)
// ═══════════════════════════════════════════════════════════════

export function usePerfilCandidatos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['perfilCandidatos', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      if (f.cargo) conds.push(`DS_CARGO ILIKE '%${f.cargo}%'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      const [total, generos, instrucoes, ocupacoes] = await Promise.all([
        mdQuery<{ total: string }>(`SELECT count(*) AS total FROM ${cand} ${where}`),
        mdQuery<{ nome: string; total: string }>(`SELECT COALESCE(DS_GENERO, 'NÃO INFORMADO') AS nome, count(*) AS total FROM ${cand} ${where} GROUP BY nome ORDER BY total DESC`),
        mdQuery<{ nome: string; total: string }>(`SELECT COALESCE(DS_GRAU_INSTRUCAO, 'NÃO INFORMADO') AS nome, count(*) AS total FROM ${cand} ${where} GROUP BY nome ORDER BY total DESC`),
        mdQuery<{ nome: string; total: string }>(`SELECT COALESCE(DS_OCUPACAO, 'NÃO INFORMADO') AS nome, count(*) AS total FROM ${cand} ${where} GROUP BY nome ORDER BY total DESC LIMIT 15`),
      ]);
      return {
        total: Number(total[0]?.total || 0),
        generos: generos.map(r => ({ nome: r.nome, total: Number(r.total) })),
        instrucoes: instrucoes.map(r => ({ nome: r.nome, total: Number(r.total) })),
        ocupacoes: ocupacoes.map(r => ({ nome: r.nome, total: Number(r.total) })),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 32. EVOLUÇÃO PATRIMÔNIO POR CANDIDATO (nome_urna)
// ═══════════════════════════════════════════════════════════════

export function useEvolucaoPatrimonio(nomeUrna: string) {
  return useQuery({
    queryKey: ['evolucaoPatrimonio', nomeUrna],
    queryFn: async () => {
      if (!nomeUrna) return [];
      const anos = getAnosDisponiveis('bens');
      const results = await Promise.all(anos.map(async ano => {
        try {
          const [r] = await mdQuery<{ patrimonio: string }>(
            `SELECT SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS patrimonio
            FROM ${getTableName('bens', ano)} b
            JOIN ${getTableName('candidatos', ano)} c ON b.SQ_CANDIDATO = c.SQ_CANDIDATO
            WHERE c.NM_URNA_CANDIDATO = '${nomeUrna.replace(/'/g, "''")}'`
          );
          const p = Number(r?.patrimonio || 0);
          return p > 0 ? { ano, patrimonio: p } : null;
        } catch { return null; }
      }));
      return results.filter(Boolean).sort((a: any, b: any) => a.ano - b.ano);
    },
    enabled: !!nomeUrna,
    staleTime: 10 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 33. VOTOS DO CANDIDATO POR ZONA
// ═══════════════════════════════════════════════════════════════

export function useCandidatoVotos(nomeUrna: string, ano: number) {
  return useQuery({
    queryKey: ['candidatoVotos', nomeUrna, ano],
    queryFn: async () => {
      if (!nomeUrna || !ano) return [];
      try {
        return await mdQuery(
          `SELECT NM_MUNICIPIO AS municipio, NR_ZONA AS zona, QT_VOTOS_NOMINAIS AS total_votos, DS_CARGO AS cargo
          FROM ${getTableName('votacao', ano)}
          WHERE NM_URNA_CANDIDATO = '${nomeUrna.replace(/'/g, "''")}'
          ORDER BY total_votos DESC LIMIT 500`
        );
      } catch { return []; }
    },
    enabled: !!nomeUrna && !!ano,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 34. UF NASCIMENTO
// ═══════════════════════════════════════════════════════════════

export function useUfNascimento() {
  const f = useFilters();
  return useQuery({
    queryKey: ['uf-nascimento', f],
    queryFn: async () => {
      const cand = getTableName('candidatos', f.ano);
      const conds: string[] = ["SG_UF_NASCIMENTO IS NOT NULL", "SG_UF_NASCIMENTO != ''"];
      if (f.municipio) conds.push(`NM_UE = '${f.municipio}'`);
      const where = `WHERE ${conds.join(' AND ')}`;
      return mdQuery<{ uf: string; total: string }>(
        `SELECT SG_UF_NASCIMENTO AS uf, count(*) AS total FROM ${cand} ${where} GROUP BY SG_UF_NASCIMENTO ORDER BY total DESC`
      ).then(rows => rows.map(r => ({ uf: r.uf, total: Number(r.total) })));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 35. IMPORT LOGS (legado Supabase)
// ═══════════════════════════════════════════════════════════════

export function useImportLogs() {
  return useQuery({
    queryKey: ['importLogs'],
    queryFn: async () => [],
    staleTime: 60 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 36. VOTOS BRANCOS/NULOS
// ═══════════════════════════════════════════════════════════════

export function useVotosBrancosNulos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['votosBrancosNulos', f],
    queryFn: async () => {
      const anos = getAnosDisponiveis('detalhe_munzona');
      const targetAnos = [f.ano];
      const results = await Promise.all(targetAnos.map(async ano => {
        const munFilter = f.municipio ? `AND NM_MUNICIPIO = '${f.municipio}'` : '';
        try {
          const [r] = await mdQuery<{ brancos: string; nulos: string; comp: string }>(
            `SELECT SUM(QT_VOTOS_BRANCOS) AS brancos, SUM(QT_VOTOS_NULOS) AS nulos, SUM(QT_COMPARECIMENTO) AS comp
            FROM ${getTableName('detalhe_munzona', ano)} WHERE 1=1 ${munFilter}`
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
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// 37. PATRIMÔNIO VS VOTOS
// ═══════════════════════════════════════════════════════════════

export function usePatrimonioVsVotos() {
  const f = useFilters();
  return useQuery({
    queryKey: ['patrimonioVsVotos', f],
    queryFn: async () => {
      const bens = getTableName('bens', f.ano);
      const cand = getTableName('candidatos', f.ano);
      const vot = getTableName('votacao', f.ano);
      const conds: string[] = [];
      if (f.municipio) conds.push(`c.NM_UE = '${f.municipio}'`);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        return await mdQuery(
          `SELECT c.NM_URNA_CANDIDATO AS nome, c.SG_PARTIDO AS partido,
            SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS patrimonio,
            COALESCE(SUM(v.QT_VOTOS_NOMINAIS), 0) AS votos
          FROM ${cand} c
          JOIN ${bens} b ON c.SQ_CANDIDATO = b.SQ_CANDIDATO
          LEFT JOIN ${vot} v ON c.SQ_CANDIDATO = v.SQ_CANDIDATO
          ${where}
          GROUP BY c.NM_URNA_CANDIDATO, c.SG_PARTIDO
          HAVING SUM(CAST(REPLACE(b.VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) > 0
          ORDER BY patrimonio DESC LIMIT 100`
        );
      } catch { return []; }
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
// INTELIGÊNCIA GEOGRÁFICA — Votos por Bairro + Escolas
// ═══════════════════════════════════════════════════════════════

export function useVotosPorBairro(municipio?: string, sqCandidato?: string | null) {
  const { ano, municipio: munStore } = useFilterStore();
  const mun = municipio || munStore;
  return useQuery({
    queryKey: ['votosPorBairro', mun, ano, sqCandidato || 'all'],
    queryFn: async () => {
      const { sqlVotosPorBairro, sqlVotosCandidatoPorBairro } = await import('@/lib/motherduck');
      const sql = sqCandidato
        ? sqlVotosCandidatoPorBairro(ano, mun, sqCandidato)
        : sqlVotosPorBairro(ano, mun);
      return mdQuery(sql);
    },
    enabled: !!mun,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEscolasPorBairro(bairro: string | null, municipio?: string, sqCandidato?: string | null) {
  const { ano, municipio: munStore } = useFilterStore();
  const mun = municipio || munStore;
  return useQuery({
    queryKey: ['escolasPorBairro', bairro, mun, ano, sqCandidato || 'all'],
    queryFn: async () => {
      const { sqlEscolasPorBairro, sqlEscolasCandidatoPorBairro } = await import('@/lib/motherduck');
      const sql = sqCandidato
        ? sqlEscolasCandidatoPorBairro(ano, mun, bairro!, sqCandidato)
        : sqlEscolasPorBairro(ano, mun, bairro!);
      return mdQuery(sql);
    },
    enabled: !!mun && !!bairro,
    staleTime: 5 * 60 * 1000,
  });
}
