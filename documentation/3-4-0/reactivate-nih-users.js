
function reactivateNIHUsers(){
    let result = db.users.updateMany(
        {
            IDP: "nih"
        },
        {
            $set: { userStatus: "Active", updateAt: new Date()}
        }
    );
    console.log(result);
}

reactivateNIHUsers();
