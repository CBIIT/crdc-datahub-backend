require('dotenv').config();
const {readFile2Text} = require("./utility/io-util")
const {ConfigurationService} = require("./services/configurationService");
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
const SUBMISSION_REQUEST_EMAIL = "SUBMISSION_REQUEST_CONTACT_EMAIL";
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
const MODEL_URL = "MODEL_URL";
const SUBMISSION_GUIDE_URL = "SUBMISSION_GUIDE_URL";
const DATA_COMMONS_LIST = "DATA_COMMONS_LIST";
const HIDDEN_MODELS = "HIDDEN_MODELS";
const COMPLETED_RETENTION_DAYS = "COMPLETED_RETENTION_DAYS";
const INACTIVE_SUBMISSION_DAYS_DELETE = "INACTIVE_SUBMISSION_DAYS_DELETE";
const DASHBOARD_SESSION_TIMEOUT = "DASHBOARD_SESSION_TIMEOUT";
const INACTIVE_SUBMISSION_NOTIFY_DAYS = "INACTIVE_SUBMISSION_NOTIFY_DAYS";
const INACTIVE_APPLICATION_NOTIFY_DAYS = "INACTIVE_APPLICATION_NOTIFY_DAYS";
const LIST_OF_S3_BUCKETS = "LIST_OF_S3_BUCKETS";
const SUBMISSION_BUCKET = "SUBMISSION_BUCKET";
const METADATA_BUCKET = "Metadata Bucket";
const EMAIL_SMTP = "EMAIL_SMTP";
const SCHEDULED_JOBS = "SCHEDULED_JOBS";
const LIST_OF_EMAIL_ADDRESS = "LIST_OF_EMAIL_ADDRESS";
const LIST_OF_URLS = "LIST_OF_URLS";
const TIMEOUT = "TIMEOUT";
process.env.DATABASE_URL = `mongodb://${process.env.MONGO_DB_USER}:${process.env.MONGO_DB_PASSWORD}@${process.env.MONGO_DB_HOST}:${process.env.MONGO_DB_PORT}/${process.env.DATABASE_NAME}?authSource=admin`;
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
    // uploading heart beating check interval
    uploading_check_interval: 5 * 60 * 1000,
    //aws sts assume role
    role_arn: process.env.ROLE_ARN,
    updateConfig: async (dbConnector)=> {
        const configurationService = new ConfigurationService();
        // SCHEDULED_JOBS
        const scheduledJobsConf = await configurationService.findByType(SCHEDULED_JOBS);
        const inactiveUserDaysConf = scheduledJobsConf?.[INACTIVE_USER_DAYS];
        const inactiveApplicationDaysConf = scheduledJobsConf?.[INACTIVE_APPLICATION_DAYS];
        const remindApplicationDaysConf = scheduledJobsConf?.[REMIND_APPLICATION_DAYS];
        const inactiveSubmissionDaysConf = scheduledJobsConf?.[INACTIVE_SUBMISSION_DAYS_DELETE];
        const completedSubmissionDaysConf = scheduledJobsConf?.[COMPLETED_RETENTION_DAYS];
        const inactiveSubmissionNotifyDaysConf = scheduledJobsConf?.[INACTIVE_SUBMISSION_NOTIFY_DAYS];
        const inactiveApplicationNotifyDaysConf = scheduledJobsConf?.[INACTIVE_APPLICATION_NOTIFY_DAYS];

        const scheduledJobTime = scheduledJobsConf?.[SCHEDULED_JOBS];
        // EMAIL_SMTP
        const emailSmtpConf = await configurationService.findByType(EMAIL_SMTP);
        const emailSmtpHostConf = emailSmtpConf?.[EMAIL_SMTP_HOST];
        const emailSmtpPortConf = emailSmtpConf?.[EMAIL_SMTP_PORT];
        const emailSmtpUserConf = emailSmtpConf?.[EMAIL_USER];
        const emailSmtpPasswordConf = emailSmtpConf?.[EMAIL_PASSWORD];
        // LIST_OF_EMAIL_ADDRESS
        const listEmailsConf = await configurationService.findByType(LIST_OF_EMAIL_ADDRESS);
        const officialEmailConf = listEmailsConf?.[OFFICIAL_EMAIL];
        const techSupportEmailConf = listEmailsConf?.[TECH_SUPPORT_EMAIL];
        const submissionHelpdeskConf = listEmailsConf?.[SUBMISSION_HELPDESK];
        const submissionRequestEmailConf = listEmailsConf?.[SUBMISSION_REQUEST_EMAIL];
        // LIST_OF_URLS
        const listURLsConf = await configurationService.findByType(LIST_OF_URLS);
        const emailURLConf = listURLsConf?.[EMAIL_URL];
        const submissionDocUrlConf = listURLsConf?.[SUBMISSION_DOC_URL];
        const submissionSystemPortalConf = listURLsConf?.[SUBMISSION_SYSTEM_PORTAL];
        const prodUrlConf = listURLsConf?.[PROD_URL];
        const modelURLConf = listURLsConf?.[MODEL_URL];
        const submissionGuideURLConf = listURLsConf?.[SUBMISSION_GUIDE_URL];
        // TIMEOUT
        const timeoutConf = await configurationService.findByType(TIMEOUT);
        const roleTimeoutConf = timeoutConf?.[ROLE_TIMEOUT];
        const preSignExpirationConf = timeoutConf?.[PRESIGN_EXPIRATION];
        const dashboardSessionTimeoutConf =  timeoutConf?.[DASHBOARD_SESSION_TIMEOUT];
        // TIER
        const tierConf = await configurationService.findByType(TIER);
        // AWS_SQS_QUEUE
        const loaderQueueConf = await configurationService.findByType(LOADER_QUEUE);
        const fileQueueConf = await configurationService.findByType(FILE_QUEUE);
        const metadataQueueConf = await configurationService.findByType(METADATA_QUEUE);
        const exporterQueueConf = await configurationService.findByType(EXPORTER_QUEUE);
        // SUBMISSION
        const dataCommonsListConf = await configurationService.findByType(DATA_COMMONS_LIST);
        const hiddenModelsConf = await configurationService.findByType(HIDDEN_MODELS);
        const listS3Buckets = await configurationService.findByType(LIST_OF_S3_BUCKETS);
        const submissionBucketConf = listS3Buckets?.[SUBMISSION_BUCKET];
        const metadataBuckets = await configurationService.findManyByType(METADATA_BUCKET);
        const dataCommonsBucketMap = new Map(
            metadataBuckets?.filter(item => item?.dataCommons && item.bucketName)
                ?.map(item => [item.dataCommons, item.bucketName])
        );
        return {
            ...config,
            inactive_user_days : inactiveUserDaysConf || (process.env.INACTIVE_USER_DAYS || 60),
            remind_application_days: remindApplicationDaysConf || (process.env.REMIND_APPLICATION_DAYS || 165),
            inactive_application_days : inactiveApplicationDaysConf || (process.env.INACTIVE_APPLICATION_DAYS || 180),
            // Email settings
            email_transport: getTransportConfig(emailSmtpHostConf, emailSmtpPortConf, emailSmtpUserConf, emailSmtpPasswordConf),
            emails_enabled: process.env.EMAILS_ENABLED ? process.env.EMAILS_ENABLED.toLowerCase() === 'true' : true,
            emails_url: emailURLConf || (process.env.EMAIL_URL ? process.env.EMAIL_URL : 'http://localhost:4010'),
            official_email: officialEmailConf || (process.env.OFFICIAL_EMAIL || 'CRDCHelpDesk@nih.gov'),
            // temp url for email
            submission_doc_url: submissionDocUrlConf || (process.env.SUBMISSION_DOC_URL || ""),
            submission_helpdesk: submissionHelpdeskConf || "CRDCSubmissions@nih.gov",
            techSupportEmail: techSupportEmailConf || (process.env.TECH_SUPPORT_EMAIL || "NCICRDCTechSupport@mail.nih.gov"),
            submission_system_portal: submissionSystemPortalConf || "https://datacommons.cancer.gov/",
            prod_url: prodUrlConf || (process.env.PROD_URL || "https://hub.datacommons.cancer.gov/"),
            submission_bucket: submissionBucketConf,
            dataCommonsBucketMap: dataCommonsBucketMap,
            role_timeout: roleTimeoutConf || (parseInt(process.env.ROLE_TIMEOUT) || 12*3600),
            presign_expiration: preSignExpirationConf || (parseInt(process.env.PRESIGN_EXPIRATION) || 3600),
            tier: getTier(tierConf?.keys?.tier),
            // aws SQS names
            sqs_loader_queue: loaderQueueConf?.keys?.sqs || (process.env.LOADER_QUEUE || "crdcdh-queue"),
            metadata_queue: metadataQueueConf?.keys?.sqs || process.env.METADATA_QUEUE,
            file_queue: fileQueueConf?.keys?.sqs || process.env.FILE_QUEUE,
            export_queue: exporterQueueConf?.keys?.sqs || process.env.EXPORTER_QUEUE,
            model_url: modelURLConf || getModelUrl(tierConf?.keys?.tier),
            //uploader configuration file template
            uploaderCLIConfigs: readUploaderCLIConfigTemplate(),
            dataCommonsList: dataCommonsListConf?.key || (process.env.DATA_COMMONS_LIST ? JSON.parse(process.env.DATA_COMMONS_LIST) : ["CDS", "ICDC", "CTDC", "CCDI", "PSDC", "Test MDF", "Hidden Model"]),
            hiddenModels: hiddenModelsConf?.key || (process.env.HIDDEN_MODELS ? parseHiddenModels(process.env.HIDDEN_MODELS) : []),
            inactive_submission_days: inactiveSubmissionDaysConf || (process.env.INACTIVE_SUBMISSION_DAYS_DELETE || 120),
            completed_submission_days: completedSubmissionDaysConf || (process.env.COMPLETED_RETENTION_DAYS || 30),
            dashboardSessionTimeout: dashboardSessionTimeoutConf || (process.env.DASHBOARD_SESSION_TIMEOUT || 3600), // 60 minutes by default
            inactiveSubmissionNotifyDays: inactiveSubmissionNotifyDaysConf || [7, 30, 60],
            inactiveApplicationNotifyDays: inactiveApplicationNotifyDaysConf || [7, 15, 30], // 7, 15, 30 days by default
            conditionalSubmissionContact: submissionRequestEmailConf || "NCICRDC@mail.nih.gov",
            submissionGuideUrl: submissionGuideURLConf || "https://datacommons.cancer.gov/data-submission-instructions",
            scheduledJobTime: scheduledJobTime || "1 0 1 * * *"
        };
    }
}
config.mongo_db_connection_string = process.env.DATABASE_URL;
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
    const tier = dbTier?.replace(/[^a-zA-Z\d]/g, '')?.trim();
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
