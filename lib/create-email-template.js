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

// nlToBr helper: converts newlines to <br> for compatibility
handlebars.registerHelper('nlToBr', function (text) {
    if (!text) {
        return '';
    }
    const escaped = handlebars.Utils.escapeExpression(text);
    return new handlebars.SafeString(escaped.replace(/\n/g, '<br>'));
});


async function createEmailTemplate(templateName, params, basePath = 'resources/email-templates') {
    const templatePath = path.resolve(basePath, templateName);
    const templateSource = await fsp.readFile(templatePath, "utf-8");
    return handlebars.compile(templateSource)(params);
}

module.exports = {createEmailTemplate}