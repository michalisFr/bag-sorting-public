const fs = require('fs');

function logging(data) {
    // Function to log outputs to file in ./logs (directory needs to exist)
    //
    // Arguments:
    // - data: The data to be written to the file

    return new Promise((resolve, reject) => {
        // We statically define the log file name using the date
        const logFile = `./logs/${new Date(Date.now()).toISOString().split('T')[0]}-semi-2.log`
        const writer = fs.createWriteStream(logFile, {flags:'a', encoding: 'utf-8'})
        writer.write(JSON.stringify(data, undefined, 4) + '\n', (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }           
        });
    });
}

module.exports = {
    logging
};