import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { formatNumber } from '@/lib/eleicoes';

interface PaginationProps {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page, totalItems, pageSize, onPageChange,
  onPageSizeChange, pageSizeOptions = [20, 30, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/10">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {formatNumber(from)}–{formatNumber(to)} de {formatNumber(totalItems)}
        </span>
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={v => { onPageSizeChange(Number(v)); onPageChange(0); }}>
            <SelectTrigger className="w-[72px] h-6 text-[10px] border-border/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map(n => (
                <SelectItem key={n} value={String(n)} className="text-xs">{n}/pág</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => onPageChange(0)} className="h-6 w-6">
          <ChevronsLeft className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => onPageChange(page - 1)} className="h-6 w-6">
          <ChevronLeft className="w-3 h-3" />
        </Button>
        <span className="text-[10px] text-muted-foreground px-2 min-w-[60px] text-center">
          {page + 1} / {totalPages}
        </span>
        <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} className="h-6 w-6">
          <ChevronRight className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)} className="h-6 w-6">
          <ChevronsRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
