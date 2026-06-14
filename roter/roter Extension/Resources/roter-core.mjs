export const SUPPORTED_ANGLES = [0, 90, 180, 270];

export function normalizeAngle(angle) {
    return SUPPORTED_ANGLES.includes(angle) ? angle : 0;
}

export function angleAfterRotate(angle) {
    const currentAngle = normalizeAngle(angle);
    const currentIndex = SUPPORTED_ANGLES.indexOf(currentAngle);
    return SUPPORTED_ANGLES[(currentIndex + 1) % SUPPORTED_ANGLES.length];
}

export function getOriginKey(urlString) {
    try {
        const url = new URL(urlString);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        return url.origin;
    } catch {
        return null;
    }
}

export function getOriginPermissionPattern(urlString) {
    try {
        const url = new URL(urlString);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        return `${url.protocol}//${url.hostname}/*`;
    } catch {
        return null;
    }
}

export function isSameOrigin(previousUrl, nextUrl) {
    const previousOrigin = getOriginKey(previousUrl);
    const nextOrigin = getOriginKey(nextUrl);

    return Boolean(previousOrigin && nextOrigin && previousOrigin === nextOrigin);
}

export function canAttemptRotation(urlString) {
    return Boolean(getOriginKey(urlString));
}

export function mapWheelDeltaForAngle(_angle, wheelDelta) {
    return {
        scrollLeftDelta: wheelDelta?.deltaX ?? 0,
        scrollTopDelta: wheelDelta?.deltaY ?? 0
    };
}
