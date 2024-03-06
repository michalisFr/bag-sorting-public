const { generateKeypair } = require('./initApi');
const { logging } = require('./logging');

function needRebag(accountsInLastBag, bagThresholds) {
    // Function to find which accounts in the last bag need rebagging, if any
    // voterList.rebag moves an account that has a stake outside the bounds of its current bag into its proper bag
    // Note that this is based on correctScore, i.e. on the actual stake the account has, and not the potentially "incorrect" score stored on-chain
    //
    // Arguments:
    // - accountsInLastBag: Array of accounts in the last bag
    // - bagThresholds: Runtime constant array with the upper limits of all bags in Balance type
    //
    // Returns:
    // - accountsToRebag: Array of accounts that need rebagging

    const accountsToRebag = []; // Array to store the accounts that need rebagging
    const accountsToRemove = []; // Array to store the address of these accounts in order to be removed from accountsInLastBag

    // Loop over all accounts in the last bag to find if any require rebagging
    accountsInLastBag.forEach((currentAccount) => {
        // Find the upper limit of the bag where the account actually belongs
        const canonicalUpper = bagThresholds.find((t) => t.gt(currentAccount.scoreBn));

        // If that upper limit is higher or lower than the account's current bag's upper limit, the account is in the wrong bag
        if (canonicalUpper.gt(currentAccount.bagUpperBn) || canonicalUpper.lt(currentAccount.bagUpperBn)) {
            accountsToRebag.push(currentAccount);
            accountsToRemove.push(currentAccount);
        }
    });

    // Remove any accounts that will be rebagged from the accountsInLastBag array
    accountsToRemove.forEach((account) => {
        const index = accountsInLastBag.indexOf(account);
        accountsInLastBag.splice(index, 1);
    });

    return accountsToRebag;
}

async function doRebagFees(api, accountsToRebag) {
    // Function to determine the fees for the batch call of rebag
    //
    // Arguments:
    // - api
    // - accountsToRebag: Array of accounts that need rebagging
    //
    // Returns:
    // - info: The estimated fees for the call

    return new Promise(async (resolve, reject) => {
        const batchCall = []; // Array to store the calls of the batch
        const keypair = generateKeypair(); // Generate the keypair from the provided seed
    
        // Build the individual rebag calls from the accountsToRebag array and add them to the batchCall array
        accountsToRebag.forEach((account) => {
            // The calls are `voterList.rebag` that allows to permissionlessly rebag an account that's in the wrong bag
            batchCall.push(api.tx.voterList.rebag(account.id));
        });

        // Call paymentInfo function from PJS API on the call to be issued to get the estimation for fees
        const info = await api.tx.utility.forceBatch(batchCall)
        .paymentInfo(keypair);

        resolve(info);
        return;
    });
}

async function doRebag(api, accountsToRebag) {
    // Function to issue the batch call of rebag to reposition the accounts in the bag
    //
    // Arguments:
    // - api
    // - accountsToRebag: Array of accounts that need rebagging

    return new Promise(async (resolve, reject) => {
        const batchCall = []; // Array to store the calls of the batch
        const keypair = generateKeypair(); // Generate the keypair from the provided seed
    
        // Build the individual rebag calls from the accountsToRebag array and add them to the batchCall array
        accountsToRebag.forEach((account) => {
            // The calls are `voterList.rebag` that allows to permissionlessly rebag an account that's in the wrong bag
            batchCall.push(api.tx.voterList.rebag(account.id));
        });

        // We call singAndSend function from PJS API that will sign and broadcast the batch call
        // Besides the keypair as argument, we subcsribe to the status of the extrinsic and its events to monitor its progress and success
        // This is a standard subscription to do when issuing an extrinsic to verify it's been successful and if not, get the error
        await api.tx.utility.forceBatch(batchCall)
        .signAndSend(keypair, async ({events = [], status, txHash }) => {
            if (status.isInBlock) {
                await logging(`🛍️ Rebagging done. Included in block: ${status.asInBlock}`);
            }
            if (status.isFinalized) {
                await logging(`🛍️ Rebagging tx finalized. Included in block ${status.asFinalized}`);
                await logging(`🛍️ Transaction hash ${txHash.toHex()}`);

                // Once the extrinsic is finalized, we loop over its events to check whether the extrinsic and all the calls in the batch completed successfully
                events.forEach(async ({phase, event: { data, method, section }}) => {
                    // The call was forceBatch, which means the execution of the individual calls will continue even if some fail, so we need to check if all of them completed successfully
                    // If the event BatchCompleted has no data, the batch completed with no errors
                    if (section == 'utility' && method == 'BatchCompleted' && data.length == 0) {
                        await logging("🛍️ Batch completed successfully");
                    // Otherwise check if it completed with errors and log the error
                    } else if (section == 'utility' && method == 'BatchCompletedWithErrors') {
                        await logging("🛍️ Batch completed successfully");
                    // Or if it was interrupted (which should not be the case for a forceBatch)
                    } else if (section == 'utility' && method == 'BatchInterrupted') {
                        await logging(`🛍️ Batch was interrupted: ${data}`);
                    }

                    // Check for the ExtrinsicSuccess event to verify the extrinsic itself completed successfully
                    if (section == 'system' && method == 'ExtrinsicSuccess') {
                        await logging("🛍️ Extrinsic was successful!");
                    // Or whether it failed, and log the error
                    } else if (section == 'system' && method == 'ExtrinsicFailed') {
                        await logging(`🛍️ Extrinsic failed with error: ${data}`);
                    }
                });

                await logging("----------------------------------------------");
                resolve();
                return;
            }
        });
    });
}

module.exports = {
    needRebag,
    doRebag,
    doRebagFees
};