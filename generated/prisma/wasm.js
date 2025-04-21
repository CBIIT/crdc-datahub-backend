
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.6.0
 * Query Engine version: f676762280b54cd07c770017ed3711ddde35f37a
 */
Prisma.prismaVersion = {
  client: "6.6.0",
  engine: "f676762280b54cd07c770017ed3711ddde35f37a"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.CDEScalarFieldEnum = {
  id: 'id',
  CDECode: 'CDECode',
  CDEFullName: 'CDEFullName',
  CDEVersion: 'CDEVersion',
  PermissibleValues: 'PermissibleValues',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApplicationsScalarFieldEnum = {
  id: 'id',
  ORCID: 'ORCID',
  PI: 'PI',
  controlledAccess: 'controlledAccess',
  createdAt: 'createdAt',
  inactiveReminder: 'inactiveReminder',
  openAccess: 'openAccess',
  programAbbreviation: 'programAbbreviation',
  programDescription: 'programDescription',
  programName: 'programName',
  questionnaireData: 'questionnaireData',
  reviewComment: 'reviewComment',
  status: 'status',
  studyAbbreviation: 'studyAbbreviation',
  studyName: 'studyName',
  submittedDate: 'submittedDate',
  updatedAt: 'updatedAt',
  version: 'version',
  wholeProgram: 'wholeProgram'
};

exports.Prisma.ApprovedStudiesScalarFieldEnum = {
  id: 'id',
  ORCID: 'ORCID',
  PI: 'PI',
  controlledAccess: 'controlledAccess',
  createdAt: 'createdAt',
  dbGaPID: 'dbGaPID',
  openAccess: 'openAccess',
  originalOrg: 'originalOrg',
  primaryContactID: 'primaryContactID',
  programName: 'programName',
  studyAbbreviation: 'studyAbbreviation',
  studyName: 'studyName',
  updatedAt: 'updatedAt',
  useProgramPC: 'useProgramPC'
};

exports.Prisma.BatchScalarFieldEnum = {
  id: 'id',
  bucketName: 'bucketName',
  createdAt: 'createdAt',
  displayID: 'displayID',
  errors: 'errors',
  fileCount: 'fileCount',
  filePrefix: 'filePrefix',
  status: 'status',
  submissionID: 'submissionID',
  submitterID: 'submitterID',
  submitterName: 'submitterName',
  type: 'type',
  updatedAt: 'updatedAt',
  zipFileName: 'zipFileName'
};

exports.Prisma.ConfigurationScalarFieldEnum = {
  id: 'id',
  COMPLETED_RETENTION_DAYS: 'COMPLETED_RETENTION_DAYS',
  DASHBOARD_SESSION_TIMEOUT: 'DASHBOARD_SESSION_TIMEOUT',
  EMAIL_URL: 'EMAIL_URL',
  INACTIVE_APPLICATION_DAYS: 'INACTIVE_APPLICATION_DAYS',
  INACTIVE_SUBMISSION_DAYS_DELETE: 'INACTIVE_SUBMISSION_DAYS_DELETE',
  INACTIVE_USER_DAYS: 'INACTIVE_USER_DAYS',
  OFFICIAL_EMAIL: 'OFFICIAL_EMAIL',
  PRESIGN_EXPIRATION: 'PRESIGN_EXPIRATION',
  PROD_URL: 'PROD_URL',
  REMIND_APPLICATION_DAYS: 'REMIND_APPLICATION_DAYS',
  REVIEW_COMMITTEE_EMAIL: 'REVIEW_COMMITTEE_EMAIL',
  ROLE_TIMEOUT: 'ROLE_TIMEOUT',
  SCHEDULED_JOBS: 'SCHEDULED_JOBS',
  SUBMISSION_BUCKET: 'SUBMISSION_BUCKET',
  SUBMISSION_HELPDESK: 'SUBMISSION_HELPDESK',
  SUBMISSION_REQUEST_CONTACT_EMAIL: 'SUBMISSION_REQUEST_CONTACT_EMAIL',
  SUBMISSION_SYSTEM_PORTAL: 'SUBMISSION_SYSTEM_PORTAL',
  TECH_SUPPORT_EMAIL: 'TECH_SUPPORT_EMAIL',
  age: 'age',
  bucketName: 'bucketName',
  current: 'current',
  current_version: 'current_version',
  dashboardID: 'dashboardID',
  dataCommons: 'dataCommons',
  days: 'days',
  interval: 'interval',
  key: 'key',
  keys: 'keys',
  new: 'new',
  prefix: 'prefix',
  timeout: 'timeout',
  type: 'type',
  version: 'version'
};

exports.Prisma.DataRecordsScalarFieldEnum = {
  id: 'id',
  CRDC_ID: 'CRDC_ID',
  IDPropName: 'IDPropName',
  batchIDs: 'batchIDs',
  createdAt: 'createdAt',
  dataCommons: 'dataCommons',
  entityType: 'entityType',
  latestBatchDisplayID: 'latestBatchDisplayID',
  latestBatchID: 'latestBatchID',
  lineNumber: 'lineNumber',
  nodeID: 'nodeID',
  nodeType: 'nodeType',
  orginalFileName: 'orginalFileName',
  props: 'props',
  qcResultID: 'qcResultID',
  rawData: 'rawData',
  status: 'status',
  studyID: 'studyID',
  submissionID: 'submissionID',
  updatedAt: 'updatedAt',
  uploadedDate: 'uploadedDate',
  validatedAt: 'validatedAt'
};

exports.Prisma.DataRecordsArchivedScalarFieldEnum = {
  id: 'id',
  CRDC_ID: 'CRDC_ID',
  IDPropName: 'IDPropName',
  batchIDs: 'batchIDs',
  createdAt: 'createdAt',
  dataCommons: 'dataCommons',
  entityType: 'entityType',
  latestBatchDisplayID: 'latestBatchDisplayID',
  latestBatchID: 'latestBatchID',
  lineNumber: 'lineNumber',
  nodeID: 'nodeID',
  nodeType: 'nodeType',
  orginalFileName: 'orginalFileName',
  props: 'props',
  qcResultID: 'qcResultID',
  rawData: 'rawData',
  status: 'status',
  studyID: 'studyID',
  submissionID: 'submissionID',
  updatedAt: 'updatedAt',
  uploadedDate: 'uploadedDate',
  validatedAt: 'validatedAt'
};

exports.Prisma.FileMD5ScalarFieldEnum = {
  id: 'id',
  LastModified: 'LastModified',
  createdAt: 'createdAt',
  fileName: 'fileName',
  md5: 'md5',
  submissionID: 'submissionID',
  updatedAt: 'updatedAt'
};

exports.Prisma.InstitutionsScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  name: 'name',
  status: 'status',
  submitterCount: 'submitterCount',
  updatedAt: 'updatedAt'
};

exports.Prisma.LogsScalarFieldEnum = {
  id: 'id',
  action: 'action',
  applicationID: 'applicationID',
  eventType: 'eventType',
  localtime: 'localtime',
  newProfile: 'newProfile',
  newState: 'newState',
  prevProfile: 'prevProfile',
  prevState: 'prevState',
  submissionID: 'submissionID',
  timestamp: 'timestamp',
  userEmail: 'userEmail',
  userID: 'userID',
  userIDP: 'userIDP',
  userName: 'userName'
};

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  abbreviation: 'abbreviation',
  bucketName: 'bucketName',
  conciergeEmail: 'conciergeEmail',
  conciergeID: 'conciergeID',
  conciergeName: 'conciergeName',
  createdAt: 'createdAt',
  description: 'description',
  name: 'name',
  rootPath: 'rootPath',
  status: 'status',
  updateAt: 'updateAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.QcResultsScalarFieldEnum = {
  id: 'id',
  batchIDs: 'batchIDs',
  dataRecordID: 'dataRecordID',
  displayID: 'displayID',
  latestBatchID: 'latestBatchID',
  origin: 'origin',
  severity: 'severity',
  submissionID: 'submissionID',
  submittedID: 'submittedID',
  type: 'type',
  uploadedDate: 'uploadedDate',
  validatedDate: 'validatedDate',
  validationType: 'validationType'
};

