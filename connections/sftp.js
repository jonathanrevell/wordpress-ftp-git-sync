const config     = require("config");
const fs         = require("fs");
const path       = require("path");
const Client     = require("ssh2-sftp-client");
const Paths      = require("../paths.js");
const log        = require("fancy-log");
const micromatch = require("micromatch");
const Spinner = require('cli-spinner').Spinner;


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
    mutex          : null,
    queueRun() {
        this.drainPromise = new Promise((resolve, reject) => {
            this.drainResolve = resolve;
            this.drainReject = reject;
            this.interval = setInterval(() => {
                if(!this.mutex) {
                    this.queueStep();
                }
            }, 100);
        });

        return this.drainPromise;
    },
    queueStep() {
        if(this.directoryQueue.length > 0) {
            // Process all directories first
            let _obj = this.directoryQueue.shift();
            this.mutex = true;
            queueFilesInDirectory(this.client, _obj.directory)
                .then((() => {
                    // log(`Found ${this.fileQueue.length} files`);
                    SFTP_TASKS.discoverSpinner.setSpinnerTitle(`Discovering files... (${this.fileQueue.length}) %s`);
                    this.mutex = null;
                }))
                .catch(err => {
                    console.error(err);
                    this.mutex = null;
                });
            
        } else if(this.fileQueue.length > 0) {
            // Then start copying files
            this.discoveryPhaseDone();
            let {remotePath, localPath} = this.fileQueue.shift();
            this.mutex = true;
            getRemoteFile(this.client, remotePath, localPath)
                .then(() => {
                    this.mutex = null;
                })
        } else {
            clearInterval(this.interval);
            log("Done!");
            this.drainResolve();
        }
    },
    discoveryPhaseDone() {
        if(SFTP_TASKS.discoverSpinner) {
            SFTP_TASKS.discoverSpinner.stop();
            SFTP_TASKS.discoverSpinner = null;
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
                // log("Discovering files");
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

function getRemoteFile(client, remotePath, localPath) {
    log(`Copying ${remotePath}`);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    return client.fastGet(remotePath, localPath); 
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
                    return SFTP_TASKS.fileQueue.push({ remotePath, localPath });
                } else {
                    // log(`Skipping ${remotePath}`);
                }

            });

            return Promise.all(promises);
        });
}

/**
 * Must match ANY positive pattern and must NOT fail ANY negative pattern
 * @param {*} relativePath 
 * @param {*} type 
 */
function checkPath(relativePath, type) {
    var includeMatch = Paths.include.length === 0 || micromatch.isMatch(relativePath, Paths.include);
    var excludeMatch = Paths.exclude.length === 0 ? false : micromatch.isMatch(relativePath, Paths.exclude, { matchBase: true });

    if(excludeMatch) {
        return false;
    }
    if(includeMatch) {
        return true;
    }

    // If the current path is a directory then allow "anticipatory" matches
    // Meaning, if a partial pattern matches a partial path, then keep exploring
    if(type === "d") {
        var anyMatches = false;
        Paths.include.forEach(p => {
            let patternSegments = p.split("/");
            let pathSegments = relativePath.split("/");

            if(patternSegments.length > 0 && patternSegments[0] === "") {
                patternSegments.shift();
            }
            if(pathSegments.length > 0 && pathSegments[0] === "") {
                pathSegments.shift();
            }
    
            let workingPath = pathSegments.shift();
            let workingPattern = patternSegments.shift();

            let pathSeg = workingPath;
            let patternSeg = workingPattern;
            let patternSegmentMatches = 0;
    
            var isMatching = micromatch.isMatch(workingPath, workingPattern);

            function useNextPatternSegment() {
                patternSeg = patternSegments.shift();
                workingPattern += "/" + patternSeg;
                patternSegmentMatches = 0;
            }
    
            // Keep working through the path segments as long as they satisfy the pattern segments
            // Stop once we've evaluated the entire path
            while(pathSegments.length > 0 && isMatching) {
                pathSeg = pathSegments.shift();
                workingPath += "/" + pathSeg;
                patternSegmentMatches++;
                let mm = micromatch.scan(patternSeg);

                if(patternSegments.length > 0) {
                        
                    if(mm.isGlobstar && pathSegments.length > 0) {
                        let nextPathSeg = pathSegments[0];
                        let nextPatternSeg = patternSegments[0];

                        // Keep matching the globstar 
                        // until the next path segment matches the next pattern segment
                        if(micromatch.isMatch(nextPathSeg, nextPatternSeg)) {
                            useNextPatternSegment();
                        }
                    } else {
                        useNextPatternSegment();
                    }
                } else if(!mm.isGlobstar) {
                    isMatching = false;
                    break;
                }

                if(micromatch.isMatch(workingPath, workingPattern)) {
                    isMatching = true;
                } else {
                    isMatching = false;
                    break;
                }
            }
            if(isMatching) {
                anyMatches = true;
            }
        });

        return anyMatches;
    } else {
        return false;
    }
}

module.exports = SFTP_TASKS;

