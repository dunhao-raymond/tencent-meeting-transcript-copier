const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const url = process.argv[2];
const output = process.argv[3] || path.resolve(process.cwd(), 'meeting.tencent.com-cw-Ngkwz6W61e.mhtml');
const chromePath = process.argv[4] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!url) {
    console.error('Usage: node capture-mhtml.js <url> [output] [chromePath]');
    process.exit(1);
}

const port = 9223 + Math.floor(Math.random() * 500);
const userDataDir = path.join(process.cwd(), '.tmp', `tm-mhtml-${Date.now()}`);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForJson(endpoint, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(endpoint);
            if (response.ok) return response.json();
        } catch (_) {
            // Chrome is still starting.
        }
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${endpoint}`);
}

function send(ws, method, params = {}) {
    const id = send.nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
        const onMessage = event => {
            const message = JSON.parse(event.data);
            if (message.id !== id) return;
            ws.removeEventListener('message', onMessage);
            if (message.error) {
                reject(new Error(`${method}: ${message.error.message}`));
                return;
            }
            resolve(message.result || {});
        };
        ws.addEventListener('message', onMessage);
    });
}
send.nextId = 1;

async function waitForLoad(ws, timeoutMs = 45000) {
    await send(ws, 'Page.enable');
    await send(ws, 'Runtime.enable');

    let loaded = false;
    const onMessage = event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Page.loadEventFired') loaded = true;
    };
    ws.addEventListener('message', onMessage);
    await send(ws, 'Page.navigate', { url });

    const deadline = Date.now() + timeoutMs;
    while (!loaded && Date.now() < deadline) {
        await sleep(250);
    }
    ws.removeEventListener('message', onMessage);
}

async function main() {
    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank'
    ];

    const chrome = spawn(chromePath, args, { stdio: 'ignore' });
    let ws;
    try {
        await waitForJson(`http://127.0.0.1:${port}/json/version`);
        const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
        const pageTarget = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
        if (!pageTarget) throw new Error('Could not find a debuggable Chrome page target');

        ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', reject, { once: true });
        });

        await waitForLoad(ws);
        await sleep(8000);

        await send(ws, 'Runtime.evaluate', {
            expression: `
                new Promise(resolve => {
                    const start = Date.now();
                    const timer = setInterval(() => {
                        const text = document.body ? document.body.innerText : '';
                        if (document.readyState === 'complete' && (text.length > 200 || Date.now() - start > 10000)) {
                            clearInterval(timer);
                            resolve({ title: document.title, length: text.length, url: location.href });
                        }
                    }, 500);
                })
            `,
            awaitPromise: true,
            returnByValue: true
        });

        const snapshot = await send(ws, 'Page.captureSnapshot', { format: 'mhtml' });
        fs.writeFileSync(output, snapshot.data, 'utf8');
        console.log(output);
    } finally {
        if (ws) ws.close();
        chrome.kill();
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (_) {
            // Cleanup is best effort; the captured MHTML is the important artifact.
        }
    }
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
