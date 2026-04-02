import { getSituacaoBadge } from '@/lib/eleicoes';

export function SituacaoBadge({ situacao }: { situacao: string | null }) {
  const { bg, text, label } = getSituacaoBadge(situacao);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
}