exports.Prisma.ReleaseScalarFieldEnum = {
  id: 'id',
  CRDC_ID: 'CRDC_ID',
  createdAt: 'createdAt',
  dataCommons: 'dataCommons',
  entityType: 'entityType',
  nodeID: 'nodeID',
  nodeType: 'nodeType',
  props: 'props',
  status: 'status',
  studyID: 'studyID',
  submissionID: 'submissionID',
  updatedAt: 'updatedAt'
};

exports.Prisma.SessionsScalarFieldEnum = {
  id: 'id',
  expires: 'expires',
  lastModified: 'lastModified',
  session: 'session'
};

exports.Prisma.SubmissionsScalarFieldEnum = {
  id: 'id',
  ORCID: 'ORCID',
  accessedAt: 'accessedAt',
  archived: 'archived',
  bucketName: 'bucketName',
  collborators: 'collborators',
  conciergeEmail: 'conciergeEmail',
  conciergeName: 'conciergeName',
  controlledAccess: 'controlledAccess',
  createdAt: 'createdAt',
  crossSubmissionStatus: 'crossSubmissionStatus',
  dataCommons: 'dataCommons',
  dataCommonsDisplayName: 'dataCommonsDisplayName',
  dataType: 'dataType',
  dbGaPID: 'dbGaPID',
  deletingData: 'deletingData',
  fileValidationStatus: 'fileValidationStatus',
  finalInactiveReminder: 'finalInactiveReminder',
  inactiveReminder: 'inactiveReminder',
  inactiveReminder_30: 'inactiveReminder_30',
  inactiveReminder_60: 'inactiveReminder_60',
  inactiveReminder_7: 'inactiveReminder_7',
  intention: 'intention',
  metadataValidationStatus: 'metadataValidationStatus',
  modelVersion: 'modelVersion',
  name: 'name',
  nodeCount: 'nodeCount',
  reviewComment: 'reviewComment',
  rootPath: 'rootPath',
  status: 'status',
  studyAbbreviation: 'studyAbbreviation',
  studyID: 'studyID',
  submitterID: 'submitterID',
  submitterName: 'submitterName',
  updatedAt: 'updatedAt',
  validationEnded: 'validationEnded',
  validationScope: 'validationScope',
  validationStarted: 'validationStarted',
  validationType: 'validationType'
};

