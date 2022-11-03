const core = require('@actions/core');
const github = require('@actions/github');

try{

  const key = core.getInput('sonar.projectKey');
  const host = core.getInput('sonar.host.url');
  const login = core.getInput('sonar.login');
  const secrets = core.getInput('secrets')
  console.log('secrets', JSON.stringify(secrets, undefined, 2));
  
  //github.getOctokit()

}catch(error){
  core.setFailed(error.message);
}