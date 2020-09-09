const config     = require("config");
const fs         = require("fs");
const path       = require("path");
const Client     = require("ssh2-sftp-client");
const Paths      = require("../paths.js");
const log        = require("fancy-log");
const checkPath  = require("./sftp/check-path.js");

const Spinner = require('cli-spinner').Spinner;

const MAX_CONCURRENT = 8;


function connect() {
    var sftp = new Client();
    var connectionConfig = {
        host: config.demand("sftp.host"),
        user: config.demand("sftp.user")
    };

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

    return sftp.connect(connectionConfig)
        .then(() => {
            return sftp;
        })
        .catch(err => {
            console.error(err);
        });
}

const SFTP_TASKS = {
    directoryQueue : [],
    fileQueue      : [],
    client         : null,
    interval       : null,
    mutexCounter   : 0,
    filesCopied    : 0,
    filesFound     : 0,
    filesSkipped   : 0,
    directoriesVerified: [], // Array of directories verified as existing. Slight optimization to reduce disk reads
    queueRun() {
        this.drainPromise = new Promise((resolve, reject) => {
            this.drainResolve = resolve;
            this.drainReject = reject;
            this.interval = setInterval(() => {
                if(this.mutexCounter < MAX_CONCURRENT) {
                    this.queueStep();
                }
            }, 5);
        });

        return this.drainPromise;
    },
    queueStep() {
        if(this.directoryQueue.length > 0) {
            // Process all directories first
            let _obj = this.directoryQueue.shift();
            this.mutexCounter++;
            queueFilesInDirectory(this.client, _obj.directory)
                .then(() => {
                    // log(`Found ${this.fileQueue.length} files`);
                    SFTP_TASKS.discoverSpinner.setSpinnerTitle(`Discovering files... (${this.fileQueue.length}) %s`);
                    this.mutexCounter--;
                })
                .catch(err => {
                    console.error(err);
                    this.mutexCounter--;
                });
            
        } else if(this.fileQueue.length > 0 && this.mutexCounter <= 0) {
            this.queueStepFiles();

        } else if(this.fileQueue.length === 0 && this.directoryQueue.length === 0 && this.mutexCounter <= 0) {
            this.copySpinner.stop();
            clearInterval(this.interval);
            log("");
            log(`Done! Downloaded ${this.filesCopied} files, skipped ${this.filesSkipped}`);
            this.drainResolve();
        }
    },
    queueStepFiles() {
        // Then start copying files
        this.discoveryPhaseDone();
        this.startCopyPhase();
        let {remotePath, localPath, remoteStat} = this.fileQueue.shift();
        this.mutexCounter++;
        var changesOnly = !SFTP_TASKS.argv.all;

        return shouldGetRemoteFile(remoteStat, localPath, { changesOnly })
            .then(shouldCopy => {
                if(shouldCopy) {
                    this.filesCopied++;
                    return getRemoteFile(this.client, remotePath, localPath)
                } else {
                    this.filesSkipped++;
                    return false;
                }
            })
            .then(() => {
                this.updateCopySpinner();
                this.mutexCounter--;
            })
    },
    discoveryPhaseDone() {
        if(SFTP_TASKS.discoverSpinner) {
            SFTP_TASKS.discoverSpinner.stop();
            SFTP_TASKS.discoverSpinner = null;
        }
    },
    startCopyPhase() {
        if(!this.copySpinner) {
            this.filesFound = this.fileQueue.length;
        
            this.copySpinner = new Spinner("Copying... %s");
            this.copySpinner.setSpinnerString('|/-\\');
            this.copySpinner.start();
        }
    },
    updateCopySpinner() {
        var percent = ((this.filesCopied / this.filesFound) * 100).toFixed(0);
        this.copySpinner.setSpinnerTitle(`Copying files... (${percent}%) %s`);
    },
    coerceDirectory(dPath) {
        if(this.directoriesVerified.indexOf(dPath) === -1) {
            return new Promise((resolve, reject) => {
                fs.mkdir(dPath, { recursive: true }, (err) => {
                    if(err) {
                        return reject(err);
                    }
                    this.directoriesVerified.push(dPath);
                    resolve();
                });
            });            
        } else {
            return Promise.resolve();
        }
    },
    getRemote() {
        this.client;
        // log("Connecting to host");
        var connectSpinner = new Spinner("Connecting... %s");
        connectSpinner.setSpinnerString('|/-\\');
        connectSpinner.start();
        return connect()
            .then(sftp => {
                connectSpinner.stop();
                SFTP_TASKS.client = sftp;
                SFTP_TASKS.directoryQueue.push({ directory: "" });

                SFTP_TASKS.discoverSpinner = new Spinner("Discovering files... %s");
                SFTP_TASKS.discoverSpinner.setSpinnerString('|/-\\');
                SFTP_TASKS.discoverSpinner.start();
                return SFTP_TASKS.queueRun();
            })
            .then(() => {
                log(`END SFTP CONNECTION`);
                return SFTP_TASKS.client.end();
            })
            .catch(err => {
                console.log("An error occurred while working with the SFTP connection");
                console.error(err);
            });
    },
    putLocal() {

    }
}

