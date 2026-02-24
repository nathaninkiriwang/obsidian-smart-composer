import { PropsWithChildren, useMemo } from 'react'

import { useApp } from '../../contexts/app-context'
import { useDarkModeContext } from '../../contexts/dark-mode-context'
import { openMarkdownFile } from '../../utils/obsidian'

import { ObsidianMarkdown } from './ObsidianMarkdown'
import { MemoizedSyntaxHighlighterWrapper } from './SyntaxHighlighterWrapper'

export default function MarkdownCodeComponent({
  language,
  filename,
  children,
  isRawMode = false,
}: PropsWithChildren<{
  language?: string
  filename?: string
  isRawMode?: boolean
}>) {
  const app = useApp()
  const { isDarkMode } = useDarkModeContext()

  const wrapLines = useMemo(() => {
    return !language || ['markdown'].includes(language)
  }, [language])

  const handleOpenFile = () => {
    if (filename) {
      openMarkdownFile(app, filename)
    }
  }

  return (
    <div className="smtcmp-code-block">
      {filename && (
        <div className="smtcmp-code-block-header">
          <div
            className="smtcmp-code-block-header-filename"
            onClick={handleOpenFile}
          >
            {filename}
          </div>
        </div>
      )}
      {isRawMode ? (
        <MemoizedSyntaxHighlighterWrapper
          isDarkMode={isDarkMode}
          language={language}
          hasFilename={!!filename}
          wrapLines={wrapLines}
        >
          {String(children)}
        </MemoizedSyntaxHighlighterWrapper>
      ) : (
        <div className="smtcmp-code-block-obsidian-markdown">
          <ObsidianMarkdown content={String(children)} scale="sm" />
        </div>
      )}
    </div>
  )
}
