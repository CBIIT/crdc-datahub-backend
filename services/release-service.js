class ReleaseService {
    constructor(releaseCollection) {
        this.releaseCollection = releaseCollection;
    }

    async deleteReleaseBySubmissionID(submissionID) {
        const res = await this.releaseCollection.deleteMany({submissionID: submissionID});
        if (!res.acknowledged) {
            console.error("Failed to delete release records submissionID", submissionID);
        }
    }
}

module.exports = {
    ReleaseService
};