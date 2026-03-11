import { Electroview } from "electrobun/view";
import type { ViewerRPC, FileData, FileProperties, LmfMetadata } from "../shared/types";

// State
let openFiles: Map<string, FileData> = new Map();
let activeFile: string | null = null;
let naturalSvgWidth = 0;
let naturalSvgHeight = 0;
let fileToDelete: string | null = null;
let currentZoom = 1;
let isAutoFitEnabled = false;

// Pan state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

// DOM Elements
const elements = {
	// Toolbar
	btnOpen: document.getElementById("btn-open")!,
	btnAutoFit: document.getElementById("btn-auto-fit")!,
	btnToggleCode: document.getElementById("btn-toggle-code")!,
	btnRefresh: document.getElementById("btn-refresh")!,
	btnMenu: document.getElementById("btn-menu")!,

	// Sidebar
	sidebar: document.getElementById("sidebar")!,
	fileList: document.getElementById("file-list")!,
	sidebarEmpty: document.getElementById("sidebar-empty")!,
	sidebarResize: document.getElementById("sidebar-resize")!,

	// Preview
	previewArea: document.getElementById("preview-area")!,
	previewContainer: document.getElementById("preview-container")!,
	previewPlaceholder: document.getElementById("preview-placeholder")!,
	previewSvg: document.getElementById("preview-svg")!,

	// Code Panel
	codePanel: document.getElementById("code-panel")!,
	codeContent: document.getElementById("code-content")!,
	btnCloseCode: document.getElementById("btn-close-code")!,

	// Status Bar
	statusBar: document.getElementById("statusbar")!,
	statusFile: document.getElementById("status-file")!,
	statusDimensions: document.getElementById("status-dimensions")!,
	statusNodes: document.getElementById("status-nodes")!,
	statusZoom: document.getElementById("status-zoom")!,
	statusPython: document.getElementById("status-python")!,
	zoomDropdown: document.getElementById("zoom-dropdown")!,
	zoomGroup: document.querySelector(".zoom-group") as HTMLElement,

	// Context Menu
	contextMenu: document.getElementById("context-menu")!,

	// Dialogs
	propertiesOverlay: document.getElementById("properties-overlay")!,
	propertiesDialog: document.getElementById("properties-dialog")!,
	propertiesContent: document.getElementById("properties-content")!,
	btnCloseProperties: document.getElementById("btn-close-properties")!,
	btnClosePropertiesFooter: document.getElementById("btn-close-properties-footer")!,
	deleteOverlay: document.getElementById("delete-overlay")!,
	deleteMessage: document.getElementById("delete-message")!,
	btnCancelDelete: document.getElementById("btn-cancel-delete")!,
	btnConfirmDelete: document.getElementById("btn-confirm-delete")!,

	// Toast
	exportToast: document.getElementById("export-toast")!,
	toastMessage: document.getElementById("toast-message")!,

	// File Input
	fileInput: document.getElementById("file-input")!,

	// App Menu
	appMenuDropdown: document.getElementById("app-menu-dropdown")!,
	menuOpenFile: document.getElementById("menu-open-file")!,
	menuCloseFile: document.getElementById("menu-close-file")!,
	menuExportPng: document.getElementById("menu-export-png")!,
	menuExportSvg: document.getElementById("menu-export-svg")!,
	menuExportHtml: document.getElementById("menu-export-html")!,
	menuProperties: document.getElementById("menu-properties")!,
	menuAbout: document.getElementById("menu-about")!,
	aboutOverlay: document.getElementById("about-overlay")!,
	btnCloseAbout: document.getElementById("btn-close-about")!,
};

// Initialize Electroview with RPC
const rpc = Electroview.defineRPC<ViewerRPC>({
	handlers: {
		requests: {
			updateWindowState: async ({ width, height, sidebarWidth }) => {
				// Save window state to localStorage
				localStorage.setItem("windowState", JSON.stringify({ width, height, sidebarWidth }));
				return true;
			},
		},
		messages: {
			fileChanged: ({ path }) => {
				console.log("File changed notification:", path);
				// Re-render the file
				if (openFiles.has(path)) {
					renderFile(path);
					flashStatusbar();
				}
			},
			fileRemoved: ({ path }) => {
				console.log("File removed notification:", path);
				removeFileFromUI(path);
			},
			fileDialogResult: ({ path }) => {
				console.log("File dialog result received:", path);
				if (path) {
					openFile(path);
				}
			},
			fileOpenedViaAssociation: async ({ path }) => {
				console.log("File opened via association:", path);
				if (path) {
					await openFile(path);
				}
			},
		},
	},
});

