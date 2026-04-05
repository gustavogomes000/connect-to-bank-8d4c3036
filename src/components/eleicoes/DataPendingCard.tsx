import { AlertCircle, Database } from 'lucide-react';

interface DataPendingCardProps {
  titulo: string;
  tabela: string;
  descricao?: string;
}

export function DataPendingCard({ titulo, tabela, descricao }: DataPendingCardProps) {
  return (
    <div className="bg-card rounded-xl border border-dashed border-border p-6 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Database className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-secondary" />
          {titulo}
        </h4>
        <p className="text-sm text-muted-foreground mt-1">
          Dados da tabela <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{tabela}</code> ainda não importados.
        </p>
        {descricao && <p className="text-xs text-muted-foreground mt-1">{descricao}</p>}
      </div>
    </div>
  );
}
