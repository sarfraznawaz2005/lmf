import { BrowserWindow, BrowserView, Utils } from "electrobun/bun";
import { dlopen, ptr, FFIType } from "bun:ffi";
import type { ViewerRPC } from "../shared/types";
import { addRecentFile, removeRecentFile } from "./window-state";
import { openFile, getFileProperties, deleteFile, fileExists, saveFile } from "./file-manager";
import { renderLmf, exportLmf, checkPython } from "./renderer";
import { watchFile, unwatchFile, onFileChange } from "./watcher";
import { ensureFileAssociation } from "./file-association";
import { acquireSingleInstance, onSingleInstanceFile } from "./single-instance";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

function readStartupFile(): string | null {
	// Check temp file written by lmf-opener.vbs
	const tempFile = join(tmpdir(), "lmf-open-request.txt");
	if (existsSync(tempFile)) {
		try {
			const p = readFileSync(tempFile, "utf-8").trim();
			// Don't delete the temp file yet - wait until it's actually processed
			// This prevents race condition where file is deleted before Bun app reads it
			if (p.endsWith(".lmf") && existsSync(p)) return p;
		} catch {}
	}
	// Fallback: env var
	const envFile = process.env.LMF_OPEN_FILE;
	if (envFile?.endsWith(".lmf")) return envFile;
	return null;
}

const startupFile = readStartupFile();

// Single-instance guard: if another instance is already running, forward the
// file path to it via the named pipe and exit immediately.
if (!await acquireSingleInstance(startupFile)) process.exit(0);

// Clean up temp file after single-instance check passes
if (startupFile) {
	try {
		unlinkSync(join(tmpdir(), "lmf-open-request.txt"));
	} catch {}
}

// Track open files
const openFiles = new Set<string>();

// Current active file
let activeFile: string | null = null;

// Define RPC handlers using BrowserView.defineRPC
export const rpc = BrowserView.defineRPC<ViewerRPC>({
	handlers: {
		requests: {
			openFileDialog: async () => {
				// Defer the dialog to the next tick so RPC response is sent first
				// (native dialog blocks the event loop)
				setTimeout(() => {
					Utils.openFileDialog({
						canChooseFiles: true,
						canChooseDirectory: false,
						allowsMultipleSelection: false,
						filters: [{ name: "LMF Files", extensions: ["lmf"] }],
					}).then((paths) => {
						const path = Array.isArray(paths) && paths.length > 0 ? paths[0] : null;
						mainWindow.webview.rpc.send.fileDialogResult({ path });
					});
				}, 0);
				return { queued: true };
			},

			checkPython: async () => {
				const result = await checkPython();
				return result;
			},

			getRecentFiles: async () => {
				const files = await import("./window-state").then((m) => m.loadRecentFiles());
				return files;
			},

			openFile: async ({ path }) => {
				console.log("Opening file:", path);
				const result = openFile(path);

				if (result.success && result.data) {
					openFiles.add(path);
					watchFile(path);
					activeFile = path;
					addRecentFile(path);
				}

				return result;
			},

			deleteFile: async ({ path }) => {
				console.log("Deleting file:", path);
				const result = deleteFile(path);

				if (result.success) {
					openFiles.delete(path);
					unwatchFile(path);
					removeRecentFile(path);

					if (activeFile === path) {
						activeFile = null;
					}
				}

				return result;
			},

			getFileProperties: async ({ path }) => {
				return getFileProperties(path);
			},

			renderLmf: async ({ path }) => {
				console.log("Rendering LMF:", path);
				return renderLmf(path);
			},

			exportFile: async ({ path, format, scale }) => {
				console.log(`Exporting ${path} to ${format} (scale: ${scale || 1})`);
				return exportLmf(path, format, scale);
			},

			saveFile: async ({ path, content }) => {
				console.log(`Saving file: ${path}`);
				return saveFile(path, content);
			},
		},

		messages: {
			fileSelected: ({ path }) => {
				console.log("File selected:", path);
				activeFile = path;
				addRecentFile(path);
			},

			fileOpenRequested: () => {
				console.log("Open file requested");
			},

			exportRequested: ({ format, scale }) => {
				console.log(`Export requested: ${format} (scale: ${scale || 1})`);
				if (activeFile) {
					exportLmf(activeFile, format, scale).then((result) => {
						console.log("Export result:", result);
					});
				}
			},

			toggleCodeRequested: () => {
				console.log("Toggle code panel requested");
			},

			refreshRequested: () => {
				console.log("Refresh requested");
				if (activeFile) {
					renderLmf(activeFile).then((result) => {
						mainWindow.webview.rpc.send.fileChanged({ path: activeFile });
					});
				}
			},
		},
	},
});

