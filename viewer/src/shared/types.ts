import { RPCSchema } from "electrobun/bun";

export type ViewerRPC = {
	bun: RPCSchema<{
		requests: {
			// File operations
			openFileDialog: { params: {}; response: { queued: boolean } };
			checkPython: { params: {}; response: { available: boolean; version?: string } };
			openFile: { params: { path: string }; response: { success: boolean; data?: FileData; error?: string } };
			deleteFile: { params: { path: string }; response: { success: boolean; error?: string } };
			getFileProperties: { params: { path: string }; response: FileProperties };
			getRecentFiles: { params: {}; response: string[] };
			saveFile: { params: { path: string; content: string }; response: { success: boolean; error?: string } };

			// Rendering
			renderLmf: { params: { path: string }; response: { svg: string; metadata: LmfMetadata; error?: string } };

			// Export
			exportFile: { params: { path: string; format: "png" | "svg" | "html"; scale?: number }; response: { success: boolean; outputPath?: string; error?: string } };
		};
		messages: {
			fileChanged: { path: string };
			fileRemoved: { path: string };
		};
	}>;
	webview: RPCSchema<{
		requests: {
			updateWindowState: { params: { width: number; height: number; sidebarWidth: number }; response: boolean };
		};
		messages: {
			fileSelected: { path: string };
			fileOpenRequested: {};
			exportRequested: { format: "png" | "svg" | "html"; scale?: number };
			toggleCodeRequested: {};
			refreshRequested: {};
			fileDialogResult: { path: string | null };
			fileOpenedViaAssociation: { path: string };
		};
	}>;
};

export interface FileData {
	content: string;
	metadata: LmfMetadata;
	path: string;
}

export interface LmfMetadata {
	width: number;
	height: number;
	backgroundColor: string;
	nodeCount: number;
}

export interface FileProperties {
	name: string;
	path: string;
	size: number;
	sizeFormatted: string;
	modified: string;
	metadata: LmfMetadata | null;
}

export interface WindowState {
	width: number;
	height: number;
	x: number;
	y: number;
	sidebarWidth: number;
	maximized?: boolean;
}
