import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const extensionResources = path.join(repoRoot, "roter/roter Extension/Resources");
const fixtureRoot = path.join(__dirname, "fixtures/basic-site");

function localUrl(port, pathname = "/") {
    return `http://127.0.0.1:${port}${pathname}`;
}

async function startFixtureServer() {
    const server = http.createServer(async (request, response) => {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
        const filePath = path.join(fixtureRoot, relativePath);

        try {
            const body = await fs.readFile(filePath);
            response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            response.end(body);
        } catch {
            response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            response.end("Not found");
        }
    });

    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    return {
        port: address.port,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        })
    };
}

async function makeChromiumExtensionFixture(originPattern) {
    const extensionDir = await fs.mkdtemp(path.join(os.tmpdir(), "roter-extension-"));
    await fs.cp(extensionResources, extensionDir, { recursive: true });

    const manifestPath = path.join(extensionDir, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.background = {
        service_worker: "background.js",
        type: "module"
    };
    manifest.host_permissions = [originPattern];
    manifest.optional_host_permissions = [];

    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
    await fs.writeFile(
        path.join(extensionDir, "e2e-harness.html"),
        "<!doctype html><title>Roter E2E Harness</title><h1>Roter E2E Harness</h1>\n"
    );

    return extensionDir;
}

async function openExtensionHarness(context, extensionId) {
    const harness = await context.newPage();
    await harness.goto(`chrome-extension://${extensionId}/e2e-harness.html`, {
        waitUntil: "domcontentloaded",
        timeout: 5000
    });
    return harness;
}

test("the extension rotates, preserves same-origin rotation, and resets the current tab", async () => {
    const server = await startFixtureServer();
    const originPattern = "http://127.0.0.1/*";
    const extensionDir = await makeChromiumExtensionFixture(originPattern);
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "roter-profile-"));
    let context;

    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            viewport: { width: 900, height: 600 },
            args: [
                `--disable-extensions-except=${extensionDir}`,
                `--load-extension=${extensionDir}`
            ]
        });

        let [serviceWorker] = context.serviceWorkers();
        serviceWorker ??= await context.waitForEvent("serviceworker", { timeout: 5000 });
        const extensionId = new URL(serviceWorker.url()).host;

        const page = await context.newPage();
        await page.goto(localUrl(server.port));
        await expect(page.locator("#marker")).toBeVisible();

        const harness = await openExtensionHarness(context, extensionId);
        await page.bringToFront();

        const rotateState = await harness.evaluate(() => {
            return chrome.runtime.sendMessage({ type: "roter:rotate" });
        });

        expect(rotateState).toMatchObject({
            actionable: true,
            angle: 90,
            matchScrollDirection: false
        });
        await expect(page.locator("#roter-surface")).toHaveAttribute("data-roter-angle", "90");

        const disabledScrollState = await harness.evaluate(() => {
            return chrome.runtime.sendMessage({
                type: "roter:setMatchScrollDirection",
                enabled: false
            });
        });
        expect(disabledScrollState).toMatchObject({
            actionable: true,
            angle: 90,
            matchScrollDirection: false
        });

        const enabledScrollState = await harness.evaluate(() => {
            return chrome.runtime.sendMessage({
                type: "roter:setMatchScrollDirection",
                enabled: true
            });
        });
        expect(enabledScrollState).toMatchObject({
            actionable: true,
            angle: 90,
            matchScrollDirection: true
        });

        const matchedScrollBeforeWheel = await page.locator("#roter-viewport").evaluate((viewport) => {
            return {
                scrollLeft: viewport.scrollLeft,
                scrollTop: viewport.scrollTop
            };
        });
        expect(matchedScrollBeforeWheel.scrollLeft).toBeGreaterThan(0);
        await page.mouse.move(450, 300);
        await page.mouse.wheel(0, 120);
        const matchedScrollAfterWheel = await page.locator("#roter-viewport").evaluate((viewport) => {
            return {
                scrollLeft: viewport.scrollLeft,
                scrollTop: viewport.scrollTop
            };
        });
        expect(matchedScrollAfterWheel.scrollLeft).toBeLessThan(matchedScrollBeforeWheel.scrollLeft);
        expect(matchedScrollAfterWheel.scrollTop).toBe(matchedScrollBeforeWheel.scrollTop);

        const scrollTopBeforeWheel = await page.locator("#roter-viewport").evaluate((viewport) => {
            return viewport.scrollTop;
        });
        await expect.poll(async () => {
            return page.locator("#roter-viewport").evaluate((viewport) => {
                return viewport.scrollHeight - viewport.clientHeight;
            });
        }).toBeGreaterThan(0);
        await page.locator("#roter-viewport").evaluate((viewport) => {
            viewport.scrollTop += 120;
        });
        await expect(page.locator("#roter-viewport")).toHaveJSProperty("scrollTop", scrollTopBeforeWheel + 120);

        await page.locator("a[href='/same-origin.html']").click();
        await expect(page.locator("#same-origin-marker")).toBeVisible();
        await expect(page.locator("#roter-surface")).toHaveAttribute("data-roter-angle", "90");

        const resetState = await harness.evaluate(() => {
            return chrome.runtime.sendMessage({ type: "roter:reset" });
        });

        expect(resetState).toMatchObject({ actionable: true, angle: 0 });
        await expect(page.locator("#roter-surface")).toHaveCount(0);
    } finally {
        await context?.close();
        await server.close();
        await fs.rm(extensionDir, { force: true, recursive: true });
        await fs.rm(userDataDir, { force: true, recursive: true });
    }
});
