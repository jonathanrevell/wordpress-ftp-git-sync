const simpleGit = require("simple-git");
const git = simpleGit();


function getChanges() {
    return git.checkIsRepo()
        .then(isRepo => {
            if(!isRepo) {
                throw new Error(`Not a git repository`);
            }
            return git.checkIsRepo('root');

        })
        .then(isRepoRoot => {
            if(!isRepoRoot) {
                throw new Error(`Please run command from the root directory of the repository`);
            }
            return git.status();
        })
        .then(status => {
            // console.log("GIT STATUS", status);
            return status;
        });
}

module.exports.getChanges = getChanges;