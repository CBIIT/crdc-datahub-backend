function attachStudyIDToSubmissions() {
    const submissions = db.submissions.find({}).toArray();

    for (const submission of submissions) {
        const { studyName, studyAbbreviation, _id } = submission;
        if (!studyName || !studyAbbreviation) continue;

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
                console.log(`Updated submission ${_id} with studyID ${matchedStudy._id}`);
            }
        } else {
            console.warn(`No matching study found for submission ${_id}`);
        }
    }
}

attachStudyIDToSubmissions()