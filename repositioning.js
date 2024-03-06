const { generateKeypair } = require('./initApi');
const { logging } = require('./logging');

async function doRepositioningFees(api, putInFrontOf) {
    // Function to determine the fees for the batch call of putInFrontOf
    //
    // Arguments:
    // - api
    // - putInFrontOf: Array of arrays with heavier-lighter address pairs. Heavier is the account to be put in front of lighter. It is used to build the batch call
    //
    // Returns:
    // - info: The estimated fees for the call

    return new Promise(async (resolve, reject) => {
        const batchCall = []; // Array to store the calls of the batch
        const keypair = generateKeypair(); // Generate the keypair from the provided seed
    
        // Build the individual putInFrontOfOther calls from the putInFrontOf array and add them to the batchCall array
        putInFrontOf.forEach((account) => {
            // The calls are `voterList.putInFrontOfOther` that allows to permissionlessly move a heavier account in front of a lighter one
            batchCall.push(api.tx.voterList.putInFrontOfOther(
                account[0],
                account[1]
            ));
        });

        // Call paymentInfo function from PJS API on the call to be issued to get the estimation for fees
        const info = await api.tx.utility.forceBatch(batchCall)
        .paymentInfo(keypair);

        resolve(info);
        return;
    });
}

async function doRepositioning(api, putInFrontOf) {
    // Function to issue the batch call of putInFrontOfOther to reposition the accounts in the bag
    //
    // Arguments:
    // - api
    // - putInFrontOf: Array of arrays with heavier-lighter address pairs. Heavier is the account to be put in front of lighter. It is used to build the batch call

    return new Promise(async (resolve, reject) => {
        const batchCall = []; // Array to store the calls of the batch
        const keypair = generateKeypair(); // Generate the keypair from the provided seed
    
        // Build the individual putInFrontOfOther calls from the putInFrontOf array and add them to the batchCall array
        putInFrontOf.forEach((account) => {
            // The calls are `voterList.putInFrontOfOther` that allows to permissionlessly move a heavier account in front of a lighter one
            batchCall.push(api.tx.voterList.putInFrontOfOther(
                account[0],
                account[1]
            ));
        });
    
        // We call singAndSend function from PJS API that will sign and broadcast the batch call
        // Besides the keypair as argument, we subcsribe to the status of the extrinsic and its events to monitor its progress and success
        // This is a standard subscription to do when issuing an extrinsic to verify it's been successful and if not, get the error
        await api.tx.utility.forceBatch(batchCall)
        .signAndSend(keypair, async ({events = [], status, txHash }) => {
            if (status.isInBlock) {
                await logging(`🔃 Repositioning done. Included in block: ${status.asInBlock}`);
            }
            if (status.isFinalized) {
                await logging(`🔃 Repositioning tx finalized. Included in block ${status.asFinalized}`);
                await logging(`🔃 Transaction hash ${txHash.toHex()}`);
                
                // Once the extrinsic is finalized, we loop over its events to check whether the extrinsic and all the calls in the batch completed successfully
                events.forEach(async ({phase, event: { data, method, section }}) => {
                    // The call was forceBatch, which means the execution of the individual calls will continue even if some fail, so we need to check if all of them completed successfully
                    // If the event BatchCompleted has no data, the batch completed with no errors
                    if (section == 'utility' && method == 'BatchCompleted' && data.length == 0) {
                        await logging("🔃 Batch completed successfully");
                    // Otherwise check if it completed with errors and log the error
                    } else if (section == 'utility' && method == 'BatchCompletedWithErrors') {
                        await logging(`🔃 Batch had some errors: ${data}`);
                    // Or if it was interrupted (which should not be the case for a forceBatch)
                    } else if (section == 'utility' && method == 'BatchInterrupted') {
                        await logging(`🔃 Batch was interrupted: ${data}`);
                    }

                    // Check for the ExtrinsicSuccess event to verify the extrinsic itself completed successfully
                    if (section == 'system' && method == 'ExtrinsicSuccess') {
                        await logging("🔃 Extrinsic was successful!");
                    // Or whether it failed, and log the error
                    } else if (section == 'system' && method == 'ExtrinsicFailed') {
                        await logging(`🔃 Extrinsic failed with error: ${data}`);
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
    doRepositioning,
    doRepositioningFees
}
