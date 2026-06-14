import {
    angleAfterRotate,
    canAttemptRotation,
    getOriginKey,
    getOriginPermissionPattern,
    isSameOrigin,
    normalizeAngle
} from "./roter-core.mjs";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const tabStates = new Map();

function getStoredState(tabId) {
    return tabStates.get(tabId) ?? { angle: 0, origin: null, url: null };
}

function setStoredState(tabId, state) {
    tabStates.set(tabId, {
        angle: normalizeAngle(state.angle),
        origin: state.origin ?? null,
        url: state.url ?? null
    });
}

function clearStoredState(tabId) {
    tabStates.delete(tabId);
}

function hasTabId(tab) {
    return typeof tab?.id === "number";
}

function getResponseAngle(contentState) {
    if (typeof contentState?.angle !== "number") {
        return null;
    }

    const angle = normalizeAngle(contentState.angle);

    return angle === contentState.angle ? angle : null;
}

async function getActiveTab() {
    const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
}

async function hasOriginPermission(url) {
    const originPattern = getOriginPermissionPattern(url);

    if (!originPattern) {
        return false;
    }

    return extensionApi.permissions.contains({ origins: [originPattern] });
}

async function requestOriginPermission(url) {
    const originPattern = getOriginPermissionPattern(url);

    if (!originPattern) {
        return false;
    }

    return extensionApi.permissions.request({ origins: [originPattern] });
}

async function ensureContentController(tabId) {
    await extensionApi.scripting.executeScript({
        target: { tabId },
        files: [ "content.js" ]
    });
}

async function sendToTab(tabId, message) {
    return extensionApi.tabs.sendMessage(tabId, message);
}

async function resolveSafely(action) {
    try {
        return await action();
    } catch {
        return { actionable: false, permitted: false, angle: 0 };
    }
}

function addRuntimeMessageListener(handler) {
    extensionApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const response = handler(request, sender);

        if (response === undefined) {
            return false;
        }

        Promise.resolve(response).then(sendResponse, () => {
            sendResponse({ actionable: false, permitted: false, angle: 0 });
        });

        return true;
    });
}

async function getTabStatus(tab) {
    if (!hasTabId(tab) || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    const permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        return { actionable: true, permitted: false, angle: 0 };
    }

    const storedState = getStoredState(tab.id);
    const origin = getOriginKey(tab.url);
    const angle = storedState.origin === origin ? storedState.angle : 0;

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, {
            type: "roter:applyAngle",
            angle
        });
        const responseAngle = getResponseAngle(contentState);

        if (responseAngle === null) {
            return { actionable: false, permitted: true, angle: 0 };
        }

        setStoredState(tab.id, { angle: responseAngle, origin, url: tab.url });

        return {
            actionable: true,
            permitted: true,
            angle: responseAngle
        };
    } catch {
        return { actionable: false, permitted: true, angle: 0 };
    }
}

async function rotateActiveTab() {
    const tab = await getActiveTab();

    if (!hasTabId(tab) || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    let permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        permitted = await requestOriginPermission(tab.url);
    }

    if (!permitted) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    const origin = getOriginKey(tab.url);
    const storedState = getStoredState(tab.id);
    const previousAngle = storedState.origin === origin ? storedState.angle : 0;
    const nextAngle = angleAfterRotate(previousAngle);

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, {
            type: "roter:applyAngle",
            angle: nextAngle
        });
        const angle = getResponseAngle(contentState);

        if (angle === null) {
            return { actionable: false, permitted: true, angle: 0 };
        }

        setStoredState(tab.id, { angle, origin, url: tab.url });

        return { actionable: true, permitted: true, angle };
    } catch {
        return { actionable: false, permitted: true, angle: 0 };
    }
}

async function resetActiveTab() {
    const tab = await getActiveTab();

    if (!hasTabId(tab) || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    let permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        permitted = await requestOriginPermission(tab.url);
    }

    if (!permitted) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    const origin = getOriginKey(tab.url);

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, { type: "roter:reset" });
        const angle = getResponseAngle(contentState);

        if (angle === null) {
            return { actionable: false, permitted: true, angle: 0 };
        }

        setStoredState(tab.id, { angle, origin, url: tab.url });

        return { actionable: true, permitted: true, angle };
    } catch {
        return { actionable: false, permitted: true, angle: 0 };
    }
}

addRuntimeMessageListener((request) => {
    if (request?.type === "roter:getStatus") {
        return resolveSafely(async () => getTabStatus(await getActiveTab()));
    }

    if (request?.type === "roter:rotate") {
        return resolveSafely(rotateActiveTab);
    }

    if (request?.type === "roter:reset") {
        return resolveSafely(resetActiveTab);
    }

    return undefined;
});

async function reapplyStoredRotation(tabId, tab, completedUrl) {
    if (!tabStates.has(tabId)) {
        return;
    }

    const storedState = getStoredState(tabId);
    const url = completedUrl ?? tab?.url ?? storedState.url;

    if (!canAttemptRotation(url) || !isSameOrigin(storedState.url, url)) {
        clearStoredState(tabId);
        return;
    }

    if (storedState.angle === 0) {
        return;
    }

    const permitted = await hasOriginPermission(url);

    if (!permitted) {
        clearStoredState(tabId);
        return;
    }

    try {
        await ensureContentController(tabId);
        const contentState = await sendToTab(tabId, {
            type: "roter:applyAngle",
            angle: storedState.angle
        });
        const angle = getResponseAngle(contentState);

        if (angle === null) {
            clearStoredState(tabId);
            return;
        }

        setStoredState(tabId, { angle, origin: getOriginKey(url), url });
    } catch {
        clearStoredState(tabId);
    }
}

extensionApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tabStates.has(tabId)) {
        const storedState = getStoredState(tabId);

        if (!isSameOrigin(storedState.url, changeInfo.url)) {
            clearStoredState(tabId);
            return;
        }

        setStoredState(tabId, {
            angle: storedState.angle,
            origin: getOriginKey(changeInfo.url),
            url: changeInfo.url
        });
    }

    if (changeInfo.status !== "complete") {
        return;
    }

    void reapplyStoredRotation(tabId, tab, changeInfo.url);
});

extensionApi.tabs.onRemoved.addListener((tabId) => {
    clearStoredState(tabId);
});
