import { useFilterStore } from "@/stores/filterStore";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
            <SelectItem value="2024">2024</SelectItem>
            <SelectItem value="2022">2022</SelectItem>
            <SelectItem value="2020">2020</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Município */}
      <div className="space-y-2 flex-1">
        <Label htmlFor="municipio">Município</Label>
        <Select 
          value={municipio || "todos"} 
          onValueChange={(val) => setMunicipio(val === "todos" ? "GOIÂNIA" : val)}
        >
          <SelectTrigger id="municipio">
            <SelectValue placeholder="Todos os Municípios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="GOIÂNIA">Goiânia</SelectItem>
            <SelectItem value="APARECIDA DE GOIÂNIA">Aparecida de Goiânia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cargo */}
      <div className="space-y-2 flex-1">
        <Label htmlFor="cargo">Cargo</Label>
        <Select 
          value={cargo || "todos"} 
          onValueChange={(val) => setCargo(val === "todos" ? null : val)}
          disabled={!municipio}
        >
          <SelectTrigger id="cargo">
            <SelectValue placeholder="Todos os Cargos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="PREFEITO">Prefeito</SelectItem>
            <SelectItem value="VEREADOR">Vereador</SelectItem>
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
