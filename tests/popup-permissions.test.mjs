import assert from "node:assert/strict";
import test from "node:test";

import {
    needsOriginPermission,
    requestOriginPermissionForState
} from "../roter/roter Extension/Resources/popup-permissions.mjs";

test("needsOriginPermission identifies actionable tabs waiting for host access", () => {
    assert.equal(needsOriginPermission({
        actionable: true,
        permitted: false,
        originPermissionPattern: "https://example.com/*"
    }), true);

    assert.equal(needsOriginPermission({
        actionable: true,
        permitted: true,
        originPermissionPattern: "https://example.com/*"
    }), false);

    assert.equal(needsOriginPermission({
        actionable: false,
        permitted: false,
        originPermissionPattern: "https://example.com/*"
    }), false);

    assert.equal(needsOriginPermission({
        actionable: true,
        permitted: false
    }), false);
});

test("requestOriginPermissionForState requests the origin pattern from the popup context", async () => {
    const calls = [];
    const extensionApi = {
        permissions: {
            request: async (request) => {
                calls.push(request);
                return true;
            }
        }
    };

    const granted = await requestOriginPermissionForState(extensionApi, {
        actionable: true,
        permitted: false,
        originPermissionPattern: "https://example.com/*"
    });

    assert.equal(granted, true);
    assert.deepEqual(calls, [
        { origins: ["https://example.com/*"] }
    ]);
});

test("requestOriginPermissionForState skips non-actionable states", async () => {
    const extensionApi = {
        permissions: {
            request: async () => {
                throw new Error("should not request");
            }
        }
    };

    const granted = await requestOriginPermissionForState(extensionApi, {
        actionable: false,
        permitted: false,
        originPermissionPattern: "https://example.com/*"
    });

    assert.equal(granted, false);
});
