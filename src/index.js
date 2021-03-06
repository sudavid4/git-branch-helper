#!/usr/bin/env node
'use strict';
var chalk = require('chalk');
var _ = require('lodash');
var fsUtils = require('./utils/fsUtils');
var gitUtils = require('./utils/gitUtils');
var flags = require('./utils/flags');
var params = require('./utils/params');
var defaultReject = require('./utils/promiseUtils').defaultReject;

var log = require('./utils/logUtils');

var exec = require('child_process').exec;
var prompt = require('./utils/prompt.js');

const TMP_FOLDER = process.env.HOME + '/.gbh/tmp/';
//comment
function toMaster() {
    return toBranch('master');
}

function toBranch(branch) {
    branch = branch || params.branch;
    log.task('tobranch: ' + branch);
    return gitUtils.isValidBranch(branch)
        .then((isValidBranch)=> {
            if (isValidBranch) {
                return;
            }
            return prompt.branch()
                .then((branchObj)=> {
                    if (branchObj.currBranch === branchObj.selectedBranch) {
                        throw {
                            err: 'selected branch is same as current branch.\ncan\'t merge into self'
                        };
                    }
                    branch = branchObj.selectedBranch;
                })
        })
        .then(status)
        .then((statusObj)=> {
            log.task('verify no commit pending');
            if (!_.all(statusObj, (arr)=> arr.length === 0)) {
                log.err('commit pending');
                log.err('commit your changes before proceeding');
                return gitUtils.commit()
                    .then(status);
            }
            return statusObj;
        })
        .then(()=>(flags.skipMerge && diff(branch)) || gitUtils.merge(branch).then(()=>diff(branch)))
        .then((files)=> {
            prepareFiles(files);
            transferFilesToBranch(files, branch);

        });
}

function toTmp() {
    var currBranch;
    var tmpBranch = params.getBranch() || 'tmp_' + Date.now();
    return gitUtils.currBranch(false)
        .then((cbranch)=>currBranch = cbranch)
        .then(()=>gitUtils.checkout('master'))
        .then(()=>gitUtils.run('git branch ' + tmpBranch))
        .then(()=>gitUtils.checkout(currBranch))
        .then(()=>toBranch(tmpBranch));
}

function deleteTmp() {
    return gitUtils.getAllBranches(true)
        .then((branches)=> {
            _.chain(branches.all)
                .filter((branch)=>_.startsWith(branch, 'tmp_'))
                .forEach((branch)=> {
                    gitUtils.run('git branch -D ' + branch)
                })
                .value();
        });
}

function pullMaster() {
    var currBranch;
    return gitUtils.isDirty()
        .then((isDirty)=> isDirty && gitUtils.commit())
        .then(()=>gitUtils.currBranch(true))
        .then((cbranch)=>currBranch = cbranch)
        .then(()=>gitUtils.checkout('master'))
        .then(()=>gitUtils.run('git pull'))
        .then((stdout)=>log(stdout))
        .then(()=>gitUtils.checkout(currBranch))
}

function transferFilesToBranch(files, branch) {
    log.task('transfer files to branch ' + branch);
    branch = branch || params.branch;
    return gitUtils.run('git checkout ' + branch)
        .then(()=> {
            log.task('copying into ' + branch);
            log.info(files.modified.concat(files.created));
            _.forEach(files.modified.concat(files.created), (file)=> {
                fsUtils.copy(TMP_FOLDER + file, file)
            });
        })
        .then(()=> {
            log.task('deleting from master');
            exec('rm -rf ' + TMP_FOLDER);
            _.forEach(files.deleted, (file)=>exec('rm ' + file));
        });
}

function prepareFiles(files) {
    log.task('prepare files');
    _.forEach(files.modified.concat(files.created), (_file)=>fsUtils.copy(_file, TMP_FOLDER + _file));
}

function status() {
    log.task('status');
    return gitUtils.run("git status --porcelain")
        .then(gitUtils.parseStatus)
        .then(log.status);
}

function diff(branch) {
    log.task('diff');
    branch = branch || params.getBranch();
    if (!branch) {
        return prompt.branch()
            .then((branchObj)=>branchObj.selectedBranch)
            .then(runDiff);
    }
    return runDiff(branch);

}
function runDiff(branch) {
    return gitUtils.run('git diff ' + branch + ' --name-status')
        .then(gitUtils.parseStatus)
        .then(log.status);
}

var cmds = {
    status: status,
    diff: diff,
    toMaster: toMaster,
    toBranch: toBranch,
    toTmp: toTmp,
    pullMaster: pullMaster,
    checkout: gitUtils.checkout,
    merge: gitUtils.merge,
    simpleCommit: gitUtils.simpleCommit,
    commit: gitUtils.commit,
    log: gitUtils.log,
    deleteTmp: deleteTmp
};


var shortCuts = {
    tomaster: cmds.toMaster,
    simplecommit: cmds.simpleCommit,
    tobranch: toBranch,
    totmp: toTmp,
    pullmaster: pullMaster,
    pm: pullMaster,
    D: deleteTmp,
    deletetmp: deleteTmp
};
_.assign(cmds, shortCuts);

function performCmdsInOrder(userArgs) {
    var cmdNames = _.filter(userArgs, (arg)=>!_.startsWith(arg, '-'));
    var cmd = cmdNames.shift();
    var promise = cmds[cmd] ? cmds[cmd]() : defaultReject({err: 'uknown cmd: ' + cmd});
    while ((cmd = cmdNames.shift())) {
        let cacheCmd = cmd;
        promise = promise.then(()=> {
            if (cmds[cacheCmd]) {
                return cmds[cacheCmd]();
            }
            throw {err: 'uknown cmd: ' + cacheCmd}
        });
    }
    promise.then(()=> {
            log.task('end');
            prompt.end()
        })
        .catch(defaultReject);
}
var args = process.argv.slice(2);
if (args.length && args[0] === '--help' || args[0] === '-h') {
    _.chain(cmds)
        .map((val, key)=>key)
        .sortBy((v)=>v.toLowerCase())
        .forEach((key, i)=>log('%s:', key))
        .value();
    prompt.end();
    return;
}
performCmdsInOrder(process.argv.slice(2));


