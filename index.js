const core = require('@actions/core');
const github = require('@actions/github');

try{

  const key = core.getInput('sonar-projectKey');
  const host = core.getInput('sonar-host-url');
  const login = core.getInput('sonar.login');
  console.log(`inputs => ${key} / ${host} / ${login}`);
  const time = (new Date()).toTimeString();
  core.setOutput("comment", time+' added');
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
  
}catch(error){
  core.setFailed(error.message);
}