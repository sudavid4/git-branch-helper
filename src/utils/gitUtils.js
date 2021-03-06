/**
 * Created by davidsu on 04/12/2015.
 */
var _ = require('lodash');
var chalk = require('chalk');
var prompt = require('./prompt');
var flags = require('./flags');
var params = require('./params');
var exec = require('child_process').exec;
var log = require('./logUtils');

function run(cmd) {
    log.task('gitUtils.run ===>  ' + cmd);
    return new Promise((resolve, reject)=> {
        exec(cmd, (err, stdout, stderr)=> {
            err && reject({
                err: err
                , stderr: stderr
                , stdin: stdout
            });
            resolve(stdout);
        });
    });
}
function merge(branch) {
    log.task('merging');
    branch = branch || params.getBranch() || 'master';
    log.info(branch);
    return run('git merge ' + branch)
        .catch((rejectObj)=> {
            if (!flags.dontReset && rejectObj.stdin.indexOf('Automatic merge failed; fix conflicts and then commit the result.') !== -1) {
                log(chalk.underline('merge rejected, reseting'));
                return run('git reset --hard')
                    .then(()=> { throw rejectObj; });
            }
            throw rejectObj;
        });
}
function parseStatus(status) {
    log.task('gitUtils.parseStatus');
    var line;
    var lines = status.trim().split('\n');

    var not_added = [];
    var deleted = [];
    var modified = [];
    var created = [];

    var whitespace = /\s+/;

    while (line = lines.shift()) {
        line = line.trim().split(whitespace);

        switch (line.shift()) {
            case "??":
                not_added.push(line.join());
                break;
            case "D":
                deleted.push(line.join());
                break;
            case "M":
                modified.push(line.join());
                break;
            case "A":
                case "C":
            case "AM":
                created.push(line.join());
                break;
        }
    }

    return {
        not_added: not_added,
        deleted: deleted,
        modified: modified,
        created: created
    };
}

function isDirty(){
    return run('git status --porcelain')
    .then(parseStatus)
    .then((status)=>{
        return _.reduce(status, (acc, arr)=>acc+arr.length) !== 0;
    })
}

function commit(msg, isRecursing) {
    !isRecursing && log.task('commit');
    if (!msg) {
        return run('git log --format=%B -1')
            .then((stdout)=> {log.info('last commit:\n' + stdout);})
            .then(()=>prompt.question('commit message:\n'))
            .then((cmsg)=> {
                commit(cmsg, true);
            })
    }
    return run('git add . && git commit -m"' + msg + '"');
}
function currBranch(showAll) {
    return run('git branch')
        .then((stdin)=> {
            var currBranchName = null;
            _.forEach(stdin.split('\n'), (branch)=> {
                if (branch[0] === '*') {
                    currBranchName = branch.substring(1).trim();
                    (flags.shouldLog || showAll) && log.ok(branch.trim());
                } else {
                    (flags.shouldLog || showAll) && log(branch.trim());
                }

            });
            if (!currBranchName) {
                throw 'can\'t find current branch, are you in a git repo folder?'
            }
            return currBranchName;
        });
}
function checkout(branchName, isRecursing) {
    branchName = branchName || params.getBranch();
    !isRecursing && log(chalk.underline('checkout ' + branchName));
    if (!branchName) {
        return prompt.branch()
            .then((bname)=>checkout(bname.selectedBranch, true));
    }
    return run('git checkout ' + branchName);
}

function getAllBranches(shouldLog) {
    return run('git branch')
        .then((stdin)=> {
            var branches, currBranchIdx;
            branches = _.map(stdin.split('\n'), (branch, i)=> {
                if (branch[0] === '*') {
                    currBranchIdx = i;
                    return branch.substring(1).trim();
                } else {
                    return branch.trim();
                }
            });
            shouldLog && _.forEach(branches, (branch, i)=> {
                i === currBranchIdx ? log.ok('* ' + branch) : log(branch);
            });
            return {
                curr: branches[currBranchIdx],
                all: branches
            };

        });
}
function isValidBranch(branch) {
    return getAllBranches()
        .then((branchesObj)=> {
            return _.contains(branchesObj.all, branch);
        })
}
function gitLog() {
    return run(
        'git log --graph ' +
        '--pretty=format:"%Cred%h%Creset %an: %s - %Creset %C(yellow)%d%Creset %Cgreen(%cr)%Creset" ' +
        '--abbrev-commit --date=relative ' +
        '--color')
        .then(console.log);
}


module.exports.simpleCommit = ()=>commit('.');
module.exports.commit = commit;
module.exports.currBranch = currBranch;
module.exports.isValidBranch = isValidBranch;
module.exports.getAllBranches = getAllBranches;
module.exports.checkout = checkout;
module.exports.merge = merge;
module.exports.run = run;
module.exports.log = gitLog;
module.exports.parseStatus = parseStatus;
module.exports.isDirty = isDirty;
