import { useState } from 'react';
import { useFilterStore } from '@/stores/filterStore';
import { useMunicipios, usePartidos, useCargos, useZonas, useBairros, useEscolas } from '@/hooks/useEleicoes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Filter, Search, MapPin, School, Hash, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ANOS = [2024, 2022, 2020, 2018, 2016, 2014];

export type FilterField = 'busca' | 'ano' | 'municipio' | 'cargo' | 'turno' | 'partido' | 'zona' | 'bairro' | 'escola';

const ALL_FILTERS: FilterField[] = ['busca', 'ano', 'municipio', 'cargo', 'turno', 'partido', 'zona', 'bairro', 'escola'];

interface GlobalFiltersProps {
  visibleFilters?: FilterField[];
}

export function GlobalFilters({ visibleFilters = ALL_FILTERS }: GlobalFiltersProps) {
  const store = useFilterStore();
  const { data: municipios } = useMunicipios();
  const { data: partidos } = usePartidos();
  const { data: cargos } = useCargos();
  const { data: zonas } = useZonas();
  const { data: bairros } = useBairros();
  const { data: escolas } = useEscolas();
  const activeCount = store.activeFiltersCount();

  const show = (field: FilterField) => visibleFilters.includes(field);

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/50">
      <div className="px-2 sm:px-4 py-2">
        <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center max-w-[1800px] mx-auto">
          <div className="flex items-center gap-1.5 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Filtros</span>
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-sm">
                {activeCount}
              </Badge>
            )}
          </div>

          {show('busca') && (
            <div className="relative flex-1 min-w-[120px] max-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={store.searchText}
                onChange={e => store.setSearchText(e.target.value)}
                placeholder="Buscar..."
                className="pl-7 h-7 text-xs bg-muted/50 border-border/50"
              />
            </div>
          )}

          {show('ano') && (
            <Select value={store.ano.toString()} onValueChange={v => store.setAno(parseInt(v))}>
              <SelectTrigger className="w-[70px] sm:w-[85px] h-7 text-xs bg-muted/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANOS.map(a => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {show('municipio') && (
            <Select value={store.municipio} onValueChange={v => store.setMunicipio(v)}>
              <SelectTrigger className="w-[110px] sm:w-[140px] h-7 text-xs bg-muted/50 border-border/50 truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(municipios || ['GOIÂNIA']).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {show('cargo') && (
            <Select value={store.cargo || '_all'} onValueChange={v => store.setCargo(v === '_all' ? null : v)}>
              <SelectTrigger className="w-[100px] sm:w-[130px] h-7 text-xs bg-muted/50 border-border/50">
                <SelectValue placeholder="Cargos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos cargos</SelectItem>
                {(cargos || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {show('turno') && (
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
          )}

          {show('partido') && (
            <Select value={store.partido || '_all'} onValueChange={v => store.setPartido(v === '_all' ? null : v)}>
              <SelectTrigger className="w-[100px] h-7 text-xs bg-muted/50 border-border/50">
                <SelectValue placeholder="Partido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {(partidos || []).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {show('zona') && (
            <Select
              value={store.zona?.toString() || '_all'}
              onValueChange={v => store.setZona(v === '_all' ? null : parseInt(v))}
              disabled={!store.municipio}
            >
              <SelectTrigger className="w-[95px] h-7 text-xs bg-muted/50 border-border/50">
                <Hash className="w-3 h-3 mr-1 text-muted-foreground/60 shrink-0" />
                <SelectValue placeholder="Zona" />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <SelectItem value="_all">Todas zonas</SelectItem>
                {(zonas || []).map(z => <SelectItem key={z} value={z.toString()} className="text-xs">Zona {z}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {show('bairro') && (
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
          )}

          {show('escola') && (
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
          )}

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
