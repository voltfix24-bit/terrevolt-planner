import { create } from "zustand";

interface SelectedProjectState {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
}

export const useSelectedProject = create<SelectedProjectState>((set) => ({
  projectId: null,
  setProjectId: (id) => set({ projectId: id }),
}));
