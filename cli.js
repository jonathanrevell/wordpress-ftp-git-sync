#!/usr/bin/env node

const config = require("config");
const path   = require("path");

var yargs = require("yargs")
    .boolean("all");

// Needed for side-effects to extend config
require("./config-ext.js");

const FTP_TASKS = require("./connections/ftp.js");
const SFTP_TASKS = require("./connections/sftp.js");

const protocol = config.has("ftp") ? "ftp" : "sftp";
if(protocol === "ftp") {
    yargs.command({
        command: "get",
        handler: (argv) => {
            return FTP_TASKS.getRemote();
        }
    }).command({
        command: "put",
        handler: (argv) => {
            return FTP_TASKS.putLocal();
        }
    });
} else if(protocol === "sftp") {
    yargs.command({
        command: "get",
        handler: (argv) => {
            return SFTP_TASKS.getRemoteFiles();
        }
    }).command({
        command: "put",
        handler: (argv) => {
            return SFTP_TASKS.putLocalFiles();
        }
    }).command({
        command: "grantPermissions",
        handler: (argv) => {
            var grantPermissions = require("./connections/sftp/grant-permissions.js");
            return grantPermissions();
        }
    });
}

var argv = yargs.argv;


FTP_TASKS.argv = argv;
SFTP_TASKS.argv = argv;




