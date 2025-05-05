// run shared js function first before function alls
// remove default notifications for federal leader, 
// submission_request:to_be_reviewed
// submission_request:reviewed
// submission_request:canceled
// submission_request:expiring
// submission_request:deleted
removeUserNotification("submission_request:to_be_reviewed",  {role: "Federal Lead"});
removeUserNotification("submission_request:reviewed", {role: "Federal Lead"});
removeUserNotification("submission_request:canceled", {role: "Federal Lead"});
removeUserNotification("submission_request:expiring", {role: "Federal Lead"});
removeUserNotification("submission_request:deleted", {role: "Federal Lead"});

// remove default permissions for federal leader,
// submission_request:cancel
removeUserPermissions("submission_request:cancel", {role: "Federal Lead"});

// restore default permissions for federal leader,
// submission_request:submit
restoreUserPermissions("submission_request:submit", {role: "Federal Lead"});
