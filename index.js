var fs = require('fs');
var os = require('os');
var url = require('url');
var axios = require('axios');
var Promise = require('promise');
var shell = require('shelljs');
var save = require('save-file');

const AUTHOR = 1;
const REPOSITORY = 2;
const BRANCH = 4;

var parameters = {
    url: "https://github.com/Gyumeijie/qemu-object-model/tree/master/qom",
    fileName: undefined,
    rootDirectory: undefined
};

// Default authentication setting
var authentication = {};

// Read configuration file
const defaultConfigFile = `${os.homedir()}/.download_github`;
(function parseConfig(){
    var exists = fs.existsSync(defaultConfigFile);
    if (exists) {
       var data = fs.readFileSync(defaultConfigFile, 'utf8');
       authentication = JSON.parse(data);
    }
})();


function parseInfo(parameters) {

    var repoPath = url.parse(parameters.url, true).pathname;
    var splitPath = repoPath.split("/");
    var info = {};

    info.author = splitPath[AUTHOR];
    info.repository = splitPath[REPOSITORY];
    info.branch = splitPath[BRANCH];
    info.rootName = splitPath[splitPath.length-1];

    info.urlPrefix = `https://api.github.com/repos/${info.author}/${info.repository}/contents/`;
    info.urlPostfix = `?ref=${info.branch}`;

    if(!!splitPath[BRANCH]){
        info.resPath = repoPath.substring(repoPath.indexOf(splitPath[BRANCH])+splitPath[BRANCH].length+1);
    }

    if(!parameters.fileName || parameters.fileName==""){
        info.downloadFileName = info.rootName;
    } else {
        info.downloadFileName = parameters.fileName;
    }

    if(parameters.rootDirectory == "false"){
        info.rootDirectoryName = "";
    } else if (!parameters.rootDirectory || parameters.rootDirectory=="" ||
        parameters.rootDirectory=="true"){
        info.rootDirectoryName = info.rootName+"/";
    } else {
        info.rootDirectoryName = parameters.rootDirectory+"/";
    }

    console.log(info)
    return info;
}


var basicOptions = {
    method: "get",
    responseType: 'arrayBuffer'
};

function downloadDirectory(){

    var dirPaths = [];
    var files = [];
    var requestPromises = [];

    dirPaths.push(repoInfo.resPath);
    iterateDirectory(dirPaths, files, requestPromises);
}

function iterateDirectory(dirPaths, files, requestPromises){

    axios({
        ...basicOptions,
        url: repoInfo.urlPrefix+dirPaths.pop()+repoInfo.urlPostfix,
        ...authentication
    }).then(function(response) {

        for(var i=0; i<response.data.length-1; i++){
            if(response.data[i].type == "dir"){
                dirPaths.push(response.data[i].path);
            } else {
                if(response.data[i].download_url) {
                    var promise = fetchFile(response.data[i].path, response.data[i].download_url, files);
                    requestPromises.push(promise);
                } else {
                    console.log(response.data[i]);
                }
            }
        }

        // Save files after we iterate all the directories
        if(dirPaths.length <= 0){
            saveFiles(files, requestPromises);
        } else {
            iterateDirectory(dirPaths, files, requestPromises);
        }
    });
}

function extractFilenameAndDirectoryFrom(path) {

     var components = path.split('/');
     var filename = components[components.length-1];
     var directory = path.substring(0, path.length-filename.length);

     return {
         filename: filename,
         directory: directory
     };
}

function saveFiles(files, requestPromises){

    shell.mkdir('-p', repoInfo.rootDirectoryName);
    var rootDir = repoInfo.rootDirectoryName;
    Promise.all(requestPromises).then(function(data) {

        for(let i=0; i<files.length-1; i++) {

            var pathForSave = extractFilenameAndDirectoryFrom(files[i].path.substring(decodeURI(repoInfo.resPath).length+1));
            var dir = rootDir+pathForSave.directory;

            fs.exists(dir, function (i,dir, pathForSave, exists) {
                if (!exists) {
                    shell.mkdir('-p', dir);
                }
                save(files[i].data, dir + pathForSave.filename, (err, data) => {
                    if (err) throw err;
                })
            }.bind(null, i, dir, pathForSave));
         }
    });
}

function fetchFile(path, url, files) {

    return axios({
            ...basicOptions,
            url,
            ...authentication
        }).then(function (file) {
            console.log("downloading ", path);
            files.push({path: path, data: file.data});
        }).catch(function(error) {
            console.log("error: ", error.message);
        });
}

function downloadFile(url) {

    axios({
        ...basicOptions,
        url,
        ...authentication
    }).then(function (file) {
        console.log("downloading ", repoInfo.resPath);
        var pathForSave = extractFilenameAndDirectoryFrom(decodeURI(repoInfo.resPath));
        save(file.data, pathForSave.filename, (err, data) => {
            if (err) throw err;
        })
    }).catch(function(error){
        console.log(error);
    });
}

var repoInfo = {};
function initializeDownload(parameters) {
    repoInfo = parseInfo(parameters);

    if(!repoInfo.resPath || repoInfo.resPath==""){
        if(!repoInfo.branch || repoInfo.branch==""){
            repoInfo.branch = "master";
        }

        // Download the whole repository
        var repoUrl = `https://github.com/${repoInfo.author}/${repoInfo.repository}/archive/${repoInfo.branch}.zip`;

        axios({
             ...basicOptions,
             responseType: 'stream',
             url: repoUrl,
             ...authentication
        }).then(function(response){
             var filename = `${repoInfo.repository}.zip`;
             response.data.pipe(fs.createWriteStream(filename))
                 .on('close', function () {
                               console.log(`${filename} downloaded.`);
                 });
        }).catch(function(error) {
            console.log("error: ", error.message);
        });
    } else {

        // Download part of repository
        axios({
            ...basicOptions,
            url: repoInfo.urlPrefix+repoInfo.resPath+repoInfo.urlPostfix,
            ...authentication
        }).then(function(response) {
            if(response.data instanceof Array){
                downloadDirectory();
            } else {
                downloadFile(response.data.download_url);
            }
        }).catch(function(error) {
            console.log(error);
        });
    }
}

initializeDownload(parameters);