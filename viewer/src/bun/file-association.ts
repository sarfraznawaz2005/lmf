import { join, dirname } from "path";
import { existsSync, writeFileSync } from "fs";

const OPENER_VBS = `' LMF file opener - runs silently, no window flash
Dim filePath, fso, f, shell, launcherDir, tempFile, exePath, bs
filePath = WScript.Arguments(0)
bs = Chr(92)  ' backslash

Set fso = CreateObject("Scripting.FileSystemObject")

' Validate that the file exists before proceeding
If Not fso.FileExists(filePath) Then
    WScript.Echo "Error: File not found: " & filePath
    WScript.Quit 1
End If

' Write requested file path to temp file for the app to read on startup
tempFile = fso.GetSpecialFolder(2) & bs & "lmf-open-request.txt"
Set f = fso.CreateTextFile(tempFile, True)
f.Write filePath
f.Close

' Small delay to ensure file is written to disk
WScript.Sleep 100

' Launch the app
Set shell = CreateObject("WScript.Shell")
launcherDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Try launcher.exe first (installed app), then launcher (build directory)
exePath = launcherDir & bs & "launcher.exe"
If Not fso.FileExists(exePath) Then
    exePath = launcherDir & bs & "launcher"
End If

If fso.FileExists(exePath) Then
    shell.Run Chr(34) & exePath & Chr(34), 1, False
Else
    WScript.Echo "Error: launcher not found in " & launcherDir
    WScript.Quit 1
End If

' Wait for app to read the file before exiting
WScript.Sleep 200
`;

// Runs fully async via Bun.spawn so it never blocks the bun thread.
// Call without await — runs in background immediately on startup.
export async function ensureFileAssociation() {
	if (process.platform !== "win32") return;

	try {
		const launcherDir = dirname(process.argv0); // .../bin/
		const openerVbs = join(launcherDir, "lmf-opener.vbs");
		const expectedCmd = `wscript.exe "${openerVbs}" "%1"`;

		// Async check — doesn't block the bun thread
		const checkProc = Bun.spawn(
			["powershell", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-Command",
				`(Get-ItemProperty 'HKCU:\\Software\\Classes\\LMFFile\\shell\\open\\command' -ErrorAction SilentlyContinue).'(default)'`],
			{ stdout: "pipe", stderr: "pipe" }
		);
		await checkProc.exited;
		const currentCmd = (await new Response(checkProc.stdout).text()).trim();

		if (currentCmd === expectedCmd && existsSync(openerVbs)) {
			return; // Already registered correctly
		}

		// Write lmf-opener.vbs next to launcher.exe
		writeFileSync(openerVbs, OPENER_VBS);

		// Note: PowerShell single-quoted strings treat backslashes literally —
		// do NOT double them. Only escape single quotes by doubling them.
		const safePath = openerVbs.replace(/'/g, "''");
		const ps = `
$ErrorActionPreference = 'Stop';
$vbs = '${safePath}';
$cmd = "wscript.exe \`"$vbs\`" \`"%1\`"";
$null = New-Item -Path 'HKCU:\\Software\\Classes\\.lmf' -Force;
Set-ItemProperty   -Path 'HKCU:\\Software\\Classes\\.lmf' -Name '(Default)' -Value 'LMFFile' -ErrorAction SilentlyContinue;
$null = New-Item -Path 'HKCU:\\Software\\Classes\\LMFFile' -Force;
Set-ItemProperty   -Path 'HKCU:\\Software\\Classes\\LMFFile' -Name '(Default)' -Value 'LMF File' -ErrorAction SilentlyContinue;
$null = New-Item -Path 'HKCU:\\Software\\Classes\\LMFFile\\shell\\open\\command' -Force;
Set-ItemProperty   -Path 'HKCU:\\Software\\Classes\\LMFFile\\shell\\open\\command' -Name '(Default)' -Value $cmd;
`;
		const regProc = Bun.spawn(
			["powershell", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-Command", ps],
			{ stdout: "pipe", stderr: "pipe" }
		);
		await regProc.exited;

		console.log("File association registered for .lmf files");
	} catch (e) {
		console.warn("Could not register file association:", e);
	}
}
