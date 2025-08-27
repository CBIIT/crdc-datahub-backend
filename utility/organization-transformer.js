/**
 * Utility functions for transforming organization data between Prisma and GraphQL formats
 */

/**
 * Formats a nested organization object from Prisma format (with 'id' field) 
 * to GraphQL format (with '_id' field)
 * 
 * @param {Object} org - Organization object from Prisma with 'id' field
 * @returns {Object|null} - Organization object with '_id' field, or null if input is null/undefined
 */
function formatNestedOrganization(org) {
    if (!org) {
        return null;
    }
    
    return {
        _id: org.id,
        name: org.name,
        abbreviation: org.abbreviation
    };
}

/**
 * Formats an array of nested organization objects from Prisma format to GraphQL format
 * 
 * @param {Array} organizations - Array of organization objects from Prisma
 * @returns {Array} - Array of organization objects with '_id' field
 */
function formatNestedOrganizations(organizations) {
    if (!Array.isArray(organizations)) {
        return [];
    }
    
    return organizations.map(org => formatNestedOrganization(org));
}

module.exports = {
    formatNestedOrganization,
    formatNestedOrganizations
};
