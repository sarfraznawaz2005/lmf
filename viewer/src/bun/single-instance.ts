import net from "net";

const PIPE_PATH = "\\\\.\\pipe\\lmf-viewer-single-instance";

let _onFileReceived: ((path: string) => void) | null = null;

export function onSingleInstanceFile(callback: (path: string) => void) {
	_onFileReceived = callback;
}

/**
 * Acquires the single-instance lock.
 * - If another instance is already running, forwards `fileToOpen` to it and returns false.
 *   The caller should call process.exit(0) immediately after.
 * - If this is the first instance, starts the named-pipe server and returns true.
 */
export async function acquireSingleInstance(fileToOpen: string | null): Promise<boolean> {
	if (process.platform !== "win32") return true;

	const forwarded = await tryForwardToExisting(fileToOpen);
	if (forwarded) return false;

	startPipeServer();
	return true;
}

function tryForwardToExisting(fileToOpen: string | null): Promise<boolean> {
	return new Promise((resolve) => {
		const client = net.createConnection(PIPE_PATH);

		const timer = setTimeout(() => {
			client.destroy();
			resolve(false); // No server responded — we are the first instance
		}, 500);

		client.once("connect", () => {
			clearTimeout(timer);
			client.write((fileToOpen ?? "") + "\n");
			client.end();
			resolve(true); // Existing instance found and notified
		});

		client.once("error", () => {
			clearTimeout(timer);
			resolve(false); // No server — we are the first instance
		});
	});
}

function startPipeServer() {
	const server = net.createServer((socket) => {
		let buf = "";
		socket.on("data", (chunk) => {
			buf += chunk.toString("utf8");
		});
		socket.on("end", () => {
			const path = buf.trim();
			if (path && _onFileReceived) {
				_onFileReceived(path);
			}
		});
		socket.on("error", () => {});
	});

	server.on("error", (e) => console.warn("Single-instance pipe error:", e));
	server.listen(PIPE_PATH);
}
