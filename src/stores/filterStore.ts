import { create } from 'zustand';

interface FilterState {
  ano: number;
  municipio: string;
  cargo: string | null;
  turno: number | null;
  partido: string | null;
  zona: number | null;
  bairro: string | null;
  escola: string | null;
  candidatoSelecionadoId: string | null;
  searchText: string;

  setAno: (ano: number) => void;
  setMunicipio: (municipio: string) => void;
  setCargo: (cargo: string | null) => void;
  setTurno: (turno: number | null) => void;
  setPartido: (partido: string | null) => void;
  setZona: (zona: number | null) => void;
  setBairro: (bairro: string | null) => void;
  setEscola: (escola: string | null) => void;
  setCandidatoSelecionadoId: (id: string | null) => void;
  setSearchText: (searchText: string) => void;
  limpar: () => void;
  activeFiltersCount: () => number;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  ano: 2024,
  municipio: 'APARECIDA DE GOIÂNIA',
  cargo: null,
  turno: null,
  partido: null,
  zona: null,
  bairro: null,
  escola: null,
  candidatoSelecionadoId: null,
  searchText: '',

  setAno: (ano) => set({ ano }),
  setMunicipio: (municipio) => set({ municipio, zona: null, bairro: null, escola: null }),
  setCargo: (cargo) => set({ cargo }),
  setTurno: (turno) => set({ turno }),
  setPartido: (partido) => set({ partido }),
  setZona: (zona) => set({ zona, bairro: null, escola: null }),
  setBairro: (bairro) => set({ bairro, escola: null }),
  setEscola: (escola) => set({ escola }),
  setCandidatoSelecionadoId: (id) => set({ candidatoSelecionadoId: id }),
  setSearchText: (searchText) => set({ searchText }),
  limpar: () => set({ ano: 2024, municipio: 'APARECIDA DE GOIÂNIA', cargo: null, turno: null, partido: null, zona: null, bairro: null, escola: null, candidatoSelecionadoId: null, searchText: '' }),
  activeFiltersCount: () => {
    const s = get();
    let c = 0;
    if (s.cargo) c++;
    if (s.turno) c++;
    if (s.partido) c++;
    if (s.zona) c++;
    if (s.bairro) c++;
    if (s.escola) c++;
    if (s.searchText) c++;
    return c;
  },
}));
