// Cores por partido para gráficos
export const PARTIDO_CORES: Record<string, string> = {
  PT: '#e02424',
  PL: '#1a56db',
  'UNIÃO': '#38bdf8',
  'UNIÃO BRASIL': '#38bdf8',
  MDB: '#16a34a',
  PP: '#f97316',
  PSD: '#7c3aed',
  PSDB: '#fbbf24',
  REPUBLICANOS: '#0891b2',
  SOLIDARIEDADE: '#db2777',
  PDT: '#065f46',
  PSOL: '#dc2626',
  PODE: '#6366f1',
  PODEMOS: '#6366f1',
  AVANTE: '#0d9488',
  CIDADANIA: '#8b5cf6',
  PCdoB: '#b91c1c',
  'PC do B': '#b91c1c',
  REDE: '#059669',
  PSB: '#ea580c',
  NOVO: '#f59e0b',
  PMN: '#14b8a6',
  DC: '#6b21a8',
  PRTB: '#047857',
  PMB: '#2563eb',
  PROS: '#d97706',
  PATRIOTA: '#15803d',
  PSC: '#7c2d12',
};

// Gerar cor por hash do nome do partido
function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

export function getPartidoCor(partido: string): string {
  if (!partido) return '#6b7280';
  const key = partido.toUpperCase().trim();
  return PARTIDO_CORES[key] || hashColor(key);
}

// Formatar números com ponto como separador de milhar
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString('pt-BR');
}

// Formatar percentual
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '0%';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}

// Formatar data
export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Cor do badge por situação
export function getSituacaoBadge(situacao: string | null): { bg: string; text: string; label: string } {
  const s = (situacao || '').toUpperCase().trim();
  if (s.includes('ELEITO') && s.includes('QP'))
    return { bg: 'bg-accent', text: 'text-accent-foreground', label: 'ELEITO POR QP' };
  if (s.includes('ELEITO') && !s.includes('NÃO'))
    return { bg: 'bg-green-100', text: 'text-green-800', label: 'ELEITO' };
  if (s.includes('SUPLENTE'))
    return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'SUPLENTE' };
  if (s.includes('CASSAD'))
    return { bg: 'bg-red-100', text: 'text-red-800', label: situacao || '' };
  return { bg: 'bg-gray-100', text: 'text-gray-600', label: situacao || 'NÃO ELEITO' };
}

// Anos disponíveis
export const ANOS_DISPONIVEIS = [2018, 2020, 2022, 2024];

// Cargos disponíveis
export const CARGOS_DISPONIVEIS = [
  'Presidente',
  'Governador',
  'Senador',
  'Deputado Federal',
  'Deputado Estadual',
  'Prefeito',
  'Vereador',
];

// Avatar color from name
export function getAvatarColor(name: string): string {
  return hashColor(name || 'X');
}

export function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}