exports.Prisma.SynonymsScalarFieldEnum = {
  id: 'id',
  equivalent_term: 'equivalent_term',
  synonym_term: 'synonym_term'
};

exports.Prisma.UsersScalarFieldEnum = {
  id: 'id',
  IDP: 'IDP',
  createdAt: 'createdAt',
  dataCommons: 'dataCommons',
  email: 'email',
  firstName: 'firstName',
  lastName: 'lastName',
  notifications: 'notifications',
  permissions: 'permissions',
  role: 'role',
  status: 'status',
  tokens: 'tokens',
  updateAt: 'updateAt',
  userStatus: 'userStatus'
};

exports.Prisma.ValidationScalarFieldEnum = {
  id: 'id',
  ended: 'ended',
  scope: 'scope',
  started: 'started',
  status: 'status',
  submissionID: 'submissionID',
  type: 'type'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};


exports.Prisma.ModelName = {
  CDE: 'CDE',
  applications: 'applications',
  approvedStudies: 'approvedStudies',
  batch: 'batch',
  configuration: 'configuration',
  dataRecords: 'dataRecords',
  dataRecordsArchived: 'dataRecordsArchived',
  fileMD5: 'fileMD5',
  institutions: 'institutions',
  logs: 'logs',
  organization: 'organization',
  qcResults: 'qcResults',
  release: 'release',
  sessions: 'sessions',
  submissions: 'submissions',
  synonyms: 'synonyms',
  users: 'users',
  validation: 'validation'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }

        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
