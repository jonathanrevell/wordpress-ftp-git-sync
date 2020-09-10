const config = require("config");
const fs = require("fs");

/**
 * Applies the SSH credentials to the connection configuration object
 * @param {*} connectionConfig 
 */
function resolveSSHCredentials(connectionConfig) {
    // Get the password if specified
    if(config.has("sftp.password")) {
        connectionConfig.password = config.get("sftp.password");
    }

    // Resolve the SSH authentication
    if(config.has("sftp.privateKeyPath")) {
        connectionConfig.privateKey = fs.readFileSync( config.get("sftp.privateKeyPath") );

    } else if(process.env.SSH_AUTH_SOCK) {
        connectionConfig.agent = process.env.SSH_AUTH_SOCK;

    } else {
        throw new Error("sftp.privateKeyPath required");
    }    
}

module.exports = resolveSSHCredentials;