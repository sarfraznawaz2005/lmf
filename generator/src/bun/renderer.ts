// Python renderer integration for LMF to SVG/PNG/HTML conversion

import { $ } from 'bun';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RenderOptions {
  format: 'svg' | 'png' | 'html';
  scale?: number;
  outputPath?: string;
}

export interface RenderResult {
  success: boolean;
  content?: string;
  path?: string;
  error?: string;
}

export class Renderer {
  private pythonPath: string = 'python';
  private rendererPath: string;
  private pythonAvailable: boolean = false;
  private cairosvgAvailable: boolean = false;

  constructor() {
    // Look for lmf.py in multiple possible locations
    // In built app: lmf.py is at Resources/app/lmf.py, JS is at Resources/app/bun/index.js
    // So from __dirname (bun folder), we need to go up one level
    const possiblePaths = [
      join(__dirname, '..', 'lmf.py'),                   // Built app: up from bun/ to app/
      join(__dirname, 'lmf.py'),                          // Same dir (fallback)
      join(process.cwd(), 'lmf.py'),                      // Dev: from cwd root
      join(process.cwd(), 'src', 'bun', 'lmf.py'),        // Dev: src/bun/
    ];

    this.rendererPath = '';
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        this.rendererPath = path;
        console.log('[Renderer] Found lmf.py at:', path);
        break;
      }
    }

    if (!this.rendererPath) {
      console.error('[Renderer] lmf.py not found. Checked paths:', possiblePaths);
      console.error('[Renderer] __dirname:', __dirname);
      console.error('[Renderer] cwd:', process.cwd());
    }

    this.checkPython();
  }

  private async checkPython() {
    try {
      const result = await $`${this.pythonPath} --version`.quiet().nothrow();
      this.pythonAvailable = result.exitCode === 0;

      if (this.pythonAvailable) {
        // Check for cairosvg
        try {
          await $`${this.pythonPath} -c "import cairosvg"`.quiet().nothrow();
          this.cairosvgAvailable = true;
        } catch {
          this.cairosvgAvailable = false;
        }
      }
    } catch {
      this.pythonAvailable = false;
      this.cairosvgAvailable = false;
    }
  }

  async checkStatus(): Promise<{ available: boolean; version?: string; cairosvgAvailable: boolean }> {
    await this.checkPython();

    let version: string | undefined;
    if (this.pythonAvailable) {
      try {
        const result = await $`${this.pythonPath} --version`.quiet().text();
        version = result.trim();
      } catch {
        // Ignore version check errors
      }
    }

    return {
      available: this.pythonAvailable,
      version,
      cairosvgAvailable: this.cairosvgAvailable,
    };
  }

  async render(lmf: string, options: RenderOptions): Promise<RenderResult> {
    if (!this.rendererPath) {
      return {
        success: false,
        error: 'Renderer script not found',
      };
    }

    if (!this.pythonAvailable) {
      return {
        success: false,
        error: 'Python is not available',
      };
    }

    if (options.format === 'png' && !this.cairosvgAvailable) {
      return {
        success: false,
        error: 'cairosvg is required for PNG export. Install with: pip install cairosvg',
      };
    }

    try {
      const scale = options.scale || 1;

      // Use OS temp directory for better compatibility with bundled apps
      const tempDir = join(tmpdir(), 'lmf-generator');
      const tempLmfPath = join(tempDir, 'input.lmf');
      const tempOutputPath = options.outputPath || join(tempDir, `output.${options.format}`);

      // Ensure temp directory exists
      await $`mkdir -p ${tempDir}`.quiet();

      // Write LMF to temp file
      await Bun.write(tempLmfPath, lmf);

      // Run Python renderer
      const args = [
        this.rendererPath,
        'render',
        tempLmfPath,
        '-o',
        tempOutputPath,
      ];

      if (options.format === 'png') {
        args.push('--scale', scale.toString());
      }

      console.log('[Renderer] Running command:', this.pythonPath, args.join(' '));

      const result = await $`${this.pythonPath} ${args}`.quiet().nothrow();

      console.log('[Renderer] Exit code:', result.exitCode);
      console.log('[Renderer] Stderr:', result.stderr?.toString() || 'empty');

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr?.toString() || 'Rendering failed',
        };
      }

      // Check if output file exists
      const fileExists = existsSync(tempOutputPath);
      console.log('[Renderer] Output file exists:', fileExists, 'at path:', tempOutputPath);

      // Read output
      let content: string | undefined;
      if (options.format === 'svg' || options.format === 'html') {
        content = await Bun.file(tempOutputPath).text();
      }

      return {
        success: true,
        content,
        path: tempOutputPath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Rendering failed',
      };
    }
  }

  async renderToSvg(lmf: string): Promise<string> {
    const result = await this.render(lmf, { format: 'svg' });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.content || '';
  }

  async renderToHtml(lmf: string): Promise<string> {
    const result = await this.render(lmf, { format: 'html' });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.content || '';
  }

  async renderToPng(lmf: string, scale: number = 2): Promise<string> {
    const result = await this.render(lmf, { format: 'png', scale });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.path || '';
  }
}
