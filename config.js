require('dotenv').config();

let config = {
    //info variables
    version: process.env.VERSION || 'Version not set',
    date: process.env.DATE || new Date(),
    inactive_user_days : process.env.INACTIVE_USER_DAYS || 60,
    remind_application_days: process.env.REMIND_APPLICATION_DAYS || 30,
    inactive_application_days : process.env.INACTIVE_APPLICATION_DAYS || 45,
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
    // Email settings
    email_transport: getTransportConfig(),
    emails_enabled: process.env.EMAILS_ENABLED ? process.env.EMAILS_ENABLED.toLowerCase() === 'true' : true,
    emails_url: process.env.EMAIL_URL ? process.env.EMAIL_URL : 'http://localhost:4010',
    official_email: process.env.OFFICIAL_EMAIL || 'CRDCHelpDesk@nih.gov',
    // Scheduled cronjob once a day (1am) eastern time at default
    schedule_job: process.env.SCHEDULE_JOB || "1 0 1 * * *",
    // temp url for email
    submission_doc_url: process.env.SUBMISSION_DOC_URL || "",
    submission_helpdesk: "CRDCSubmissions@nih.gov",
    submission_system_portal: "https://datacommons.cancer.gov/",
    submission_bucket: process.env.SUBMISSION_BUCKET, 
    //aws sts assume role
    role_arn: process.env.ROLE_ARN,
    role_timeout: parseInt(process.env.ROLE_TIMEOUT) || 12*3600,
    presign_expiration: parseInt(process.env.PRESIGN_EXPIRATION) || 3600,
    tier: getTier(),
    // aws SQS names
    sqs_loader_queue: process.env.LOADER_QUEUE || "crdcdh-queue",
    metadata_queue: process.env.METADATA_QUEUE,
    file_queue: process.env.FILE_QUEUE,
    export_queue: process.env.EXPORTER_QUEUE,
    //CRDC Review Committee Emails, separated by ","
     committee_emails: process.env.REVIEW_COMMITTEE_EMAIL ? process.env.REVIEW_COMMITTEE_EMAIL.split(',') : ["CRDCSubmisison@nih.gov"],
    model_url: getModelUrl()

};
config.mongo_db_connection_string = `mongodb://${config.mongo_db_user}:${config.mongo_db_password}@${config.mongo_db_host}:${process.env.MONGO_DB_PORT}`;

function getTransportConfig() {
    return {
        host: process.env.EMAIL_SMTP_HOST,
        port: process.env.EMAIL_SMTP_PORT,
        secure: false,
        // Optional AWS Email Identity
        ...(process.env.EMAIL_USER && {
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.EMAIL_USER, // generated ethereal user
                    pass: process.env.EMAIL_PASSWORD, // generated ethereal password
                }
            }
        )
    };
}
function getModelUrl() {
    // if MODEL_URL exists, it overrides
    if (process.env.MODEL_URL) {
        return process.env.MODEL_URL;
    }
    const tier = extractTierName();
    // By default url
    const modelUrl = ['https://raw.githubusercontent.com/CBIIT/crdc-datahub-models/', 'master', '/content.json']
    if (tier?.length > 0) {
        modelUrl[1] = tier.toLowerCase();
    }
    return modelUrl.join("");
}

function extractTierName() {
    return process.env.TIER?.replace(/[^a-zA-Z\d]/g, '').trim();
}

function getTier() {
    const tier = extractTierName();
    return tier?.length > 0 ? `[${tier.toUpperCase()}]` : '';
}

module.exports = config;
