import { Notice, TFile, TFolder } from 'obsidian'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { buildPdfFilename } from '../../core/zotero/pdfNaming'
import {
  extractYear,
  getAuthorLastNames,
} from '../../core/zotero/zoteroClient'
import { usePaperSelection } from '../../hooks/usePaperSelection'
import { PaperMetadata } from '../../types/zotero.types'

import { CollectionSelector } from './CollectionSelector'
import { DateFilter } from './DateFilter'
import { PaperList } from './PaperList'
import { SearchBar } from './SearchBar'

/** Collect all PDFs recursively from a vault folder */
function collectPdfs(folder: TFolder): TFile[] {
  const pdfs: TFile[] = []
  for (const child of folder.children) {
    if (child instanceof TFile && child.extension === 'pdf') {
      pdfs.push(child)
    } else if (child instanceof TFolder) {
      pdfs.push(...collectPdfs(child))
    }
  }
  return pdfs
}

export function LibraryPane() {
  const app = useApp()
  const plugin = usePlugin()
  const { settings, setSettings } = useSettings()

  const { selectedPapers, addPaper, removePaper, isSelected } =
    usePaperSelection()

  const [papers, setPapers] = useState<PaperMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const fetchingRef = useRef(false)

  const libraryPath = settings.zotero.libraryVaultPath || 'Library'
  const selectedCollection = settings.zotero.selectedCollection

  // Build a filename -> vault path index from the Library folder
  const buildFileIndex = useCallback((): Map<string, string> => {
    const folder = app.vault.getAbstractFileByPath(libraryPath)
    if (!folder || !(folder instanceof TFolder)) return new Map()
    const pdfs = collectPdfs(folder)
    const index = new Map<string, string>()
    for (const pdf of pdfs) {
      index.set(pdf.name, pdf.path)
    }
    return index
  }, [app.vault, libraryPath])

  // Fetch papers from Zotero API
  const fetchPapers = useCallback(async () => {
    const client = plugin.zoteroClient
    if (!client) {
      setPapers([])
      setLoading(false)
      return
    }

    if (fetchingRef.current) return
    fetchingRef.current = true

    try {
      const collectionKey = selectedCollection || undefined
      const { items, attachmentMap } =
        await client.fetchItemsWithAttachments(collectionKey)
      const fileIndex = buildFileIndex()

      const paperList: PaperMetadata[] = []
      for (const item of items) {
        const attachment = attachmentMap.get(item.key)
        if (!attachment?.data.filename) {
          paperList.push(client.buildPaperMetadata(item, ''))
          continue
        }
        // Look up using the renamed filename (matching sync logic)
        const authors = getAuthorLastNames(item.data.creators)
        const year = extractYear(item.data.date)
        const renamedFilename = buildPdfFilename(authors, year, item.data.title)
        const vaultPath = fileIndex.get(renamedFilename) ?? ''
        paperList.push(client.buildPaperMetadata(item, vaultPath))
      }

      paperList.sort((a, b) => a.title.localeCompare(b.title))
      setPapers(paperList)
      plugin.paperSelection.setAvailablePapers(paperList)
    } catch {
      // Zotero unavailable
      setPapers([])
      plugin.paperSelection.setAvailablePapers([])
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [plugin.zoteroClient, selectedCollection, buildFileIndex])

  // Fetch on mount and when collection or refreshKey changes
  useEffect(() => {
    setLoading(true)
    void fetchPapers()
  }, [fetchPapers, refreshKey])

  // Reactive vault event listeners — re-fetch when files change in Library
  useEffect(() => {
    const debounceMs = 500
    let timer: ReturnType<typeof setTimeout> | null = null

    const triggerRefresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setRefreshKey((k) => k + 1)
      }, debounceMs)
    }

    const isInLibrary = (path: string) =>
      path.startsWith(libraryPath + '/') || path === libraryPath

    const onCreate = (file: { path: string }) => {
      if (isInLibrary(file.path)) triggerRefresh()
    }
    const onDelete = (file: { path: string }) => {
      if (isInLibrary(file.path)) triggerRefresh()
    }
    const onRename = (file: { path: string }, oldPath: string) => {
      if (isInLibrary(file.path) || isInLibrary(oldPath)) triggerRefresh()
    }

    const refs = [
      app.vault.on('create', onCreate),
      app.vault.on('delete', onDelete),
      app.vault.on('rename', onRename),
    ]

    return () => {
      refs.forEach((ref) => app.vault.offref(ref))
      if (timer) clearTimeout(timer)
    }
  }, [app.vault, libraryPath])

  const handleCollectionChange = useCallback(
    async (collectionKey: string) => {
      await setSettings({
        ...settings,
        zotero: { ...settings.zotero, selectedCollection: collectionKey },
      })
    },
    [settings, setSettings],
  )

  const filteredPapers = useMemo(() => {
    let result = papers

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.authors.some((a) => a.toLowerCase().includes(q)),
      )
    }

    if (yearFrom) {
      const from = parseInt(yearFrom, 10)
      if (!isNaN(from)) {
        result = result.filter((p) => {
          const y = parseInt(p.year, 10)
          return !isNaN(y) && y >= from
        })
      }
    }
    if (yearTo) {
      const to = parseInt(yearTo, 10)
      if (!isNaN(to)) {
        result = result.filter((p) => {
          const y = parseInt(p.year, 10)
          return !isNaN(y) && y <= to
        })
      }
    }

    return result
  }, [papers, searchQuery, yearFrom, yearTo])

  const handleTogglePaper = useCallback(
    (paper: PaperMetadata) => {
      if (isSelected(paper.zoteroKey)) {
        removePaper(paper.zoteroKey)
      } else {
        addPaper(paper)
      }
    },
    [isSelected, addPaper, removePaper],
  )

  const handleOpenPdf = useCallback(
    async (pdfPath: string) => {
      if (!pdfPath) {
        new Notice('PDF not synced to vault yet')
        return
      }
      const file = app.vault.getAbstractFileByPath(pdfPath)
      if (file instanceof TFile) {
        await app.workspace.getLeaf(false).openFile(file)
      } else {
        new Notice('PDF file not found in vault')
      }
    },
    [app.vault, app.workspace],
  )

  return (
    <div className="smtcmp-library-pane">
      <div className="smtcmp-library-header">
        <h4 className="smtcmp-library-title">Library</h4>
      </div>

      <CollectionSelector
        selectedCollection={selectedCollection}
        onSelect={(key) => void handleCollectionChange(key)}
      />

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        totalCount={papers.length}
      />

      <DateFilter
        yearFrom={yearFrom}
        yearTo={yearTo}
        onYearFromChange={setYearFrom}
        onYearToChange={setYearTo}
      />

      <PaperList
        papers={filteredPapers}
        loading={loading}
        selectedPapers={selectedPapers}
        onToggle={handleTogglePaper}
        onOpenPdf={handleOpenPdf}
        hasSearchQuery={searchQuery.trim().length > 0}
      />
    </div>
  )
}
