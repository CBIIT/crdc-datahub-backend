const yaml = require('js-yaml');
const fs = require('fs');
const {createEmailTemplate} = require("../lib/create-email-template");
const sanitizeHtml = require('sanitize-html');
const {replaceMessageVariables} = require("../utility/string-util");
const NOTIFICATION_USER_HTML_TEMPLATE = "notification-template-user.html";
const ROLE = "Role";
const DATA_COMMONS = "Data Commons";
const STUDIES = "Studies";
const CRDC_PORTAL_USER = "CRDC Submission Portal User";
const CRDC_SUBMISSION_PORTAL ="CRDC Submission Portal";
const USER_NAME = "User Name"
const ACCOUNT_TYPE = "Account Type";
const ACCOUNT_EMAIL = "Account Email";
const REQUESTED_ROLE = "Requested Role";
const ADDITIONAL_INFO = "Additional Info";
const AFFILIATED_ORGANIZATION = "Affiliated Organization";
const CRDC_PORTAL_ADMIN = "CRDC Submission Portal Admins";
class NotifyUser {

    constructor(emailService, committeeEmails) {
        this.emailService = emailService;
        this.email_constants = undefined
        try {
            this.email_constants = yaml.load(fs.readFileSync('resources/yaml/notification_email_values.yaml', 'utf8'));
        } catch (e) {
            console.error(e)
        }
        this.committeeEmails = committeeEmails;
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
                this.committeeEmails
            );
        });
    }

    async submitRequestReceivedNotification(email, messageVariables, templateParams, BCCs) {
        const message = replaceMessageVariables(this.email_constants.SUBMISSION_SUBMIT_RECEIVE_CONTENT_FIRST, {});
        const secondMessage = replaceMessageVariables(this.email_constants.SUBMISSION_SUBMIT_RECEIVE_CONTENT_SECOND, messageVariables);
        return await this.send(async () => {
            const res = await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                this.email_constants.SUBMISSION_SUBMIT_RECEIVE_SUBJECT,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, firstName: templateParams.userName
                }),
                email,
                [],
                BCCs
            );
            if (res?.accepted?.length === 0) {
                console.error(`Failed to send Submission Request Email Notifications: ${email}`);
            }
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
    async inquireQuestionNotification(email, emailCCs, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.INQUIRE_CONTENT, messageVariables);
        const subject = this.email_constants.INQUIRE_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                emailCCs
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

    async approveQuestionNotification(email, emailCCs,templateParams, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.APPROVE_CONTENT, messageVariables);
        const subject = this.email_constants.APPROVE_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...templateParams
                }),
                email,
                emailCCs
            );
        });
    }

    async conditionalApproveQuestionNotification(email, emailCCs, templateParams, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.CONDITIONAL_APPROVE_CONTENT_FIRST, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.CONDITIONAL_APPROVE_CONTENT_SECOND, messageVariables);
        const subject = this.email_constants.CONDITIONAL_APPROVE_SUBJECT;
        const approverNotes = templateParams?.approverNotes?.trim();
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-submission-request.html", {
                    firstName: templateParams?.firstName,
                    message,
                    secondMessage,
                    url: templateParams?.url,
                    approverNotes: approverNotes?.length > 0 ? approverNotes : "N/A",
                    contactEmail: templateParams?.contactEmail
                }),
                email,
                emailCCs
            );
        });
    }

    async userRoleChangeNotification(email, emailCCs, templateParams, messageVariables, tier) {
        const topMessage = replaceMessageVariables(this.email_constants.USER_ROLE_CHANGE_CONTENT_TOP, messageVariables);
        const bottomMessage = replaceMessageVariables(this.email_constants.USER_ROLE_CHANGE_CONTENT_BOTTOM, messageVariables);
        const subject = this.email_constants.USER_ROLE_CHANGE_SUBJECT;
        const additionalInfo = [
            [ACCOUNT_TYPE, templateParams.accountType?.toUpperCase()],
            [ACCOUNT_EMAIL, templateParams.email],
            ...(templateParams.role) ? [[ROLE, templateParams.role]] : [],
            ...(templateParams.org) ? [[AFFILIATED_ORGANIZATION, templateParams.org]] : [],
            ...(templateParams.dataCommons) ? [[DATA_COMMONS, templateParams.dataCommons]] : [],
            ...(templateParams.studies) ? [[STUDIES, templateParams.studies]] : [],
        ];
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate(NOTIFICATION_USER_HTML_TEMPLATE, {
                    topMessage, bottomMessage, ...{
                        firstName: CRDC_PORTAL_USER,
                        senderName: CRDC_SUBMISSION_PORTAL,
                        ...templateParams, additionalInfo}
                }),
                email,
                emailCCs
            );
        });
    }


    async inactiveUserNotification(email, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_USER_CONTENT, messageVariables);
        const subject = this.email_constants.INACTIVE_USER_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }

    async inactiveUserAdminNotification(email, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_ADMIN_USER_CONTENT, messageVariables);
        const subject = this.email_constants.INACTIVE_ADMIN_USER_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
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

    async releaseDataSubmissionNotification(emails, emailCCs,template_params, subjectVariables, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.RELEASE_DATA_SUBMISSION_CONTENT, messageVariables);
        const emailSubject = replaceMessageVariables(this.email_constants.RELEASE_DATA_SUBMISSION_SUBJECT, subjectVariables)
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${emailSubject}` : emailSubject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                emails,
                emailCCs
            );
        });
    }

    async submitDataSubmissionNotification(email, emailCCs,templateParams, messageVariables, subjectVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMIT_DATA_SUBMISSION_CONTENT_FIRST, {});
        const secondMessage = replaceMessageVariables(this.email_constants.SUBMIT_DATA_SUBMISSION_CONTENT_SECOND, messageVariables);
        const subject = this.email_constants.SUBMIT_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(subjectVariables) ? `${subjectVariables} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, ...templateParams
                }),
                email,
                emailCCs
            );
        });
    }

    async completeSubmissionNotification(email, CCs, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.COMPLETE_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.COMPLETE_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async cancelSubmissionNotification(email, CCs, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.CANCEL_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.CANCEL_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async withdrawSubmissionNotification(email, CCs, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.WITHDRAW_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.WITHDRAW_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async rejectSubmissionNotification(email, CCs, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.REJECT_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.REJECT_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async deactivateUserNotification(email, CCs, template_params, messageVariables, tier) {
        const message = replaceMessageVariables(this.email_constants.DEACTIVATE_USER_CONTENT, messageVariables);
        const subject = this.email_constants.DEACTIVATE_USER_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async inactiveSubmissionNotification(email, CCs, template_params, messageVariables, tier) {
        const subject = replaceMessageVariables(this.email_constants.INACTIVE_SUBMISSION_SUBJECT, messageVariables);
        const message = replaceMessageVariables(this.email_constants.INACTIVE_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCs
            );
        });
    }

    async requestUserAccessNotification(email, CCs, templateParams, tier) {
        const sanitizedAdditionalInfo = sanitizeHtml(templateParams.additionalInfo, {allowedTags: [],allowedAttributes: {}});
        const topMessage = replaceMessageVariables(this.email_constants.USER_REQUEST_ACCESS_CONTENT, {});
        const subject = this.email_constants.USER_REQUEST_ACCESS_SUBJECT;
        const additionalInfo = [
            [USER_NAME, templateParams.userName],
            [ACCOUNT_TYPE, templateParams.accountType?.toUpperCase()],
            [ACCOUNT_EMAIL, templateParams.email],
            ...(templateParams.role) ? [[REQUESTED_ROLE, templateParams.role]] : [],
            ...(templateParams.studies) ? [[STUDIES, templateParams.studies]] : [],
            ...(sanitizedAdditionalInfo) ? [[ADDITIONAL_INFO, sanitizedAdditionalInfo]] : []
        ];
        return await this.send(async () => {
            const res = await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate(NOTIFICATION_USER_HTML_TEMPLATE, {
                    topMessage, ...{
                        firstName: CRDC_PORTAL_ADMIN,
                        senderName: CRDC_SUBMISSION_PORTAL,
                        ...templateParams, additionalInfo}
                }),
                email,
                CCs
            );
            if (res?.accepted?.length === 0) {
                console.error(`Failed to send Request User Access Email Notifications: ${email.join(",")}`);
            }
            return res;
        });
    }

    async finalInactiveSubmissionNotification(email, CCs, template_params, messageVariables, tier) {
        const subject = replaceMessageVariables(this.email_constants.FINAL_INACTIVE_SUBMISSION_SUBJECT, messageVariables);
        const message = replaceMessageVariables(this.email_constants.FINAL_INACTIVE_SUBMISSION_CONTENT, messageVariables);
        const additionalMsg = this.email_constants.FINAL_INACTIVE_SUBMISSION_ADDITIONAL_CONTENT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(tier) ? `${tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...{...template_params, additionalMsg: additionalMsg}
                }),
                email,
                CCs
            );
        });
    }
}

const isTierAdded = (tier) => {
    return tier?.trim()?.length > 0
};

module.exports = {
    NotifyUser
}