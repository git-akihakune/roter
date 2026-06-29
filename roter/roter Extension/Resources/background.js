import {
    angleAfterRotate,
    canAttemptRotation,
    getOriginKey,
    getOriginPermissionPattern,
    isSameOrigin,
    normalizeAngle
} from "./roter-core.mjs";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const MATCH_SCROLL_DIRECTION_KEY = "matchScrollDirection";
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

async function ensureContentController(tabId) {
    await extensionApi.scripting.executeScript({
        target: { tabId },
        files: [ "content.js" ]
    });
}

async function sendToTab(tabId, message) {
    return extensionApi.tabs.sendMessage(tabId, message);
}

async function getMatchScrollDirection() {
    const values = await extensionApi.storage.local.get({
        [MATCH_SCROLL_DIRECTION_KEY]: false
    });

    return values[MATCH_SCROLL_DIRECTION_KEY] !== false;
}

async function setMatchScrollDirection(matchScrollDirection) {
    const enabled = matchScrollDirection !== false;
    await extensionApi.storage.local.set({
        [MATCH_SCROLL_DIRECTION_KEY]: enabled
    });
    return enabled;
}

async function resolveSafely(action) {
    try {
        return await action();
    } catch {
        return { actionable: false, permitted: false, angle: 0 };
    }
}

function getUnpermittedState(url, matchScrollDirection) {
    return {
        actionable: true,
        permitted: false,
        angle: 0,
        matchScrollDirection,
        originPermissionPattern: getOriginPermissionPattern(url)
    };
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
    const matchScrollDirection = await getMatchScrollDirection();

    if (!hasTabId(tab) || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0, matchScrollDirection };
    }

    const permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        return getUnpermittedState(tab.url, matchScrollDirection);
    }

    const storedState = getStoredState(tab.id);
    const origin = getOriginKey(tab.url);
    const angle = storedState.origin === origin ? storedState.angle : 0;

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, {
            type: "roter:applyAngle",
            angle,
            matchScrollDirection
        });
        const responseAngle = getResponseAngle(contentState);

        if (responseAngle === null) {
            return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
        }

        setStoredState(tab.id, { angle: responseAngle, origin, url: tab.url });

        return {
            actionable: true,
            permitted: true,
            angle: responseAngle,
            matchScrollDirection
        };
    } catch {
        return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
    }
}

async function rotateActiveTab() {
    const tab = await getActiveTab();
    const matchScrollDirection = await getMatchScrollDirection();

    if (!hasTabId(tab) || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0, matchScrollDirection };
    }

    const permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        return getUnpermittedState(tab.url, matchScrollDirection);
    }

    const origin = getOriginKey(tab.url);
    const storedState = getStoredState(tab.id);
    const previousAngle = storedState.origin === origin ? storedState.angle : 0;
    const nextAngle = angleAfterRotate(previousAngle);

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, {
            type: "roter:applyAngle",
            angle: nextAngle,
            matchScrollDirection
        });
        const angle = getResponseAngle(contentState);

        if (angle === null) {
            return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
        }

        setStoredState(tab.id, { angle, origin, url: tab.url });

        return { actionable: true, permitted: true, angle, matchScrollDirection };
    } catch {
        return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
    }
}

async function resetActiveTab() {
    const tab = await getActiveTab();
    const matchScrollDirection = await getMatchScrollDirection();

    if (!hasTabId(tab) || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0, matchScrollDirection };
    }

    const permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        return getUnpermittedState(tab.url, matchScrollDirection);
    }

    const origin = getOriginKey(tab.url);

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, { type: "roter:reset" });
        const angle = getResponseAngle(contentState);

        if (angle === null) {
            return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
        }

        setStoredState(tab.id, { angle, origin, url: tab.url });

        return { actionable: true, permitted: true, angle, matchScrollDirection };
    } catch {
        return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
    }
}

async function setMatchScrollDirectionForActiveTab(enabled) {
    const matchScrollDirection = await setMatchScrollDirection(enabled);
    const tab = await getActiveTab();

    if (!hasTabId(tab) || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0, matchScrollDirection };
    }

    const permitted = await hasOriginPermission(tab.url);
    const storedState = getStoredState(tab.id);
    const origin = getOriginKey(tab.url);
    const angle = storedState.origin === origin ? storedState.angle : 0;

    if (!permitted) {
        return getUnpermittedState(tab.url, matchScrollDirection);
    }

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, {
            type: "roter:applyAngle",
            angle,
            matchScrollDirection
        });
        const responseAngle = getResponseAngle(contentState);

        if (responseAngle === null) {
            return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
        }

        setStoredState(tab.id, { angle: responseAngle, origin, url: tab.url });

        return { actionable: true, permitted: true, angle: responseAngle, matchScrollDirection };
    } catch {
        return { actionable: false, permitted: true, angle: 0, matchScrollDirection };
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

    if (request?.type === "roter:setMatchScrollDirection") {
        return resolveSafely(() => setMatchScrollDirectionForActiveTab(request.enabled));
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
        const matchScrollDirection = await getMatchScrollDirection();
        await ensureContentController(tabId);
        const contentState = await sendToTab(tabId, {
            type: "roter:applyAngle",
            angle: storedState.angle,
            matchScrollDirection
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
