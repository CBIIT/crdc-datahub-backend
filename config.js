require('dotenv').config();
const {readFile2Text} = require("./utility/io-util")
const {ConfigurationService} = require("./services/configurationService");
const {MongoDBCollection} = require("./crdc-datahub-database-drivers/mongodb-collection");
const {DATABASE_NAME, CONFIGURATION_COLLECTION} = require("./crdc-datahub-database-drivers/database-constants");
const EMAIL_SMTP_HOST = "EMAIL_SMTP_HOST";
const EMAIL_SMTP_PORT = "EMAIL_SMTP_PORT";
const EMAIL_USER = "EMAIL_USER";
const EMAIL_PASSWORD = "EMAIL_PASSWORD";
const EMAIL_URL = "EMAIL_URL";
const OFFICIAL_EMAIL = "OFFICIAL_EMAIL";
const INACTIVE_APPLICATION_DAYS= "INACTIVE_APPLICATION_DAYS";
const REMIND_APPLICATION_DAYS = "REMIND_APPLICATION_DAYS";
const SUBMISSION_SYSTEM_PORTAL = "SUBMISSION_SYSTEM_PORTAL";
const SUBMISSION_HELPDESK = "SUBMISSION_HELPDESK";
const TECH_SUPPORT_EMAIL = "TECH_SUPPORT_EMAIL";
const INACTIVE_USER_DAYS = "INACTIVE_USER_DAYS";
const SUBMISSION_DOC_URL = "SUBMISSION_DOC_URL";
const PROD_URL = "PROD_URL";
const ROLE_TIMEOUT = "ROLE_TIMEOUT";
const PRESIGN_EXPIRATION = "PRESIGN_EXPIRATION";
const TIER = "TIER";
const LOADER_QUEUE = "LOADER_QUEUE";
const METADATA_QUEUE = "METADATA_QUEUE";
const FILE_QUEUE = "FILE_QUEUE";
const EXPORTER_QUEUE = "EXPORTER_QUEUE";
const REVIEW_COMMITTEE_EMAIL = "REVIEW_COMMITTEE_EMAIL";
const MODEL_URL = "MODEL_URL";
const DATA_COMMONS_LIST = "DATA_COMMONS_LIST";
const HIDDEN_MODELS = "HIDDEN_MODELS";
const COMPLETED_RETENTION_DAYS = "COMPLETED_RETENTION_DAYS";
const INACTIVE_SUBMISSION_DAYS_DELETE = "INACTIVE_SUBMISSION_DAYS_DELETE";
const DASHBOARD_SESSION_TIMEOUT = "DASHBOARD_SESSION_TIMEOUT";

