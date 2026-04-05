import { getSituacaoBadge } from '@/lib/eleicoes';

export function SituacaoBadge({ situacao }: { situacao: string | null }) {
  const { bg, text, label } = getSituacaoBadge(situacao);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${bg} ${text}`}>
      {label}
    </span>
  );
}
