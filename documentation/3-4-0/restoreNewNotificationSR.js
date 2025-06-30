// need run sharedFunctions/restoreUserNotifications.js first
// add new notification to submitter and user roles
restoreUserNotifications("submission_request:pending_cleared",  {role: {$in: [ "Submitter", "User"]}});
