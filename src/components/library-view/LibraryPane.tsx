import { Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LIBRARY_VIEW_TYPE } from '../../constants'
import { useApp } from '../../contexts/app-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { buildCitekeyFilenameMap, buildFilenameMap } from '../../core/zotero/pdfNaming'
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

      // Resolve the target filename for each item. In citekey mode the
      // citekeys come from one batched Better BibTeX call; items without a
      // citekey fall back to author-year naming.
      const filenameMap =
        settings.zotero.pdfNamingScheme === 'citekey'
          ? await buildCitekeyFilenameMap(items, (keys) =>
              client.fetchCitekeys(keys),
            )
          : buildFilenameMap(items)

      const paperList: PaperMetadata[] = []
      for (const item of items) {
        const attachment = attachmentMap.get(item.key)
        if (!attachment) {
          paperList.push(client.buildPaperMetadata(item, ''))
          continue
        }

        // Resolve the PDF's vault path by matching the resolved filename (or
        // the original Zotero filename) against the Library folder index.
        let vaultPath = ''
        const renamedFilename = filenameMap.get(item.key)
        if (renamedFilename) {
          vaultPath = fileIndex.get(renamedFilename) ?? ''
        }
        if (!vaultPath && attachment.data.filename) {
          vaultPath = fileIndex.get(attachment.data.filename) ?? ''
        }

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
  }, [
    plugin.zoteroClient,
    selectedCollection,
    buildFileIndex,
    settings.zotero.pdfNamingScheme,
  ])

  // Fetch on mount and when collection or refreshKey changes
  useEffect(() => {
    setLoading(true)
    void fetchPapers()
  }, [fetchPapers, refreshKey])

  // Refresh on focus instead of polling on a timer: refetch when Obsidian
  // regains OS focus or when the Library pane becomes the active leaf, so the
  // list reflects any Zotero changes made while we were away. Together with the
  // mount fetch above (which also covers app restart / reopening the pane) and
  // the vault file events below, this keeps the list current with no interval.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => void fetchPapers(), 150)
    }
    const onActiveLeafChange = (leaf: WorkspaceLeaf | null) => {
      if (leaf?.view.getViewType() === LIBRARY_VIEW_TYPE) refresh()
    }
    const leafRef = app.workspace.on('active-leaf-change', onActiveLeafChange)
    window.addEventListener('focus', refresh)
    return () => {
      if (debounce) clearTimeout(debounce)
      app.workspace.offref(leafRef)
      window.removeEventListener('focus', refresh)
    }
  }, [app.workspace, fetchPapers])

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
