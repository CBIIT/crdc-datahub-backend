async function findProgramIdForStudy(studyID) {
    const prog = await db.organization.findOne(
        { "studies._id": studyID }, // direct array membership check
        { projection: { _id: 1 } }
    );
    return prog?._id || null;
}

async function setProgramIDs() {
    // 1) Fetch NA program once
    const naProgram = await db.organization.findOne({ name: "NA" }, { projection: { _id: 1, name: 1 } });
    if (!naProgram?._id) {
        throw new Error('❌ No "NA" program found. Please insert a program { name: "NA" } first.');
    }
    console.log(`Using NA program: ${naProgram._id}`);

    // 2) Iterate all submissions that have a studyID
    const cursor = db.submissions.find({ studyID: { $exists: true, $ne: null } });

    let total = 0;
    let successCount = 0;
    const failed = [];

    while (await cursor.hasNext()) {
        const s = await cursor.next();
        total++;

        try {
            const programId = (await findProgramIdForStudy(s.studyID)) || naProgram._id;
            const res = await db.submissions.updateOne(
                { _id: s._id },
                { $set: { programID: programId } }
            );

            if (res.modifiedCount === 1) {
                console.log(`Updated submissionID: ${s._id} programID: ${programId} studyID: ${s.studyID}`);
                successCount++;
            }

        } catch (err) {
            console.error(`❌ Failed for submission ${s._id}: ${err.message}`);
            failed.push({ id: s._id, error: err.message });
        }
    }

    // 3) Summary
    console.log(`\nSummary setting a ProgramID for the submissions.`);
    console.log(`Scanned:  ${total}`);
    console.log(`Updated:  ${successCount}`);
    if (failed.length > 0) {
        console.log(`\n❌ Failed: ${failed.length}`);
        console.log(JSON.stringify(failed, null, 2));
    }
}
setProgramIDs()
