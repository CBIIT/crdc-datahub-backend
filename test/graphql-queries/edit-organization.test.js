const { ERROR } = require("../../crdc-datahub-database-drivers/constants/error-constants");
const {Organization} = require("../../crdc-datahub-database-drivers/services/organization");

describe('Test Organization Service', () => {

    let organization;

    beforeAll(() => {
        const mockOrganizationCollection = {
            aggregate: jest.fn().mockResolvedValue([{
                "_id": "437e864a-621b-40f5-b214-3dc368137081",
                "name": "NA",
                "abbreviation": "NA",
                "status": "Active",
                "bucketName": "crdc-hub-dev-submission",
                "rootPath": "437e864a-621b-40f5-b214-3dc368137081",
                "createdAt": {
                    "$date": "2025-05-06T00:00:00.000Z"
                },
                "updateAt": {
                    "$date": "2025-05-06T00:00:00.000Z"
                },
                "studies": [],
                "readOnly": true
            }])
        }
        organization = new Organization(mockOrganizationCollection);
    })

    test('Get error editing NA program', async () => {
        await expect(organization.editOrganization("437e864a-621b-40f5-b214-3dc368137081", null))
            .rejects.toThrow(ERROR.CANNOT_UPDATE_READ_ONLY_PROGRAM);
    });



});