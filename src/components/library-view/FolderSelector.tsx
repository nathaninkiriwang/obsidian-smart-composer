import { TFolder } from 'obsidian'
import { useCallback, useMemo, useState } from 'react'

import { useApp } from '../../contexts/app-context'

type FolderSelectorProps = {
  selectedFolder: string
  onSelect: (folderPath: string) => void
}

export function FolderSelector({ selectedFolder, onSelect }: FolderSelectorProps) {
  const app = useApp()
  const [isOpen, setIsOpen] = useState(false)

  const folders = useMemo(() => {
    const result: string[] = []
    const collect = (folder: TFolder) => {
      result.push(folder.path)
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          collect(child)
        }
      }
    }
    collect(app.vault.getRoot())
    return result.sort()
  }, [app.vault])

  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path)
      setIsOpen(false)
    },
    [onSelect],
  )

  const displayName = selectedFolder
    ? selectedFolder === '/'
      ? 'Vault Root'
      : selectedFolder
    : 'Select a folder...'

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
          {folders.map((path) => (
            <button
              key={path}
              className={`smtcmp-library-folder-option ${path === selectedFolder ? 'smtcmp-library-folder-option-active' : ''}`}
              onClick={() => handleSelect(path)}
            >
              {path === '/' ? 'Vault Root' : path}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