// Create main window with RPC - always start with sensible defaults, maximize on dom-ready
const mainWindow = new BrowserWindow({
	title: "LMF Viewer",
	url: "views://mainview/index.html",
	frame: {
		width: 1280,
		height: 800,
		x: 100,
		y: 100,
	},
	minFrame: { width: 800, height: 600 },
	sandbox: false,
	rpc,
	show: false,
});

// Set titlebar icon via Win32 API (Electrobun doesn't expose a public API for this)
const iconPath = join(dirname(process.argv0), "..", "Resources", "app.ico");

function setWindowTitlebarIcon(title: string, iconFilePath: string) {
	try {
		const user32 = dlopen("user32.dll", {
			FindWindowW:  { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
			SendMessageW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr], returns: FFIType.ptr },
			LoadImageW:   { args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.ptr },
		});

		const toWide = (s: string) => { const b = Buffer.alloc((s.length + 1) * 2); b.write(s, 0, "utf16le"); return b; };
		const WM_SETICON = 0x0080;
		const LR_LOADFROMFILE = 0x0010;
		const LR_DEFAULTSIZE  = 0x0040;
		const IMAGE_ICON = 1;

		const pathBuf  = toWide(iconFilePath);
		const titleBuf = toWide(title);

		const hIcon = user32.symbols.LoadImageW(null, ptr(pathBuf), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
		const hwnd  = user32.symbols.FindWindowW(null, ptr(titleBuf));

		if (hwnd && hIcon) {
			user32.symbols.SendMessageW(hwnd, WM_SETICON, 1, hIcon); // ICON_BIG
			user32.symbols.SendMessageW(hwnd, WM_SETICON, 0, hIcon); // ICON_SMALL
			console.log("Window icon set successfully");
		} else {
			console.warn("setWindowTitlebarIcon: hwnd=", hwnd, "hIcon=", hIcon);
		}
	} catch (e) {
		console.warn("Could not set window titlebar icon:", e);
	}
}

// Maximize once the webview DOM is ready, then open any startup file
mainWindow.webview.on("dom-ready", () => {
	mainWindow.maximize();
	mainWindow.show();
	setWindowTitlebarIcon("LMF Viewer", iconPath);
	if (startupFile) {
		console.log("Opening startup file:", startupFile);
		// Verify the file still exists before sending to frontend
		if (existsSync(startupFile)) {
			setTimeout(() => {
				mainWindow.webview.rpc.send.fileOpenedViaAssociation({ path: startupFile });
			}, 500); // Increased delay to ensure window is fully ready
		} else {
			console.warn("Startup file no longer exists:", startupFile);
		}
	}
});

// Handle file changes (from watcher)
onFileChange((path) => {
	console.log("File changed notification:", path);
	// Notify the browser view
	mainWindow.webview.rpc.send.fileChanged({ path });
});

// Handle opening files via file association (double-click on .lmf file)
process.on("open-file", (event, path) => {
	event.preventDefault();
	if (path && path.endsWith(".lmf")) {
		if (existsSync(path)) {
			console.log("Opening file via association:", path);
			mainWindow.webview.rpc.send.fileOpenedViaAssociation({ path });
		} else {
			console.warn("File does not exist:", path);
		}
	}
});

// Receive file paths forwarded from a second instance via the named pipe
onSingleInstanceFile((path) => {
	console.log("Single-instance: received file from second instance:", path);
	if (path && existsSync(path)) {
		mainWindow.webview.rpc.send.fileOpenedViaAssociation({ path });
	} else if (path) {
		console.warn("Received file path but file does not exist:", path);
	}
});

// Check Python availability on startup
checkPython().then((result) => {
	if (result.available) {
		console.log(`Python ${result.version} detected`);
	} else {
		console.warn("Python not found - LMF rendering will not work");
	}
});

// Handle graceful shutdown
process.on("beforeExit", () => {
	console.log("Shutting down...");
	const { unwatchAll } = require("./watcher");
	unwatchAll();
});

console.log("LMF Viewer started!");

// Auto-register .lmf file association on first run (or if paths changed)
ensureFileAssociation();