const electroview = new Electroview({ rpc });

// Initialize app
async function init() {
	// Load recent files (non-blocking)
	loadRecentFiles().catch(console.error);

	// Setup event listeners
	setupEventListeners();

	// Check Python status
	checkPythonStatus();

	console.log("LMF Viewer UI initialized");
}

// Load recent files from Bun
async function loadRecentFiles() {
	try {
		const files = await electroview.rpc.request.getRecentFiles({});
		console.log("Recent files:", files);
		// Files will be loaded on demand when opened
	} catch (e) {
		console.error("Failed to load recent files:", e);
	}
}

// Setup all event listeners
function setupEventListeners() {
	// Open file button - use native file dialog via RPC
	elements.btnOpen.addEventListener("click", () => {
		electroview.rpc.request.openFileDialog({}).catch(console.error);
	});

	// File input change (fallback - kept for keyboard shortcut Ctrl+O)
	elements.fileInput.addEventListener("change", async (e) => {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			// Note: This path is only available in Electrobun's browser context
			const file = target.files[0] as any;
			if (file.path) {
				await openFile(file.path);
			}
		}
		// Reset input so same file can be selected again
		elements.fileInput.value = "";
	});

	// Auto-fit button
	elements.btnAutoFit.addEventListener("click", autoFitPreview);

	// Zoom dropdown
	elements.zoomGroup.addEventListener("click", (e) => {
		e.stopPropagation();
		elements.zoomDropdown.classList.toggle("show");
	});

	elements.zoomDropdown.querySelectorAll("button").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			const zoom = parseFloat(btn.getAttribute("data-zoom") || "1");
			setZoom(zoom);
			elements.zoomDropdown.classList.remove("show");
		});
	});

	// Pan functionality
	elements.previewArea.addEventListener("mousedown", startPan);
	elements.previewArea.addEventListener("mousemove", pan);
	elements.previewArea.addEventListener("mouseup", endPan);
	elements.previewArea.addEventListener("mouseleave", endPan);

	// Mouse wheel zoom
	elements.previewArea.addEventListener("wheel", handleWheel);

	// Close dropdown when clicking outside
	document.addEventListener("click", () => {
		hideContextMenu();
		elements.zoomDropdown.classList.remove("show");
	});

	// Toggle code button
	elements.btnToggleCode.addEventListener("click", toggleCodePanel);
	elements.btnCloseCode.addEventListener("click", toggleCodePanel);

	// Refresh button
	elements.btnRefresh.addEventListener("click", () => {
		if (activeFile) {
			renderFile(activeFile);
		}
	});

	// Menu button
	elements.btnMenu.addEventListener("click", toggleAppMenu);

	// App menu items
	elements.menuOpenFile.addEventListener("click", () => {
		hideAppMenu();
		electroview.rpc.request.openFileDialog({}).catch(console.error);
	});

	elements.menuCloseFile.addEventListener("click", () => {
		hideAppMenu();
		if (activeFile) {
			removeFileFromUI(activeFile);
		}
	});

	elements.menuExportPng.addEventListener("click", () => {
		hideAppMenu();
		exportFile("png", 1);
	});

	elements.menuExportSvg.addEventListener("click", () => {
		hideAppMenu();
		exportFile("svg");
	});

	elements.menuExportHtml.addEventListener("click", () => {
		hideAppMenu();
		exportFile("html");
	});

	elements.menuProperties.addEventListener("click", () => {
		hideAppMenu();
		if (activeFile) {
			showPropertiesDialog(activeFile);
		} else {
			showError("No file selected");
		}
	});

	elements.menuAbout.addEventListener("click", () => {
		hideAppMenu();
		showAboutDialog();
	});

	// Close app menu when clicking outside
	document.addEventListener("click", (e) => {
		if (!elements.btnMenu.contains(e.target as Node) && !elements.appMenuDropdown.contains(e.target as Node)) {
			hideAppMenu();
		}
	});

	// Re-apply auto-fit whenever preview area changes size:
	// covers window drag-resize, maximize button, sidebar resize, and initial layout.
	const resizeObserver = new ResizeObserver(() => {
		if (isAutoFitEnabled) {
			applyAutoFit();
		}
	});
	resizeObserver.observe(elements.previewArea);

	// Sidebar resize disabled — fixed width

	// Context menu on file items
	elements.fileList.addEventListener("contextmenu", handleContextMenu);
	elements.fileList.addEventListener("click", handleFileClick);

	// Dialog buttons
	elements.btnCloseProperties.addEventListener("click", hidePropertiesDialog);
	elements.btnClosePropertiesFooter.addEventListener("click", hidePropertiesDialog);
	elements.btnCancelDelete.addEventListener("click", hideDeleteDialog);
	elements.btnConfirmDelete.addEventListener("click", confirmDelete);
	elements.btnCloseAbout.addEventListener("click", hideAboutDialog);

	// About overlay click
	elements.aboutOverlay.addEventListener("click", (e) => {
		if (e.target === elements.aboutOverlay) {
			hideAboutDialog();
		}
	});

	// Keyboard shortcuts
	document.addEventListener("keydown", handleKeyboard);

	// Properties overlay click
	elements.propertiesOverlay.addEventListener("click", (e) => {
		if (e.target === elements.propertiesOverlay) {
			hidePropertiesDialog();
		}
	});

	elements.deleteOverlay.addEventListener("click", (e) => {
		if (e.target === elements.deleteOverlay) {
			hideDeleteDialog();
		}
	});
}

