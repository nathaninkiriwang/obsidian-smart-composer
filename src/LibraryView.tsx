import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import { LibraryPane } from './components/library-view/LibraryPane'
import { LIBRARY_VIEW_TYPE } from './constants'
import { AppProvider } from './contexts/app-context'
import { DarkModeProvider } from './contexts/dark-mode-context'
import { PluginProvider } from './contexts/plugin-context'
import { SettingsProvider } from './contexts/settings-context'
import SmartComposerPlugin from './main'

export class LibraryView extends ItemView {
  private root: Root | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SmartComposerPlugin,
  ) {
    super(leaf)
  }

  getViewType() {
    return LIBRARY_VIEW_TYPE
  }

  getIcon() {
    return 'library'
  }

  getDisplayText() {
    return 'Library'
  }

  async onOpen() {
    this.root = createRoot(this.containerEl.children[1])
    this.root.render(
      <PluginProvider plugin={this.plugin}>
        <AppProvider app={this.app}>
          <SettingsProvider
            settings={this.plugin.settings}
            setSettings={(newSettings) =>
              this.plugin.setSettings(newSettings)
            }
            addSettingsChangeListener={(listener) =>
              this.plugin.addSettingsChangeListener(listener)
            }
          >
            <DarkModeProvider>
              <React.StrictMode>
                <LibraryPane />
              </React.StrictMode>
            </DarkModeProvider>
          </SettingsProvider>
        </AppProvider>
      </PluginProvider>,
    )
  }

  async onClose() {
    this.root?.unmount()
  }
}
