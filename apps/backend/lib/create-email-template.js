const fsp = require('fs/promises');
const path = require('path');
const handlebars = require('handlebars');

// isArray is a helper function in this html template,
handlebars.registerHelper('isArray', function(value) {
    return Array.isArray(value);
});

// AND helper
handlebars.registerHelper('and', function () {
    return Array.from(arguments).slice(0, -1).every(Boolean);
});

// OR helper
handlebars.registerHelper('or', function () {
    return Array.from(arguments).slice(0, -1).some(Boolean);
});


async function createEmailTemplate(templateName, params, basePath = 'resources/email-templates') {
    const templatePath = path.resolve(basePath, templateName);
    const templateSource = await fsp.readFile(templatePath, "utf-8");
    return handlebars.compile(templateSource)(params);
}

module.exports = {createEmailTemplate}