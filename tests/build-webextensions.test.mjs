import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(repoRoot, "dist/webextensions");
const releaseRoot = path.join(repoRoot, "dist/releases");

async function readManifest(browser) {
    const manifestPath = path.join(distRoot, browser, "manifest.json");
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

test("build:webextensions creates Safari, Chromium, and Firefox artifacts", async () => {
    await fs.rm(path.join(repoRoot, "dist"), { force: true, recursive: true });

    await execFileAsync("npm", ["run", "build:webextensions"], {
        cwd: repoRoot
    });

    const safariManifest = await readManifest("safari");
    assert.deepEqual(safariManifest.background, {
        scripts: ["background.js"],
        type: "module"
    });
    assert.equal(safariManifest.host_permissions, undefined);
    assert.deepEqual(safariManifest.optional_host_permissions, ["<all_urls>"]);

    const chromiumManifest = await readManifest("chromium");
    assert.deepEqual(chromiumManifest.background, {
        service_worker: "background.js",
        type: "module"
    });
    assert.deepEqual(chromiumManifest.host_permissions, undefined);
    assert.deepEqual(chromiumManifest.optional_host_permissions, ["<all_urls>"]);

    const firefoxManifest = await readManifest("firefox");
    assert.deepEqual(firefoxManifest.background, {
        scripts: ["background.js"],
        type: "module"
    });
    assert.equal(firefoxManifest.host_permissions, undefined);
    assert.deepEqual(firefoxManifest.optional_host_permissions, ["<all_urls>"]);
    assert.deepEqual(firefoxManifest.browser_specific_settings.gecko, {
        id: "{8262c48d-51c6-48ec-92de-0db6dc521a8f}",
        strict_min_version: "128.0",
        data_collection_permissions: {
            required: ["none"]
        }
    });

    for (const browser of ["safari", "chromium", "firefox"]) {
        const popupPath = path.join(distRoot, browser, "popup.html");
        const archivePath = path.join(releaseRoot, `roter-${browser}.zip`);
        const archiveStats = await fs.stat(archivePath);

        assert.equal((await fs.stat(popupPath)).isFile(), true);
        assert.equal(archiveStats.isFile(), true);
        assert.equal(archiveStats.size > 0, true);
    }
});