function fsAccessPromise(file, mode) {
    return new Promise((resolve, reject) => {
        fs.access(file, mode, (err) => {
            if(err) {
                reject(err);
            } else {
                resolve(true);
            }
        });
    });
}

function localFileExists(file) {
    return fsAccessPromise(file, fs.constants.F_OK)
        .then(() => {
            return true;
        })
        .catch(err => {
            return false;
        });
}
function fsStatPromise(file) {
    return new Promise((resolve, reject) => {
        fs.stat(file, (err, stats) => {
            if(err) {
                reject(err);
            } else {
                resolve(stats);
            }
        });
    });
}

function remoteFileSizeDifferent(remoteStat, localPath) {
    return fsStatPromise(localPath)
        .then(localStats => {
            return localStats.size !== remoteStat.size;
        });
}

function shouldGetRemoteFile(remoteStat, localPath, { changesOnly = false }={}) {
    if(!changesOnly) {
        return Promise.resolve(true);
    }
    return localFileExists(localPath)
        .then(exists => {
            if(!exists) {
                return true;
            }
            if(changesOnly) {
                return remoteFileSizeDifferent(remoteStat, localPath);
            } else {
                return true;
            }
        });
}

function getRemoteFile(client, remotePath, localPath) {
    // log(`Copying ${remotePath}`);
    return SFTP_TASKS.coerceDirectory(path.dirname(localPath))
        .then(() => {
            return client.fastGet(remotePath, localPath)
        });
}

function queueFilesInDirectory(client, directory) {
    if(directory === undefined) {
        log(SFTP_TASKS.directoryQueue);
        throw new Error(`Directory cannot be undefined`);
    }
    var resolvedRemotePath = path.join(Paths.remote.root, directory);
    var fileCounter = 0;
    var directoryCounter = 0;

    return client.list(resolvedRemotePath)
        .then(files => {
            var promises = files.map(f => {
                let relativePath = `${directory}/${f.name}`
                let remotePath = path.join(Paths.remote.root, directory, f.name);
                let localPath = path.join(Paths.local.root, directory, f.name);

                var matches = checkPath(relativePath, f.type);
                if(f.type === "d" && matches) {
                    // log(`Queued ${relativePath}`);
                    directoryCounter++;
                    return SFTP_TASKS.directoryQueue.push({ directory: relativePath, file: f });
                } else if(matches) {
                    // log(`Queued ${remotePath}`);
                    fileCounter++;
                    return SFTP_TASKS.fileQueue.push({ remotePath, localPath, remoteStat: f });
                } else {
                    // log(`Skipping ${remotePath}`);
                }

            });

            return Promise.all(promises);
        });
}


module.exports = SFTP_TASKS;