// Open a file
async function openFile(path: string) {
	console.log("[openFile] Opening:", path);
	try {
		const result = await electroview.rpc.request.openFile({ path });
		console.log("[openFile] Result:", result);

		if (result.success && result.data) {
			console.log("[openFile] File opened successfully, adding to openFiles map");
			openFiles.set(path, result.data);
			watchFile(path);
			selectFile(path);
			console.log("[openFile] About to render file");
			await renderFile(path);
			console.log("[openFile] File rendered and sidebar updated");
			updateSidebar();
		} else {
			console.error("[openFile] Open file failed:", result.error);
			showError(`Failed to open file: ${result.error}`);
		}
	} catch (e) {
		console.error("[openFile] Exception:", e);
		showError(`Failed to open file: ${e}`);
	}
}

// Watch file for changes
async function watchFile(path: string) {
	// The Bun side is already watching via the openFile handler
}

// Select a file
function selectFile(path: string) {
	activeFile = path;
	electroview.rpc.send.fileSelected({ path });
	updateSidebar();
}

// Render a file
async function renderFile(path: string) {
	console.log("[renderFile] Rendering:", path);
	const fileData = openFiles.get(path);
	if (!fileData) {
		console.error("[renderFile] File not found in openFiles map:", path);
		return;
	}

	try {
		const result = await electroview.rpc.request.renderLmf({ path });
		console.log("[renderFile] Render result:", result);

		if (result.svg) {
			elements.previewPlaceholder.style.display = "none";
			elements.previewSvg.innerHTML = result.svg;
			elements.previewSvg.classList.add("show");

			// Store natural SVG dimensions
			const svgEl = elements.previewSvg.querySelector("svg");
			if (svgEl) {
				naturalSvgWidth = parseFloat(svgEl.getAttribute("width") || "0");
				naturalSvgHeight = parseFloat(svgEl.getAttribute("height") || "0");
				// Ensure viewBox exists for proper attribute-based scaling
				if (!svgEl.getAttribute("viewBox") && naturalSvgWidth && naturalSvgHeight) {
					svgEl.setAttribute("viewBox", `0 0 ${naturalSvgWidth} ${naturalSvgHeight}`);
				}
			}

			// Auto-fit on load - call immediately and again after layout settles
			isAutoFitEnabled = true;
			panOffsetX = 0;
			panOffsetY = 0;
			currentZoom = 1;
			applyAutoFit();
			// Retry after layout settles (window maximize / webview init may not be done)
			setTimeout(() => applyAutoFit(), 100);

			// Update zoom display
			updateZoomDisplay();

			// Update status bar
			updateStatusBar(fileData.name, result.metadata);
			console.log("[renderFile] File rendered successfully");
		}

		if (result.error) {
			console.warn("[renderFile] Render error:", result.error);
			// Show error in the preview area
			elements.previewPlaceholder.style.display = "none";
			elements.previewSvg.innerHTML = result.svg || "";
			elements.previewSvg.classList.add("show");
		}
	} catch (e) {
		console.error("[renderFile] Exception:", e);
		showError(`Failed to render: ${e}`);
	}
}

