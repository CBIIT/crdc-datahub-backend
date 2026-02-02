const yaml = require('js-yaml');
const fs = require('fs');
const {createEmailTemplate} = require("../lib/create-email-template");
const sanitizeHtml = require('sanitize-html');
const {replaceMessageVariables} = require("../utility/string-util");
const NOTIFICATION_USER_HTML_TEMPLATE = "notification-template-user.html";
const ROLE = "Role";
const DATA_COMMONS = "Data Commons";
const STUDIES = "Studies";
const INSTITUTION = "Institution";
const CRDC_PORTAL_USER = "CRDC Submission Portal User";
const CRDC_SUBMISSION_PORTAL ="CRDC Submission Portal";
const USER_NAME = "User Name"
const ACCOUNT_TYPE = "Account Type";
const ACCOUNT_EMAIL = "Account Email";
const REQUESTED_ROLE = "Requested Role";
const ADDITIONAL_INFO = "Additional Info";
const AFFILIATED_INSTITUTION = "Affiliated Institution";

const SUBMITTER_NAME = "Submitter Name";
const SUBMITTER_EMAIL = "Submitter Email";
const STUDY_NAME = "Study Name";
const STUDY_ABBREVIATION = "Study Abbreviation";
const DATA_SUBMISSION_ID = "Data Submission ID";
const NODE = "Node";
const PROPERTY = "Property";
const CDE_ID = "CDE ID";
const REQUESTED_PERMISSIVE_VALUE = "Requested Permissive Value";
const JUSTIFICATION = "Justification";

class NotifyUser {

    constructor(emailService, tier) {
        this.emailService = emailService;
        this.email_constants = undefined
        try {
            this.email_constants = yaml.load(fs.readFileSync('resources/yaml/notification_email_values.yaml', 'utf8'));
        } catch (e) {
            console.error(e)
        }
        this.tier = tier;
    }

    async send(fn){
        if (this.email_constants) return await fn();
        console.error("Unable to load email constants from file, email not sent");
    }

