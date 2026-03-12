# LMF Generator - Implementation Plan

## Overview

LMF Generator is an Electrobun desktop application that allows users to generate LMF images from natural language prompts. Users type queries in plain English, and the app generates LMF files in real-time using AI providers via Vercel AI SDK.

**Preview Design:** By default, preview shows rendered **SVG format**. A toggle button allows viewing the raw LMF code that was generated.

## Tech Stack

- **Runtime**: Electrobun (Bun-based desktop framework)
- **Language**: TypeScript
- **AI Integration**: Vercel AI SDK
- **Rendering**: Python lmf.py script (same as viewer app)
- **Platform**: Windows (primary)

## Project Structure

```
generator/
├── package.json
├── electrobun.config.ts
├── config/
│   └── config.json           # AI provider settings, API keys, preferences
├── system-prompt.md          # Customizable system prompt for LLM
├── src/
│   ├── bun/
│   │   ├── index.ts          # Main Bun process (window, RPC handlers)
│   │   ├── ai-provider.ts    # AI provider management (Vercel AI SDK)
│   │   ├── renderer.ts       # Python renderer integration
│   │   ├── file-manager.ts   # File save/export operations
│   │   ├── config-manager.ts # Config file management (JSON + system prompt)
│   │   └── window-state.ts   # Window state persistence
│   ├── shared/
│   │   └── types.ts          # Shared TypeScript types
│   └── mainview/
│       ├── index.html        # Main view HTML structure
│       ├── index.css         # Styles (grayish theme)
│       └── index.ts          # UI logic, event handlers
└── assets/
    └── icon.ico              # App icon
```

## Screens

### 1. Main Screen

**Layout:**
- Header toolbar with app logo, title, Settings, Export, and Toggle View buttons
- Large preview area with toggle between:
  - **SVG Preview** (default): Rendered SVG output from LMF
  - **LMF Code View**: Raw LMF markup with syntax highlighting
- Chat input section at bottom with:
  - Model selector dropdown (left side)
  - Text input field with integrated send button (> icon)

**Features:**
- Toggle button to switch between SVG preview (default) and LMF code
- Live SVG rendering as LMF is generated
- Code view for transparency and debugging
- Token count display
- Provider connection status
- Export to SVG/PNG/HTML

### 2. Settings Screen

**Sections:**

1. **AI Provider**
   - Provider selection cards (Anthropic, OpenAI, Custom)
   - API Key input with show/hide toggle
   - Base URL input (Custom provider only)
   - Model dropdown (auto-fetched from provider)

2. **System Prompt**
   - Multi-line textarea for custom system prompt
   - Content saved to `system-prompt.md` file
   - Reset to Default button
   - Apply button

3. **Export Settings**
   - Default export format (SVG/PNG/HTML)
   - PNG scale selector (1x, 2x, 3x)
   - Python detection status

## Features

### Core Features

1. **AI-Powered LMF Generation**
   - Send natural language prompts to AI
   - Receive LMF format response
   - Auto-render to SVG for preview (default view)
   - Toggle to view raw LMF code

2. **Provider Support**
   - Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
   - OpenAI (GPT-4, GPT-3.5 Turbo)
   - Custom OpenAI-compatible providers

3. **Export Options**
   - SVG (no dependencies)
   - HTML (no dependencies)
   - PNG (requires cairosvg)

4. **Settings Management**
   - Provider configuration saved to `config/config.json`
   - API key storage in JSON config
   - System prompt saved to `system-prompt.md`
   - Export preferences in JSON config

### Future Features

- Chat history with previous generations
- LMF file browser/open existing files
- Syntax highlighting for LMF code view
- One-click copy to clipboard
- Regenerate/modify existing LMF
- Template library

## Implementation Phases

### Phase 1: Project Setup
- Initialize Electrobun project
- Configure build settings
- Create folder structure
- Set up TypeScript config
- Create config directory and system-prompt.md

### Phase 2: UI Implementation
- Create main view HTML structure
- Implement grayish theme CSS
- Build header toolbar component
- Build preview area with SVG view (default) and LMF code toggle
- Build chat input component
- Build settings screen components

### Phase 3: Core Functionality
- Set up RPC communication between Bun and webview
- Implement AI provider service (Vercel AI SDK)
- Create model fetching logic
- Implement LMF generation endpoint

### Phase 4: Rendering & Export
- Integrate Python renderer (same as viewer)
- Implement SVG preview (default) with code toggle
- Add export functionality (SVG, PNG, HTML)
- Handle Python detection

