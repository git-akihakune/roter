export function needsOriginPermission(state) {
    return Boolean(
        state?.actionable &&
        state.permitted === false &&
        typeof state.originPermissionPattern === "string"
    );
}

export async function requestOriginPermissionForState(extensionApi, state) {
    if (!needsOriginPermission(state)) {
        return false;
    }

    try {
        return await extensionApi.permissions.request({
            origins: [state.originPermissionPattern]
        });
    } catch {
        return false;
    }
}
