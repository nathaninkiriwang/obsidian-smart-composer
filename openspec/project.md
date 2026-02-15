# Project Context

## Purpose

Smart Composer is an Obsidian plugin that integrates AI-powered writing assistance directly into the editor. Key capabilities:

- **Contextual AI chat**: Users reference vault content with `@filename` syntax to ground conversations in their notes
- **AI-suggested edits**: One-click apply of AI-generated document changes with diff preview
- **RAG (Retrieval Augmented Generation)**: Semantic search across the vault using vector embeddings for context retrieval
- **MCP (Model Context Protocol)**: Connect external tools and data sources to the AI workflow
- **Multi-provider LLM support**: OpenAI, Anthropic Claude, Google Gemini, Groq, DeepSeek, Perplexity, Mistral, xAI, OpenRouter, Ollama, LM Studio, Azure OpenAI, and generic OpenAI-compatible providers
- **OAuth subscription connections**: No-API-key usage for Claude, OpenAI, and Gemini via OAuth flows

Current version: 1.2.9. Licensed under MIT. Single developer maintained, not under active development.

## Tech Stack

- **Language**: TypeScript 5.6
- **UI Framework**: React 18.3 with JSX (automatic runtime)
- **Plugin Host**: Obsidian API (extends `Plugin` class)
- **Build Tool**: esbuild (bundles to single CommonJS `main.js`)
- **State Management**: React Context (9 context providers) + TanStack React Query 5
- **Rich Text Editor**: Lexical (for chat input composition)
- **Database**: PGLite 0.2.12 (embedded PostgreSQL in browser) + Drizzle ORM 0.39
- **Schema Validation**: Zod
- **LLM SDKs**: @anthropic-ai/sdk, openai, @google/genai, groq-sdk, langchain
- **MCP**: @modelcontextprotocol/sdk
- **UI Components**: Radix UI (dialog, dropdown, popover, tooltip), Lucide React icons
- **Markdown Rendering**: react-markdown + remark-gfm + react-syntax-highlighter
- **Diff Visualization**: vscode-diff
- **Tokenization**: js-tiktoken
- **Testing**: Jest 29 + ts-jest
- **Linting**: ESLint 8 (TypeScript + React plugins) + Prettier 3
- **CI/CD**: GitHub Actions (CI on PRs, release on tags)

## Project Conventions

### Code Style

- **Prettier**: 2-space indent, no tabs, semicolons, single quotes, trailing commas on all
- **ESLint**: TypeScript strict + React hooks rules, alphabetical import sorting with newlines between groups, unused vars error with `_` prefix exception
- **TypeScript**: `strictNullChecks` enabled, `noImplicitAny` enabled, target ES6, module ESNext
- **Naming**: React components in PascalCase (`ChatView.tsx`), utilities in camelCase (`fuzzy-search.ts`), types in dedicated `.types.ts` files
- **Lint commands**: `npm run lint:check` and `npm run lint:fix`

### Architecture Patterns

- **Obsidian Plugin Pattern**: Main entry (`src/main.ts`) extends `Plugin`, registers views (ChatView, ApplyView), commands, and settings tab
- **Lazy Initialization**: DatabaseManager and RAGEngine use deferred initialization with promise caching
- **React Context Composition**: Nested context providers (Plugin → Settings → RAG → Database → MCP → App) for cross-component state
- **Factory Pattern**: `getProviderClient()` creates appropriate LLM provider instances based on provider type
- **Base Class Hierarchy**: Abstract `BaseLLMProvider` with concrete implementations per provider
- **Message Adapter Pattern**: Provider-specific message formatters convert a unified request format to each API's format
- **Dual Storage**: PGLite vector DB for embeddings + JSON file-based storage for chat history and templates
- **Settings Migration**: Sequential numbered migrations (currently version 16) with automatic migration on plugin load and Zod schema validation
- **Repository Pattern**: Database modules split into Manager (business logic) and Repository (data access) classes

### Directory Structure

