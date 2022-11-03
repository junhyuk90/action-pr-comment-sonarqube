const core = require('@actions/core');
const github = require('@actions/github');
const http = require('@actions/http-client');
const fs = require('fs');
const path = require('path');

try{

  //inputs
  const key = core.getInput('sonar.projectKey');
  const host = core.getInput('sonar.host.url');
  const login = core.getInput('sonar.login');
  const token = core.getInput('github.token')

  console.log(`inputs => key:${key} / host:${host} / login:${login}`);
  
  //get task file
  const taskFilePath = '.scannerwork/report-task.txt'
  const homePath = `/home/runner/work/${github.context.issue.repo}/${github.context.issue.repo}`
  console.log('home path => '+homePath);
  console.log('find taskFile => '+taskFilePath);
  const taskFileString = fs.readFileSync(path.resolve(home, taskFilePath), {encoding:'utf8'})
  console.log('taskFileString =>\n'+taskFileString);
  
  const octo = github.getOctokit(token)

  octo.rest.issues.createComment({
    owner:github.context.issue.owner,
    repo:github.context.issue.repo,
    issue_number:github.context.issue.number,
    title:'test issue from action',
    body:'hahahaha\n줄바꿈 되나??'
  })

}catch(error){
  core.setFailed(error.message);
}