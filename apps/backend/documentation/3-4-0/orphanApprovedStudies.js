
async function naElementFactory(naOrg) {
    const usesObject = Array.isArray(naOrg.studies) && naOrg.studies.some(s => s && typeof s === "object" && s._id);
    return (id) => (usesObject ? { _id: id } : id);
}


async function findOrphanApprovedStudies() {
    const orphans = await db.approvedStudies.aggregate([
        {
            $lookup: {
                from: "organization",
                let: { sid: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $in: [
                                    "$$sid",
                                    {
                                        $map: {
                                            input: { $ifNull: ["$studies", []] },
                                            as: "s",
                                            in: { $ifNull: ["$$s._id", "$$s"] } // supports {_id} or direct string
                                        }
                                    }
                                ]
                            }
                        }
                    },
                    { $project: { _id: 1 } }
                ],
                as: "orgs"
            }
        },
        { $match: { $expr: { $eq: [{ $size: "$orgs" }, 0] } } },
        { $project: { _id: 1, studyName: 1, dbGaPID: 1 } }
    ]).toArray();

    return orphans;
}


async function migrateOrphansToNA() {
    const naProgram = await db.organization.findOne(
        { name: "NA" }
    );
    if (!naProgram?._id) {
        throw new Error('❌ No "NA" program found. Please insert a NA program first.');
    }
    console.log(`Using NA program: ${naProgram._id} ("${naProgram.name}")`);

    // 2) Find orphan studies
    const orphans = await findOrphanApprovedStudies();
    console.log(`Orphan studies found: ${orphans.length}`);

    if (orphans.length === 0) {
        console.log("No orphan studies.");
        return;
    }

    const toNAElement = await naElementFactory(naProgram);
    const elementsToAdd = orphans.map(o => toNAElement(o._id));

    const CHUNK = 500;
    let chunksApplied = 0;

    for (let i = 0; i < elementsToAdd.length; i += CHUNK) {
        const chunk = elementsToAdd.slice(i, i + CHUNK);

        const res = await db.organization.updateOne(
            { _id: naProgram._id },
            {
                $addToSet: { studies: { $each: chunk } },
                $set: { updateAt: new Date() }
            }
        );

        chunksApplied += 1;
        console.log(
            `Chunk ${chunksApplied}: attempted to add ${chunk.length} (modifiedCount=${res.modifiedCount ?? 0})`
        );
    }

    console.log("\n---- Summary Orphan Approved Study ----");
    console.log(`Total orphans considered: ${orphans.length}`);
    orphans.slice(0, 20).forEach(s =>
        console.log(JSON.stringify({ _id: s._id, studyName: s.studyName}))
    );
}

migrateOrphansToNA();