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
            applicantID: "test",
            applicantName: "crdc",
            applicantEmail: "crdc@nih.gov"
        },
        "history": [
            {
                "status": "In Progress",
                "reviewComment": "test review comment",
                "dateTime": "3000-01-01T12:00:00",
                "userID": "test_user_id"
            }
        ]
    }

}