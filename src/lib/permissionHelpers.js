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