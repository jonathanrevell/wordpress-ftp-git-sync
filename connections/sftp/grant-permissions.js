const Client = require("ssh2").Client;
const config = require("config");
const resolveSSHCredentials = require("./resolve-credentials.js");

const GROUP = "ftpsync";

const connectionConfig = {
    host: config.get("sftp.host"),
    port: config.get("sftp.port", 22),
    username: config.get("sftp.user")
};

resolveSSHCredentials(connectionConfig);

function promiseExec(conn, command) {
    return new Promise((resolve, reject) => {
        var streamClosed = false;
        var outReceived = false;
        var errReceived = false;
        var resolveData = null;

        function attemptResolve(withValue) {
            if(withValue !== undefined) {
                resolveData = withValue;
            }
            if(streamClosed && outReceived) {
                resolve(resolveData);
            } else if(streamClosed) {
                setTimeout(() => {
                    resolve(resolveData);
                }, 500);
            }
        }
        function attemptReject(withValue) {
            if(withValue !== undefined) {
                resolveData = withValue;
            }
            if(streamClosed && errReceived) {
                reject(resolveData);
            } else if(streamClosed) {
                setTimeout(() => {
                    reject(resolveData);
                }, 500);
            }
        }

        conn.exec(command, function(err, stream) {
            stream.on("close", function(code, signal) {
                // console.log(`Stream :: close :: code ${code}, signal: ${signal}`);
                streamClosed = true;
                if(errReceived) {
                    attemptReject();
                } else {
                    attemptResolve();
                }
            }).on("data", function(data) {
                console.log("STDOUT: " + data);
                outReceived = true;
                attemptResolve(data.toString());
            }).stderr.on("data", function(data) {
                console.log("STDERR: " + data);
                errReceived = true;
                attemptReject(data.toString());
            });
        });
    });
}


function grantPermissions() {
    console.log("Connecting via SSH and granting permissions");

    return new Promise((resolve, reject) => {
        var conn = new Client();
        conn.on("ready", function() {
            console.log(`SSH Client Ready`);
            console.log(`Adding group and setting permissions for folder`);

            promiseExec(conn, `sudo groupadd ${GROUP}`)
                .catch(err => {
                    if(err.indexOf("already exists") >= 0) {
                        console.log("Won't recreate group");
                        return true;
                    } else {
                        throw new Error(err);
                    }
                })
                .then(() => {
                    console.log("Adding user to group");
                    return promiseExec(conn, `sudo adduser ${config.get("sftp.user")} ${GROUP}`)
                })
                .catch(err => {
                    if(err.indexOf("already a member of") >= 0) {
                        console.log("Won't add user again");
                    } else {
                        throw new Error(err);
                    }
                })
                .then(() => {
                    console.log(`Granting ownership to group`);
                    return promiseExec(conn, `sudo chown -R ${config.get("sftp.user")}:${GROUP} ${config.get("sftp.remoteRootPath")}`);
                })
                .then(() => {
                    console.log(`Ownership granted`);
                    return promiseExec(conn, `sudo chmod -R g+rwX ${config.get("sftp.remoteRootPath")};`);
                })
                .catch(err => {
                    console.log(`An error ocurred while updating permissions`);
                    console.log(err);
                })                
                .then(() => {
                    console.log(`Write permissions updated`);
                    conn.end();
                });
            // conn.exec(`\
            // if [ $(getent group ${GROUP}) ]; then echo "Group already exists"; else sudo groupadd ${GROUP}; fi\
            // sudo adduser ${config.get("sftp.user")} ${GROUP};\
            // sudo chown -R ${config.get("sftp.user")}:${GROUP} ${config.get("sftp.remoteRootPath")};\
            // sudo chmod -R g+rwX ${config.get("sftp.remoteRootPath")};`, function(err, stream) {
            //     if(err) throw err;
            //     stream.on("close", function(code, signal) {
            //         console.log(`Stream :: close :: code ${code}, signal: ${signal}`);
            //         conn.end();
            //     }).on("data", function(data) {
            //         console.log("STDOUT: " + data);
            //     }).stderr.on("data", function(data) {
            //         console.log("STDERR: " + data);
            //         reject(data);
            //     });
            // });
        }).on('end', function() {
            console.log('Client disconnected');
            resolve();
        })
        .connect(connectionConfig);
    });

}

module.exports = grantPermissions;