// Export a file
async function exportFile(format: "png" | "svg" | "html", scale: number = 1) {
	if (!activeFile) {
		showError("No file selected for export");
		return;
	}

	try {
		const result = await electroview.rpc.request.exportFile({
			path: activeFile,
			format,
			scale,
		});

		if (result.success) {
			showToast(`Exported as ${format.toUpperCase()}`);
		} else {
			showError(`Export failed: ${result.error}`);
		}
	} catch (e) {
		showError(`Export failed: ${e}`);
	}
}

// Auto-fit preview to viewport
function autoFitPreview() {
	// Toggle auto-fit state
	isAutoFitEnabled = !isAutoFitEnabled;

	if (!isAutoFitEnabled) {
		// Disable auto-fit - reset to 100%
		panOffsetX = 0;
		panOffsetY = 0;
		currentZoom = 1;
		const svgElement = elements.previewSvg.querySelector("svg");
		if (svgElement) {
			applyTransform(svgElement);
		}
		updateZoomDisplay();
		updateZoomDropdownActive();
		return;
	}

	// Enable auto-fit
	applyAutoFit();
}

// Apply auto-fit calculation
function applyAutoFit() {
	const svgElement = elements.previewSvg.querySelector("svg");
	if (!svgElement || !activeFile) {
		return;
	}

	// Get the preview area dimensions
	const previewRect = elements.previewArea.getBoundingClientRect();
	const availableWidth = previewRect.width;
	const availableHeight = previewRect.height;

	// If layout hasn't settled yet, retry
	if (availableWidth === 0 || availableHeight === 0) {
		setTimeout(() => applyAutoFit(), 50);
		return;
	}

	if (naturalSvgWidth === 0 || naturalSvgHeight === 0) return;

	// Scale to fit within available space — full image always visible.
	const scaleX = availableWidth / naturalSvgWidth;
	const scaleY = availableHeight / naturalSvgHeight;
	const scale = Math.min(scaleX, scaleY);

	currentZoom = scale;
	panOffsetX = 0;
	panOffsetY = 0;

	// Resize SVG attributes directly so layout box matches visual size.
	// CSS transform alone won't work — flexbox centers the layout box (natural size),
	// leaving black space even after scaling.
	svgElement.setAttribute("width", String(Math.round(naturalSvgWidth * scale)));
	svgElement.setAttribute("height", String(Math.round(naturalSvgHeight * scale)));
	svgElement.style.transform = "";

	// Update zoom display
	updateZoomDisplay();
	updateZoomDropdownActive();
}

// Set zoom level
function setZoom(zoom: number) {
	if (!activeFile) return;

	// Disable auto-fit when manually zooming
	if (isAutoFitEnabled) {
		isAutoFitEnabled = false;
	}

	const svgElement = elements.previewSvg.querySelector("svg");
	if (!svgElement) return;

	// Auto-center when zooming to 100%
	if (zoom === 1) {
		panOffsetX = 0;
		panOffsetY = 0;
	}

	currentZoom = zoom;
	applyTransform(svgElement);
	updateZoomDisplay();
	updateZoomDropdownActive();
}

