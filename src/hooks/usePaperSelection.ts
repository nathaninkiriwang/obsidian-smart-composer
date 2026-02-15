import { useCallback, useSyncExternalStore } from 'react'

import { PaperSelectionStore } from '../core/paper-selection/store'
import { usePlugin } from '../contexts/plugin-context'
import { PaperMetadata } from '../types/zotero.types'

export function usePaperSelection(): {
  selectedPapers: Map<string, PaperMetadata>
  availablePapers: PaperMetadata[]
  addPaper: (paper: PaperMetadata) => void
  removePaper: (zoteroKey: string) => void
  clearSelection: () => void
  isSelected: (zoteroKey: string) => boolean
} {
  const plugin = usePlugin()
  const store = plugin.paperSelection

  const selectedPapers = useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), [store]),
    useCallback(() => store.getSelectedMap(), [store]),
  )

  const availablePapers = useSyncExternalStore(
    useCallback((cb) => store.subscribeAvailable(cb), [store]),
    useCallback(() => store.getAvailablePapers(), [store]),
  )

  const addPaper = useCallback(
    (paper: PaperMetadata) => store.addPaper(paper),
    [store],
  )

  const removePaper = useCallback(
    (zoteroKey: string) => store.removePaper(zoteroKey),
    [store],
  )

  const clearSelection = useCallback(() => store.clear(), [store])

  const isSelected = useCallback(
    (zoteroKey: string) => store.isSelected(zoteroKey),
    [store],
  )

  return {
    selectedPapers,
    availablePapers,
    addPaper,
    removePaper,
    clearSelection,
    isSelected,
  }
}
