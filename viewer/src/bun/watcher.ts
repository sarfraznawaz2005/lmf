import { watch } from "fs";
import { fileExists } from "./file-manager";

// Active file watchers
const watchers = new Map<string, { watcher: any; timeout: NodeJS.Timeout | null }>();

// Callback type
type FileChangeCallback = (path: string) => void;

// Global callback registry
const callbacks = new Set<FileChangeCallback>();

// Register a file change callback
export function onFileChange(callback: FileChangeCallback): void {
	callbacks.add(callback);
}

// Remove a file change callback
export function offFileChange(callback: FileChangeCallback): void {
	callbacks.delete(callback);
}

// Watch a file for changes with debouncing
export function watchFile(path: string): void {
	// Already watching
	if (watchers.has(path)) {
		return;
	}

	// Check file exists
	if (!fileExists(path)) {
		console.warn(`Cannot watch non-existent file: ${path}`);
		return;
	}

	try {
		// Use Node's fs.watch for file watching
		const watcher = watch(path, { persistent: false }, (eventType) => {
			if (eventType === "change") {
				// Debounce: clear existing timeout
				const existing = watchers.get(path);
				if (existing?.timeout) {
					clearTimeout(existing.timeout);
				}

				// Set new timeout to notify after 500ms
				const timeout = setTimeout(() => {
					console.log(`File changed: ${path}`);
					callbacks.forEach((cb) => cb(path));
				}, 500);

				// Update watcher entry
				watchers.set(path, { watcher, timeout });
			}
		});

		watchers.set(path, { watcher, timeout: null });
		console.log(`Watching file: ${path}`);
	} catch (e) {
		console.error(`Failed to watch file ${path}:`, e);
	}
}

// Stop watching a file
export function unwatchFile(path: string): void {
	const entry = watchers.get(path);
	if (entry) {
		if (entry.timeout) {
			clearTimeout(entry.timeout);
		}
		// Close the fs watcher
		if (entry.watcher) {
			entry.watcher.close();
		}
		watchers.delete(path);
		console.log(`Stopped watching file: ${path}`);
	}
}

// Stop watching all files
export function unwatchAll(): void {
	for (const [path, entry] of watchers.entries()) {
		if (entry.timeout) {
			clearTimeout(entry.timeout);
		}
		if (entry.watcher) {
			entry.watcher.close();
		}
	}
	watchers.clear();
	console.log("Stopped watching all files");
}

// Check if a file is being watched
export function isWatching(path: string): boolean {
	return watchers.has(path);
}
