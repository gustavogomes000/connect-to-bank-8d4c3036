// Cores por partido para gráficos
export const PARTIDO_CORES: Record<string, string> = {
  PT: '#e02424', PL: '#1e3a5f', 'UNIÃO': '#38bdf8', 'UNIÃO BRASIL': '#38bdf8',
  MDB: '#16a34a', PP: '#f97316', PSD: '#7c3aed', PSDB: '#fbbf24',
  REPUBLICANOS: '#0891b2', SOLIDARIEDADE: '#db2777', PDT: '#065f46',
  PSOL: '#dc2626', PODE: '#6366f1', PODEMOS: '#6366f1', AVANTE: '#0d9488',
  CIDADANIA: '#8b5cf6', PCdoB: '#b91c1c', 'PC do B': '#b91c1c',
  REDE: '#059669', PSB: '#ea580c', NOVO: '#f59e0b', PMN: '#14b8a6',
  DC: '#6b21a8', PRTB: '#047857', PMB: '#2563eb', PROS: '#d97706',
  PATRIOTA: '#15803d', PSC: '#7c2d12',
};

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 50%)`;
}

export function getPartidoCor(partido: string): string {
  if (!partido) return '#6b7280';
  return PARTIDO_CORES[partido.toUpperCase().trim()] || hashColor(partido);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString('pt-BR');
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '0%';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatBRLCompact(val: number): string {
  if (val >= 1_000_000_000) return `R$ ${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(0)}k`;
  return `R$ ${val.toFixed(0)}`;
}

export function getSituacaoBadge(situacao: string | null): { bg: string; text: string; label: string } {
  const s = (situacao || '').toUpperCase().trim();
  if (s.includes('ELEITO') && s.includes('QP'))
    return { bg: 'bg-success/20', text: 'text-success', label: 'ELEITO QP' };
  if (s.includes('ELEITO') && s.includes('MÉDIA'))
    return { bg: 'bg-success/20', text: 'text-success', label: 'ELEITO MÉDIA' };
  if (s.includes('ELEITO') && !s.includes('NÃO'))
    return { bg: 'bg-success/20', text: 'text-success', label: 'ELEITO' };
  if (s.includes('SUPLENTE'))
    return { bg: 'bg-warning/20', text: 'text-warning', label: 'SUPLENTE' };
  if (s.includes('2º TURNO'))
    return { bg: 'bg-[hsl(var(--info))]/20', text: 'text-[hsl(var(--info))]', label: '2º TURNO' };
  if (s.includes('CASSAD'))
    return { bg: 'bg-destructive/20', text: 'text-destructive', label: situacao || '' };
  if (s.includes('INDEFERIDO'))
    return { bg: 'bg-destructive/20', text: 'text-destructive', label: 'INDEFERIDO' };
  if (s.includes('RENÚNCIA'))
    return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'RENÚNCIA' };
  return { bg: 'bg-muted/50', text: 'text-muted-foreground', label: situacao || 'NÃO ELEITO' };
}

export const ANOS_DISPONIVEIS = [2018, 2020, 2022, 2024];

export const CARGOS_DISPONIVEIS = [
  'Presidente', 'Governador', 'Senador', 'Deputado Federal',
  'Deputado Estadual', 'Prefeito', 'Vereador',
];

export function getAvatarColor(name: string): string { return hashColor(name || 'X'); }
export function getInitial(name: string): string { return (name || '?').charAt(0).toUpperCase(); }
