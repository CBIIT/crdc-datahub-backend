module.exports = {
    TEST_SESSION: {
        userInfo: {
            email: "test@email.com",
            firstName: "test first",
            lastName: "test last",
            IDP: "test-idp",
            _id: "test_user_id"
        }
    },
    TEST_APPLICATION: {
        "_id": "test_application_id",
        "status": "In Review",
        "createdAt": "3000-01-01T12:00:00",
        "updatedAt": "3000-01-01T12:00:00",
        "applicant": {
            applicantID: "test_user_id",
            applicantName: "test test",
            applicantEmail: "test@email.com"
        },
        organization: {
            _id: "test",
            name: "crdc-org"
        },
        "history": [
            {
                "status": "In Progress",
                "reviewComment": "test review comment",
                "dateTime": "3000-01-01T12:00:00",
                "userID": "test_user_id"
            }
        ]
    },
    TEST_ORGANIZATION: {
        "_id": "test_organization_id",
        "name": "crdc"
    },
    STUDY_ID: "test-study-id"

}