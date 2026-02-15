import { useCallback, useEffect, useState } from 'react'

import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { buildCollectionTree } from '../../core/zotero/zoteroClient'
import { CollectionTreeNode } from '../../types/zotero.types'

type CollectionSelectorProps = {
  selectedCollection: string
  onSelect: (collectionKey: string) => void
}

export function CollectionSelector({
  selectedCollection,
  onSelect,
}: CollectionSelectorProps) {
  const plugin = usePlugin()
  const { settings } = useSettings()
  const [isOpen, setIsOpen] = useState(false)
  const [tree, setTree] = useState<CollectionTreeNode[]>([])

  const libraryPath = settings.zotero.libraryVaultPath || 'Library'

  useEffect(() => {
    const client = plugin.zoteroClient
    if (!client) return

    let cancelled = false

    async function loadCollections() {
      try {
        const collections = await client!.fetchCollections()
        if (cancelled) return
        const nodes = buildCollectionTree(collections, libraryPath)
        setTree(nodes)
      } catch {
        // Zotero unavailable
      }
    }

    void loadCollections()
    return () => {
      cancelled = true
    }
  }, [plugin.zoteroClient, libraryPath])

  const handleSelect = useCallback(
    (key: string) => {
      onSelect(key)
      setIsOpen(false)
    },
    [onSelect],
  )

  // Find the selected collection name for display
  const findName = (
    nodes: CollectionTreeNode[],
    key: string,
  ): string | null => {
    for (const node of nodes) {
      if (node.key === key) return node.name
      const found = findName(node.children, key)
      if (found) return found
    }
    return null
  }

  const displayName = selectedCollection
    ? findName(tree, selectedCollection) ?? 'All Items'
    : 'All Items'

  const renderNode = (node: CollectionTreeNode, depth: number) => {
    return (
      <div key={node.key}>
        <button
          className={`smtcmp-library-collection-option ${node.key === selectedCollection ? 'smtcmp-library-collection-option-active' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => handleSelect(node.key)}
        >
          <span className="smtcmp-library-collection-name">{node.name}</span>
          <span className="smtcmp-library-collection-count">
            {node.itemCount}
          </span>
        </button>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="smtcmp-library-folder-selector">
      <button
        className="smtcmp-library-folder-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
        <span className="smtcmp-library-folder-name">{displayName}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`smtcmp-library-chevron ${isOpen ? 'smtcmp-library-chevron-open' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="smtcmp-library-folder-dropdown">
          <button
            className={`smtcmp-library-collection-option ${!selectedCollection ? 'smtcmp-library-collection-option-active' : ''}`}
            style={{ paddingLeft: '12px' }}
            onClick={() => handleSelect('')}
          >
            <span className="smtcmp-library-collection-name">All Items</span>
          </button>
          {tree.map((node) => renderNode(node, 0))}
        </div>
      )}
    </div>
  )
}
