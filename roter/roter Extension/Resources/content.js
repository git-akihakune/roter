(() => {
    const extensionApi = globalThis.browser ?? globalThis.chrome;
    const CONTROLLER_KEY = "__roterContentController";
    const STYLE_ID = "roter-style";
    const VIEWPORT_ID = "roter-viewport";
    const SURFACE_ID = "roter-surface";
    const SPACER_ID = "roter-scroll-spacer";
    const MANAGED_CLASS = "roter-managed";
    const OWNED_ATTRIBUTE = "data-roter-owned";
    const ROLE_ATTRIBUTE = "data-roter-role";
    const STYLE_ROLE = "style";
    const VIEWPORT_ROLE = "viewport";
    const SURFACE_ROLE = "surface";
    const SPACER_ROLE = "spacer";
    const SUPPORTED_ANGLES = [0, 90, 180, 270];

    if (window[CONTROLLER_KEY]) {
        window[CONTROLLER_KEY].ensureReady();
        return;
    }

    let currentAngle = 0;
    let matchScrollDirection = true;

    function normalizeAngle(angle) {
        return SUPPORTED_ANGLES.includes(angle) ? angle : 0;
    }

    function mapWheelDeltaForAngle(angle, wheelDelta) {
        const deltaX = wheelDelta?.deltaX ?? 0;
        const deltaY = wheelDelta?.deltaY ?? 0;

        switch (normalizeAngle(angle)) {
        case 90:
            return { scrollLeftDelta: -deltaY, scrollTopDelta: deltaX };
        case 180:
            return { scrollLeftDelta: -deltaX, scrollTopDelta: -deltaY };
        case 270:
            return { scrollLeftDelta: deltaY, scrollTopDelta: -deltaX };
        default:
            return { scrollLeftDelta: deltaX, scrollTopDelta: deltaY };
        }
    }

    function ownedSelector(id, role) {
        return `[id="${id}"][${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${role}"]`;
    }

    function getOwnedElement(id, role) {
        return document.querySelector(ownedSelector(id, role));
    }

    function getOwnedElements(id, role) {
        return Array.from(document.querySelectorAll(ownedSelector(id, role)));
    }

    function getOwnedWrapperPair() {
        const viewports = getOwnedElements(VIEWPORT_ID, VIEWPORT_ROLE);
        const surfaces = getOwnedElements(SURFACE_ID, SURFACE_ROLE);
        const spacers = getOwnedElements(SPACER_ID, SPACER_ROLE);

        for (const viewport of viewports) {
            const surface = surfaces.find((candidate) => {
                return candidate.parentNode === viewport;
            });

            if (surface) {
                const spacer = spacers.find((candidate) => {
                    return candidate.parentNode === viewport;
                }) ?? null;

                return { spacer, surface, viewport };
            }
        }

        return null;
    }

    function isOwnedNode(node) {
        return node.nodeType === Node.ELEMENT_NODE && node.getAttribute(OWNED_ATTRIBUTE) === "true";
    }

    function markOwned(element, role) {
        element.setAttribute(OWNED_ATTRIBUTE, "true");
        element.setAttribute(ROLE_ATTRIBUTE, role);
    }

    function handleWheel(event) {
        if (currentAngle === 0 || !matchScrollDirection) {
            return;
        }

        const viewport = getOwnedElement(VIEWPORT_ID, VIEWPORT_ROLE);

        if (!viewport) {
            return;
        }

        const { scrollLeftDelta, scrollTopDelta } = mapWheelDeltaForAngle(currentAngle, event);

        if (scrollLeftDelta === 0 && scrollTopDelta === 0) {
            return;
        }

        event.preventDefault();
        viewport.scrollLeft += scrollLeftDelta;
        viewport.scrollTop += scrollTopDelta;
    }

    function removeOwnedWrapperNodes(keptPair = null) {
        const keptSurface = keptPair?.surface ?? null;
        const keptViewport = keptPair?.viewport ?? null;
        const keptSpacer = keptPair?.spacer ?? null;
        const surfaces = getOwnedElements(SURFACE_ID, SURFACE_ROLE);
        const viewports = getOwnedElements(VIEWPORT_ID, VIEWPORT_ROLE);
        const spacers = getOwnedElements(SPACER_ID, SPACER_ROLE);

        for (const spacer of spacers) {
            if (spacer !== keptSpacer) {
                spacer.remove();
            }
        }

        for (const surface of surfaces) {
            if (surface === keptSurface) {
                continue;
            }

            const anchor = surface.closest(ownedSelector(VIEWPORT_ID, VIEWPORT_ROLE)) || surface;

            while (surface.firstChild) {
                if (anchor.parentNode) {
                    anchor.parentNode.insertBefore(surface.firstChild, anchor);
                } else {
                    document.body.append(surface.firstChild);
                }
            }

            surface.remove();
        }

        for (const viewport of viewports) {
            if (viewport === keptViewport) {
                continue;
            }

            while (viewport.firstChild) {
                if (viewport.parentNode) {
                    viewport.parentNode.insertBefore(viewport.firstChild, viewport);
                } else {
                    document.body.append(viewport.firstChild);
                }
            }

            viewport.remove();
        }
    }

    function removeOwnedStyles() {
        for (const style of getOwnedElements(STYLE_ID, STYLE_ROLE)) {
            style.remove();
        }
    }

    function ensureStyle() {
        if (getOwnedElement(STYLE_ID, STYLE_ROLE)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        markOwned(style, STYLE_ROLE);
        style.textContent = `
            html.${MANAGED_CLASS},
            body.${MANAGED_CLASS} {
                width: 100vw !important;
                height: 100vh !important;
                margin: 0 !important;
                overflow: hidden !important;
            }

            #${VIEWPORT_ID}[${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${VIEWPORT_ROLE}"] {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                overflow: auto !important;
                z-index: 2147483647 !important;
                background: Canvas !important;
            }

            #${SURFACE_ID}[${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${SURFACE_ROLE}"] {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                transform-origin: top left !important;
                transition: none !important;
            }

            #${SPACER_ID}[${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${SPACER_ROLE}"] {
                display: block !important;
                pointer-events: none !important;
                visibility: hidden !important;
            }

            #${SURFACE_ID}[${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${SURFACE_ROLE}"][data-roter-angle="0"] {
                width: 100vw !important;
                min-height: 100vh !important;
                transform: none !important;
            }

            #${SURFACE_ID}[${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${SURFACE_ROLE}"][data-roter-angle="90"] {
                width: 100vh !important;
                min-height: 100vw !important;
                transform: translateX(var(--roter-content-height, 100vw)) rotate(90deg) !important;
            }

            #${SURFACE_ID}[${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${SURFACE_ROLE}"][data-roter-angle="180"] {
                width: 100vw !important;
                min-height: 100vh !important;
                transform: translate(var(--roter-content-width, 100vw), var(--roter-content-height, 100vh)) rotate(180deg) !important;
            }

            #${SURFACE_ID}[${OWNED_ATTRIBUTE}="true"][${ROLE_ATTRIBUTE}="${SURFACE_ROLE}"][data-roter-angle="270"] {
                width: 100vh !important;
                min-height: 100vw !important;
                transform: translateY(var(--roter-content-width, 100vh)) rotate(270deg) !important;
            }
        `;
        document.documentElement.append(style);
    }

    function ensureWrapper() {
        ensureStyle();

        const existingPair = getOwnedWrapperPair();

        if (existingPair) {
            removeOwnedWrapperNodes(existingPair);
            if (!existingPair.spacer) {
                const spacer = document.createElement("div");
                spacer.id = SPACER_ID;
                markOwned(spacer, SPACER_ROLE);
                existingPair.viewport.insertBefore(spacer, existingPair.surface);
                existingPair.spacer = spacer;
            }

            return existingPair.surface;
        }

        removeOwnedWrapperNodes();

        const viewport = document.createElement("div");
        viewport.id = VIEWPORT_ID;
        markOwned(viewport, VIEWPORT_ROLE);

        const surface = document.createElement("div");
        surface.id = SURFACE_ID;
        markOwned(surface, SURFACE_ROLE);
        surface.dataset.roterAngle = "0";

        const spacer = document.createElement("div");
        spacer.id = SPACER_ID;
        markOwned(spacer, SPACER_ROLE);

        const children = Array.from(document.body.childNodes).filter((node) => {
            return !isOwnedNode(node);
        });

        for (const child of children) {
            surface.append(child);
        }

        viewport.append(spacer, surface);
        document.body.append(viewport);

        return surface;
    }

    function updateScrollSpacer(surface, angle) {
        const spacer = getOwnedElement(SPACER_ID, SPACER_ROLE);

        if (!spacer) {
            return;
        }

        const contentWidth = Math.max(surface.scrollWidth, window.innerWidth);
        const contentHeight = Math.max(surface.scrollHeight, window.innerHeight);
        const isSideways = angle === 90 || angle === 270;
        surface.style.setProperty("--roter-content-width", `${contentWidth}px`);
        surface.style.setProperty("--roter-content-height", `${contentHeight}px`);
        spacer.style.width = `${isSideways ? contentHeight : contentWidth}px`;
        spacer.style.height = `${isSideways ? contentWidth : contentHeight}px`;
    }

    function setInitialScrollForAngle(angle) {
        const viewport = getOwnedElement(VIEWPORT_ID, VIEWPORT_ROLE);

        if (!viewport) {
            return;
        }

        const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

        if (angle === 90) {
            viewport.scrollLeft = maxScrollLeft;
            viewport.scrollTop = 0;
            return;
        }

        if (angle === 180) {
            viewport.scrollLeft = maxScrollLeft;
            viewport.scrollTop = maxScrollTop;
            return;
        }

        if (angle === 270) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = maxScrollTop;
        }
    }

    function unwrapIfReset() {
        document.removeEventListener("wheel", handleWheel, { capture: true });
        removeOwnedWrapperNodes();
        removeOwnedStyles();
        document.documentElement.classList.remove(MANAGED_CLASS);
        document.body.classList.remove(MANAGED_CLASS);
    }

    function applyAngle(angle, options = {}) {
        const previousAngle = currentAngle;
        currentAngle = normalizeAngle(angle);
        matchScrollDirection = options.matchScrollDirection !== false;

        if (currentAngle === 0) {
            unwrapIfReset();
            return { angle: currentAngle };
        }

        const surface = ensureWrapper();
        document.addEventListener("wheel", handleWheel, {
            capture: true,
            passive: false
        });
        document.documentElement.classList.add(MANAGED_CLASS);
        document.body.classList.add(MANAGED_CLASS);
        surface.dataset.roterAngle = String(currentAngle);
        updateScrollSpacer(surface, currentAngle);
        if (previousAngle !== currentAngle) {
            setInitialScrollForAngle(currentAngle);
        }

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

    function addRuntimeMessageListener(handler) {
        extensionApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const response = handler(request, sender);

            if (response === undefined) {
                return false;
            }

            Promise.resolve(response).then(sendResponse);

            return true;
        });
    }

    window[CONTROLLER_KEY] = {
        applyAngle,
        ensureReady,
        getState: () => ({ angle: currentAngle }),
        reset
    };

    addRuntimeMessageListener((request) => {
        if (request?.type === "roter:getState") {
            return Promise.resolve(window[CONTROLLER_KEY].getState());
        }

        if (request?.type === "roter:applyAngle") {
            return Promise.resolve(window[CONTROLLER_KEY].applyAngle(request.angle, {
                matchScrollDirection: request.matchScrollDirection
            }));
        }

        if (request?.type === "roter:reset") {
            return Promise.resolve(window[CONTROLLER_KEY].reset());
        }

        return undefined;
    });
})();
