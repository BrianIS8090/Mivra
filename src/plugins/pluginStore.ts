import { create } from 'zustand';
import type { PluginManifest, RegisteredDialog, ToolbarButtonConfig } from './types';

type OpenDialogState = {
  id: string;
  props: Record<string, unknown>;
};

type PluginStore = {
  manifests: PluginManifest[];
  toolbarButtons: ToolbarButtonConfig[];
  dialogs: RegisteredDialog[];
  openDialogs: OpenDialogState[];
  refreshKey: number;
  setManifests: (manifests: PluginManifest[]) => void;
  requestRefresh: () => void;
  registerToolbarButton: (button: ToolbarButtonConfig) => () => void;
  registerDialog: (dialog: RegisteredDialog) => () => void;
  openDialog: (id: string, props?: Record<string, unknown>) => void;
  closeDialog: (id: string) => void;
  clearPlugin: (pluginId: string) => void;
  reset: () => void;
};

export const usePluginStore = create<PluginStore>((set) => ({
  manifests: [],
  toolbarButtons: [],
  dialogs: [],
  openDialogs: [],
  refreshKey: 0,
  setManifests: (manifests) => set({ manifests }),
  requestRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
  registerToolbarButton: (button) => {
    set((state) => ({
      toolbarButtons: [
        ...state.toolbarButtons.filter((item) => item.id !== button.id || item.pluginId !== button.pluginId),
        button,
      ],
    }));
    return () => set((state) => ({
      toolbarButtons: state.toolbarButtons.filter(
        (item) => item.id !== button.id || item.pluginId !== button.pluginId,
      ),
    }));
  },
  registerDialog: (dialog) => {
    set((state) => ({
      dialogs: [
        ...state.dialogs.filter((item) => item.id !== dialog.id || item.pluginId !== dialog.pluginId),
        dialog,
      ],
    }));
    return () => set((state) => ({
      dialogs: state.dialogs.filter((item) => item.id !== dialog.id || item.pluginId !== dialog.pluginId),
      openDialogs: state.openDialogs.filter((item) => item.id !== dialog.id),
    }));
  },
  openDialog: (id, props = {}) => set((state) => ({
    openDialogs: [...state.openDialogs.filter((item) => item.id !== id), { id, props }],
  })),
  closeDialog: (id) => set((state) => ({
    openDialogs: state.openDialogs.filter((item) => item.id !== id),
  })),
  clearPlugin: (pluginId) => set((state) => ({
    toolbarButtons: state.toolbarButtons.filter((item) => item.pluginId !== pluginId),
    dialogs: state.dialogs.filter((item) => item.pluginId !== pluginId),
    openDialogs: state.openDialogs.filter((open) => {
      const dialog = state.dialogs.find((item) => item.id === open.id);
      return dialog?.pluginId !== pluginId;
    }),
  })),
  reset: () => set({ manifests: [], toolbarButtons: [], dialogs: [], openDialogs: [], refreshKey: 0 }),
}));