### Phase 5: Settings & Persistence
- Implement config manager for JSON config
- System prompt saved to system-prompt.md
- API key storage in config
- Window state persistence
- Load/save preferences

### Phase 6: Polish & Testing
- Error handling
- Loading states
- Keyboard shortcuts
- App icon
- Testing on Windows

## Color Palette (Grayish Theme)

| Element | Color |
|---------|-------|
| Canvas bg | `#1a1a1a` |
| Surface | `#2a2a2a` |
| Input bg | `#1a1a1a` |
| Border | `#404040` |
| Primary text | `#e8e8e8` |
| Secondary text | `#888888` |
| Muted text | `#6a6a6a` |
| Primary button | `#4a7c4a` (greenish) |
| Secondary button | `#3a3a3a` (gray) |
| Success badge | `#2d3a2d` bg, `#7ca87c` text |
| Provider avatars | Orange `#c97c4a`, Green `#5a7a5a`, Blue `#5a6a9a` |

## AI Provider Integration

### Vercel AI SDK Setup

```typescript
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

// Anthropic
const anthropic = createAnthropic({ apiKey: '...' })
const { text } = await generateText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  system: systemPrompt,
  prompt: userPrompt
})

// OpenAI
const openai = createOpenAI({ apiKey: '...' })
const { text } = await generateText({
  model: openai('gpt-4-turbo'),
  system: systemPrompt,
  prompt: userPrompt
})

// Custom (OpenAI compatible)
const custom = createOpenAI({
  apiKey: '...',
  baseURL: 'https://custom-provider.com/v1'
})
```

### System Prompt (Default - stored in system-prompt.md)

```markdown
You are an expert LMF (LLM Markup Format) designer.
Generate clean, semantic LMF layouts based on user requests.
Use the dark theme palette by default:
- Canvas: #0f172a or #1a1a1a
- Surfaces: #1e293b or #2a2a2a
- Primary text: #f1f5f9 or #e8e8e8
- Muted text: #64748b or #888888
- Accent: #6366f1

Always output valid LMF format starting with #LMF1.
Use semantic node types (R, C, T, B, Ch, etc.).
Keep layouts clean and well-structured.
```

## RPC Endpoints

### Bun → Webview Messages
- `generationStarted` - When AI starts generating
- `generationComplete` - When LMF is received
- `generationError` - When generation fails
- `modelListUpdated` - When models are fetched
- `svgRendered` - When SVG is rendered from LMF

### Webview → Bun Requests
- `generateLmf` - Generate LMF from prompt
- `renderSvg` - Render LMF to SVG
- `getSettings` - Load current settings
- `saveSettings` - Save settings
- `fetchModels` - Fetch available models
- `exportFile` - Export current LMF
- `checkPython` - Check Python availability
- `getSystemPrompt` - Load system prompt from file
- `saveSystemPrompt` - Save system prompt to file

## Config File Structure

### config/config.json

```json
{
  "provider": "anthropic",
  "apiKeys": {
    "anthropic": "sk-...",
    "openai": "sk-...",
    "custom": "..."
  },
  "customProvider": {
    "baseURL": "https://api.custom.com/v1",
    "models": ["model-1", "model-2"]
  },
  "selectedModel": "claude-3-5-sonnet-20241022",
  "export": {
    "defaultFormat": "svg",
    "pngScale": 2
  },
  "window": {
    "width": 1280,
    "height": 800,
    "x": 100,
    "y": 100
  }
}
```

### system-prompt.md

Plain markdown file containing the system prompt text sent to the LLM.

## Dependencies

### Runtime
- `electrobun` - Desktop framework
- `@ai-sdk/anthropic` - Anthropic provider
- `@ai-sdk/openai` - OpenAI provider
- `ai` - Vercel AI SDK core

### Dev
- `@types/bun` - Bun type definitions

### Python (optional, for export)
- `cairosvg` - For PNG export

## File Associations

- `.lmf` files can be opened by the app
- Double-click to open in LMF Generator

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send prompt |
| `Ctrl+T` | Toggle preview (SVG/LMF code) |
| `Ctrl+Shift+S` | Open settings |
| `Ctrl+E` | Export current |
| `Ctrl+Shift+L` | Clear chat |
| `Escape` | Cancel generation |

## Error Handling

- API key missing → Show settings prompt
- Rate limit → Show retry after message
- Invalid LMF → Show error, allow retry
- Python missing → Disable PNG export, show warning
