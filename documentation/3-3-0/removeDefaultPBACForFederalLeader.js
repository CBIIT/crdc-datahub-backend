// run shared js function first before function alls
// remove all default notifications for federal leader, 
db.users.updateMany({role: "Federal Lead"}, {"$set": {notifications: []}})

// restore default notification for federal lead
restoreUserNotifications("account:access_changed",  {role: "Federal Lead"});
restoreUserNotifications("account:inactivated",  {role: "Federal Lead"});


// remove default permissions for federal leader,
// submission_request:create
// submission_request:review
// submission_request:cancel
removeUserPermissions("submission_request:create", {role: "Federal Lead"});
removeUserPermissions("submission_request:review", {role: "Federal Lead"});
removeUserPermissions("submission_request:cancel", {role: "Federal Lead"});
// data_submission:create
// data_submission:cancel
// data_submission:review
// data_submission:confirm
removeUserPermissions("data_submission:create", {role: "Federal Lead"});
removeUserPermissions("data_submission:cancel", {role: "Federal Lead"});
removeUserPermissions("data_submission:review", {role: "Federal Lead"});
removeUserPermissions("data_submission:confirm", {role: "Federal Lead"});

// user:manage
// program:manage
// study:manage
// institution:manage
removeUserPermissions("user:manage", {role: "Federal Lead"});
removeUserPermissions("program:manage", {role: "Federal Lead"});
removeUserPermissions("study:manage", {role: "Federal Lead"});
removeUserPermissions("institution:manage", {role: "Federal Lead"});

// restore default permissions for federal leader,
// submission_request:submit
// submission_request:view
// data_submission:view
// dashboard:view
restoreUserPermissions("submission_request:submit", {role: "Federal Lead"});
restoreUserPermissions("submission_request:view", {role: "Federal Lead"});
restoreUserPermissions("data_submission:view", {role: "Federal Lead"});
restoreUserPermissions("dashboard:view", {role: "Federal Lead"});
