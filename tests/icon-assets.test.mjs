import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const resourcesDir = path.join("roter", "roter Extension", "Resources");
const manifest = JSON.parse(fs.readFileSync(path.join(resourcesDir, "manifest.json"), "utf8"));

test("toolbar icon uses a custom rotation glyph", () => {
    assert.equal(manifest.action.default_icon, "images/toolbar-icon.svg");

    const toolbarIcon = fs.readFileSync(path.join(resourcesDir, manifest.action.default_icon), "utf8");

    assert.match(toolbarIcon, /roter-toolbar-icon/);
    assert.doesNotMatch(toolbarIcon, /L4\.53906 8\.50781/);
});
