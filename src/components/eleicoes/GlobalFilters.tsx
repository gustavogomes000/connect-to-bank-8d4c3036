import { useFilterStore } from '@/stores/filterStore';
import { useMunicipios, usePartidos, useFilterOptions } from '@/hooks/useEleicoes';
import { ANOS_DISPONIVEIS, CARGOS_DISPONIVEIS } from '@/lib/eleicoes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Filter, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export function GlobalFilters() {
  const store = useFilterStore();
  const { data: municipios } = useMunicipios();
  const { data: partidos } = usePartidos();
  const { data: filterOpts } = useFilterOptions();
  const [expanded, setExpanded] = useState(false);
  const activeCount = store.activeFiltersCount();

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/50">
      {/* Primary row */}
      <div className="px-4 py-2.5">
        <div className="flex flex-wrap gap-2 items-center max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2 mr-2">
            <Filter className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros</span>
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-primary text-primary-foreground">
                {activeCount}
              </Badge>
            )}
          </div>

          <div className="relative flex-1 max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={store.searchText}
              onChange={e => store.setSearchText(e.target.value)}
              placeholder="Buscar candidato..."
              className="pl-8 h-8 text-xs bg-muted/50 border-border/50"
            />
          </div>

          <Select value={store.ano?.toString() || 'todos'} onValueChange={v => store.setAno(v === 'todos' ? null : parseInt(v))}>
            <SelectTrigger className="w-[100px] h-8 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos anos</SelectItem>
              {ANOS_DISPONIVEIS.map(a => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={store.turno?.toString() || 'todos'} onValueChange={v => store.setTurno(v === 'todos' ? null : parseInt(v))}>
            <SelectTrigger className="w-[110px] h-8 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Turno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Ambos turnos</SelectItem>
              <SelectItem value="1">1º Turno</SelectItem>
              <SelectItem value="2">2º Turno</SelectItem>
            </SelectContent>
          </Select>

          <Select value={store.cargo || 'todos'} onValueChange={v => store.setCargo(v === 'todos' ? null : v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Cargo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos cargos</SelectItem>
              {CARGOS_DISPONIVEIS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={store.municipio || 'todos'} onValueChange={v => store.setMunicipio(v === 'todos' ? null : v)}>
            <SelectTrigger className="w-[150px] h-8 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Município" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos municípios</SelectItem>
              {(municipios || []).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={store.partido || 'todos'} onValueChange={v => store.setPartido(v === 'todos' ? null : v)}>
            <SelectTrigger className="w-[120px] h-8 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Partido" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos partidos</SelectItem>
              {(partidos || []).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="h-8 text-xs text-muted-foreground px-2">
            {expanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
            Avançado
          </Button>

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={store.limpar} className="h-8 text-xs text-destructive hover:text-destructive px-2">
              <X className="w-3.5 h-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Expanded advanced filters — placeholder for future demographic filters */}
      {expanded && (
        <div className="px-4 py-2 border-t border-border/30 bg-muted/20">
          <div className="flex flex-wrap gap-2 items-center max-w-[1600px] mx-auto">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-2">Filtros avançados em breve</span>
          </div>
        </div>
      )}
    </div>
  );
}
