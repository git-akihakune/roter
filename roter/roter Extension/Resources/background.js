import {
    angleAfterRotate,
    canAttemptRotation,
    getOriginKey,
    getOriginPermissionPattern,
    isSameOrigin,
    normalizeAngle
} from "./roter-core.mjs";

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

async function getActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
}

async function hasOriginPermission(url) {
    const originPattern = getOriginPermissionPattern(url);

    if (!originPattern) {
        return false;
    }

    return browser.permissions.contains({ origins: [originPattern] });
}

async function requestOriginPermission(url) {
    const originPattern = getOriginPermissionPattern(url);

    if (!originPattern) {
        return false;
    }

    return browser.permissions.request({ origins: [originPattern] });
}

async function ensureContentController(tabId) {
    await browser.scripting.executeScript({
        target: { tabId },
        files: [ "content.js" ]
    });
}

async function sendToTab(tabId, message) {
    return browser.tabs.sendMessage(tabId, message);
}

async function getTabStatus(tab) {
    if (!tab?.id || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    const permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        return { actionable: true, permitted: false, angle: 0 };
    }

    const storedState = getStoredState(tab.id);
    const origin = getOriginKey(tab.url);
    const angle = storedState.origin === origin ? storedState.angle : 0;

    setStoredState(tab.id, { angle, origin, url: tab.url });

    try {
        await ensureContentController(tab.id);
        const contentState = await sendToTab(tab.id, {
            type: "roter:applyAngle",
            angle
        });

        return {
            actionable: true,
            permitted: true,
            angle: normalizeAngle(contentState?.angle)
        };
    } catch {
        return { actionable: false, permitted: true, angle: 0 };
    }
}

async function rotateActiveTab() {
    const tab = await getActiveTab();

    if (!tab?.id || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    let permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        permitted = await requestOriginPermission(tab.url);
    }

    if (!permitted) {
        return { actionable: true, permitted: false, angle: 0 };
    }

    const origin = getOriginKey(tab.url);
    const storedState = getStoredState(tab.id);
    const previousAngle = storedState.origin === origin ? storedState.angle : 0;
    const nextAngle = angleAfterRotate(previousAngle);

    await ensureContentController(tab.id);
    const contentState = await sendToTab(tab.id, {
        type: "roter:applyAngle",
        angle: nextAngle
    });
    const angle = normalizeAngle(contentState?.angle ?? nextAngle);

    setStoredState(tab.id, { angle, origin, url: tab.url });

    return { actionable: true, permitted: true, angle };
}

async function resetActiveTab() {
    const tab = await getActiveTab();

    if (!tab?.id || !canAttemptRotation(tab.url)) {
        return { actionable: false, permitted: false, angle: 0 };
    }

    let permitted = await hasOriginPermission(tab.url);

    if (!permitted) {
        permitted = await requestOriginPermission(tab.url);
    }

    if (!permitted) {
        return { actionable: true, permitted: false, angle: 0 };
    }

    const origin = getOriginKey(tab.url);

    await ensureContentController(tab.id);
    const contentState = await sendToTab(tab.id, { type: "roter:reset" });
    const angle = normalizeAngle(contentState?.angle);

    setStoredState(tab.id, { angle, origin, url: tab.url });

    return { actionable: true, permitted: true, angle };
}

browser.runtime.onMessage.addListener((request) => {
    if (request?.type === "roter:getStatus") {
        return getActiveTab().then(getTabStatus);
    }

    if (request?.type === "roter:rotate") {
        return rotateActiveTab();
    }

    if (request?.type === "roter:reset") {
        return resetActiveTab();
    }

    return undefined;
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url) {
        return;
    }

    const storedState = getStoredState(tabId);

    if (!storedState.url) {
        setStoredState(tabId, {
            angle: storedState.angle,
            origin: getOriginKey(changeInfo.url),
            url: changeInfo.url
        });
        return;
    }

    if (!isSameOrigin(storedState.url, changeInfo.url)) {
        clearStoredState(tabId);
        return;
    }

    setStoredState(tabId, {
        angle: storedState.angle,
        origin: getOriginKey(changeInfo.url),
        url: changeInfo.url
    });
});

browser.tabs.onRemoved.addListener((tabId) => {
    clearStoredState(tabId);
});