    async submitQuestionNotification(toEmails, CCEmails, BCCEmails, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMISSION_SUBMIT_FIRST_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.SUBMISSION_SUBMIT_SECOND_CONTENT, messageVariables);
        const subject = this.email_constants.SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, firstName: this.email_constants.APPLICATION_COMMITTEE_NAME
                }),
                toEmails,
                CCEmails,
                BCCEmails
            );
        });
    }

    async submitRequestReceivedNotification(email, CCEmails, BCCsEmails, messageVariables, templateParams) {
        const message = replaceMessageVariables(this.email_constants.SUBMISSION_SUBMIT_RECEIVE_CONTENT_FIRST, {});
        const secondMessage = replaceMessageVariables(this.email_constants.SUBMISSION_SUBMIT_RECEIVE_CONTENT_SECOND, messageVariables);
        const subject = this.email_constants.SUBMISSION_SUBMIT_RECEIVE_SUBJECT;
        return await this.send(async () => {
            const res = await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, firstName: templateParams.userName
                }),
                email,
                CCEmails,
                BCCsEmails
            );
            if (res?.accepted?.length === 0) {
                console.error(`Failed to send Submission Request Email Notifications: ${email}`);
            }
        });
    }

    async inactiveApplicationsNotification(email, CCEmails, BCCEmails, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_APPLICATION_CONTENT, messageVariables);
        const subject = this.email_constants.INACTIVE_APPLICATION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async cancelApplicationNotification(email, CCEmails, BCCsEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.CANCEL_APPLICATION_CONTENT, messageVariables);
        const subject = this.email_constants.CANCEL_APPLICATION_SUBJECT;
        return await this.send(async () => {
            const res = await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, firstName: templateParams.firstName
                }),
                email,
                CCEmails,
                BCCsEmails
            );
            if (res?.accepted?.length === 0) {
                console.error(`Failed to send Cancel Submission Request Email Notifications: ${email}`);
            }
        });
    }

    async restoreApplicationNotification(email, CCEmails, BCCsEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.RESTORE_APPLICATION_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.RESTORE_APPLICATION_SECOND_CONTENT, messageVariables);
        const thirdMessage = replaceMessageVariables(this.email_constants.RESTORE_APPLICATION_THIRD_CONTENT, messageVariables);
        const subject = this.email_constants.RESTORE_APPLICATION_SUBJECT;
        return await this.send(async () => {
            const res = await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, thirdMessage, firstName: templateParams.firstName
                }),
                email,
                CCEmails,
                BCCsEmails
            );
            if (res?.accepted?.length === 0) {
                console.error(`Failed to send Restore Submission Request Email Notifications: ${email}`);
            }
        });
    }

    async inquireQuestionNotification(email, CCEmails, BCCEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INQUIRE_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.INQUIRE_SECOND_CONTENT, messageVariables);
        const subject = this.email_constants.INQUIRE_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, ...templateParams
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async rejectQuestionNotification(email, toCCEmails, toBCCEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REJECT_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.REJECT_SECOND_CONTENT, {});
        const subject = this.email_constants.REJECT_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, ...templateParams
                }),
                email,
                toCCEmails,
                toBCCEmails
            );
        });
    }

    async approveQuestionNotification(email, CCEmails, BCCEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.APPROVE_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.APPROVE_SECOND_CONTENT, messageVariables);
        const thirdMessage = replaceMessageVariables(this.email_constants.APPROVE_THIRD_CONTENT, messageVariables);
        const subject = this.email_constants.APPROVE_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, thirdMessage, ...templateParams
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async dbGapMissingApproveQuestionNotification(email, CCEmails, BCCEmails, templateParams) {
        const subject = this.email_constants.APPROVE_SUBJECT;
        const topMessage = replaceMessageVariables(this.email_constants.SINGLE_PENDING_PENDING_TOP_MESSAGE, templateParams);
        const dataModelPendingCondition = replaceMessageVariables(this.email_constants.MISSING_DBGAP_PENDING_CHANGE, templateParams);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-SR-pending-conditions.html", {
                    pendingConditions: [dataModelPendingCondition],
                    topMessage,
                    ...templateParams}),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async pendingGPANotification(email, CCEmails, BCCEmails, templateParams) {
        const subject = this.email_constants.APPROVE_SUBJECT;
        const topMessage = replaceMessageVariables(this.email_constants.SINGLE_PENDING_PENDING_TOP_MESSAGE, templateParams);
        const GPAPendingCondition = replaceMessageVariables(this.email_constants.MISSING_GPA_INFO, templateParams);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-SR-pending-conditions.html", {
                    pendingConditions: [GPAPendingCondition],
                    topMessage,
                    ...templateParams
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }


    async dataModelChangeApproveQuestionNotification(email, CCEmails, BCCEmails, templateParams) {
        const subject = this.email_constants.APPROVE_SUBJECT;
        const topMessage = replaceMessageVariables(this.email_constants.SINGLE_PENDING_PENDING_TOP_MESSAGE, templateParams);
        const dataModelPendingCondition = replaceMessageVariables(this.email_constants.DATA_MODEL_PENDING_CHANGE, {});
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-SR-pending-conditions.html", {
                    pendingConditions: [dataModelPendingCondition],
                    topMessage,
                    ...templateParams
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async multipleChangesApproveQuestionNotification(email, CCEmails, BCCEmails, templateParams, isDbGapMissing, isPendingModelChange, isPendingGPA) {
        const subject = this.email_constants.APPROVE_SUBJECT;
        const topMessage = replaceMessageVariables(this.email_constants.CONDITIONAL_PENDING_MULTIPLE_CHANGES, templateParams);
        const dataModelPendingCondition = replaceMessageVariables(this.email_constants.DATA_MODEL_PENDING_CHANGE, {});
        const missingDbGapPendingCondition = replaceMessageVariables(this.email_constants.MISSING_DBGAP_PENDING_CHANGE_MULTIPLE, templateParams);
        const missingGPAPendingCondition = replaceMessageVariables(this.email_constants.MISSING_GPA_INFO, templateParams);
        // Only include valid pending conditions
        const pendingConditions = [
            isDbGapMissing && missingDbGapPendingCondition,
            isPendingModelChange && dataModelPendingCondition,
            isPendingGPA && missingGPAPendingCondition,
        ].filter(Boolean);

        if (pendingConditions.length === 0) {
            console.warn(`Sending Approve Question Email Notification to ${email} with no pending conditions.`);
        }

        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-SR-pending-conditions.html", {
                    pendingConditions: pendingConditions,
                    topMessage,
                    ...templateParams
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async userRoleChangeNotification(email, templateParams, messageVariables) {
        const topMessage = replaceMessageVariables(this.email_constants.USER_ROLE_CHANGE_CONTENT_TOP, messageVariables);
        const bottomMessage = replaceMessageVariables(this.email_constants.USER_ROLE_CHANGE_CONTENT_BOTTOM, messageVariables);
        const subject = this.email_constants.USER_ROLE_CHANGE_SUBJECT;
        const additionalInfo = [
            [ACCOUNT_TYPE, templateParams.accountType?.toUpperCase()],
            [ACCOUNT_EMAIL, templateParams.email],
            ...(templateParams.role) ? [[ROLE, templateParams.role]] : [],
            ...(templateParams.dataCommons) ? [[DATA_COMMONS, templateParams.dataCommons]] : [],
            ...(templateParams?.studies?.length > 0) ? [[STUDIES, templateParams.studies]] : [],
            ...(templateParams?.institution) ? [[INSTITUTION, templateParams.institution]] : [],
        ];
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate(NOTIFICATION_USER_HTML_TEMPLATE, {
                    topMessage, bottomMessage, ...{
                        firstName: CRDC_PORTAL_USER,
                        senderName: CRDC_SUBMISSION_PORTAL,
                        ...templateParams, additionalInfo}
                }),
                email
            );
        });
    }


    async inactiveUserNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_USER_CONTENT, messageVariables);
        const subject = this.email_constants.INACTIVE_USER_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                []
            );
        });
    }

    async inactiveUserAdminNotification(email, BCCEmails, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.INACTIVE_ADMIN_USER_CONTENT, messageVariables);
        const subject = this.email_constants.INACTIVE_ADMIN_USER_SUBJECT;
        const recipientName = this.email_constants.INACTIVE_ADMIN_USER_RECIPIENT_NAME;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params, firstName: recipientName
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async deleteSubmissionNotification(email, BCCEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMISSION_FIRST_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.SUBMISSION_SECOND_CONTENT, messageVariables);
        const subject = this.email_constants.DELETE_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, ...templateParams
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async remindNoPrimaryContact(toEmails, CCEmails, templateParams) {
        const subject = replaceMessageVariables(this.email_constants.REMIND_PRIMARY_CONTACT_SUBJECT, templateParams);
        return await this.send(async () => {
            return await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-submission.html", templateParams),
                toEmails,
                CCEmails
            );
        });
    }

    async remindApplicationsNotification(email, CCEmails, BCCEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REMIND_EXPIRED_APPLICATION_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.REMIND_EXPIRED_APPLICATION_SECOND_CONTENT, messageVariables);
        const subject = replaceMessageVariables(this.email_constants.REMIND_EXPIRED_APPLICATION_SUBJECT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, ...templateParams
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async finalRemindApplicationsNotification(email, CCEmails, BCCEmails, templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.FINAL_INACTIVE_APPLICATION_CONTENT, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.FINAL_INACTIVE_APPLICATION_SECOND_CONTENT, messageVariables);
        const thirdMessage = replaceMessageVariables(this.email_constants.FINAL_INACTIVE_APPLICATION_THIRD_CONTENT, messageVariables);
        const subject = this.email_constants.FINAL_INACTIVE_APPLICATION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, thirdMessage, ...templateParams
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async releaseDataSubmissionNotification(emails, BCCsEmails,template_params, subjectVariables, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.RELEASE_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = replaceMessageVariables(this.email_constants.RELEASE_DATA_SUBMISSION_SUBJECT, subjectVariables)
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                emails,
                [],
                BCCsEmails
            );
        });
    }

    async submitDataSubmissionNotification(email, BCCEmails,templateParams, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.SUBMIT_DATA_SUBMISSION_CONTENT_FIRST, messageVariables);
        const secondMessage = replaceMessageVariables(this.email_constants.SUBMIT_DATA_SUBMISSION_CONTENT_SECOND, messageVariables);
        const subject = this.email_constants.SUBMIT_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, secondMessage, ...templateParams
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async completeSubmissionNotification(email, BCCEmails, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.COMPLETE_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.COMPLETE_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async cancelSubmissionNotification(email, BCCEmails, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.CANCEL_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.CANCEL_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async withdrawSubmissionNotification(email, BCCEmails, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.WITHDRAW_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.WITHDRAW_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async rejectSubmissionNotification(email, BCCEmails, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.REJECT_DATA_SUBMISSION_CONTENT, messageVariables);
        const subject = this.email_constants.REJECT_DATA_SUBMISSION_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async deactivateUserNotification(email, template_params, messageVariables) {
        const message = replaceMessageVariables(this.email_constants.DEACTIVATE_USER_CONTENT, messageVariables);
        const subject = this.email_constants.DEACTIVATE_USER_SUBJECT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email
            );
        });
    }

    async inactiveSubmissionNotification(email, BCCEmails, template_params, messageVariables) {
        const subject = replaceMessageVariables(this.email_constants.INACTIVE_SUBMISSION_SUBJECT, messageVariables);
        const message = replaceMessageVariables(this.email_constants.INACTIVE_SUBMISSION_CONTENT, messageVariables);
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...template_params
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async requestUserAccessNotification(email, templateParams) {
        const sanitizedAdditionalInfo = sanitizeHtml(templateParams.additionalInfo, {allowedTags: [],allowedAttributes: {}});
        const topMessage = replaceMessageVariables(this.email_constants.USER_REQUEST_ACCESS_CONTENT, {});
        const subject = this.email_constants.USER_REQUEST_ACCESS_SUBJECT;
        const additionalInfo = [
            [USER_NAME, templateParams.userName],
            [ACCOUNT_TYPE, templateParams.accountType?.toUpperCase()],
            [ACCOUNT_EMAIL, templateParams.email],
            ...(templateParams.role) ? [[REQUESTED_ROLE, templateParams.role]] : [],
            ...(templateParams.institutionName) ? [[AFFILIATED_INSTITUTION, templateParams.institutionName]] : [],
            ...(templateParams.studies) ? [[STUDIES, templateParams.studies]] : [],
            ...(sanitizedAdditionalInfo) ? [[ADDITIONAL_INFO, sanitizedAdditionalInfo]] : [],
        ];
        return await this.send(async () => {
            return await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate(NOTIFICATION_USER_HTML_TEMPLATE, {
                    topMessage, ...{
                        firstName: this.email_constants.USER_REQUEST_ACCESS_RECIPIENT_NAME,
                        senderName: CRDC_SUBMISSION_PORTAL,
                        ...templateParams, additionalInfo}
                }),
                email,
                []
            );
        });
    }

    async requestPVNotification(email, CCEmails, dataCommonsName, templateParams) {
        const topMessage = replaceMessageVariables(this.email_constants.PV_REQUEST_SUBJECT_CONTENT, {});
        const bottomMessage = replaceMessageVariables(this.email_constants.PV_REQUEST_SUBJECT_SECOND_CONTENT, {});
        const subject = this.email_constants.PV_REQUEST_SUBJECT;
        const pendingPV = [
            [SUBMITTER_NAME, templateParams?.submitterName],
            [SUBMITTER_EMAIL, templateParams?.submitterEmail],
            [STUDY_NAME, templateParams?.studyName],
            [STUDY_ABBREVIATION, templateParams?.studyAbbreviation],
            [DATA_SUBMISSION_ID, templateParams?.submissionID],
            [NODE, templateParams?.nodeName],
            [PROPERTY, templateParams?.property],
            [CDE_ID, templateParams?.CDEId],
            [REQUESTED_PERMISSIVE_VALUE, templateParams.value],
            ...(templateParams.comment) ? [[JUSTIFICATION, templateParams.comment]] : []
        ];
        return await this.send(async () => {
            return await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate(NOTIFICATION_USER_HTML_TEMPLATE, {
                    topMessage,
                    bottomMessage,
                    ...{
                        firstName: dataCommonsName + " Team",
                        senderName: CRDC_SUBMISSION_PORTAL,
                        ...templateParams, pendingPV},
                }),
                email,
                CCEmails
            );
        });
    }

    async updateSubmissionNotification(email, CCEmails, BCCEmails, templateParams) {
        const subject = replaceMessageVariables(this.email_constants.UPDATE_SUBMISSION_SUBJECT, {});
        return await this.send(async () => {
            return await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-edit-submission.html", {
                    ...{...templateParams}
                }),
                email,
                CCEmails,
                BCCEmails
            );
        });
    }

    async finalInactiveSubmissionNotification(email, BCCEmails, template_params, messageVariables) {
        const subject = replaceMessageVariables(this.email_constants.FINAL_INACTIVE_SUBMISSION_SUBJECT, messageVariables);
        const message = replaceMessageVariables(this.email_constants.FINAL_INACTIVE_SUBMISSION_CONTENT, messageVariables);
        const additionalMsg = this.email_constants.FINAL_INACTIVE_SUBMISSION_ADDITIONAL_CONTENT;
        return await this.send(async () => {
            await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template.html", {
                    message, ...{...template_params, additionalMsg: additionalMsg}
                }),
                email,
                [],
                BCCEmails
            );
        });
    }

    async clearPendingModelState(email, BCCEmails, template_params) {
        const subject = replaceMessageVariables(this.email_constants.CLEAR_PENDING_STATE_SUBJECT, {});
        return await this.send(async () => {
            return await this.emailService.sendNotification(
                this.email_constants.NOTIFICATION_SENDER,
                isTierAdded(this.tier) ? `${this.tier} ${subject}` : subject,
                await createEmailTemplate("notification-template-pending-clear.html", {
                    ...{...template_params, senderName: CRDC_SUBMISSION_PORTAL}
                }),
                email,
                [],
                BCCEmails
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