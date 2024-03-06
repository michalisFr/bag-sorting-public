async function correctScoreOf(api, node) {
    // Helper function to find the correct score (i.e. bonded amount) of an account
    // The score of an account isn't updated due to rewards or slashes, so the score of an account might not correspond to the actual bonded amount
    //
    // Arguments:
    // - api
    // - node: The account to find the score for
    //
    // Returns:
    // - The actual bonded amount in Big Number type

    const currentAccount = node.id;
    const controller = (await api.query.staking.bonded(currentAccount)).unwrap();
    return (await api.query.staking.ledger(controller)).unwrapOrDefault().active.toBn();
}

async function getAccountsInLastBag(api, head) {
    // Function to get all the accounts in the last bag and update their scores to the actual bonded amount
    //
    // Arguments:
    // - api
    // - head: The first account in the bag
    // 
    // Returns:
    // - accountsInLastBag: An array of objects, each object being one account

    // Start from the head of the bag
    let current = head;
    let condition = true;
    const accountsInLastBag =[]; // Array to store the accounts

    // Loop over all accounts in the bag
    while (condition) {
        const currentAccount = (await api.query.voterList.listNodes(current)).unwrap();
        let updatedAccount = {}; // New object to store the account details

        // Get the correct score of the account
        const correctScore = await correctScoreOf(api, currentAccount);

        // We create a new object with human readable account details
        // We store the upper limit of the bag and the account score in both Big Number and Number types
        // Big Number is needed for compatibility with bagThresholds, Number is for human readability
        updatedAccount = {
            id: currentAccount.id.toHuman(),
            prev: currentAccount.prev.toHuman(),
            next: currentAccount.next.toHuman(),
            bagUpper: currentAccount.bagUpper.toNumber(),
            bagUpperBn: currentAccount.bagUpper.toBn(),
            score: correctScore.toNumber(),
            scoreBn: correctScore.toBn()
        }

        accountsInLastBag.push(updatedAccount);

        // As long as there is a next account in the bag keep the loop going
        if (currentAccount.next.isSome) {
            current = currentAccount.next.unwrap();
        } else {
            condition = false;
        }
    }

    return accountsInLastBag;
}

module.exports = {
    getAccountsInLastBag
}