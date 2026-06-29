import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("release workflow builds and publishes all browser artifacts", async () => {
    const workflow = await fs.readFile(
        path.join(repoRoot, ".github/workflows/release.yml"),
        "utf8"
    );

    assert.match(workflow, /npm run build:webextensions/);
    assert.match(workflow, /release:\s*\n\s+types:\s*\[\s*published\s*\]/);
    assert.match(workflow, /workflow_dispatch:/);

    for (const browser of ["safari", "chromium", "firefox"]) {
        assert.match(workflow, new RegExp(`dist/releases/roter-${browser}\\.zip`));
    }

    assert.match(workflow, /softprops\/action-gh-release/);
});
