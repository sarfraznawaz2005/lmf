import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import type { LmfMetadata } from "../shared/types";

// Path to lmf.py renderer (relative to project root or absolute)
let LMF_PY_PATH = join(__dirname, "..", "..", "lmf.py");

// Allow override via environment or config
export function setLmfPyPath(path: string): void {
	LMF_PY_PATH = path;
}

// Check if Python is available
export async function checkPython(): Promise<{ available: boolean; version?: string }> {
	return new Promise((resolve) => {
		const proc = spawn("python", ["--version"]);
		let output = "";
		let errorOutput = "";

		proc.stdout.on("data", (data) => {
			output += data.toString();
		});

		proc.stderr.on("data", (data) => {
			errorOutput += data.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				// Python outputs version to stderr, not stdout
				const versionOutput = errorOutput.trim() || output.trim();
				const match = versionOutput.match(/Python\s+([\d.]+)/i);
				const version = match ? match[1] : versionOutput.split(" ")[1];
				resolve({ available: true, version });
			} else {
				resolve({ available: false });
			}
		});
	});
}

// Render LMF file to SVG
export async function renderLmf(path: string): Promise<{ svg: string; metadata: LmfMetadata; error?: string }> {
	// First check if lmf.py exists
	if (!existsSync(LMF_PY_PATH)) {
		// Try alternate path (parent directory)
		LMF_PY_PATH = join(__dirname, "..", "..", "..", "lmf.py");
		if (!existsSync(LMF_PY_PATH)) {
			return {
				svg: "",
				metadata: { width: 1920, height: 1080, backgroundColor: "#0f172a", nodeCount: 0 },
				error: "lmf.py renderer not found. Please ensure it exists in the project directory.",
			};
		}
	}

	return new Promise((resolve) => {
		// First, parse the file to get metadata
		const { openFile } = require("./file-manager");
		const result = openFile(path);

		if (!result.success || !result.data) {
			return resolve({
				svg: "",
				metadata: { width: 1920, height: 1080, backgroundColor: "#0f172a", nodeCount: 0 },
				error: result.error || "Failed to read LMF file",
			});
		}

		const metadata = result.data.metadata;

		// Render to SVG using lmf.py with -o - for stdout output
		const proc = spawn("python", [LMF_PY_PATH, "render", path, "-o", "-"]);
		let svg = "";
		let stderr = "";

		proc.stdout.on("data", (data) => {
			svg += data.toString();
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (code === 0 && svg.trim()) {
				resolve({ svg, metadata });
			} else {
				// If rendering fails, return error with placeholder SVG
				resolve({
					svg: createErrorSvg(`Failed to render: ${stderr || "Unknown error"}`),
					metadata,
					error: stderr || "Renderer returned empty output",
				});
			}
		});

		// Timeout after 10 seconds
		setTimeout(() => {
			proc.kill();
			resolve({
				svg: createErrorSvg("Render timeout (10s)"),
				metadata,
				error: "Render timeout",
			});
		}, 10000);
	});
}

// Export LMF file to different formats
export async function exportLmf(
	path: string,
	format: "png" | "svg" | "html",
	scale: number = 1,
	outputPath?: string
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
	if (!existsSync(LMF_PY_PATH)) {
		LMF_PY_PATH = join(__dirname, "..", "..", "..", "lmf.py");
		if (!existsSync(LMF_PY_PATH)) {
			return { success: false, error: "lmf.py renderer not found" };
		}
	}

	// Determine output path
	if (!outputPath) {
		const base = path.replace(/\.lmf$/i, "");
		outputPath = `${base}.${format}`;
	}

	const args = [LMF_PY_PATH, "render", path, "-o", outputPath];

	if (format === "png" && scale > 1) {
		args.push("--scale", scale.toString());
	}

	return new Promise((resolve) => {
		const proc = spawn("python", args);
		let stderr = "";

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve({ success: true, outputPath });
			} else {
				resolve({ success: false, error: stderr || `Export failed with code ${code}` });
			}
		});

		// Timeout after 30 seconds for PNG exports
		setTimeout(() => {
			proc.kill();
			resolve({ success: false, error: "Export timeout" });
		}, 30000);
	});
}

// Create an error SVG to display when rendering fails
function createErrorSvg(message: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
		<rect width="400" height="200" fill="#1e293b"/>
		<text x="200" y="90" text-anchor="middle" fill="#f87171" font-family="system-ui" font-size="16">⚠️ Render Error</text>
		<text x="200" y="120" text-anchor="middle" fill="#94a3b8" font-family="system-ui" font-size="12">${escapeXml(message)}</text>
	</svg>`;
}

function escapeXml(text: string): string {
	return text.replace(/[<>&'"]/g, (c) => {
		switch (c) {
			case "<": return "&lt;";
			case ">": return "&gt;";
			case "&": return "&amp;";
			case "'": return "&apos;";
			case '"': return "&quot;";
			default: return c;
		}
	});
}