let config = {
    //info variables
    version: process.env.VERSION || 'Version not set',
    date: process.env.DATE || new Date(),
    //Mongo DB
    mongo_db_user: process.env.MONGO_DB_USER,
    mongo_db_password: process.env.MONGO_DB_PASSWORD,
    mongo_db_host: process.env.MONGO_DB_HOST,
    mongo_db_port: process.env.MONGO_DB_PORT,

    //session
    session_secret: process.env.SESSION_SECRET,
    session_timeout: parseInt(process.env.SESSION_TIMEOUT_SECONDS) * 1000 || 30 * 60 * 1000,
    token_secret: process.env.SESSION_SECRET,
    token_timeout: parseInt(process.env.TOKEN_TIMEOUT) * 1000 || 30 * 24 * 60 * 60 * 1000,
    schedule_job: process.env.SCHEDULE_JOB || "1 0 1 * * *",
    //aws sts assume role
    role_arn: process.env.ROLE_ARN,
    updateConfig: async (dbConnector)=> {
        const configurationCollection = new MongoDBCollection(dbConnector.client, DATABASE_NAME, CONFIGURATION_COLLECTION);
        const configurationService = new ConfigurationService(configurationCollection);
        const inactiveUserDaysConf = await configurationService.findByType(INACTIVE_USER_DAYS);
        const inactiveApplicationDaysConf = await configurationService.findByType(INACTIVE_APPLICATION_DAYS);
        const remindApplicationDaysConf = await configurationService.findByType(REMIND_APPLICATION_DAYS);

        const emailSmtpHostConf = await configurationService.findByType(EMAIL_SMTP_HOST);
        const emailSmtpPortConf = await configurationService.findByType(EMAIL_SMTP_PORT);
        const emailSmtpUserConf = await configurationService.findByType(EMAIL_USER);
        const emailSmtpPasswordConf = await configurationService.findByType(EMAIL_PASSWORD);

        const emailURLConf = await configurationService.findByType(EMAIL_URL);
        const officialEmailConf = await configurationService.findByType(OFFICIAL_EMAIL);

        const submissionDocUrlCOnf = await configurationService.findByType(SUBMISSION_DOC_URL);
        const submissionHelpdeskConf = await configurationService.findByType(SUBMISSION_HELPDESK);
        const techSupportEmailConf = await configurationService.findByType(TECH_SUPPORT_EMAIL);
        const submissionSystemPortalConf = await configurationService.findByType(SUBMISSION_SYSTEM_PORTAL);
        const prodUrlConf = await configurationService.findByType(PROD_URL);
        const roleTimeoutConf = await configurationService.findByType(ROLE_TIMEOUT);
        const preSignExpirationConf = await configurationService.findByType(PRESIGN_EXPIRATION);

        const tierConf = await configurationService.findByType(TIER);
        const loaderQueueConf = await configurationService.findByType(LOADER_QUEUE);
        const metadataQueueConf = await configurationService.findByType(METADATA_QUEUE);
        const fileQueueConf = await configurationService.findByType(FILE_QUEUE);

        const exporterQueueConf = await configurationService.findByType(EXPORTER_QUEUE);
        const reviewCommitteeEmailConf = await configurationService.findByType(REVIEW_COMMITTEE_EMAIL);

        const modelURLConf = await configurationService.findByType(MODEL_URL);
        const dataCommonsListConf = await configurationService.findByType(DATA_COMMONS_LIST);
        const hiddenModelsConf = await configurationService.findByType(HIDDEN_MODELS);
        const inactiveSubmissionDaysConf = await configurationService.findByType(INACTIVE_SUBMISSION_DAYS_DELETE);
        const completedSubmissionDaysConf = await configurationService.findByType(COMPLETED_RETENTION_DAYS);
        const dashboardSessionTimeoutConf =  await configurationService.findByType(DASHBOARD_SESSION_TIMEOUT);

        return {
            ...this.config,
            inactive_user_days : inactiveUserDaysConf?.key || (process.env.INACTIVE_USER_DAYS || 60),
            remind_application_days: remindApplicationDaysConf?.key || (process.env.REMIND_APPLICATION_DAYS || 30),
            inactive_application_days : inactiveApplicationDaysConf?.key || (process.env.INACTIVE_APPLICATION_DAYS || 45),
            // Email settings
            email_transport: getTransportConfig(emailSmtpHostConf?.key, emailSmtpPortConf?.key, emailSmtpUserConf?.key, emailSmtpPasswordConf?.key),
            emails_enabled: process.env.EMAILS_ENABLED ? process.env.EMAILS_ENABLED.toLowerCase() === 'true' : true,
            emails_url: emailURLConf?.key || (process.env.EMAIL_URL ? process.env.EMAIL_URL : 'http://localhost:4010'),
            official_email: officialEmailConf?.key || (process.env.OFFICIAL_EMAIL || 'CRDCHelpDesk@nih.gov'),
            // temp url for email
            submission_doc_url: submissionDocUrlCOnf?.key || (process.env.SUBMISSION_DOC_URL || ""),
            submission_helpdesk: submissionHelpdeskConf?.key || "CRDCSubmissions@nih.gov",
            techSupportEmail: techSupportEmailConf?.key || (process.env.TECH_SUPPORT_EMAIL || "NCICRDCTechSupport@mail.nih.gov"),
            submission_system_portal: submissionSystemPortalConf?.key || "https://datacommons.cancer.gov/",
            prod_url: prodUrlConf?.key || (process.env.PROD_URL || "https://hub.datacommons.cancer.gov/"),
            submission_bucket: process.env.SUBMISSION_BUCKET,
            role_timeout: roleTimeoutConf?.key || (parseInt(process.env.ROLE_TIMEOUT) || 12*3600),
            presign_expiration: preSignExpirationConf?.key || (parseInt(process.env.PRESIGN_EXPIRATION) || 3600),
            tier: getTier(tierConf),
            // aws SQS names
            sqs_loader_queue: loaderQueueConf?.key || (process.env.LOADER_QUEUE || "crdcdh-queue"),
            metadata_queue: metadataQueueConf?.key || process.env.METADATA_QUEUE,
            file_queue: fileQueueConf?.key || process.env.FILE_QUEUE,
            export_queue: exporterQueueConf?.key || process.env.EXPORTER_QUEUE,
            //CRDC Review Committee Emails, separated by ","
            committee_emails: ((reviewCommitteeEmailConf?.key || process.env.REVIEW_COMMITTEE_EMAIL) ? (reviewCommitteeEmailConf?.key || process.env.REVIEW_COMMITTEE_EMAIL)?.split(',') : ["CRDCSubmisison@nih.gov"]),
            model_url: modelURLConf?.key || getModelUrl(tierConf?.key),
            //uploader configuration file template
            uploaderCLIConfigs: readUploaderCLIConfigTemplate(),
            dataCommonsList: dataCommonsListConf?.key || (process.env.DATA_COMMONS_LIST ? JSON.parse(process.env.DATA_COMMONS_LIST) : ["CDS", "ICDC", "CTDC", "CCDI", "Test MDF", "Hidden Model"]),
            hiddenModels: hiddenModelsConf?.key || (process.env.HIDDEN_MODELS ? parseHiddenModels(process.env.HIDDEN_MODELS) : []),
            inactive_submission_days: inactiveSubmissionDaysConf?.key || (process.env.INACTIVE_SUBMISSION_DAYS_DELETE || 120),
            completed_submission_days: completedSubmissionDaysConf?.key || (process.env.COMPLETED_RETENTION_DAYS || 30),
            dashboardSessionTimeout: dashboardSessionTimeoutConf?.key || (process.env.DASHBOARD_SESSION_TIMEOUT || 3600), // 60 minutes by default
        };
    }
}
config.mongo_db_connection_string = `mongodb://${config.mongo_db_user}:${config.mongo_db_password}@${config.mongo_db_host}:${process.env.MONGO_DB_PORT}`;

