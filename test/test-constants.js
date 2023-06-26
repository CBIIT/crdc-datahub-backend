module.exports = {
    TEST_SESSION: {
        userInfo: {
            email: "test@email.com",
            firstName: "test first",
            lastName: "test last",
            IDP: "test-idp",
            userID: "777"
        }
    },
    TEST_APPLICATION: {
        "_id": "1234",
        "sections": [
            {
                "name": "Section A",
                "status": "In Progress"
            },
            {
                "name": "Section B",
                "status": "Submitted"
            }
        ],
        "pi": {
            "firstName": "John",
            "lastName": "Doe",
            "position": "Professor",
            "email": "johndoe@example.com",
            "institution": "Example University",
            "eRAAccount": "ERA12345",
            "address": "123 Main Street"
        },
        "primaryContact": {
            "firstName": "Jane",
            "lastName": "Smith",
            "email": "janesmith@example.com",
            "phone": "123-456-7890"
        },
        "additionalContacts": [
            {
                "role": "Researcher",
                "firstName": "Bob",
                "lastName": "Johnson",
                "email": "bobjohnson@example.com",
                "phone": "987-654-3210"
            }
        ],
        "program": {
            "title": "Example Program",
            "abbreviation": "EP",
            "description": "This is an example program."
        },
        "study": {
            "title": "Example Study",
            "abbreviation": "ES",
            "description": "This is an example study.",
            "repositories": [
                {
                    "name": "Repository A",
                    "studyID": "RA123"
                }
            ]
        },
        "funding": {
            "agencies": [
                {
                    "name": "Agency A",
                    "grantNumbers": [
                        "12345",
                        "67890"
                    ]
                }
            ],
            "nciProgramOfficer": "Program Officer A",
            "nciGPA": "GPA12345"
        },
        "accessPolicy": "Open Access",
        "targetedReleaseDate": "2023-07-01",
        "embargoInfo": "Embargo until further notice",
        "cancerTypes": [
            "Breast Cancer",
            "Lung Cancer"
        ],
        "preCancerTypes": [
            "Benign",
            "Pre-Malignant"
        ],
        "numberOfParticipants": 1000,
        "species": [
            "Human",
            "Mouse"
        ],
        "dataTypes": [
            "Genomic Data",
            "Clinical Data"
        ],
        "clinicalData": {
            "dataTypes": [
                "Clinical Data"
            ],
            "futureDataTypes": true
        },
        "files": [
            {
                "type": "Data File",
                "count": 10,
                "amount": "1GB"
            }
        ],
        "publications": [
            {
                "title": "Publication 1",
                "pubmedID": "PMID123",
                "DOI": "doi:12345/example"
            }
        ],
        "timeConstraints": "No time constraints",
        "submitterComment": "This is a comment from the submitter.",
        "status": "In Review",
        "programLevelApproval": false,
        "reviewComment": "This is a review comment.",
        "createdAt": "2023-05-01T12:00:00",
        "updatedAt": "2023-06-01T10:30:00",
        "history": [
            {
                "status": "In Progress",
                "reviewComment": "",
                "dateTime": "2023-05-01T12:00:00",
                "userID": "user123"
            }
        ]
    }

}