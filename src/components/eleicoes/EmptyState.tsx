import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Download className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">Nenhum dado importado</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Para começar a usar o EleiçõesGO, importe os dados eleitorais do TSE.
      </p>
      <Button asChild size="lg">
        <Link to="/importar">
          <Download className="w-5 h-5 mr-2" />
          Importar Dados Agora
        </Link>
      </Button>
    </div>
  );
}
