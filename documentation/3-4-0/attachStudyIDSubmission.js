function isValidUUID(uuid) {
    // UUID v4 regex pattern
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return typeof uuid === 'string' && uuidRegex.test(uuid);
}

function attachStudyIDToSubmissions() {
    const submissions = db.submissions.find({}).toArray();

    for (const submission of submissions) {
        const { studyName, studyAbbreviation, _id, studyID } = submission;
        if (!studyName || !studyAbbreviation) continue;

        // Skip if studyID exists and is already a valid UUID
        if (studyID && isValidUUID(studyID)) {
            console.log(`Skipping submission ${_id} - studyID already valid UUID: ${studyID}`);
            continue;
        }

        const matchedStudy = db.approvedStudies.findOne({
            studyName,
            studyAbbreviation,
        });

        if (matchedStudy?._id) {
            const res = db.submissions.updateOne(
                { _id },
                { $set: { studyID: matchedStudy._id } }
            );
            if (res?.modifiedCount > 0) {
                console.log(`Updated submission ${_id} with studyID ${matchedStudy._id} (was: ${studyID || 'missing'})`);
            }
        } else {
            console.warn(`No matching study found for submission ${_id}`);
        }
    }
}

attachStudyIDToSubmissions()