import { create } from 'zustand';

interface FilterState {
  ano: number;
  municipio: string;
  cargo: string | null;
  turno: number | null;
  partido: string | null;
  candidatoSelecionadoId: string | null;
  searchText: string;

  setAno: (ano: number) => void;
  setMunicipio: (municipio: string) => void;
  setCargo: (cargo: string | null) => void;
  setTurno: (turno: number | null) => void;
  setPartido: (partido: string | null) => void;
  setCandidatoSelecionadoId: (id: string | null) => void;
  setSearchText: (searchText: string) => void;
  limpar: () => void;
  activeFiltersCount: () => number;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  ano: 2024,
  municipio: 'GOIÂNIA',
  cargo: null,
  turno: null,
  partido: null,
  candidatoSelecionadoId: null,
  searchText: '',

  setAno: (ano) => set({ ano }),
  setMunicipio: (municipio) => set({ municipio }),
  setCargo: (cargo) => set({ cargo }),
  setTurno: (turno) => set({ turno }),
  setPartido: (partido) => set({ partido }),
  setCandidatoSelecionadoId: (id) => set({ candidatoSelecionadoId: id }),
  setSearchText: (searchText) => set({ searchText }),
  limpar: () => set({ ano: 2024, municipio: 'GOIÂNIA', cargo: null, turno: null, partido: null, candidatoSelecionadoId: null, searchText: '' }),
  activeFiltersCount: () => {
    const s = get();
    let c = 0;
    if (s.cargo) c++;
    if (s.turno) c++;
    if (s.partido) c++;
    if (s.searchText) c++;
    return c;
  },
}));
