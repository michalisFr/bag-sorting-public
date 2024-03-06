const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
require('dotenv').config();

// We read the network to connect to from the .env file
const network = process.env.NETWORK;

async function initApi() {
    // Function to initialize the PJS API
    // We call it once from the main script and then pass the api object to any function that needs to connect to the API
    //
    // Returns:
    // - api: An API object that allows to connect to the API

    // Connect to the proper RPC provider
    // Default: polkadot -> Connect to the Parity Polkadot RPC endpoint
    // Options: local -> Connect to a local Polkadot node (fastest)
    //          chopsticks -> Connect to a clone of Polkadot using chopsticks on your local node (for testing) (https://github.com/AcalaNetwork/chopsticks)
    let endpoint = 'wss://rpc.polkadot.io';
    let api;

    if (network == 'local') {
        endpoint = 'ws://127.0.0.1:30944'; // The port needs to be adjusted to point to the node's wss port
    } else if (network == 'chopsticks') {
        endpoint = 'ws://127.0.0.1:8000'; // 8000 is the default port used by chopsticks
    }

    // Create a ws provider using the defined endpoint
    const wsProvider = new WsProvider(endpoint);
    // Create an API promise
    await ApiPromise.create({ provider: wsProvider, noInitWarn: true })
    .then(async (res) => {
        api = res;
    })
    .catch((err) => {
        throw new Error(err);
    });

    return api;
}

function generateKeypair() {
    // Function to generate a keypair from the provided seed
    //
    // Returns:
    // - keypair object

    // We read the mnemonic from the .env file
    const mnemonic = process.env.SENDING_ACCOUNT;
    let addressFormat = 0; // The script is meant to be used with Polkadot, hence we use the Polkadot ss58 prefix for address format for the signing account

    const keyring = new Keyring({ ss58Format: addressFormat });
    const keypair = keyring.addFromUri(mnemonic, null, 'sr25519');

    return keypair;
}



module.exports = {
    initApi,
    generateKeypair
};
