const { watchFile, unwatchFile } = require('fs');

const testFile = process.argv[2];
if (!testFile) {
    console.log('Usage: node test-watcher.js <file-to-watch>');
    process.exit(1);
}

console.log(`Testing stat polling watcher on: ${testFile}`);

watchFile(testFile, { interval: 2000 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
        console.log(`[STAT POLL] File changed at ${new Date().toISOString()}`);
        console.log(`  Previous mtime: ${prev.mtimeMs}`);
        console.log(`  Current mtime: ${curr.mtimeMs}`);
    }
});

console.log('Watcher active. Press Ctrl+C to stop.');
console.log('Modify the file externally to test detection.');
