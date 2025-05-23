/**
 * updateSubmission - populate the submission document with the abbreviation from the program document and the studyName from the approved studies.
 */
function updateSubmission() {
    const submissions = db.submissions.find({}).toArray();
    const matchedCount = submissions?.length;
    let updatedCount = 0;
    for (const submission of submissions) {
        const updates = {};
        if (submission.studyID && !submission.studyName) {
            const study = db.approvedStudies.findOne({ _id: submission.studyID });
            if (study && study.studyName && study.studyName !== submission.studyName) {
                updates.studyName = study.studyName;
            }
        }

        if (submission?.organization && submission?.organization?._id && !submission?.organization?.abbreviation) {
            const org = db.organization.findOne({ _id: submission.organization._id });
            if (org && org.abbreviation && org.abbreviation !== submission.organization.abbreviation) {
                updates['organization.abbreviation'] = org.abbreviation;
            }
        }

        // Apply update if needed
        if (Object.keys(updates).length > 0) {
            const res = db.submissions.updateOne(
                { _id: submission._id },
                { $set: updates }
            );

            if (res.modifiedCount > 0) {
                updatedCount += 1;
            }
        }
    }
    console.log(`Matched Records: ${matchedCount}`);
    console.log(`Updated Records: ${updatedCount}`);
}

updateSubmission();