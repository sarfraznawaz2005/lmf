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

  private async tryPython(pythonCmd: string): Promise<{ works: boolean; cairosvgWorks: boolean }> {
    try {
      const versionResult = await $`${pythonCmd} --version`.quiet().nothrow();
      if (versionResult.exitCode !== 0) {
        return { works: false, cairosvgWorks: false };
      }

      // Check if cairosvg can be imported
      const importResult = await $`${pythonCmd} -c "import cairosvg; print('cairosvg_ok')"`.quiet().nothrow();
      const cairosvgWorks = importResult.exitCode === 0 && importResult.stdout?.toString().includes('cairosvg_ok');

      return { works: true, cairosvgWorks };
    } catch {
      return { works: false, cairosvgWorks: false };
    }
  }

  private async checkPython() {
    // List of Python commands to try (in order of preference)
    const pythonCommands = [
      'python3.13',
      'python3.12',
      'python3.11',
      'python3',
      'py -3.13',
      'py -3.12',
      'py -3.11',
      'py',
      'python',
    ];

    console.log('[Renderer] Searching for working Python with cairosvg...');

    for (const cmd of pythonCommands) {
      const result = await this.tryPython(cmd);
      if (result.works) {
        this.pythonPath = cmd;
        this.pythonAvailable = true;
        this.cairosvgAvailable = result.cairosvgWorks;
        console.log(`[Renderer] Found working Python: ${cmd} (cairosvg: ${result.cairosvgWorks})`);
        return;
      }
    }

    // Fallback: try to use whatever 'python' is
    console.log('[Renderer] No working Python found with cairosvg, falling back to system python');
    this.pythonPath = 'python';
    this.pythonAvailable = false;
    this.cairosvgAvailable = false;
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

  async installCairoSVG(): Promise<{ success: boolean; message: string }> {
    if (!this.pythonAvailable) {
      return {
        success: false,
        message: 'Python is not available. Please install Python first.',
      };
    }

    try {
      console.log('[Renderer] Installing cairosvg...');
      const result = await $`${this.pythonPath} -m pip install cairosvg`.quiet().nothrow();

      if (result.exitCode === 0) {
        // Verify installation by actually importing (catches DLL errors)
        const verifyResult = await $`${this.pythonPath} -c "import cairosvg; print('cairosvg_ok')"`.quiet().nothrow();
        if (verifyResult.exitCode === 0 && verifyResult.stdout?.toString().includes('cairosvg_ok')) {
          this.cairosvgAvailable = true;
          console.log('[Renderer] cairosvg installed and verified successfully');
          return {
            success: true,
            message: 'cairosvg installed successfully',
          };
        } else {
          const errorMsg = verifyResult.stderr?.toString() || 'Import verification failed';
          console.error('[Renderer] cairosvg installed but import failed:', errorMsg);
          this.cairosvgAvailable = false;
          // Check for DLL errors
          if (errorMsg.includes('DLL load failed') || errorMsg.includes('pyexpat') || errorMsg.includes('ImportError')) {
            return {
              success: false,
              message: `cairosvg installed but cannot be loaded due to Python configuration issues (mixed Python/miniconda installations). PNG export unavailable. Use SVG or HTML export instead.`,
            };
          }
          return {
            success: false,
            message: `cairosvg installed but cannot be imported: ${errorMsg}`,
          };
        }
      } else {
        const errorMsg = result.stderr?.toString() || 'Unknown error during installation';
        console.error('[Renderer] Failed to install cairosvg:', errorMsg);
        return {
          success: false,
          message: `Failed to install cairosvg: ${errorMsg}`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Renderer] Error installing cairosvg:', errorMsg);
      return {
        success: false,
        message: `Error installing cairosvg: ${errorMsg}`,
      };
    }
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
        const stderr = result.stderr?.toString() || '';

        // Check for Windows DLL/pyexpat errors
        if (stderr.includes('DLL load failed') || stderr.includes('pyexpat') || stderr.includes('cannot run')) {
          return {
            success: false,
            error: `Python DLL/Import Error: ${stderr.split('\n').pop() || 'DLL load failed'}\n\nYour Python installation has a configuration issue (common with mixed Python/miniconda setups).\n\nQuick fix: Use SVG or HTML export instead - they work without cairosvg.\n\nTo fix PNG export:\n1. Reinstall Python from python.org (64-bit, use "Install for all users")\n2. Or use a clean virtual environment\n3. Install Visual C++ Redistributables if missing`,
          };
        }

        return {
          success: false,
          error: stderr || 'Rendering failed',
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
