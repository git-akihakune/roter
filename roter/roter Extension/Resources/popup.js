const angleOutput = document.getElementById("angle");
const rotateButton = document.getElementById("rotate");
const resetButton = document.getElementById("reset");

function setEnabled(enabled) {
    rotateButton.disabled = !enabled;
    resetButton.disabled = !enabled;
}

function renderState(state) {
    const angle = state?.angle ?? 0;
    angleOutput.value = `${angle}°`;
    angleOutput.textContent = `${angle}°`;
    setEnabled(Boolean(state?.actionable));
}

async function sendCommand(type) {
    setEnabled(false);

    try {
        const state = await browser.runtime.sendMessage({ type });
        renderState(state);
    } catch {
        renderState({ actionable: false, angle: 0 });
    }
}

rotateButton.addEventListener("click", () => {
    sendCommand("roter:rotate");
});

resetButton.addEventListener("click", () => {
    sendCommand("roter:reset");
});

sendCommand("roter:getStatus");
