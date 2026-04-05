import { create } from 'zustand';

interface FilterState {
  ano: number | null;
  turno: number | null;
  cargo: string | null;
  municipio: string | null;
  partido: string | null;
  genero: string | null;
  escolaridade: string | null;
  ocupacao: string | null;
  situacao: string | null;
  searchText: string;
  setAno: (ano: number | null) => void;
  setTurno: (turno: number | null) => void;
  setCargo: (cargo: string | null) => void;
  setMunicipio: (municipio: string | null) => void;
  setPartido: (partido: string | null) => void;
  setGenero: (genero: string | null) => void;
  setEscolaridade: (escolaridade: string | null) => void;
  setOcupacao: (ocupacao: string | null) => void;
  setSituacao: (situacao: string | null) => void;
  setSearchText: (searchText: string) => void;
  limpar: () => void;
  activeFiltersCount: () => number;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  ano: 2024,
  turno: null,
  cargo: null,
  municipio: null,
  partido: null,
  genero: null,
  escolaridade: null,
  ocupacao: null,
  situacao: null,
  searchText: '',
  setAno: (ano) => set({ ano }),
  setTurno: (turno) => set({ turno }),
  setCargo: (cargo) => set({ cargo }),
  setMunicipio: (municipio) => set({ municipio }),
  setPartido: (partido) => set({ partido }),
  setGenero: (genero) => set({ genero }),
  setEscolaridade: (escolaridade) => set({ escolaridade }),
  setOcupacao: (ocupacao) => set({ ocupacao }),
  setSituacao: (situacao) => set({ situacao }),
  setSearchText: (searchText) => set({ searchText }),
  limpar: () => set({ ano: null, turno: null, cargo: null, municipio: null, partido: null, genero: null, escolaridade: null, ocupacao: null, situacao: null, searchText: '' }),
  activeFiltersCount: () => {
    const s = get();
    let c = 0;
    if (s.ano) c++;
    if (s.turno) c++;
    if (s.cargo) c++;
    if (s.municipio) c++;
    if (s.partido) c++;
    if (s.genero) c++;
    if (s.escolaridade) c++;
    if (s.ocupacao) c++;
    if (s.situacao) c++;
    if (s.searchText) c++;
    return c;
  },
}));
