
const fileSizeFormatter = (bytes = 0) => {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    const TB = GB * 1024;

    let formattedSize = "0"; // Default for 0 or negative bytes

    if (bytes >= TB) {
        formattedSize = (bytes / TB).toFixed(2) + " TB";
    } else if (bytes >= GB) {
        formattedSize = (bytes / GB).toFixed(2) + " GB";
    } else if (bytes >= MB) {
        formattedSize = (bytes / MB).toFixed(2) + " MB";
    } else if (bytes > 0) { // Handles bytes between 1 and 1023, formatting as KB
        formattedSize = (bytes / KB).toFixed(2) + " KB";
    } else if (bytes === 0) {
        formattedSize = "0 KB";
    }

    return formattedSize.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const fileSizes = db.batch.aggregate([
    {
      $sort: {
        submissionID: 1,
        updatedAt: -1
      }
    },
    {
      $group: {
        _id: "$submissionID",
        latestBatch: { $first: "$$ROOT" }
      }
    },
    {
      $unwind: "$latestBatch.files"
    },
    {
      $group: {
        _id: "$_id",
        totalSize: { $sum: "$latestBatch.files.size" }
      }
    }
  ]).toArray();
  
  // Step 2: Iterate and update the submissions collection, filtered by status
  if (fileSizes.length > 0) {
    let count = 0;
    fileSizes.forEach(item => {
        item.formattedSize = fileSizeFormatter(item.totalSize);
        db.submissions.updateMany(
            {
                _id: item._id,
                status: { $in: ["Completed", "Released"] }
            },
            { $set: { dataFileSize: {formatted: item.formattedSize, size: item.totalSize}, calculatedDataFileSize: true } }
        );
        count++;
    });
    print(`${count} submissions updated`);
  } else {
    print("No submissions needed to be updated");
  }
  

  db.submissions.updateMany(
      {
          dataFileSize: { $exists: false },
          status: { $in: ["Completed", "Released"] }
      },
      { $set: { dataFileSize: {formatted: "0 KB", size: 0}, calculatedDataFileSize: true } }
  );


  //Review then run the function below to clear the calculated field
  db.submissions.updateMany(
    {
        calculatedDataFileSize: true
    },
    { $unset: { calculatedDataFileSize: ""} }
  );