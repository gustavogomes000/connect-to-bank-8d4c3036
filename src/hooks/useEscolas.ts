import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { mdQuery, getTableName, getAnosDisponiveis } from '@/lib/motherduck';

export interface EscolaItem {
  escola: string;
  setor: string;
  zona: number;
  qtd_secoes: number;
  secoes: string;
  eleitores: number;
}

export interface PessoalItem {
  lideranca: string;
  funcao: string;
}

/** Escolas eleitorais direto do MotherDuck (eleitorado_local) */
export const useEscolas = () => {
  const ano = useFilterStore((state) => state.ano);
  const municipio = useFilterStore((state) => state.municipio);
  const zona = useFilterStore((state) => state.zona);

  return useQuery<{ status: string; total: number; dados: EscolaItem[] }, Error>({
    queryKey: ['escolas-md', ano, municipio, zona],
    queryFn: async () => {
      const anosLocal = getAnosDisponiveis('eleitorado_local');
      const anoLocal = anosLocal.includes(ano) ? ano : ([...anosLocal].sort((a, b) => Math.abs(a - ano) - Math.abs(b - ano))[0] || null);
      if (!anoLocal) {
        return { status: 'ok', total: 0, dados: [] };
      }
      const loc = getTableName('eleitorado_local', anoLocal);
      const zonaCond = zona ? ` AND NR_ZONA = ${zona}` : '';
      const rows = await mdQuery<any>(`
        SELECT
          NM_LOCAL_VOTACAO AS escola,
          COALESCE(NM_BAIRRO, '') AS setor,
          NR_ZONA AS zona,
          COUNT(DISTINCT NR_SECAO) AS qtd_secoes,
          STRING_AGG(DISTINCT CAST(NR_SECAO AS VARCHAR), ', ' ORDER BY CAST(NR_SECAO AS VARCHAR)) AS secoes,
          SUM(QT_ELEITOR_SECAO) AS eleitores
        FROM ${loc}
        WHERE SG_UF = 'GO'
          AND NM_MUNICIPIO = '${municipio}'
          AND NM_LOCAL_VOTACAO IS NOT NULL AND NM_LOCAL_VOTACAO != ''
          ${zonaCond}
        GROUP BY NM_LOCAL_VOTACAO, NM_BAIRRO, NR_ZONA
        ORDER BY eleitores DESC
      `);
      return {
        status: 'ok',
        total: rows.length,
        dados: rows.map((r: any) => ({
          escola: r.escola,
          setor: r.setor,
          zona: Number(r.zona),
          qtd_secoes: Number(r.qtd_secoes),
          secoes: r.secoes || '',
          eleitores: Number(r.eleitores || 0),
        })),
      };
    },
    enabled: !!municipio,
    staleTime: 5 * 60 * 1000,
  });
};

/** Pessoal (lideranças/fiscais) por zona+seção — desativado (sem backend) */
export const useEscolaPessoal = (_zona: string | number, _secao: string) => {
  return useQuery<{ status: string; total: number; dados: PessoalItem[] }, Error>({
    queryKey: ['escola-pessoal', _zona, _secao],
    queryFn: async () => ({ status: 'ok', total: 0, dados: [] }),
    staleTime: Infinity,
    enabled: false,
  });
};
