const { initApi } = require('./initApi');
const { findLastAccount, findLastBag } = require('./findLast');
const { getAccountsInLastBag } = require('./accountsInLastBag');
const { semiSortLastBag } = require('./lastBagSorting');
const { needRebag, doRebag, doRebagFees } = require('./rebagging');
const { doRepositioning, doRepositioningFees } = require('./repositioning');
const { logging } = require('./logging');

async function main(){
    // Main script function
    //
    // Calls the necessary functions in order to:
    // 1. Find the last account and bag
    // 2. Get the accounts in the last bag
    // 3. Rebag any accounts needed
    // 4. Find the accounts that need to be repositioned
    // 5. Do the repositioning

    const startTime = Date.now();
    console.log(new Date(Date.now()).toISOString());
    await logging(new Date(Date.now()).toISOString());
    await logging("--------------------------");

    // Initiate the API
    const api = await initApi();

    let lastIndex; // Index of the 22,500th account in its bag
    let lastBag; // The last bag: the bag that includes the 22,500th account
    let lastBagUpper; // The upper limit of the last bag
    let currentNode; // The 22,500th account 
    let bagThresholds; // Runtime constant array with the upper limits of all bags in Balance type

    // Find the index of the 22,500th account in its bag, as well as its bag (lastBag)
    ({ lastIndex, lastBag, lastBagUpper, currentNode, bagThresholds } = await findLastAccount(api));

    await logging("⬇️ Last bag (before rebagging)");
    await logging("--------------------------");
    await logging(`Last bag upper (before rebagging): ${lastBagUpper.toHuman()}`);
    await logging(lastBag.toHuman());
    await logging(`Last index (before rebagging): ${lastIndex}`);
    await logging(currentNode.toHuman());
    await logging("--------------------------");

    // Get the accounts in the last bag
    const accountsInLastBag = await getAccountsInLastBag(api, lastBag.toHuman().head);

    await logging(`👜 ${accountsInLastBag.length} accounts in last bag (before rebagging)`);
    await logging("----------------------------------");

    // Log all accounts in the last bag with their index
    for (i = 0; i < accountsInLastBag.length; i++) {
        await logging(i);
        await logging(accountsInLastBag[i]);
    }

    // Get the accounts that need rebagging
    let accountsToRebag = await needRebag(accountsInLastBag, bagThresholds);

    // If there are any, proceed to rebag them
    if (accountsToRebag.length > 0) {
        await logging(`🛍️ ${accountsToRebag.length} accounts will be rebagged`);

        // Get the fee info for rebagging
        const feeInfo = await doRebagFees(api, accountsToRebag);
        await logging(`💸 ${feeInfo.partialFee.toHuman()} will be paid in fees for rebagging`);
        await logging("----------------------------------");
        await logging(accountsToRebag);
        
        // Do the rebagging
        await doRebag(api, accountsToRebag);

        // After the rebagging is done we recheck if any accounts still need rebagging, as a sanity check (there shouldn't be any)
        accountsToRebag = await needRebag(accountsInLastBag, bagThresholds);
        if (accountsToRebag.length > 0) {
            await logging(`🆘 Something went wrong. There are still ${accountsToRebag.length} accounts to be rebagged!`);
            await logging("-------------------------------------------------------------------------");
            await logging(accountsToRebag);
        }
        
        // Then we recalculate the index of the 22,500th and get the last bag (in case we jumped to the next bag after rebagging)
        ({ lastIndex, lastBag, lastBagUpper, currentNode, bagThresholds } = await findLastAccount(api));
    
        await logging("⬇️ Last bag (after rebagging)");
        await logging("--------------------------");
        await logging(`Last bag upper (after rebagging): ${lastBagUpper.toHuman()}`);
        await logging(lastBag.toHuman());
        await logging(`Last index (after rebagging): ${lastIndex}`);
        await logging(currentNode.toHuman());
        await logging("--------------------------");

    // If there were no accounts that needed rebagging, we simply log that
    } else {
        await logging("----------------------------------");
        await logging("🎉 No accounts need rebagging!");
        await logging("----------------------------------");
    }
    
    // Get the accounts that need repositioning and the account that needs to be 22,500th (at the last index in the bag)
    let { putInFrontOf, lastAccount } = await semiSortLastBag(accountsInLastBag, lastIndex);

    await logging(lastAccount);
    await logging("----------------------");
    
    // If there are accounts that need repositioning
    if (putInFrontOf.length > 0) {
        await logging(`🔃 ${putInFrontOf.length} repositionings will happen`);

        // Get the fee info for the repositioning batch call
        const feeInfo = await doRepositioningFees(api, putInFrontOf);
        await logging(`💸 ${feeInfo.partialFee.toHuman()} will be paid in fees for repositioning`);
        await logging("--------------------------------------");
        
        await logging(putInFrontOf);

        // Issue the bath call to reposition the accounts
        await doRepositioning(api, putInFrontOf);

        // Once that's done we get the (now sorted) last bag. We need to get the head again (the first account in the bag), because now it may have changed
        ({ lastBag, lastBagUpper } = await findLastBag(api, currentNode.score, bagThresholds));
        // We need the head to call getAccountsInLastBag again to get the accounts in the now "adjustedBag"
        const adjustedBag = await getAccountsInLastBag(api, lastBag.toHuman().head);
        
        // We check again if there are any accounts that still need to be putInFrontOf, as a sanity check (there shouldn't be any)
        putInFrontOf = await semiSortLastBag(adjustedBag, lastIndex);

        if (putInFrontOf.length > 0) {
            await logging(`🆘 Something went wrong. There are still ${putInFrontOf.length} accounts to be repositioned!`);
            await logging("-----------------------------------------------------------------------------");
            await logging(putInFrontOf);
        }
      
        await logging("Adjusted bag");
        await logging("----------------------");

        // We log the accounts in the (new) adjusted bag along with their indices
        for (i = 0; i < adjustedBag.length; i++) {
            await logging(i);
            await logging(adjustedBag[i]);
        }
        await logging("----------------------");

        await logging("Adjusted bag (scores only)");
        await logging("----------------------");

        // We also log just their scores to be able to quickly verify no accounts are in the wrong position
        for (i = 0; i < adjustedBag.length; i++) {
            if (i == lastIndex) {
                await logging("----------------------");
            }
            await logging(adjustedBag[i].score/1e10);
            if (i == lastIndex) {
                await logging("----------------------");
            }
        }
        await logging("----------------------");

        // Finally we do an automated sanity check that no accounts with higher score are below the last account and no accounts with lower score above it
        for (let i = 0; i < adjustedBag.length; i++) {
            if (adjustedBag[i].score > adjustedBag[lastIndex].score && i > lastIndex) {
                await logging(`Heavier account ${adjustedBag[i].id} with score ${adjustedBag[i].score} is below last account ${adjustedBag[lastIndex].id} with score ${adjustedBag[lastIndex].score}`);
            }
            if (adjustedBag[i].score < adjustedBag[lastIndex].score && i < lastIndex) {
                await logging(`Lighter account ${adjustedBag[i].id} with score ${adjustedBag[i].score} is in front of last account ${adjustedBag[lastIndex].id} with score ${adjustedBag[lastIndex].score}`);
            }
        }
            
    // If no accounts needed repositioning, then simply log that      
    } else {
        await logging("----------------------------------");
        await logging("🎉 No accounts need repositioning!");
        await logging("----------------------------------");
    }

    console.log(`Completed in: ${(Date.now() - startTime)/1000} s`);
    await logging(`Completed in: ${(Date.now() - startTime)/1000} s`);
    return;
}

main()
.then(process.exit);