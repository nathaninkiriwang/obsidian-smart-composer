import { PaperMetadata } from '../../types/zotero.types'

type Listener = () => void

export class PaperSelectionStore {
  private selected = new Map<string, PaperMetadata>()
  private available: PaperMetadata[] = []
  private listeners: Set<Listener> = new Set()
  private availableListeners: Set<Listener> = new Set()

  // Cached snapshots for useSyncExternalStore (must be referentially stable)
  private selectedSnapshot: Map<string, PaperMetadata> = new Map()
  private availableSnapshot: PaperMetadata[] = []

  addPaper(paper: PaperMetadata): void {
    if (this.selected.has(paper.zoteroKey)) return
    this.selected.set(paper.zoteroKey, paper)
    this.selectedSnapshot = new Map(this.selected)
    this.notify()
  }

  removePaper(zoteroKey: string): void {
    if (!this.selected.has(zoteroKey)) return
    this.selected.delete(zoteroKey)
    this.selectedSnapshot = new Map(this.selected)
    this.notify()
  }

  clear(): void {
    if (this.selected.size === 0) return
    this.selected.clear()
    this.selectedSnapshot = new Map()
    this.notify()
  }

  isSelected(zoteroKey: string): boolean {
    return this.selected.has(zoteroKey)
  }

  getSelected(): PaperMetadata[] {
    return Array.from(this.selected.values())
  }

  getSelectedMap(): Map<string, PaperMetadata> {
    return this.selectedSnapshot
  }

  setAvailablePapers(papers: PaperMetadata[]): void {
    this.available = papers
    this.availableSnapshot = papers
    this.notifyAvailable()
  }

  getAvailablePapers(): PaperMetadata[] {
    return this.availableSnapshot
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeAvailable(listener: Listener): () => void {
    this.availableListeners.add(listener)
    return () => {
      this.availableListeners.delete(listener)
    }
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }

  private notifyAvailable(): void {
    this.availableListeners.forEach((l) => l())
  }
}
