import assert from "node:assert/strict";
import test from "node:test";

import {
    angleAfterRotate,
    canAttemptRotation,
    getOriginKey,
    getOriginPermissionPattern,
    isSameOrigin,
    mapWheelDeltaForAngle,
    normalizeAngle
} from "../roter/roter Extension/Resources/roter-core.mjs";

test("normalizeAngle accepts only the four supported angles", () => {
    assert.equal(normalizeAngle(0), 0);
    assert.equal(normalizeAngle(90), 90);
    assert.equal(normalizeAngle(180), 180);
    assert.equal(normalizeAngle(270), 270);
    assert.equal(normalizeAngle(undefined), 0);
    assert.equal(normalizeAngle(45), 0);
    assert.equal(normalizeAngle("90"), 0);
});

test("angleAfterRotate cycles through all orientations", () => {
    assert.equal(angleAfterRotate(0), 90);
    assert.equal(angleAfterRotate(90), 180);
    assert.equal(angleAfterRotate(180), 270);
    assert.equal(angleAfterRotate(270), 0);
    assert.equal(angleAfterRotate(45), 90);
});

test("getOriginKey returns exact web origins", () => {
    assert.equal(getOriginKey("https://example.com/a/b"), "https://example.com");
    assert.equal(getOriginKey("http://localhost:8080/path"), "http://localhost:8080");
    assert.equal(getOriginKey("https://sub.example.com/path"), "https://sub.example.com");
});

test("getOriginKey rejects non-web and malformed URLs", () => {
    assert.equal(getOriginKey("safari-web-extension://abc/popup.html"), null);
    assert.equal(getOriginKey("about:blank"), null);
    assert.equal(getOriginKey("file:///Users/aki/example.html"), null);
    assert.equal(getOriginKey("not a url"), null);
});

test("getOriginPermissionPattern creates a valid host permission pattern", () => {
    assert.equal(getOriginPermissionPattern("https://example.com/a"), "https://example.com/*");
    assert.equal(getOriginPermissionPattern("http://localhost:3000/path"), "http://localhost/*");
    assert.equal(getOriginPermissionPattern("https://example.com:8443/path"), "https://example.com/*");
    assert.equal(getOriginPermissionPattern("about:blank"), null);
});

test("isSameOrigin compares exact origins", () => {
    assert.equal(isSameOrigin("https://example.com/a", "https://example.com/b"), true);
    assert.equal(isSameOrigin("https://example.com/a", "https://sub.example.com/a"), false);
    assert.equal(isSameOrigin("http://example.com/a", "https://example.com/a"), false);
    assert.equal(isSameOrigin("about:blank", "https://example.com/a"), false);
});

test("canAttemptRotation accepts only normal web pages", () => {
    assert.equal(canAttemptRotation("https://example.com/a"), true);
    assert.equal(canAttemptRotation("http://localhost:3000/a"), true);
    assert.equal(canAttemptRotation("about:blank"), false);
    assert.equal(canAttemptRotation("file:///tmp/page.html"), false);
    assert.equal(canAttemptRotation(undefined), false);
});

test("mapWheelDeltaForAngle rotates wheel movement with the page orientation", () => {
    assert.deepEqual(mapWheelDeltaForAngle(0, { deltaX: 3, deltaY: 7 }), {
        scrollLeftDelta: 3,
        scrollTopDelta: 7
    });
    assert.deepEqual(mapWheelDeltaForAngle(90, { deltaX: 3, deltaY: 7 }), {
        scrollLeftDelta: -7,
        scrollTopDelta: 3
    });
    assert.deepEqual(mapWheelDeltaForAngle(180, { deltaX: 3, deltaY: 7 }), {
        scrollLeftDelta: -3,
        scrollTopDelta: -7
    });
    assert.deepEqual(mapWheelDeltaForAngle(270, { deltaX: 3, deltaY: 7 }), {
        scrollLeftDelta: 7,
        scrollTopDelta: -3
    });
});
