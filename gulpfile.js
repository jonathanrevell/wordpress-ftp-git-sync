const gulp   = require("gulp");
const ftp    = require("vinyl-ftp");
const log    = require("fancy-log");
const config = require("config");
const path   = require("path");

// Needed for side-effects to extend config
require("./config-ext.js");

const localRoot             = process.cwd();
const remoteRoot            = config.demand("ftp.remoteWordpressPath");
const MAX_PARALLEL_REQUESTS = 10;
const DEFAULT_FTP_PORT      = 21;

const conn = ftp.create({
    host     : config.demand("ftp.host"),
    user     : config.demand("ftp.user"),
    password : config.demand("ftp.password"),
    port     : config.get("ftp.port", DEFAULT_FTP_PORT),
    parallel : MAX_PARALLEL_REQUESTS,
    log      : log
});

var globs = [
    "wp-content/themes/**"
];

var FTP_TASKS = {
    pullRemote() {

    },
    pushLocal() {
        return gulp.src( globs, { base: localRoot, buffer: false })
            .pipe( conn.newer(remoteRoot) )
            .pipe( conn.dest(remoteRoot) );
            
    }
}

exports.ftpPull = FTP_TASKS.pullRemote;
exports.ftpPush = FTP_TASKS.pushLocal;