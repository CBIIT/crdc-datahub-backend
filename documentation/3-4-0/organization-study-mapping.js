function updateOrgStudies() {
    db.organization.find({ studies: { $exists: true, $ne: [] } }).forEach(doc => {
        const studyIDs = doc.studies.map(s => s._id);

        print(`Updating document _id: ${doc._id}`);
        print(`Converted studies to array of IDs: ${JSON.stringify(studyIDs)}`);

        const result = db.organization.updateOne(
            { _id: doc._id },
            {
                $set: {
                    studies: studyIDs // ✅ replaces 'studies' with array of string IDs
                }
            }
        );

        print(`Update result: ${JSON.stringify(result)}`);
        print('-----------------------------------');
    });
}


updateOrgStudies();
