# sftp-sync

Synchronizes files using FTP, SFTP, and git for a static site, web app, service, and more. As long as your endpoint supports FTP or SFTP then you can use this.

This is particularly useful for Wordpress, which has inconsistent or even poor git support. Properly setting up git on some of these servers can be a challenge, or sometimes even impossible. As long as the server supports FTP or SFTP, this tool will help you sync with git.

You can run this in the root directory of any project, with specific configuration for each project.

## Installation

    npm i --global ftp-git-sync 

    yarn global add ftp-git-sync

## Getting Started

### Configuration

Under the hood, ftp-git-sync uses the [config](https://www.npmjs.com/package/config) npm package for getting its config data. Therefore you can provide config data via a config file. environment variables, or command line arguments.

Whether you're using FTP or SFTP, you'll need to supply a username, and host in your configuration.

Sample config:

    {
        "sftp": {
            "host": "127.0.0.1",
            "user": "my_user_name",
            "remoteRootPath": "/var/www/html",
            "localRootPath": "dist",
            "globs": [
                "wp-content/themes/**"
            ]
        }
    }

The easiest way to configure the software, or at least to get started, is to create a config folder in your project (make sure to exclude it in your .gitignore). Then create a default.json containing your configuration details.

### Synchronization



## get

By default, get will only pull files you don't have or that are a different size than what you have. If you want to download every file, use the --all flag.

### get --all

## grantPermissions

**SFTP ONLY:** Uses SSH to update a unix system's permissions to permit access to the underlying files. If you get a permission denied error while trying to upload files to your FTP server try running this command. Note that this grants permissions specifically to remoteRootPath. If you change this value you may need to run this command again.

## put

### put --git

Uploads files with uncommitted changes in git which also satisfy the patterns in the configuration. This would allow you to modify files, and upload only those files that are modified without having to individually track down the changes or re-scan all the files for every sync.