import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { mdQuery, getTableName, getAnosDisponiveis, isEleicaoGeral } from '@/lib/motherduck';

export interface RankingItem {
  SQ_CANDIDATO: string;
  NM_CANDIDATO: string;
  NM_URNA_CANDIDATO: string;
  SG_PARTIDO: string;
  DS_CARGO: string;
  NM_UE: string;
  DS_SIT_TOT_TURNO: string;
  DS_GENERO: string;
  total_votos: number;
  patrimonio_total: number;
}

export const useRankingMD = () => {
  const ano = useFilterStore((s) => s.ano);
  const municipio = useFilterStore((s) => s.municipio);
  const cargo = useFilterStore((s) => s.cargo);
  const partido = useFilterStore((s) => s.partido);
  const turno = useFilterStore((s) => s.turno);
  const zona = useFilterStore((s) => s.zona);
  const bairro = useFilterStore((s) => s.bairro);
  const escola = useFilterStore((s) => s.escola);
  const searchText = useFilterStore((s) => s.searchText);

  return useQuery<RankingItem[]>({
    queryKey: ['ranking-md', ano, municipio, cargo, partido, turno, zona, bairro, escola, searchText],
    queryFn: async () => {
      const cand = getTableName('candidatos', ano);
      const geral = isEleicaoGeral(ano);
      const hasGeo = !!(zona || bairro || escola);
      // Always use votacao_candidato_munzona — votacao_secao has NO SQ_CANDIDATO
      const vot = getTableName('votacao', ano);

      const conds: string[] = [];
      
      // For general elections (2014/2018/2022), NM_UE is state name ("GOIÁS"),
      // so we filter votes by NM_MUNICIPIO instead of filtering candidates by NM_UE
      if (municipio && !geral) {
        conds.push(`c.NM_UE = '${municipio}'`);
      }
      if (municipio && geral) {
        conds.push(`v.NM_MUNICIPIO = '${municipio}'`);
      }
      
      if (cargo) conds.push(`c.DS_CARGO ILIKE '%${cargo}%'`);
      if (partido) conds.push(`c.SG_PARTIDO = '${partido}'`);
      if (turno) conds.push(`c.NR_TURNO = ${turno}`);
      if (searchText) conds.push(`(c.NM_URNA_CANDIDATO ILIKE '%${searchText}%' OR c.NM_CANDIDATO ILIKE '%${searchText}%')`);
      if (zona) conds.push(`v.NR_ZONA = ${zona}`);

      let geoJoin = '';
      if (hasGeo && (bairro || escola)) {
        const loc = getTableName('eleitorado_local', ano);
        geoJoin = `INNER JOIN ${loc} loc ON v.NR_ZONA = loc.NR_ZONA AND v.NR_SECAO = loc.NR_SECAO AND loc.SG_UF = 'GO' AND loc.NM_MUNICIPIO = '${municipio}'`;
        if (bairro) conds.push(`loc.NM_BAIRRO = '${bairro}'`);
        if (escola) conds.push(`loc.NM_LOCAL_VOTACAO = '${escola}'`);
      }

      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      // Patrimônio join (only if bens available for this year)
      const hasBens = getAnosDisponiveis('bens').includes(ano);
      const bensJoin = hasBens 
        ? `LEFT JOIN (
            SELECT SQ_CANDIDATO, SUM(CAST(REPLACE(VR_BEM_CANDIDATO, ',', '.') AS DOUBLE)) AS patrimonio_total
            FROM ${getTableName('bens', ano)}
            GROUP BY SQ_CANDIDATO
          ) b ON c.SQ_CANDIDATO = b.SQ_CANDIDATO`
        : '';

      const sql = `
        SELECT
          c.SQ_CANDIDATO,
          c.NM_CANDIDATO,
          c.NM_URNA_CANDIDATO,
          c.SG_PARTIDO,
          c.DS_CARGO,
          c.NM_UE,
          c.DS_SIT_TOT_TURNO,
          c.DS_GENERO,
          COALESCE(SUM(v.QT_VOTOS_NOMINAIS), 0) AS total_votos,
          COALESCE(${hasBens ? 'b.patrimonio_total' : '0'}, 0) AS patrimonio_total
        FROM ${cand} c
        LEFT JOIN ${vot} v ON c.SQ_CANDIDATO = v.SQ_CANDIDATO
        ${geoJoin}
        ${bensJoin}
        ${where}
        GROUP BY c.SQ_CANDIDATO, c.NM_CANDIDATO, c.NM_URNA_CANDIDATO, c.SG_PARTIDO,
                 c.DS_CARGO, c.NM_UE, c.DS_SIT_TOT_TURNO, c.DS_GENERO${hasBens ? ', b.patrimonio_total' : ''}
        ORDER BY total_votos DESC
        LIMIT 200
      `;

      const rows = await mdQuery<any>(sql);
      return rows.map((r: any) => ({
        SQ_CANDIDATO: String(r.SQ_CANDIDATO),
        NM_CANDIDATO: r.NM_CANDIDATO,
        NM_URNA_CANDIDATO: r.NM_URNA_CANDIDATO,
        SG_PARTIDO: r.SG_PARTIDO,
        DS_CARGO: r.DS_CARGO,
        NM_UE: r.NM_UE,
        DS_SIT_TOT_TURNO: r.DS_SIT_TOT_TURNO,
        DS_GENERO: r.DS_GENERO,
        total_votos: Number(r.total_votos || 0),
        patrimonio_total: Number(r.patrimonio_total || 0),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
};
