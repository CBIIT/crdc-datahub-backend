// migration-concierge-id.js
async function migrateConciergeIDs() {
    const submissions = db.submissions;
    const users = db.users;

    // Only process submissions that have concierge info but NO conciergeID
    const cursor = submissions.find({
        conciergeName: { $nin: [null, ""] },
        conciergeEmail: { $nin: [null, ""] },
        conciergeID: { $exists: false }  // Only process if conciergeID doesn't exist
    });

    let updatedCount = 0;
    let notFoundCount = 0;
    let skippedCount = 0;

    while (await cursor.hasNext()) {
        const submission = await cursor.next();
        
        // Double-check conciergeID doesn't exist (extra safety)
        if (submission.conciergeID) {
            console.log(`Skipping submission ${submission._id} - conciergeID already exists: ${submission.conciergeID}`);
            skippedCount++;
            continue;
        }

        // Try to find a user that matches name + email
        const userNameArr = submission.conciergeName.trim().split(/\s+/); // split on spaces

        if (!submission.conciergeName) {
            console.log(`no concierge stored for the submission ID: ${submission._id}.`);
            continue
        }

        const query = {
            firstName: userNameArr[0],
            email: submission.conciergeEmail
        };

        // If there's a last name part, add it
        if (userNameArr?.length > 1 && userNameArr[1].trim().length > 0) {
            query.lastName = userNameArr.slice(1).join(" "); // handle multi-part last names
        }

        const user = await users.findOne(query);

        if (user) {
            // Update submission with conciergeID
            const res = await submissions.updateOne(
                { _id: submission._id },
                { $set: { conciergeID: user._id } }
            );

            if (res.modifiedCount > 0) {
                updatedCount++;
                console.log(`Updated submission ${submission._id} with conciergeID ${user._id}`);
            }
        } else {
            notFoundCount++;
            console.warn(
                `⚠️  No matching user found for submission ${submission._id}. ` +
                `Name: "${submission.conciergeName}", Email: "${submission.conciergeEmail}"`
            );
        }
    }
    
    console.log(`Migration complete.`);
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⚠️ Not found: ${notFoundCount}`);
    console.log(`⏭️ Skipped: ${skippedCount}`);
}

// Separate cleanup function - run this ONLY after migration is complete and verified
async function cleanupOldConciergeFields() {
    const unsetRes = await db.submissions.updateMany(
        {
            conciergeID: { $exists: true }  // Only clean up if conciergeID exists
        },
        {
            $unset: {
                submitterName: "",
                conciergeName: "",
                conciergeEmail: ""
            }
        }
    );

    console.log(`Cleanup complete. Removed old fields from ${unsetRes.modifiedCount} submissions.`);
}

migrateConciergeIDs();
