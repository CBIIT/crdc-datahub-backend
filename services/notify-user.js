const yaml = require('js-yaml');
const fs = require('fs');
const {replaceMessageVariables} = require("../crdc-datahub-database-drivers/utility/string-utility");

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

    async submitQuestionNotification(messageVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.SUBMISSION_SUBJECT,
                {message, templateParams: {firstName: this.email_constants.APPLICATION_COMMITTEE_NAME}},
                this.email_constants.APPLICATION_COMMITTEE_EMAIL
            );
        });
    }

    async inactiveApplicationsNotification(email, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_APPLICATION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.INACTIVE_APPLICATION_SUBJECT,
                {message, templateParams},
                email,
                []
            );
        });
    }

    async rejectQuestionNotification(email, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REJECT_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.REJECT_SUBJECT,
                {message, templateParams},
                email,
                []
            );
        });
    }

    async approveQuestionNotification(email, emailCCs,templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.APPROVE_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.APPROVE_SUBJECT,
                {message, templateParams},
                email,
                emailCCs
            );
        });
    }

    async inactiveUserNotification(email, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_USER_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.INACTIVE_USER_SUBJECT,
                {message, templateParams},
                email,
                []
            );
        });
    }

    async inactiveUserAdminNotification(email, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_ADMIN_USER_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.INACTIVE_ADMIN_USER_SUBJECT,
                {message, templateParams},
                email,
                []
            );
        });
    }


    async remindApplicationsNotification(email, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REMIND_EXPIRED_APPLICATION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.REMIND_EXPIRED_APPLICATION_SUBJECT,
                {message, templateParams},
                email,
                []
            );
        });
    }

    async completeSubmissionNotification(email, CCs, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.COMPLETE_DATA_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.COMPLETE_DATA_SUBMISSION_SUBJECT,
                {message, templateParams},
                email,
                CCs
            );
        });
    }

    async cancelSubmissionNotification(email, CCs, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.CANCEL_DATA_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.CANCEL_DATA_SUBMISSION_SUBJECT,
                {message, templateParams},
                email,
                CCs
            );
        });
    }

    async withdrawSubmissionNotification(email, CCs, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.WITHDRAW_DATA_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.WITHDRAW_DATA_SUBMISSION_SUBJECT,
                {message, templateParams},
                email,
                CCs
            );
        });
    }
}

module.exports = {
    NotifyUser
}