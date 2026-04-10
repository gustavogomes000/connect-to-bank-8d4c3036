import { useState } from "react";
import { useFilterStore } from "@/stores/filterStore";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const MUNICIPIOS = [
  { value: "APARECIDA DE GOIÂNIA", label: "Aparecida de Goiânia" },
  { value: "GOIÂNIA", label: "Goiânia" },
];

export function GlobalFilters() {
  const {
    ano,
    municipio,
    cargo,
    setAno,
    setMunicipio,
    setCargo,
    limpar: resetFilters,
  } = useFilterStore();

  const [openMunicipio, setOpenMunicipio] = useState(false);

  const municipioLabel = MUNICIPIOS.find((m) => m.value === municipio)?.label || municipio;

  return (
    <div className="bg-card text-card-foreground p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 items-end mb-6">
      {/* Ano Eleitoral */}
      <div className="space-y-2 flex-1">
        <Label htmlFor="ano">Ano Eleitoral</Label>
        <Select 
          value={ano.toString()} 
          onValueChange={(val) => setAno(Number(val))}
        >
          <SelectTrigger id="ano">
            <SelectValue placeholder="Selecione o ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2024">2024 (Municipal)</SelectItem>
            <SelectItem value="2022">2022 (Geral)</SelectItem>
            <SelectItem value="2020">2020 (Municipal)</SelectItem>
            <SelectItem value="2018">2018 (Geral)</SelectItem>
            <SelectItem value="2016">2016 (Municipal)</SelectItem>
            <SelectItem value="2014">2014 (Geral)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Município - Searchable */}
      <div className="space-y-2 flex-1">
        <Label>Município</Label>
        <Popover open={openMunicipio} onOpenChange={setOpenMunicipio}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openMunicipio}
              className="w-full justify-between font-normal"
            >
              {municipioLabel}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar município..." />
              <CommandList>
                <CommandEmpty>Nenhum município encontrado.</CommandEmpty>
                <CommandGroup>
                  {MUNICIPIOS.map((m) => (
                    <CommandItem
                      key={m.value}
                      value={m.label}
                      onSelect={() => {
                        setMunicipio(m.value);
                        setOpenMunicipio(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          municipio === m.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {m.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Cargo */}
      <div className="space-y-2 flex-1">
        <Label htmlFor="cargo">Cargo</Label>
        <Select 
          value={cargo || "todos"} 
          onValueChange={(val) => setCargo(val === "todos" ? null : val)}
        >
          <SelectTrigger id="cargo">
            <SelectValue placeholder="Todos os Cargos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {[2016, 2020, 2024].includes(ano) ? (
              <>
                <SelectItem value="PREFEITO">Prefeito</SelectItem>
                <SelectItem value="VICE-PREFEITO">Vice-Prefeito</SelectItem>
                <SelectItem value="VEREADOR">Vereador</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="GOVERNADOR">Governador</SelectItem>
                <SelectItem value="VICE-GOVERNADOR">Vice-Governador</SelectItem>
                <SelectItem value="SENADOR">Senador</SelectItem>
                <SelectItem value="1º SUPLENTE">1º Suplente</SelectItem>
                <SelectItem value="2º SUPLENTE">2º Suplente</SelectItem>
                <SelectItem value="DEPUTADO FEDERAL">Deputado Federal</SelectItem>
                <SelectItem value="DEPUTADO ESTADUAL">Deputado Estadual</SelectItem>
                {ano === 2014 && <SelectItem value="PRESIDENTE">Presidente</SelectItem>}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Reset */}
      <Button variant="outline" onClick={resetFilters} className="md:w-auto w-full">
        Limpar Filtros
      </Button>
    </div>
  );
}
