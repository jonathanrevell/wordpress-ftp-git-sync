const gulp   = require("gulp");
const config = require("config");
const path   = require("path");
const yargs  = require("yargs");

var argv = require("yargs")
    .boolean("all")
    .argv;

// Needed for side-effects to extend config
require("./config-ext.js");

const FTP_TASKS = require("./connections/ftp.js");
const SFTP_TASKS = require("./connections/sftp.js");

FTP_TASKS.argv = argv;
SFTP_TASKS.argv = argv;

const protocol = config.has("ftp") ? "ftp" : "sftp";

if(protocol === "ftp") {
    exports.get = FTP_TASKS.getRemote;
    exports.put = FTP_TASKS.putLocal;
} else if(protocol === "sftp") {
    exports.get = SFTP_TASKS.getRemote;
    exports.put = SFTP_TASKS.putLocal;
}

