import { useFilterStore } from '@/stores/filterStore';
import { useMunicipios, usePartidos, useCargos, useBairros, useEscolas } from '@/hooks/useEleicoes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Filter, Search, MapPin, School } from 'lucide-react';

const ANOS = [2024, 2022, 2020, 2018, 2016, 2014];

export function GlobalFilters() {
  const store = useFilterStore();
  const { data: municipios } = useMunicipios();
  const { data: partidos } = usePartidos();
  const { data: cargos } = useCargos();
  const { data: bairros } = useBairros();
  const { data: escolas } = useEscolas();
  const activeCount = store.activeFiltersCount();

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/50">
      <div className="px-4 py-2">
        <div className="flex flex-wrap gap-2 items-center max-w-[1800px] mx-auto">
          <div className="flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Filtros</span>
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-sm">
                {activeCount}
              </Badge>
            )}
          </div>

          <div className="relative flex-1 max-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={store.searchText}
              onChange={e => store.setSearchText(e.target.value)}
              placeholder="Buscar candidato..."
              className="pl-7 h-7 text-xs bg-muted/50 border-border/50"
            />
          </div>

          <Select value={store.ano.toString()} onValueChange={v => store.setAno(parseInt(v))}>
            <SelectTrigger className="w-[85px] h-7 text-xs bg-muted/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANOS.map(a => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={store.municipio} onValueChange={v => store.setMunicipio(v)}>
            <SelectTrigger className="w-[140px] h-7 text-xs bg-muted/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(municipios || ['GOIÂNIA']).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={store.cargo || '_all'} onValueChange={v => store.setCargo(v === '_all' ? null : v)}>
            <SelectTrigger className="w-[130px] h-7 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Todos cargos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos cargos</SelectItem>
              {(cargos || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={store.turno?.toString() || '_all'} onValueChange={v => store.setTurno(v === '_all' ? null : parseInt(v))}>
            <SelectTrigger className="w-[100px] h-7 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Turno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Ambos</SelectItem>
              <SelectItem value="1">1º Turno</SelectItem>
              <SelectItem value="2">2º Turno</SelectItem>
            </SelectContent>
          </Select>

          <Select value={store.partido || '_all'} onValueChange={v => store.setPartido(v === '_all' ? null : v)}>
            <SelectTrigger className="w-[100px] h-7 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Partido" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos</SelectItem>
              {(partidos || []).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Bairro — cascata: só habilitado se município selecionado */}
          <Select
            value={store.bairro || '_all'}
            onValueChange={v => store.setBairro(v === '_all' ? null : v)}
            disabled={!store.municipio}
          >
            <SelectTrigger className="w-[130px] h-7 text-xs bg-muted/50 border-border/50">
              <MapPin className="w-3 h-3 mr-1 text-muted-foreground/60 shrink-0" />
              <SelectValue placeholder="Bairro" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="_all">Todos bairros</SelectItem>
              {(bairros || []).map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Escola — cascata: só habilitado se bairro selecionado */}
          <Select
            value={store.escola || '_all'}
            onValueChange={v => store.setEscola(v === '_all' ? null : v)}
            disabled={!store.bairro}
          >
            <SelectTrigger className="w-[160px] h-7 text-xs bg-muted/50 border-border/50">
              <School className="w-3 h-3 mr-1 text-muted-foreground/60 shrink-0" />
              <SelectValue placeholder="Escola" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="_all">Todos locais</SelectItem>
              {(escolas || []).map(e => <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>)}
            </SelectContent>
          </Select>

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={store.limpar} className="h-7 text-[10px] text-destructive hover:text-destructive px-2">
              <X className="w-3 h-3 mr-0.5" /> Limpar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
