const fsp = require('fs/promises');
const path = require('path');
const { template } = require('lodash');

async function createEmailTemplate(templateName, params, basePath = 'resources/email-templates') {
    const templatePath = path.resolve(basePath, templateName);
    const templateSource = await fsp.readFile(templatePath, "utf-8");
    return template(templateSource)(params);
}

module.exports = {createEmailTemplate}