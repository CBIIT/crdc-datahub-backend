const yaml = require('js-yaml');
const fs = require('fs');
const {createEmailTemplate} = require("../lib/create-email-template");
const {replaceMessageVariables} = require("../utility/string-util");

class NotifyUser {

    constructor(emailService) {
        this.emailService = emailService;
        this.email_constants = undefined
        try {
            this.email_constants = yaml.load(fs.readFileSync('resources/yaml/notification_email_values.yaml', 'utf8'));
        } catch (e) {
            console.error(e)
        }
    }

    async send(fn){
        if (this.email_constants) return await fn();
        console.error("Unable to load email constants from file, email not sent");
    }

    async submitQuestionNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.SUBMISSION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email
            );
        });
    }

    async approveQuestionNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.APPROVE_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.APPROVE_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email
            );
        });
    }
}

module.exports = {
    NotifyUser
}