(() => {
    const CONTROLLER_KEY = "__roterContentController";
    const STYLE_ID = "roter-style";
    const VIEWPORT_ID = "roter-viewport";
    const SURFACE_ID = "roter-surface";
    const MANAGED_CLASS = "roter-managed";
    const SUPPORTED_ANGLES = [0, 90, 180, 270];

    if (window[CONTROLLER_KEY]) {
        window[CONTROLLER_KEY].ensureReady();
        return;
    }

    let currentAngle = 0;
    let originalBodyStyle = null;
    let originalHtmlStyle = null;

    function normalizeAngle(angle) {
        return SUPPORTED_ANGLES.includes(angle) ? angle : 0;
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            html.${MANAGED_CLASS},
            body.${MANAGED_CLASS} {
                width: 100vw !important;
                height: 100vh !important;
                margin: 0 !important;
                overflow: hidden !important;
            }

            #${VIEWPORT_ID} {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                overflow: auto !important;
                z-index: 2147483647 !important;
                background: Canvas !important;
            }

            #${SURFACE_ID} {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                transform-origin: top left !important;
                transition: none !important;
            }

            #${SURFACE_ID}[data-roter-angle="0"] {
                width: 100vw !important;
                min-height: 100vh !important;
                transform: none !important;
            }

            #${SURFACE_ID}[data-roter-angle="90"] {
                width: 100vh !important;
                min-height: 100vw !important;
                transform: translateX(100vw) rotate(90deg) !important;
            }

            #${SURFACE_ID}[data-roter-angle="180"] {
                width: 100vw !important;
                min-height: 100vh !important;
                transform: translate(100vw, 100vh) rotate(180deg) !important;
            }

            #${SURFACE_ID}[data-roter-angle="270"] {
                width: 100vh !important;
                min-height: 100vw !important;
                transform: translateY(100vh) rotate(270deg) !important;
            }
        `;
        document.documentElement.append(style);
    }

    function captureOriginalStyles() {
        if (originalBodyStyle === null) {
            originalBodyStyle = document.body.getAttribute("style");
        }

        if (originalHtmlStyle === null) {
            originalHtmlStyle = document.documentElement.getAttribute("style");
        }
    }

    function restoreOriginalStyles() {
        if (originalBodyStyle === null) {
            document.body.removeAttribute("style");
        } else {
            document.body.setAttribute("style", originalBodyStyle);
        }

        if (originalHtmlStyle === null) {
            document.documentElement.removeAttribute("style");
        } else {
            document.documentElement.setAttribute("style", originalHtmlStyle);
        }
    }

    function ensureWrapper() {
        ensureStyle();
        captureOriginalStyles();

        let viewport = document.getElementById(VIEWPORT_ID);
        let surface = document.getElementById(SURFACE_ID);

        if (viewport && surface) {
            return surface;
        }

        viewport = document.createElement("div");
        viewport.id = VIEWPORT_ID;

        surface = document.createElement("div");
        surface.id = SURFACE_ID;
        surface.dataset.roterAngle = "0";

        const children = Array.from(document.body.childNodes).filter((node) => {
            return node !== viewport;
        });

        for (const child of children) {
            surface.append(child);
        }

        viewport.append(surface);
        document.body.append(viewport);

        return surface;
    }

    function unwrapIfReset() {
        const viewport = document.getElementById(VIEWPORT_ID);
        const surface = document.getElementById(SURFACE_ID);

        if (!viewport || !surface) {
            return;
        }

        while (surface.firstChild) {
            document.body.insertBefore(surface.firstChild, viewport);
        }

        viewport.remove();
        document.documentElement.classList.remove(MANAGED_CLASS);
        document.body.classList.remove(MANAGED_CLASS);
        restoreOriginalStyles();
    }

    function applyAngle(angle) {
        currentAngle = normalizeAngle(angle);

        if (currentAngle === 0) {
            unwrapIfReset();
            return { angle: currentAngle };
        }

        const surface = ensureWrapper();
        document.documentElement.classList.add(MANAGED_CLASS);
        document.body.classList.add(MANAGED_CLASS);
        surface.dataset.roterAngle = String(currentAngle);

        return { angle: currentAngle };
    }

    function reset() {
        return applyAngle(0);
    }

    function ensureReady() {
        if (currentAngle !== 0) {
            applyAngle(currentAngle);
        }
    }

    window[CONTROLLER_KEY] = {
        applyAngle,
        ensureReady,
        getState: () => ({ angle: currentAngle }),
        reset
    };

    browser.runtime.onMessage.addListener((request) => {
        if (request?.type === "roter:getState") {
            return Promise.resolve(window[CONTROLLER_KEY].getState());
        }

        if (request?.type === "roter:applyAngle") {
            return Promise.resolve(window[CONTROLLER_KEY].applyAngle(request.angle));
        }

        if (request?.type === "roter:reset") {
            return Promise.resolve(window[CONTROLLER_KEY].reset());
        }

        return undefined;
    });
})();
