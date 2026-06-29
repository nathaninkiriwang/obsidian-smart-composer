import { z } from 'zod'

import {
  DEFAULT_APPLY_MODEL_ID,
  DEFAULT_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROVIDERS,
  ZOTERO_DEFAULT_API_BASE_URL,
} from '../../constants'
import { chatModelSchema } from '../../types/chat-model.types'
import { embeddingModelSchema } from '../../types/embedding-model.types'
import { mcpServerConfigSchema } from '../../types/mcp.types'
import { llmProviderSchema } from '../../types/provider.types'

import { SETTINGS_SCHEMA_VERSION } from './migrations'

const ragOptionsSchema = z.object({
  chunkSize: z.number().catch(1000),
  thresholdTokens: z.number().catch(8192),
  minSimilarity: z.number().catch(0.0),
  limit: z.number().catch(10),
  excludePatterns: z.array(z.string()).catch([]),
  includePatterns: z.array(z.string()).catch([]),
})

/**
 * Settings
 */

export const smartComposerSettingsSchema = z.object({
  // Version
  version: z.literal(SETTINGS_SCHEMA_VERSION).catch(SETTINGS_SCHEMA_VERSION),

  providers: z.array(llmProviderSchema).catch([...DEFAULT_PROVIDERS]),

  chatModels: z.array(chatModelSchema).catch([...DEFAULT_CHAT_MODELS]),

  embeddingModels: z
    .array(embeddingModelSchema)
    .catch([...DEFAULT_EMBEDDING_MODELS]),

  chatModelId: z
    .string()
    .catch(
      DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_CHAT_MODEL_ID)?.id ??
        DEFAULT_CHAT_MODELS[0].id,
    ), // model for default chat feature
  applyModelId: z
    .string()
    .catch(
      DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_APPLY_MODEL_ID)?.id ??
        DEFAULT_CHAT_MODELS[0].id,
    ), // model for apply feature
  embeddingModelId: z.string().catch(DEFAULT_EMBEDDING_MODELS[0].id), // model for embedding

  // System Prompt
  systemPrompt: z.string().catch(''),

  // RAG Options
  ragOptions: ragOptionsSchema.catch({
    chunkSize: 1000,
    thresholdTokens: 8192,
    minSimilarity: 0.0,
    limit: 10,
    excludePatterns: [],
    includePatterns: [],
  }),

  // MCP configuration
  mcp: z
    .object({
      servers: z.array(mcpServerConfigSchema).catch([]),
    })
    .catch({
      servers: [],
    }),

  // Chat options
  chatOptions: z
    .object({
      includeCurrentFileContent: z.boolean(),
      enableTools: z.boolean(),
      maxAutoIterations: z.number(),
    })
    .catch({
      includeCurrentFileContent: true,
      enableTools: true,
      maxAutoIterations: 1,
    }),

  // Zotero options
  zotero: z
    .object({
      apiBaseUrl: z.string(),
      zoteroStoragePath: z.string(),
      libraryVaultPath: z.string(),
      selectedCollection: z.string(),
      pdfExtractionModelId: z.string(),
      // 'author-year' (default): copies PDFs into per-collection subfolders under
      // libraryVaultPath, named "Author et al. Year.pdf", and prunes orphans.
      // 'citekey': flat sync into libraryVaultPath using the Better BibTeX citekey
      // as the filename; never deletes anything (folder may be hand-curated).
      pdfNamingScheme: z.enum(['author-year', 'citekey']).catch('author-year'),
      // When set (citekey mode only), AI requests for a paper read the
      // pre-extracted markdown at `${markdownVaultPath}/<citekey>/<citekey>.md`
      // instead of using PDF tool-calling extraction. Empty disables this.
      markdownVaultPath: z.string().catch(''),
      // Folder where Highlight mode writes per-paper annotation files
      // (`<annotationsVaultPath>/<citekey>.md`). PDF++ renders the highlights
      // from these backlinks; the PDF itself is never modified.
      annotationsVaultPath: z.string().catch('annotations'),
      // Which interaction mode a PDF view opens in.
      defaultPdfMode: z
        .enum(['read', 'highlight', 'screenshot', 'text'])
        .catch('read'),
    })
    .catch({
      apiBaseUrl: ZOTERO_DEFAULT_API_BASE_URL,
      zoteroStoragePath: '',
      libraryVaultPath: 'Library',
      selectedCollection: '',
      pdfExtractionModelId: '',
      pdfNamingScheme: 'author-year',
      markdownVaultPath: '',
      annotationsVaultPath: 'annotations',
      defaultPdfMode: 'read',
    }),
})
export type SmartComposerSettings = z.infer<typeof smartComposerSettingsSchema>

export type SettingMigration = {
  fromVersion: number
  toVersion: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}
