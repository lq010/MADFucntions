const functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

'use strict'
exports.up_balance_member = functions.database.ref('/groups/{groupId}/members/{userId}')
    .onWrite(event => {
        const root = event.data.ref.root;
        const groupId = event.params.groupId;
        const userId = event.params.userId;

        if (event.data.previous.exists()) {
            return;
        }
        if (!event.data.exists()) { //delete 
            console.log('delete ' + userId);
            return; //TODO remove
        }
        const work = root.child('balances').child(groupId).orderByChild('settledUp').equalTo(false).once('value', function(dataSnapshot) {
            //if the balance is not exist, create the balance
            if (!dataSnapshot.exists()) {
                return root.child('balances').child(groupId).push()
                    .set({
                        'balance': {
                            [userId]: {
                                spending: 0,
                                balance: 0
                            }
                        },
                        'settledUp': false
                    });
            } else {
                return dataSnapshot.forEach(function(balance) {
                    const newestBalanceId = balance.key;
                    if (balance.val().settledUp) {
                        console.log(error + ": balance was settledUp");
                        return;
                    }
                    console.log("balanceId=" + newestBalanceId + " userId=" + userId);
                    //add 
                    console.log('add ' + userId);
                    return root.child('balances').child(groupId).child(newestBalanceId).child('balance').child(userId)
                        .set({
                            spending: 0,
                            balance: 0
                        });

                });
            }
        });
        return Promise.all([work]).then(() => {
            return;
        });
    });
//up_balance_member end..

//update newest balance
exports.updateBalance = functions.database.ref('/expenses/{groupId}/{expenseId}')
    .onWrite(event => {
        const root = event.data.ref.root;
        const groupId = event.params.groupId;
        const expenseId = event.params.expenseId;
        const expense = event.data.val();
        const num_participants = event.data.child('participants').numChildren();

        if (event.data.previous.exists()) {
            if (event.data.previous.child('status').val() == "deleted")
                return;
        }

        const temp = {
            totalCost: expense.cost,
            num_members: 1,
            avg: 0
        }

        temp.avg = temp.totalCost / num_participants;

        const work = root.child('balances').child(groupId).orderByChild('settledUp').equalTo(false).once('value', function(snapshot) {

            snapshot.forEach(function(balance) {

                const newestBalanceId = balance.key;
                if (balance.val().settledUp) {
                    console.log(error + ": balance was settledUp");
                    return;
                }


                const payerId = expense.payer;
                return balance.child('balance').forEach(function(currentBalance) {
                    const userId = currentBalance.key;
                    event.data.child('participants').forEach(function(participant) {
                        if (userId == participant.key) {
                            if (event.data.previous.exists()) { //delete expense

                                root.child('balances').child(groupId).child(newestBalanceId)
                                    .child('expenses').child(expenseId).set(false); //false ->expense was deleted
                                console.log("data exist");
                                const userSpending = (currentBalance.val().spending - temp.avg);
                                root.child('balances').child(groupId).child(newestBalanceId)
                                    .child('balance').child(userId).child('spending').set(userSpending);
                                if (userId == payerId) {
                                    console.log("user=payer: ", currentBalance.val().balance, '-', temp.totalCost, '+', temp.avg);
                                    const userBalance = (currentBalance.val().balance - temp.totalCost + temp.avg);
                                    root.child('balances').child(groupId).child(newestBalanceId)
                                        .child('balance').child(userId).child('balance').set(userBalance);
                                } else {
                                    const userBalance = currentBalance.val().balance + temp.avg;
                                    root.child('balances').child(groupId).child(newestBalanceId)
                                        .child('balance').child(userId).child('balance').set(userBalance);
                                }
                            } else { //add expense

                                root.child('balances').child(groupId).child(newestBalanceId)
                                    .child('expenses').child(expenseId).set(true); //true-> expense is valid 

                                const userSpending = (currentBalance.val().spending + temp.avg);
                                root.child('balances').child(groupId).child(newestBalanceId)
                                    .child('balance').child(userId).child('spending').set(userSpending);
                                if (userId == payerId) {
                                    console.log("user=payer: ", currentBalance.val().balance, '+', temp.totalCost, '-', temp.avg);
                                    const userBalance = (currentBalance.val().balance + temp.totalCost - temp.avg);
                                    root.child('balances').child(groupId).child(newestBalanceId)
                                        .child('balance').child(userId).child('balance').set(userBalance);
                                } else {
                                    const userBalance = currentBalance.val().balance - temp.avg;
                                    root.child('balances').child(groupId).child(newestBalanceId)
                                        .child('balance').child(userId).child('balance').set(userBalance);
                                }
                            }
                        }
                    })
                })
            });
        }).catch(reason => {
            console.log("error: " + reason);
        })
        return Promise.all([work]).then(() => {
            return;
        });
    })


