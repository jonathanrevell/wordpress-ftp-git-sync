#!/usr/bin/env node

const path   = require("path");
process.env["NODE_CONFIG_DIR"] = path.join(process.cwd(), "config");    // https://github.com/lorenwest/node-config/wiki/Configuration-Files

const config = require("config");

var yargs = require("yargs")
    .boolean("all")
    .describe("all", "use all files matched by patterns, ignore dates/sizes")
    .boolean("git")
    .describe("git", "use files with uncommitted git changes matching patterns");

// Needed for side-effects to extend config
require("./config-ext.js");

const FTP_TASKS = require("./connections/ftp.js");
const SFTP_TASKS = require("./connections/sftp.js");

const protocol = config.has("ftp") ? "ftp" : "sftp";
if(protocol === "ftp") {
    yargs.command({
        command: "get",
        handler: (argv) => {
            return FTP_TASKS.getRemote(argv);
        }
    }).command({
        command: "put",
        handler: (argv) => {
            return FTP_TASKS.putLocal(argv);
        }
    });
} else if(protocol === "sftp") {
    yargs.command({
        command: "get",
        handler: (argv) => {
            return SFTP_TASKS.getRemoteFiles(argv);
        }
    }).command({
        command: "put",
        handler: (argv) => {
            return SFTP_TASKS.putLocalFiles(argv);
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






