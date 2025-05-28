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

function updateNonAssignedProgram(NAProgramID) {
    const aProgram = db.organization.findOne({ _id: NAProgramID });
    const res = db.submissions.updateMany(
        {$or: [{"organization._id":  {$eq: null}}, {organization: {"$exists": false}}]},
        { $set: {
                "organization._id": aProgram?._id,
                "organization.name": aProgram?.name,
                "organization.abbreviation": aProgram?.abbreviation,
        } }
    );

    console.log(`Matched Records: ${res.matchedCount || 0}`);
    console.log(`Updated Records: ${res.modifiedCount || 0}`);
}

updateSubmission();
// NA program, must be created in the organization collection before running the script
updateNonAssignedProgram("437e864a-621b-40f5-b214-3dc368137081");