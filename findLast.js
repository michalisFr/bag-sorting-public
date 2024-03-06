const { logging } = require('./logging');
const { strict } = require('assert');

async function findLastAccount(api) {
    // Function to find the 22,500th account and its index in its bag
    //
    // Arguments:
    // - api object
    //
    // Returns:
    // - lastIndex: The index of the 22,500th in its bag
    // - lastBag: The bag where the 22,500th account is in
    // - lastBagUpper: The upper limit of the last bag
    // - currentNode: The 22,500th account
    // - bagThresholds: Runtime constant array with the upper limits of all bags in Balance type

    // Query all bags and get the upper limits of each one in Balance type
    const entries = await api.query.voterList.listBags.entries();
    const bagThresholds = await api.consts.voterList.bagThresholds.map((x) => api.createType('Balance', x));

    const bags = []; // store each bag's upper limit and head (first account)
    let totalCounter = 0; // Counter for total number of accounts
    let bagCounter = 0; // Counter of accounts in a bag

    // Loop over all bags to find their upper limit and head account -> store them in bags array
    entries.forEach(([key, bag]) => {
		if (bag.isSome && bag.unwrap().head.isSome && bag.unwrap().tail.isSome) {
			const head = bag.unwrap().head.unwrap();

			const keyInner = key.args[0];
			const upper = api.createType('Balance', keyInner.toBn());
            // check if the upper limit exists in bagThresholds
			strict(
				bagThresholds.findIndex((x) => x.eq(upper)) > -1,
				`upper ${upper} not found in ${bagThresholds}`
			);
			bags.push({ head, upper });
		}
	});

    // Sort the bags from higher to lower limit
    bags.sort((a, b) => b.upper - a.upper);

    // Loop over all bags to count the accounts in the election
    for (const { head } of bags) {
		// Start from the head of the bag
		let current = head;
		let cond = true;
        bagCounter = 0;

        // Loop over all accounts in the bag
		while (cond) {
			const currentNode = (await api.query.voterList.listNodes(current)).unwrap();
			bagCounter += 1;
            totalCounter += 1;

            // When we reach the 22,500th account, log the account and return the data
            if (totalCounter == 22500) {
                await logging("----------------------------------------------");
                await logging(head.toHuman(), bagCounter, totalCounter);
                await logging("----------------------------------------------");
                const lastIndex = bagCounter - 1;

                // Call findLastBag to get the details of the bag
                const { lastBag, lastBagUpper } = await findLastBag(api, currentNode.score, bagThresholds);
                return { lastIndex, lastBag, lastBagUpper, currentNode, bagThresholds };
            }

            // As long as there is a next account in the bag continue the loop
			if (currentNode.next.isSome) {
				current = currentNode.next.unwrap();
			} else {
				cond = false;
			}
		}
	}
}

async function findLastBag(api, score, bagThresholds) {    
    // Function to get the last bag and its upper limit from the score of the 22,500th account
    // It's of general function actually and will find the bag the specific score belongs to, not just the last bag
    //
    // Arguments:
    // - api
    // - score: The score we want to find its bag for
    // - bagThresholds: Runtime constant array with the upper limits of all bags 
    //
    // Returns:
    // - lastBag: The bag where the 22,500th account is in
    // - lastBagUpper: The upper limit of the last bag

    // Translate score in Balance type
    const minActiveStakeBalance =  await api.createType('Balance', score);
    
    const lastBagUpper = bagThresholds.find((x) => x.gt(minActiveStakeBalance));
    const lastBag = await api.query.voterList.listBags(lastBagUpper);

    return { lastBag, lastBagUpper };
}

module.exports = {
    findLastAccount,
    findLastBag
}