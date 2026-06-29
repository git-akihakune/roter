import { needsOriginPermission, requestOriginPermissionForState } from "./popup-permissions.mjs";

const angleOutput = document.getElementById("angle");
const directionIndicator = document.getElementById("direction");
const matchScrollDirectionInput = document.getElementById("match-scroll-direction");
const rotateButton = document.getElementById("rotate");
const resetButton = document.getElementById("reset");
const extensionApi = globalThis.browser ?? globalThis.chrome;
let renderedAngle = 0;
let renderedState = { actionable: false, permitted: false, angle: 0 };

function setEnabled(enabled) {
    rotateButton.disabled = !enabled;
    resetButton.disabled = !enabled;
}

function renderState(state) {
    renderedState = state ?? { actionable: false, permitted: false, angle: 0 };
    const angle = state?.angle ?? 0;
    const matchScrollDirection = state?.matchScrollDirection !== false;
    angleOutput.value = `${angle}°`;
    angleOutput.textContent = `${angle}°`;
    matchScrollDirectionInput.checked = matchScrollDirection;
    directionIndicator.style.setProperty("--rotation-angle", `${angle}deg`);

    if (angle !== renderedAngle) {
        directionIndicator.classList.remove("is-updating");
        directionIndicator.offsetWidth;
        directionIndicator.classList.add("is-updating");
        renderedAngle = angle;
    }

    setEnabled(Boolean(state?.actionable));
}

async function sendCommand(type, payload = {}) {
    setEnabled(false);

    try {
        const state = await extensionApi.runtime.sendMessage({ type, ...payload });
        renderState(state);
    } catch {
        renderState({ actionable: false, angle: 0 });
    }
}

async function sendCommandWithPermission(type) {
    if (needsOriginPermission(renderedState)) {
        const granted = await requestOriginPermissionForState(extensionApi, renderedState);

        if (!granted) {
            renderState(renderedState);
            return;
        }
    }

    await sendCommand(type);
}

rotateButton.addEventListener("click", () => {
    sendCommandWithPermission("roter:rotate");
});

resetButton.addEventListener("click", () => {
    sendCommandWithPermission("roter:reset");
});

matchScrollDirectionInput.addEventListener("change", () => {
    sendCommand("roter:setMatchScrollDirection", {
        enabled: matchScrollDirectionInput.checked
    });
});

setEnabled(false);
sendCommand("roter:getStatus");
