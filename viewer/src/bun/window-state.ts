import { BrowserWindow, PATHS } from "electrobun/bun";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { ViewerRPC, WindowState, FileProperties, LmfMetadata } from "../shared/types";

// Get app data path for storing window state and recent files
// Fallback to temp directory if PATHS.appData is not available
const appDataDir = PATHS.appData || join(process.env.APPDATA || process.env.HOME || "", "lmf-viewer");
const appDataPath = join(appDataDir, "lmf-viewer");
const windowStatePath = join(appDataPath, "window-state.json");
const recentFilesPath = join(appDataPath, "recent-files.json");

// Ensure app data directory exists
if (!existsSync(appDataPath)) {
	mkdirSync(appDataPath, { recursive: true });
}

// Load saved window state
function loadWindowState(): WindowState {
	try {
		if (existsSync(windowStatePath)) {
			const data = readFileSync(windowStatePath, "utf-8");
			const state = JSON.parse(data) as WindowState;
			// Default to maximized if not set
			if (state.maximized === undefined) {
				state.maximized = true;
			}
			return state;
		}
	} catch (e) {
		console.error("Failed to load window state:", e);
	}
	return { width: 1200, height: 800, x: 100, y: 100, sidebarWidth: 200, maximized: true };
}

// Save window state
function saveWindowState(state: WindowState): void {
	try {
		writeFileSync(windowStatePath, JSON.stringify(state, null, 2));
	} catch (e) {
		console.error("Failed to save window state:", e);
	}
}

// Load recent files list
function loadRecentFiles(): string[] {
	try {
		if (existsSync(recentFilesPath)) {
			const data = readFileSync(recentFilesPath, "utf-8");
			return JSON.parse(data) as string[];
		}
	} catch (e) {
		console.error("Failed to load recent files:", e);
	}
	return [];
}

// Save recent files list
function saveRecentFiles(files: string[]): void {
	try {
		writeFileSync(recentFilesPath, JSON.stringify(files, null, 2));
	} catch (e) {
		console.error("Failed to save recent files:", e);
	}
}

// Add file to recent files (most recent first, max 20)
function addRecentFile(path: string): void {
	const files = loadRecentFiles();
	const filtered = files.filter(f => f !== path);
	filtered.unshift(path);
	if (filtered.length > 20) filtered.pop();
	saveRecentFiles(filtered);
}

// Remove file from recent files
function removeRecentFile(path: string): void {
	const files = loadRecentFiles();
	const filtered = files.filter(f => f !== path);
	saveRecentFiles(filtered);
}

// Define RPC handlers for Bun side
export const viewerRpc = {
	handlers: {
		requests: {
			getRecentFiles: async () => {
				return loadRecentFiles();
			},
		},
		messages: {
			fileSelected: ({ path }) => {
				console.log("File selected:", path);
				addRecentFile(path);
			},
			fileOpenRequested: () => {
				console.log("Open file requested");
			},
			exportRequested: ({ format, scale }) => {
				console.log(`Export requested: ${format} (scale: ${scale || 1})`);
			},
			toggleCodeRequested: () => {
				console.log("Toggle code panel requested");
			},
			refreshRequested: () => {
				console.log("Refresh requested");
			},
		},
	},
};

export { loadWindowState, saveWindowState, loadRecentFiles, saveRecentFiles, addRecentFile, removeRecentFile, appDataPath };
