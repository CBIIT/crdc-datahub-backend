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

    async submitQuestionNotification(messageVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.SUBMISSION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, firstName: this.email_constants.APPLICATION_COMMITTEE_NAME
                }),
                this.email_constants.APPLICATION_COMMITTEE_EMAIL
            );
        });
    }

    async inactiveApplicationsNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_APPLICATION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.INACTIVE_APPLICATION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }

    async inquireQuestionNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INQUIRE_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.INQUIRE_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }

    async rejectQuestionNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REJECT_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.REJECT_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }

    async approveQuestionNotification(email, emailCCs,template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.APPROVE_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.APPROVE_SUBJECT,
                                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                emailCCs
            );
        });
    }

    async inactiveUserNotification(email, template_params, messageVariables, devTier) {
        const content = replaceMessageVariables(this.email_constants.INACTIVE_USER_CONTENT, messageVariables);
        const message = isTierAdded(devTier) ? `${devTier} ${content}` : content;
        const subject = this.email_constants.INACTIVE_USER_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(devTier) ? `${devTier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }

    async inactiveUserAdminNotification(email, template_params, messageVariables, devTier) {
        const content = replaceMessageVariables(this.email_constants.INACTIVE_ADMIN_USER_CONTENT, messageVariables);
        const message = isTierAdded(devTier) ? `${devTier} ${content}` : content;
        const subject = this.email_constants.INACTIVE_ADMIN_USER_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(devTier) ? `${devTier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }


    async remindApplicationsNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REMIND_EXPIRED_APPLICATION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.REMIND_EXPIRED_APPLICATION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }

    async submitDataSubmissionNotification(email, emailCCs,template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMIT_DATA_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.SUBMIT_DATA_SUBMISSION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                emailCCs
            );
        });
    }

    async completeSubmissionNotification(email, CCs, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.COMPLETE_DATA_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.COMPLETE_DATA_SUBMISSION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async cancelSubmissionNotification(email, CCs, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.CANCEL_DATA_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.CANCEL_DATA_SUBMISSION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async withdrawSubmissionNotification(email, CCs, template_params, messageVariables, devTier) {
        const message = replaceMessageVariables(this.email_constants.WITHDRAW_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.WITHDRAW_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(devTier) ? `${devTier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async rejectSubmissionNotification(email, CCs, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REJECT_DATA_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.REJECT_DATA_SUBMISSION_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }
}

const isTierAdded = (devTier) => {
    return devTier?.trim()?.length > 0
};

module.exports = {
    NotifyUser
}