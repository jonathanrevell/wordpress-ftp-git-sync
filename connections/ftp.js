const ftp    = require("vinyl-ftp");
const log    = require("fancy-log");
const gulp   = require("gulp");
const config = require("config");
const Paths = require("../paths.js");

const MAX_PARALLEL_REQUESTS = 10;
const DEFAULT_FTP_PORT      = 21;

function getConnection() {
    return ftp.create({
        host     : config.demand("ftp.host"),
        user     : config.demand("ftp.user"),
        password : config.demand("ftp.password"),
        port     : config.get("ftp.port", DEFAULT_FTP_PORT),
        parallel : MAX_PARALLEL_REQUESTS,
        log      : log
    });
}


var FTP_TASKS = {
    getRemote() {
        var conn = getConnection();
        return conn.src(Paths.include, { buffer: false})
            .pipe( gulp.dest(Paths.local.root) );
    },
    putLocal() {
        var conn = getConnection();
        return gulp.src( Paths.include, { base: Paths.local.root, buffer: false })
            .pipe( conn.newer(Paths.remote.root) )
            .pipe( conn.dest(Paths.remote.root) );    
    }
};

module.exports = FTP_TASKS;