```
src/
├── main.ts                  # Plugin entry point
├── ChatView.ts / ApplyView.ts  # Obsidian view registrations
├── constants.ts             # Provider configs, OAuth endpoints, default models
├── components/              # 84 React/TSX files
│   ├── chat-view/           # Chat interface components
│   ├── apply-view/          # Edit suggestion components
│   ├── settings/sections/   # Settings UI per feature area
│   ├── modals/              # Dialog modals (OAuth, etc.)
│   └── common/              # Shared UI components
├── contexts/                # 9 React context providers
├── hooks/                   # Custom React hooks
├── core/
│   ├── llm/                 # 32+ LLM provider implementations
│   ├── rag/                 # RAG engine and embedding logic
│   └── mcp/                 # MCP client manager
├── database/
│   ├── DatabaseManager.ts   # PGLite lifecycle
│   ├── schema.ts            # Drizzle ORM schema
│   ├── modules/vector/      # Vector/embedding storage
│   ├── modules/template/    # Prompt template storage
│   └── json/                # JSON-based storage fallback
├── settings/schema/         # Zod settings schema + 16 migrations
├── types/                   # TypeScript type definitions
└── utils/                   # Utility functions
```

### Testing Strategy

- **Framework**: Jest with ts-jest for TypeScript
- **Focus**: Settings migration tests (13+ migration test files validating each version upgrade), schema validation tests, utility tests
- **Commands**: `npm test`
- **CI Gate**: Tests run on every PR via GitHub Actions (`npm run type:check`, `npm run lint:check`, `npm test`)

### Git Workflow

- **Branch Strategy**: Feature branches → PRs to `main`
- **Commit Style**: Conventional commits (`feat:`, `fix:`, `chore:`, `version bump:`) with PR numbers
- **CI**: GitHub Actions runs type-check, lint, and tests on PRs to main
- **Releases**: Git tags trigger release workflow — builds `main.js`, creates GitHub release with `main.js`, `manifest.json`, `styles.css`, and auto-creates a version bump PR
- **Versioning**: Semantic versioning via `npm run version` (updates `manifest.json`, `versions.json`, `package.json`)

## Domain Context

- **Obsidian Plugin Ecosystem**: Plugins run in a browser-like environment within Obsidian's Electron app. No direct `node:fs` access — must use Obsidian's Vault API. Plugins bundle to a single `main.js` (CommonJS) with `manifest.json` metadata.
- **PGLite Constraints**: Embedded PostgreSQL runs via WebAssembly. Requires custom shims to avoid Node.js detection. Database persists as `.smtcmp_vector_db.tar.gz` in the vault root.
- **LLM Provider Landscape**: Each provider has different API formats, auth mechanisms, and capabilities (streaming, tool calling, thinking/reasoning modes). The plugin abstracts these behind a unified interface.
- **RAG Pipeline**: Vault files are chunked (default 1000 tokens), embedded via configurable embedding models (supporting dimensions 128–1792), stored in PGLite with HNSW vector indices, and retrieved via cosine similarity search.
- **MCP**: Model Context Protocol enables the plugin to connect to external tool servers, discover available tools, and execute them within the chat workflow.

## Important Constraints

- **CommonJS Output**: Obsidian requires plugins as CommonJS bundles — no ESM output. Custom esbuild shims bridge ESM dependencies.
- **No Direct FS Access**: Must use Obsidian's Vault API for file operations, not `node:fs`.
- **Single Bundle**: Everything compiles to one `main.js` file via esbuild.
- **Browser-like Environment**: Runs in Electron renderer process with DOM APIs available but limited Node.js APIs.
- **PGLite WebAssembly**: Database WASM files must be fetched manually; `node:fs` workarounds are required.
- **OAuth Risk**: Anthropic is restricting third-party OAuth (Jan 2026). Reports of account restrictions from OAuth usage exist — use at own risk.

## External Dependencies

- **Obsidian API**: Plugin host providing Vault, Workspace, and UI APIs
- **LLM Provider APIs**: OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Perplexity, Mistral, xAI, OpenRouter (all via their respective SDKs)
- **OAuth Endpoints**: Custom OAuth flows for Claude Code, ChatGPT, and Google Gemini subscription connections
- **PGLite WASM**: WebAssembly files for embedded PostgreSQL
- **MCP Servers**: User-configured external tool servers via Model Context Protocol
- **Ollama / LM Studio**: Local model inference servers (optional)
