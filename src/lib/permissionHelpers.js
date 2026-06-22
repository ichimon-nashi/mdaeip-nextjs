// src/lib/permissionHelpers.js
// Permission helper functions for MDAEIP app

/**
 * Check if user is a special admin (full access to everything)
 * admin employee ID or 51892 always bypass all permission checks
 */
export const isSpecialAdmin = (user) => {
	if (!user) return false;
	return user.id === "admin" || user.id === "51892";
};

/**
 * Check if user has access to a specific app
 * Special admins always get access regardless of stored permissions
 *
 * @param {object} user - user object from AuthContext
 * @param {string} appName - key from app_permissions
 * @returns {boolean}
 */
export const hasAppAccess = (user, appName) => {
	if (!user) return false;
	if (isSpecialAdmin(user)) return true;
	return user.app_permissions?.[appName]?.access === true;
};

/**
 * Check if user is a ground staff role.
 * Used only for post-login redirect logic — NOT for drawer visibility.
 * Drawer visibility is always permission-key driven via hasAppAccess.
 *
 * BUG FOUND 2026-06-22: this checked user.role, but /api/users/profile
 * (the endpoint AuthContext actually calls to populate the user object)
 * selects "id, name, rank, base, access_level, app_permissions, gender,
 * avatar_gif" — there is no "role" column returned at all. user.role was
 * therefore ALWAYS undefined for every user, meaning this function could
 * never return true for anyone, ground staff or not — the redirect to
 * /ground-schedule never fired for any real account. Fixed to check the
 * field that's actually present: user.rank.
 *
 * @param {object} user - user object from AuthContext
 * @returns {boolean}
 */
export const isGroundStaff = (user) => {
	if (!user) return false;
	return ['運務員', '地勤督導', '地勤組長', '地勤經理'].includes(user.rank);
};