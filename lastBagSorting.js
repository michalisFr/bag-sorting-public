const { logging } = require('./logging');

function moveItem(array, from, to) {
    // Helper function to move an item in an array
    var f = array.splice(from, 1)[0];
    array.splice(to, 0, f);
    return array;
}

async function fullySortLastBag(accountsToSort) {
    // Function to fully sort the accounts in the last bag based on their score
    // 
    // Arguments:
    // - accountsToSort: An array of accounts to be sorted
    //
    // Returns:
    // - sortedBag: The bag with the accounts sorted based on score from higher to lower
    // - putInFrontOf: Array of arrays with heavier-lighter address pairs. Heavier is the account to be put in front of lighter. It will be used to issue the batch call

    // Create a new array and sort it based on score
    const sortedBag = accountsToSort.map((x) => x);
    sortedBag.sort((a, b) => b.score - a.score);

    const putInFrontOf = [];
    
    // Loop over the accounts in sortedBag. 
    // If the score of the account in sortedBag is larger than the score of the account in accountsToSort at the same index, 
    // that's a heavier account that needs to be put in front of the lighter one
    for (let i = 0; i < sortedBag.length; i++) {
        if (sortedBag[i].score > accountsToSort[i].score) {
            putInFrontOf.push([sortedBag[i].id, accountsToSort[i].id]);
            accountsToSort = moveItem(accountsToSort, accountsToSort.indexOf(sortedBag[i]), accountsToSort.indexOf(accountsToSort[i]));
        }
    }

    // A sanity check to make sure no accounts are out of order
    for (let i = 0; i < accountsToSort.length - 1; i++) {
        if (accountsToSort[i].score < accountsToSort[i + 1].score) {
            await logging(`Account ${accountsToSort[i].id} with score ${accountsToSort[i].score} is in front of heavier account ${accountsToSort[i+1].id} with score ${accountsToSort[i+1].score}`);
        }
    }

    return { putInFrontOf, sortedBag };
}

async function semiSortLastBag(accountsInLastBag, lastIndex) {
    // Function to "semi" sort the accounts in the last bag based on score
    // It repositions accounts so that in the end all accounts above the index of the 22,500th account have a higher score than it and all below have a lower score
    // This way the 22,500th account determines minimumActiveStake and ensures that all accounts with a higher stake are in the active set
    // The accounts above or below that account are not necessarily ordered based on stake, but that doesn't matter
    //
    // Arguments:
    // - accountsInLastBag: Array of accounts in the last bag
    // - lastIndex: The index of the 22,500th account in the bag
    //
    // Returns:
    // - putInFrontOf: Array of arrays with heavier-lighter address pairs. Heavier is the account to be put in front of lighter. It will be used to issue the batch call
    // - lastAccount: The account that will be placed at the lastIndex (i.e. at the 22,500th position)

    // Create a new array and sort it based on score
    const sortedBag = accountsInLastBag.map((x) => x);
    sortedBag.sort((a, b) => b.score - a.score);

    const putInFrontOf = [];

    // Get the account that is at lastIndex in the sorted bag. This account needs to be placed at that position after all the putInFrontOf
    const lastAccount = sortedBag[lastIndex];

    let cond = true;
    let i = 0;

    // First we need to position lastAccount in its best possible place in the unsorted bag
    // Start from the top of the unsorted bag and continue the loop (up to the current position of lastAccount) until we find an account with a lower score than lastAccount
    // Then add that pair [lastAccount, <account with lower score>] in the putInFrontOf array
    while(cond && i < accountsInLastBag.indexOf(lastAccount)) {
        if (lastAccount.score > accountsInLastBag[i].score) {
            putInFrontOf.push([lastAccount.id, accountsInLastBag[i].id]);
            accountsInLastBag = moveItem(accountsInLastBag, accountsInLastBag.indexOf(lastAccount), accountsInLastBag.indexOf(accountsInLastBag[i]));
            cond = false;
        }
        i++;
    }

    // Then starting from the next index of lastAccount's new position loop over the rest of the bag
    // Add to putInFrontOf any account that has a higher score than lastAccount so that it's put in front of it
    // With each pair added, lastAccount moves down one place.
    // It started at the best possible position for it (all accounts above it have a higher score)
    // Once all heavier accounts below it have been moved in front of it, any remaining accounts below will have a lower score
    // lastAccount should be at the intended index, because we got that from the sorted bag, where all accounts above have a higher score and all below a lower score by definition
    // So, at the end of both these loops we have achieved the positioning we want
    for (let j = i + 1; j < accountsInLastBag.length; j++) {
        if (accountsInLastBag[j].score > lastAccount.score) {
            putInFrontOf.push([accountsInLastBag[j].id, lastAccount.id]);
        }
    }

    return { putInFrontOf, lastAccount };
}

module.exports = {
    fullySortLastBag,
    semiSortLastBag
}