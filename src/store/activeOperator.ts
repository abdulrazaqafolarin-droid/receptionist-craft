import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Active operator store — which receptionist the owner is currently
 * managing, and that operator's approved dashboard surface.
 *
 * The surface (visible_pages) is written ONLY by the approval chain
 * (approve-operator-plan writes ui_surface into receptionists.capabilities;
 * pages read it back here). The sidebar and route gates read from this
 * store, so switching operators switches the whole dashboard surface.
 *
 * null surface = operator predates surfaces OR none approved yet ->
 * show everything (backwards compatible, never a dead dashboard).
 */

interface ActiveOperatorState {
  receptionistId: string | null;
  operatorName: string | null;
  visiblePages: string[] | null;
  setActive: (id: string | null, name: string | null, visiblePages: string[] | null) => void;
  clear: () => void;
}

export const useActiveOperatorStore = create<ActiveOperatorState>()(
  persist(
    (set) => ({
      receptionistId: null,
      operatorName: null,
      visiblePages: null,
      setActive: (receptionistId, operatorName, visiblePages) =>
        set({ receptionistId, operatorName, visiblePages }),
      clear: () => set({ receptionistId: null, operatorName: null, visiblePages: null }),
    }),
    { name: "rutex-active-operator" },
  ),
);
