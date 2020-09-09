const config = require("config");
const path = require("path");

const Paths = {
    remote: {
        root: config.demandOneOf("ftp.remoteRootPath", "sftp.remoteRootPath")
    },
    local: {
        root: path.resolve( process.cwd(), config.getOneOf("", "ftp.localRootPath", "sftp.localRootPath"))
    },
    include: config.getOneOf([], "ftp.include", "sftp.include"),
    exclude: config.getOneOf([], "ftp.exclude", "sftp.exclude")
}

module.exports = Paths;