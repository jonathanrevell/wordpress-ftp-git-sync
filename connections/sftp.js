const config     = require("config");
const fs         = require("fs");
const path       = require("path");
const Client     = require("ssh2-sftp-client");
const Paths      = require("../paths.js");
const log        = require("fancy-log");
const checkPath  = require("./sftp/check-path.js");
const Promise    = require("bluebird");

const Spinner = require('cli-spinner').Spinner;
const resolveSSHCredentials = require("./sftp/resolve-credentials.js");

const MAX_CONCURRENT = 8;


function connect() {
    var sftp = new Client();
    var connectionConfig = {
        host: config.demand("sftp.host"),
        user: config.demand("sftp.user"),
        port: config.get("sftp.port", 22)
    };

    resolveSSHCredentials(connectionConfig);

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
    copyingTo      : "local",
    maxConcurrent  : MAX_CONCURRENT,
    queueRun() {
        this.drainPromise = new Promise((resolve, reject) => {
            this.drainResolve = resolve;
            this.drainReject = reject;
            this.interval = setInterval(() => {
                if(this.mutexCounter < this.maxConcurrent) {
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
                    SFTP_TASKS.discoverSpinner.setSpinnerTitle(`Discovered ${this.fileQueue.length} files... %s`);
                    this.mutexCounter--;
                })
                .catch(err => {
                    console.error(err);
                    this.mutexCounter--;
                });
            
        } else if(this.fileQueue.length > 0 && this.mutexCounter <= 0) {
            this.queueStepFiles();

        } else if(this.fileQueue.length === 0 && this.directoryQueue.length === 0 && this.mutexCounter <= 0) {
            this.cleanupSpinners();
            clearInterval(this.interval);
            log("");
            if(this.copyingTo === "local") {
                log(`Done! Downloaded ${this.filesCopied} files, skipped ${this.filesSkipped}`);
            } else {
                log(`Done! Uploaded ${this.filesCopied} files, skipped ${this.filesSkipped}`);
            }
            this.drainResolve();
        }
    },
    queueStepFiles() {
        // Then start copying files
        this.discoveryPhaseDone();
        this.startCopyPhase();
        let {remotePath, localPath, remoteStat, localStat} = this.fileQueue.shift();
        this.mutexCounter++;
        var changesOnly = !SFTP_TASKS.argv.all;

        
        return shouldCopyFile(remoteStat, localStat, { changesOnly })
            .then(shouldCopy => {
                if(shouldCopy) {
                    this.filesCopied++;
                    if(this.copyingTo === "local") {
                        return getRemoteFile(this.client, remoteStat.path, localStat.path);
                    } else {
                        return putLocalFile(this.client, remoteStat.path, localStat.path);
                    }
                } else {
                    this.filesSkipped++;
                    return false;
                }
            })
            .then(() => {
                this.updateCopySpinner();
                this.mutexCounter--;
            });

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
        if(this.copyingTo === "local") {
            this.copySpinner.setSpinnerTitle(`Downloading files... (${percent}%) %s`);
        } else {
            this.copySpinner.setSpinnerTitle(`Uploading files... (${percent}%) %s`);
        }
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
    cleanupSpinners() {
        if(this.copySpinner) {
            this.copySpinner.stop();
        }
        if(this.discoverSpinner) {
            this.discoverSpinner.stop();
        }
    },
    setupJob() {
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
    getRemoteFiles() {
        SFTP_TASKS.copyingTo = "local";
        SFTP_TASKS.maxConcurrent = MAX_CONCURRENT;
        return SFTP_TASKS.setupJob();
    },
    putLocalFiles() {
        SFTP_TASKS.copyingTo = "remote";
        SFTP_TASKS.maxConcurrent = 1;
        return SFTP_TASKS.setupJob();
    }
}

function fsAccessPromise(filePath, mode) {
    return new Promise((resolve, reject) => {
        fs.access(filePath, mode, (err) => {
            if(err) {
                reject(err);
            } else {
                resolve(true);
            }
        });
    });
}

function localFileExists(filePath) {
    return fsAccessPromise(filePath, fs.constants.F_OK)
        .then(() => {
            return true;
        })
        .catch(err => {
            return false;
        });
}
function fsStatPromise(filePath) {
    return new Promise((resolve, reject) => {
        fs.stat(filePath, (err, stats) => {
            if(err) {
                reject(err);
            } else {
                resolve(stats);
            }
        });
    });
}
function wrappedLocalFileStat(filePath, directory) {
    return fsStatPromise(filePath)
        .then(stats => {
            return {
                isDirectory: stats.isDirectory(),
                path: filePath,
                directory: directory,
                name: path.basename(filePath),
                size: stats.size,
                exists: true
            };
        });
}

// function remoteFileSizeDifferent(remoteStat, localPath) {
//     return fsStatPromise(localPath)
//         .then(localStats => {
//             return localStats.size !== remoteStat.size;
//         });
// }

// function shouldGetRemoteFile(remoteStat, localPath, { changesOnly = false }={}) {
//     if(!changesOnly) {
//         return Promise.resolve(true);
//     }
//     return localFileExists(localPath)
//         .then(exists => {
//             if(!exists) {
//                 return true;
//             }
//             if(changesOnly) {
//                 return remoteFileSizeDifferent(remoteStat, localPath);
//             } else {
//                 return true;
//             }
//         });
// }

function shouldCopyFile(local, remote, { changesOnly = false } = {}) {
    var comparison = compareFiles(local, remote);
    if(!comparison.bothExist) {
        return Promise.resolve(true);
    }
    if(changesOnly) {
        return Promise.resolve(!comparison.sizesMatch);
    } else {
        return Promise.resolve(true);
    }
}

function compareFiles(local, remote) {
    var result = {
        bothExist: local.exists && remote.exists
    };

    if(result.bothExist) {
        result.sizesMatch = (local.size === remote.size);
    }
    return result;
}

function getRemoteFile(client, remotePath, localPath) {
    // log(`Copying ${remotePath}`);
    return SFTP_TASKS.coerceDirectory(path.dirname(localPath))
        .then(() => {
            return client.fastGet(remotePath, localPath)
        });
}

function putLocalFile(client, remotePath, localPath) {
    // log(`Mock upload from ${localPath} to ${remotePath}`);
    return client.fastPut(localPath, remotePath);
    // return Promise.resolve();
}

function listLocalFiles(localPath, directory) {
    return new Promise((resolve, reject) => {
        return fs.readdir(localPath, (err, files) => {
            if(err) {
                return reject(err);
            }

            return Promise.all( files.map(f => {
                var filePath = path.join(localPath, f);
                return wrappedLocalFileStat(filePath, directory);
            })).then(wrappedFiles => {
                resolve(wrappedFiles);
            });
        });
    });
}

function localPathFromRemoteFile(remoteFile) {
    return path.join(Paths.local.root, remoteFile.directory, remoteFile.name);
}

function remotePathFromLocalFile(localFile) {
    return path.join(Paths.remote.root, localFile.directory, localFile.name);
}

/**
 * Given an array of files from one location (e.g. remote) get information about the files in the other location (e.g. local)
 * @param {Array} files 
 * @param {String} mirrorWith - "remote" or "local"
 */
function mirrorFileStats(client, files, mirrorWith) {
    if(mirrorWith === "local") {
        return Promise.mapSeries( files, f => {
            var localPath = localPathFromRemoteFile(f);
            return localFileExists(localPath)
                .then(exists => {
                    if(exists) {
                        return wrappedLocalFileStat(localPath, f.directory);
                    } else {
                        return {
                            name: f.name,
                            directory: f.directory,
                            exists: false,
                            path: localPath
                        };
                    }
                })
                .then(localFile => {
                    return {
                        remote: f,
                        local: localFile,
                        isDirectory: f.isDirectory,
                        isFile: f.isFile,
                        name: f.name,
                        directory: f.directory
                    };
                });
        });
    } else if(mirrorWith === "remote") {
        // Mirror with remote
        return Promise.mapSeries( files, f => {
            var remotePath = remotePathFromLocalFile(f);
            return client.exists(remotePath)
                .then(result => {
                    if(result !== false) {
                        return wrapRemoteFileStats(client, f.directory, f.name);
                    } else {
                        return {
                            name: f.name,
                            directory: f.directory,
                            exists: false,
                            path: remotePath
                        };
                    }
                })
                .then(remoteFile => {
                    return {
                        remote: remoteFile,
                        local: f,
                        isDirectory: f.isDirectory,
                        isFile: f.isFile,
                        name: f.name,
                        directory: f.directory
                    };
                });
        });
    } else {
        throw new Error(`Unrecognized mirrorWith target: ${mirrorWith}`);
    }
}

function applyDirectoryClassification(remoteFile) {
    if(remoteFile.isDirectory === undefined) {
        remoteFile.isDirectory = remoteFile.type === "d" ? true : false;
    }
    if(remoteFile.isFile === undefined) {
        remoteFile.isFile = !remoteFile.isDirectory;
    }
}

/**
 * Returns a normalized file stat object. Also gets the remote stats if not provided
 * @param {*} client 
 * @param {*} directory 
 * @param {*} name 
 * @param {*} stats - Optional 
 */
function wrapRemoteFileStats(client, directory, name, stats) {
    var remotePath = path.join(Paths.remote.root, directory, name);
    return Promise.resolve()
        .then(() => {
            if(!stats) {
                return client.stat(remotePath);
            } else {
                return Object.assign({}, stats);
            }
        })
        .then(statResult => {
            applyDirectoryClassification(statResult);
            statResult.exists = true;
            statResult.directory = directory;
            statResult.path = remotePath;
            return statResult;            
        });
}

function listFiles(client, directory, copyingTo) {
    if(copyingTo === "local") {
        let resolvedRemotePath = path.join(Paths.remote.root, directory);
        return client.list(resolvedRemotePath)
            .then(files => {
                return Promise.all(
                    files.map(f => wrapRemoteFileStats(client, directory, f.name, f))
                );
            })
            .then(files => {
                return mirrorFileStats(client, files, "local");
            });
    } else {
        let resolvedLocalPath = path.join(Paths.local.root, directory);
        return listLocalFiles(resolvedLocalPath, directory)
            .then(files => {
                return mirrorFileStats(client, files, "remote");
            });
    }
}


function queueFilesInDirectory(client, directory) {
    if(directory === undefined) {
        log(SFTP_TASKS.directoryQueue);
        throw new Error(`Directory cannot be undefined`);
    }
    
    var fileCounter = 0;
    var directoryCounter = 0;
    var skippedFiles = 0;
    var skippedDirectories = 0;

    return listFiles(client, directory, SFTP_TASKS.copyingTo)
        .then(filePairs => {
            var promises = filePairs.map(pair => {
                let relativePath = `${directory}/${pair.name}`;
                // let remotePath = path.join(Paths.remote.root, directory, pair.name);
                // let localPath = path.join(Paths.local.root, directory, pair.name);

                var matches = checkPath(relativePath, pair.isDirectory);
                if(pair.isDirectory && matches) {
                    // Valid Directory
                    directoryCounter++;
                    return SFTP_TASKS.directoryQueue.push({ directory: relativePath, localFile: pair.local, remoteFile: pair.remote });
                } else if(matches) {
                    // Valid File
                    fileCounter++;
                    return SFTP_TASKS.fileQueue.push({ remotePath: pair.remote.path, localPath: pair.local.path, remoteStat: pair.remote, localStat: pair.local });
                } else if(pair.isDirectory) {
                    skippedDirectories++;
                } else {
                    skippedFiles++;
                }

            });

            return Promise.all(promises);
        })
        .catch(err => {
            console.warn("An error occured while looking for files");
            throw err;
        });
}


module.exports = SFTP_TASKS;

