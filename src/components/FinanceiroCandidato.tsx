import { useBensCandidato, useReceitasCandidato } from "@/hooks/useCandidatoFinanceiro";
import { formatBRL } from "@/lib/eleicoes";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DollarSign, AlertCircle } from "lucide-react";

export const ListaBens = ({ sqCandidato }: { sqCandidato: string }) => {
  const { data, isLoading, isError, error } = useBensCandidato(sqCandidato);

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro ao carregar bens</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const bens = data?.rows || [];
  const totalBens = bens.reduce((acc, b) => acc + Number(String(b.VR_BEM_CANDIDATO).replace(',', '.') || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-muted/20 p-4 border border-border/40 rounded-lg">
        <DollarSign className="w-5 h-5 text-warning" />
        <div>
          <p className="text-xs uppercase text-muted-foreground tracking-wider">Patrimônio Total Declarado</p>
          {isLoading ? (
            <Skeleton className="h-6 w-32 mt-1" />
          ) : (
            <h3 className="text-xl font-bold text-warning">{formatBRL(totalBens)}</h3>
          )}
        </div>
        <Badge variant="outline" className="ml-auto">{bens.length} itens</Badge>
      </div>

      <div className="bg-card border border-border/40 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full text-sm">
            <TableHeader className="bg-muted/30">
              <TableRow className="border-b border-border/30 text-xs">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-b border-border/20">
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))}

              {!isLoading && bens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum bem declarado nesta eleição.
                  </TableCell>
                </TableRow>
              )}

              {bens.map((bem, idx) => (
                <TableRow key={idx} className="border-b border-border/20 hover:bg-primary/5">
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="text-xs font-medium max-w-[200px] truncate" title={bem.DS_TIPO_BEM_CANDIDATO}>
                    {bem.DS_TIPO_BEM_CANDIDATO}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" title={bem.DS_BEM_CANDIDATO}>
                    {bem.DS_BEM_CANDIDATO}
                  </TableCell>
                  <TableCell className="text-sm font-bold text-right tabular-nums">
                    {formatBRL(Number(String(bem.VR_BEM_CANDIDATO).replace(',', '.') || 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export const ResumoReceitas = ({ sqCandidato }: { sqCandidato: string }) => {
  const { data, isLoading, isError } = useReceitasCandidato(sqCandidato);

  if (isError) {
    return (
      <div className="bg-destructive/10 text-destructive p-3 rounded-lg flex items-center gap-2 text-sm">
        <AlertCircle className="w-4 h-4" /> Falha ao carregar o Resumo de Receitas
      </div>
    );
  }

  const receitas = data?.rows || [];
  const totalReceitas = receitas.reduce((sum, r) => sum + Number(String(r.VR_RECEITA).replace(',', '.') || 0), 0);
  const maioresDoadores = receitas.slice(0, 5); // top 5

  return (
    <div className="bg-card border border-border/40 rounded-lg p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Total Arrecadado (Receitas)</p>
        {isLoading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <h3 className="text-2xl font-bold text-primary">{formatBRL(totalReceitas)}</h3>
        )}
      </div>
      
      <div>
        <p className="text-xs font-medium text-foreground mb-3">Maiores Doadores</p>
        <div className="space-y-2">
          {isLoading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center bg-muted/20 p-2 rounded">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}

          {!isLoading && receitas.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Não constam receitas declaradas.</p>
          )}

          {maioresDoadores.map((rec, i) => (
            <div key={i} className="flex flex-col sm:flex-row justify-between sm:items-center bg-muted/20 p-2 rounded gap-1">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" title={rec.NM_DOADOR}>{rec.NM_DOADOR || "NÃO INFORMADO"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{rec.DS_ORIGEM_RECEITA}</p>
              </div>
              <span className="text-xs font-bold text-primary sm:text-right shrink-0">
                {formatBRL(Number(String(rec.VR_RECEITA).replace(',', '.') || 0))}
              </span>
            </div>
          ))}

          {receitas.length > 5 && (
            <p className="text-[10px] text-muted-foreground text-center pt-2">
              + {receitas.length - 5} outras doações
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