// Apply combined zoom and pan transform (manual zoom mode)
function applyTransform(svgElement: SVGElement) {
	// Restore natural dimensions so transform scales from the original size
	if (naturalSvgWidth && naturalSvgHeight) {
		svgElement.setAttribute("width", String(naturalSvgWidth));
		svgElement.setAttribute("height", String(naturalSvgHeight));
	}
	svgElement.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${currentZoom})`;
}

// Update zoom level display in status bar
function updateZoomDisplay() {
	elements.statusZoom.textContent = `${Math.round(currentZoom * 100)}%`;
}

// Update active state in zoom dropdown
function updateZoomDropdownActive() {
	elements.zoomDropdown.querySelectorAll("button").forEach((btn) => {
		const zoom = parseFloat(btn.getAttribute("data-zoom") || "1");
		btn.classList.toggle("active", Math.abs(zoom - currentZoom) < 0.01);
	});
}

// Pan functions
function startPan(e: MouseEvent) {
	// Only allow panning with left mouse button when zoomed in
	if (e.button !== 0 || currentZoom <= 1) return;

	isPanning = true;
	panStartX = e.clientX - panOffsetX;
	panStartY = e.clientY - panOffsetY;
	elements.previewArea.classList.add("panning");
	elements.previewSvg.classList.add("panning");
}

function pan(e: MouseEvent) {
	if (!isPanning) return;
	e.preventDefault();

	const svgElement = elements.previewSvg.querySelector("svg");
	if (!svgElement) return;

	panOffsetX = e.clientX - panStartX;
	panOffsetY = e.clientY - panStartY;
	applyTransform(svgElement);
}

function endPan() {
	if (!isPanning) return;
	isPanning = false;
	elements.previewArea.classList.remove("panning");
	elements.previewSvg.classList.remove("panning");
}

// Handle mouse wheel for zoom
function handleWheel(e: WheelEvent) {
	if (!activeFile) return;

	e.preventDefault();

	const svgElement = elements.previewSvg.querySelector("svg");
	if (!svgElement) return;

	// Zoom in/out by 5% per wheel notch
	const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
	let newZoom = currentZoom * zoomFactor;

	// Clamp zoom between 25% and 500%
	newZoom = Math.max(0.25, Math.min(5, newZoom));

	// Only update if zoom changed significantly
	if (Math.abs(newZoom - currentZoom) < 0.01) return;

	currentZoom = newZoom;
	applyTransform(svgElement);
	updateZoomDisplay();
	updateZoomDropdownActive();
}

// Update sidebar
function updateSidebar() {
	elements.fileList.innerHTML = "";

	if (openFiles.size === 0) {
		elements.fileList.appendChild(elements.sidebarEmpty);
		elements.sidebarEmpty.style.display = "flex";
		return;
	}

	elements.sidebarEmpty.style.display = "none";

	for (const [path, data] of openFiles.entries()) {
		const item = document.createElement("div");
		item.className = "file-item";
		if (path === activeFile) {
			item.classList.add("selected");
		}
		item.dataset.path = path;

		item.innerHTML = `
			<span class="file-icon">📄</span>
			<span class="file-name">${escapeHtml(path.split(/[/\\]/).pop() || '')}</span>
		`;

		elements.fileList.appendChild(item);
	}
}

// Handle file click
function handleFileClick(e: MouseEvent) {
	const item = (e.target as HTMLElement).closest(".file-item") as HTMLElement;
	if (!item || item === elements.sidebarEmpty) return;

	const path = item.dataset.path!;
	selectFile(path);
	renderFile(path);
}

// Handle context menu
let contextMenuPath: string | null = null;

function handleContextMenu(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();

	const item = (e.target as HTMLElement).closest(".file-item") as HTMLElement;
	if (!item || item === elements.sidebarEmpty) return;

	contextMenuPath = item.dataset.path!;

	elements.contextMenu.style.left = `${e.clientX}px`;
	elements.contextMenu.style.top = `${e.clientY}px`;
	elements.contextMenu.classList.add("show");
}

function hideContextMenu() {
	elements.contextMenu.classList.remove("show");
	contextMenuPath = null;
}

// Context menu actions
elements.contextMenu.addEventListener("click", (e) => {
	const btn = (e.target as HTMLElement).closest(".context-item") as HTMLElement;
	if (!btn) return;

	const action = btn.dataset.action;

	switch (action) {
		case "open":
			if (contextMenuPath) {
				selectFile(contextMenuPath);
				renderFile(contextMenuPath);
			}
			break;
		case "properties":
			if (contextMenuPath) {
				showPropertiesDialog(contextMenuPath);
			}
			break;
		case "delete":
			if (contextMenuPath) {
				showDeleteDialog(contextMenuPath);
			}
			break;
	}

	hideContextMenu();
});

// Show properties dialog
async function showPropertiesDialog(path: string) {
	try {
		const props = await electroview.rpc.request.getFileProperties({ path });

		elements.propertiesContent.innerHTML = `
			<div class="property-row">
				<span class="property-label">Name</span>
				<span class="property-value">${escapeHtml(props.name)}</span>
			</div>
			<div class="property-row">
				<span class="property-label">Path</span>
				<span class="property-value">${escapeHtml(props.path)}</span>
			</div>
			<div class="property-row">
				<span class="property-label">Size</span>
				<span class="property-value">${escapeHtml(props.sizeFormatted)}</span>
			</div>
			<div class="property-row">
				<span class="property-label">Modified</span>
				<span class="property-value">${escapeHtml(new Date(props.modified).toLocaleString())}</span>
			</div>
			${props.metadata ? `
			<div class="property-row">
				<span class="property-label">Dimensions</span>
				<span class="property-value">${props.metadata.width}x${props.metadata.height}</span>
			</div>
			<div class="property-row">
				<span class="property-label">Nodes</span>
				<span class="property-value">${props.metadata.nodeCount}</span>
			</div>
			<div class="property-row">
				<span class="property-label">Background</span>
				<span class="property-value">${escapeHtml(props.metadata.backgroundColor)}</span>
			</div>
			` : ""}
		`;

		elements.propertiesOverlay.classList.add("show");
	} catch (e) {
		showError(`Failed to get properties: ${e}`);
	}
}

function hidePropertiesDialog() {
	elements.propertiesOverlay.classList.remove("show");
}

// Show delete dialog
function showDeleteDialog(path: string) {
	fileToDelete = path;
	const fileName = path.split(/[/\\]/).pop() || path;
	elements.deleteMessage.textContent = `Are you sure you want to delete "${fileName}"? This cannot be undone.`;
	elements.deleteOverlay.classList.add("show");
}

function hideDeleteDialog() {
	elements.deleteOverlay.classList.remove("show");
	fileToDelete = null;
}

// Confirm delete
async function confirmDelete() {
	if (!fileToDelete) return;

	try {
		const result = await electroview.rpc.request.deleteFile({ path: fileToDelete });

		if (result.success) {
			removeFileFromUI(fileToDelete);
			hideDeleteDialog();
			showToast("File deleted");
		} else {
			showError(`Delete failed: ${result.error}`);
		}
	} catch (e) {
		showError(`Delete failed: ${e}`);
		hideDeleteDialog();
	}
}

// Remove file from UI
function removeFileFromUI(path: string) {
	openFiles.delete(path);

	if (activeFile === path) {
		activeFile = null;
		elements.previewPlaceholder.style.display = "flex";
		elements.previewSvg.classList.remove("show");
		elements.previewSvg.innerHTML = "";
		updateStatusBar("-", { width: 0, height: 0, backgroundColor: "", nodeCount: 0 });
	}

	updateSidebar();
}

// Toggle code panel
function toggleCodePanel() {
	elements.codePanel.classList.toggle("show");

	if (elements.codePanel.classList.contains("show") && activeFile) {
		const fileData = openFiles.get(activeFile);
		if (fileData) {
			(elements.codeContent as HTMLTextAreaElement).value = fileData.content;
		}
	} else {
		// Code panel closed - re-apply auto-fit if enabled
		if (isAutoFitEnabled) {
			applyAutoFit();
		}
	}
}

// Debounce timer for live updates
let liveUpdateTimer: ReturnType<typeof setTimeout> | null = null;

// Setup live code editing
elements.codeContent.addEventListener("input", () => {
	if (!activeFile) return;

	// Clear previous timer
	if (liveUpdateTimer) {
		clearTimeout(liveUpdateTimer);
	}

	// Debounce - save after 500ms of no typing
	liveUpdateTimer = setTimeout(async () => {
		const newContent = (elements.codeContent as HTMLTextAreaElement).value;

		// Update the file content in memory
		const fileData = openFiles.get(activeFile!);
		if (fileData) {
			fileData.content = newContent;
			openFiles.set(activeFile!, fileData);
		}

		// Save to disk (file watcher will trigger re-render)
		try {
			await electroview.rpc.request.saveFile({ path: activeFile!, content: newContent });
		} catch (e) {
			console.error("Failed to save file:", e);
		}
	}, 500);
});

// Update status bar
function updateStatusBar(fileName: string, metadata: LmfMetadata) {
	elements.statusFile.textContent = fileName;
	elements.statusDimensions.textContent = `${metadata.width}x${metadata.height}`;
	elements.statusNodes.textContent = `${metadata.nodeCount} nodes`;
}

function flashStatusbar() {
	elements.statusBar.style.background = "var(--accent-primary)";
	setTimeout(() => {
		elements.statusBar.style.background = "";
	}, 300);
}


// Keyboard shortcuts
function handleKeyboard(e: KeyboardEvent) {
	// Ctrl+O - Open file
	if (e.ctrlKey && e.key === "o") {
		e.preventDefault();
		electroview.rpc.request.openFileDialog({}).catch(console.error);
	}

	// Ctrl+/ - Toggle code
	if (e.ctrlKey && e.key === "/") {
		e.preventDefault();
		toggleCodePanel();
	}

	// Ctrl+0 - Auto fit
	if (e.ctrlKey && e.key === "0") {
		e.preventDefault();
		autoFitPreview();
	}

	// F5 - Refresh
	if (e.key === "F5") {
		e.preventDefault();
		if (activeFile) {
			renderFile(activeFile);
		}
	}

	// Delete - Delete selected file
	if (e.key === "Delete" && activeFile) {
		showDeleteDialog(activeFile);
	}

	// Escape - Close dialogs/menus and reset zoom/pan
	if (e.key === "Escape") {
		// If any dialog/menu is open, close it instead of resetting zoom
		if (elements.contextMenu.classList.contains("show") ||
			elements.propertiesOverlay.classList.contains("show") ||
			elements.deleteOverlay.classList.contains("show") ||
			elements.appMenuDropdown.classList.contains("show") ||
			elements.aboutOverlay.classList.contains("show") ||
			elements.zoomDropdown.classList.contains("show")) {
			hideContextMenu();
			hidePropertiesDialog();
			hideDeleteDialog();
			hideAppMenu();
			hideAboutDialog();
			elements.zoomDropdown.classList.remove("show");
			return;
		}

		// Reset zoom to 100% and center the image
		if (activeFile) {
			const svgElement = elements.previewSvg.querySelector("svg");
			if (svgElement) {
				currentZoom = 1;
				panOffsetX = 0;
				panOffsetY = 0;
				applyTransform(svgElement);
				updateZoomDisplay();
				updateZoomDropdownActive();
			}
		}
	}
}

// App menu functions
function toggleAppMenu() {
	elements.appMenuDropdown.classList.toggle("show");
}

function hideAppMenu() {
	elements.appMenuDropdown.classList.remove("show");
}

// Show about dialog
function showAboutDialog() {
	elements.aboutOverlay.classList.add("show");
}

function hideAboutDialog() {
	elements.aboutOverlay.classList.remove("show");
}

// Check Python status
async function checkPythonStatus() {
	try {
		const result = await electroview.rpc.request.checkPython({});
		if (result.available) {
			elements.statusPython.textContent = `Python: ${result.version}`;
			elements.statusPython.style.color = "var(--success)";
		} else {
			elements.statusPython.textContent = "Python: not found";
			elements.statusPython.style.color = "var(--danger)";
		}
	} catch (e) {
		elements.statusPython.textContent = "Python: error";
		elements.statusPython.style.color = "var(--danger)";
	}
}

// Show toast notification
function showToast(message: string) {
	elements.toastMessage.textContent = message;
	elements.exportToast.classList.add("show");

	setTimeout(() => {
		elements.exportToast.classList.remove("show");
	}, 2500);
}

// Show error (placeholder)
function showError(message: string) {
	console.error("Error:", message);
	// TODO: Implement proper error dialog
	alert(message);
}

// Escape HTML
function escapeHtml(text: string | number): string {
	return String(text).replace(/[<>&'"]/g, (c) => {
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

// Start the app
init();