//settled up, create new balance
exports.create_new_balance = functions.database.ref('/balances/{groupId}/{balancesId}/settledUp')
    .onWrite(event => {
        const root = event.data.ref.root;
        const groupId = event.params.groupId;
        const previousValue = event.data.previous.val();
        const newValue = event.data.val();
        if (!previousValue) {
            if (newValue) {
                const one = event.data.ref.parent.child('settleTime').set(admin.database.ServerValue.TIMESTAMP);
                var newKey = root.child('balances').child(groupId).push().key;
                const two = root.child('balances').child(groupId).child(newKey)
                    .set({
                        'settledUp': false
                    });
                const three = root.child('groups').child(groupId).child('members').once('value', function(snapshot) {
                    snapshot.forEach(function(user) {
                        const userId = user.key;
                        console.log("userId=" + userId);
                        root.child('balances').child(groupId).child(newKey).child('balance').child(userId)
                            .set({
                                spending: 0,
                                balance: 0
                            });
                    })
                })
                return Promise.all([one, two, three]);
            }
        }
    })

exports.sendNewExpenseFCM = functions.database.ref('/expenses/{groupId}/{expenseId}')
    .onWrite(event => {
        const root = event.data.ref.root;
        const expense = event.data.val();
        const groupId = event.params.groupId;
        const createdBy = expense.payer;
        const getAllGroupMembersPromise = admin.database().ref(`/groups/${groupId}/members`).once('value');
        const groupNamePromise = root.child("groups").child(groupId).child("name").once('value');

        const payload = {
            data: {
                actionType: 'newExpense',
                groupId: groupId,
                groupName: null,
                createdBy: createdBy,
                creatorName: null
            }
        }

        if (event.data.previous.exists()) {
            if (event.data.child('status').val() == "deleted")
                payload.data.actionType = "deleteExpense"
        }

        return groupNamePromise.then(result => {
            const groupName = result.val();
            payload.data.groupName = groupName;

            return getAllGroupMembersPromise.then(result => {
                const userUidSnapShot = result; //result will have children having keys of group members uid
                if (!userUidSnapShot.hasChildren()) {
                    return console.log(`Nobody in this group(error,at least one user in a group)`)
                }

                payload.data.creatorName = userUidSnapShot.child(createdBy).val();
                const users = Object.keys(userUidSnapShot.val()); //fetched the keys creating array of group members
                var AllGroupMembersFCMPromise = []; //create new array of promises of TokenList for every group members
                for (var i = 0; i < userUidSnapShot.numChildren(); i++) {
                    const user = users[i];
                    AllGroupMembersFCMPromise[i] = admin.database().ref(`/users/${user}/deviceTokens/`).once('value');
                }
                return Promise.all(AllGroupMembersFCMPromise).then(results => {
                    var tokens = []; // here is created array of tokens now ill add all the tokens of all the user and then send notification to all these.
                    for (var i in results) {
                        var usersTokenSnapShot = results[i];
                        if (usersTokenSnapShot.exists()) {
                            if (usersTokenSnapShot.hasChildren()) {
                                const token = Object.keys(usersTokenSnapShot.val()); // a array of all tokens of user[i]
                                tokens = tokens.concat(token);
                            } else {
                                //nothing to do
                            }
                        }
                    }
                    console.log('final tokens = ', tokens, 'notifications = ', payload);
                    return admin.messaging().sendToDevice(tokens, payload).then(response => {
                        const tokensToRemove = []; // for each message if there was an error
                        response.results.forEach((result, index) => {
                            const error = result.error;
                            if (error) {
                                console.error('Failure sending notification to uid=', tokens[index], error);
                                //clear the tokens who are not registered anymore.
                                if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
                                    tokensToRemove.push(usersTokenSnapShot.ref.child(tokens[index]).remove()); //??


                                }
                            } else {
                                console.log("notification sent", result);
                            }
                        });
                        return Promise.all(tokensToRemove);
                    });
                    //return console.log('final tokens = ', tokens, " notification= ", payload);
                });
            });
        });
    });

// const nodemailer = require('nodemailer');

// const gmailEmail = encodeURIComponent(functions.config().gmail.email);
// const gmailPassword = encodeURIComponent(functions.config().gmail.password);
// const mailTransport = nodemailer.createTransport(
//     `smtps://${gmailEmail}:${gmailPassword}@smtp.gmail.com`);

exports.create_new_user = functions.auth.user().onCreate(event => {
    const user = event.data;
    const uid = user.uid;
    const email = user.email;
    const displayName = user.displayName;
    const one = admin.database().ref(`/users/${uid}/`).child('name').set(displayName);
    const two = admin.database().ref(`/users/${uid}/`).child('email').set(email);
    return Promise.all([one, two]);
    //  return sendGoodbyEmail(email, displayName);

})

// function sendWelcomeEmail(email, displayName) {
//   const mailOptions = {
//     from: '"MyCompany" <noreply@firebase.com>',
//     to: email
//   };

//   // The user subscribed to the newsletter.
//   mailOptions.subject = `Welcome to ${APP_NAME}!`;
//   mailOptions.text = `Hey ${displayName}!, Welcome to ${APP_NAME}. I hope you will enjoy our service.`;
//   return mailTransport.sendMail(mailOptions).then(() => {
//     console.log('New welcome email sent to:', email);
//   });
// }