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
    const approvedStudies = db.approvedStudies.find().toArray();
    let updatedCount = 0;
    approvedStudies.forEach(study => {
        const studyID = study._id;

        const found = db.organization.findOne({
            "studies._id": { $in: [studyID] }
        });

        if (!found) {
            print(`Linking missing study ${studyID} to NA program...`);
            const result = db.organization.updateOne(
                { _id: NAProgramID },
                { $addToSet: { studies: { _id: studyID } } }
            );
            if (result.modifiedCount > 0) {
                updatedCount++;
            }
        }
    });
    console.log(`Updated Records: ${updatedCount}`);
}
updateSubmission();
// NA program, must be created in the organization collection before running the script
// NOTE: initializeNAProgram.js script must be run before this.
updateNonAssignedProgram("437e864a-621b-40f5-b214-3dc368137081");