# ftp-git-sync

Synchronizes files using FTP and git for a static site, web app, service, and more. As long as your endpoint supports FTP or SFTP then you can use this.

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



## 