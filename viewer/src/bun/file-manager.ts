import { readFileSync, writeFileSync, statSync, unlinkSync, existsSync } from "fs";
import type { FileData, FileProperties, LmfMetadata } from "../shared/types";

// Parse LMF header to extract metadata
function parseLmfHeader(content: string): LmfMetadata | null {
	try {
		const lines = content.split("\n");
		const headerLine = lines[0];

		if (!headerLine.startsWith("#LMF1")) {
			return null;
		}

		// Extract dimensions (e.g., "1920x1080")
		const dimMatch = headerLine.match(/(\d+)x(\d+)/);
		const width = dimMatch ? parseInt(dimMatch[1], 10) : 1920;
		const height = dimMatch ? parseInt(dimMatch[2], 10) : 1080;

		// Extract background color (e.g., "bg:#0f172a")
		const bgMatch = headerLine.match(/bg:([^#\s]*#[0-9a-fA-F]{3,6}|#[0-9a-fA-F]{3,6})/);
		const backgroundColor = bgMatch ? bgMatch[1] : "#ffffff";

		// Count nodes (non-empty, non-comment, non-def lines)
		let nodeCount = 0;
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !line.startsWith("//") && !line.startsWith("@")) {
				nodeCount++;
			}
		}

		return { width, height, backgroundColor, nodeCount };
	} catch (e) {
		console.error("Failed to parse LMF header:", e);
		return null;
	}
}

// Open and read an LMF file
export function openFile(path: string): { success: boolean; data?: FileData; error?: string } {
	try {
		if (!existsSync(path)) {
			return { success: false, error: "File not found" };
		}

		const content = readFileSync(path, "utf-8");
		const metadata = parseLmfHeader(content);

		if (!metadata) {
			return { success: false, error: "Invalid LMF file format" };
		}

		return {
			success: true,
			data: {
				content,
				metadata,
				path,
			},
		};
	} catch (e) {
		return { success: false, error: `Failed to open file: ${e.message}` };
	}
}

// Get file properties
export function getFileProperties(path: string): FileProperties {
	try {
		if (!existsSync(path)) {
			throw new Error("File not found");
		}

		const stats = statSync(path);
		const content = readFileSync(path, "utf-8");
		const metadata = parseLmfHeader(content);

		const fileName = path.split(/[/\\]/).pop() || path;

		// Format file size
		const size = stats.size;
		const sizeFormatted = size < 1024
			? `${size} B`
			: size < 1024 * 1024
				? `${(size / 1024).toFixed(1)} KB`
				: `${(size / (1024 * 1024)).toFixed(1)} MB`;

		return {
			name: fileName,
			path,
			size,
			sizeFormatted,
			modified: stats.mtime.toISOString(),
			metadata,
		};
	} catch (e) {
		return {
			name: "",
			path,
			size: 0,
			sizeFormatted: "0 B",
			modified: "",
			metadata: null,
		};
	}
}

// Delete a file
export function deleteFile(path: string): { success: boolean; error?: string } {
	try {
		if (!existsSync(path)) {
			return { success: false, error: "File not found" };
		}

		unlinkSync(path);
		return { success: true };
	} catch (e) {
		return { success: false, error: `Failed to delete file: ${e.message}` };
	}
}

// Check if file exists
export function fileExists(path: string): boolean {
	return existsSync(path);
}

// Save file content
export function saveFile(path: string, content: string): { success: boolean; error?: string } {
	try {
		if (!existsSync(path)) {
			return { success: false, error: "File not found" };
		}
		writeFileSync(path, content, "utf-8");
		return { success: true };
	} catch (e) {
		return { success: false, error: `Failed to save file: ${e.message}` };
	}
}