function parseHiddenModels(hiddenModels) {
    return hiddenModels.split(',')
        .filter(item => item?.trim().length > 0)
        .map(item => item?.trim());
}

function getTransportConfig(host, port, emailUser, emailPassword) {
    return {
        host: host || process.env.EMAIL_SMTP_HOST,
        port: port || process.env.EMAIL_SMTP_PORT,
        secure: false,
        // Optional AWS Email Identity
        ...(emailUser || process.env.EMAIL_USER && {
                secure: false, // true for 465, false for other ports
                auth: {
                    user: emailUser || process.env.EMAIL_USER, // generated ethereal user
                    pass: emailPassword || process.env.EMAIL_PASSWORD, // generated ethereal password
                }
            }
        )
    };
}

function readUploaderCLIConfigTemplate(){
    const uploaderConfigTemplate = 'resources/yaml/data_file_upload_config.yaml';
    configString = readFile2Text(uploaderConfigTemplate);
    if (!configString){
        throw "Can't find uploader CLI config template at " + uploaderConfigTemplate + "!";
    }
    return configString;
}
function getModelUrl(dbTier) {
    // if MODEL_URL exists, it overrides
    if (process.env.MODEL_URL) {
        return process.env.MODEL_URL;
    }
    const tier = extractTierName(dbTier);
    // By default url
    const modelUrl = ['https://raw.githubusercontent.com/CBIIT/crdc-datahub-models/', tier || 'master', '/cache/content.json']
    if (tier?.length > 0) {
        modelUrl[1] = tier.toLowerCase();
    }
    return modelUrl.join("");
}

function extractTierName(dbTier) {
    const tier = dbTier || process.env.TIER;
    return tier?.replace(/prod(uction)?/gi, '')?.replace(/[^a-zA-Z\d]/g, '')?.trim();
}

function getTier(dbTier) {
    const tier = extractTierName(dbTier);
    return tier?.length > 0 ? `[${tier.toUpperCase()}]` : '';
}

module.exports = config;
