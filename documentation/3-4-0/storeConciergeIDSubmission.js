// migration-concierge-id.js
async function migrateConciergeIDs() {
    const submissions = db.submissions;
    const users = db.users;

    const cursor = submissions.find({
        conciergeName: { $nin: [null, ""] },
        conciergeEmail: { $nin: [null, ""] }
    });

    let updatedCount = 0;
    let notFoundCount = 0;

    while (await cursor.hasNext()) {
        const submission = await cursor.next();
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
    if (updatedCount > 0) {
        console.log(`✅ Updated ${updatedCount} submissions.`);
    }

    if (notFoundCount > 0) {
        console.log(`⚠️ Could not find matching user for ${notFoundCount} submissions.`);
    }

    // After migration, remove old fields globally
    const unsetRes = await submissions.updateMany(
        {},
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
