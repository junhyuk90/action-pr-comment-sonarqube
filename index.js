const core = require('@actions/core');
const github = require('@actions/github');

try{

  const key = core.getInput('sonar.projectKey');
  const host = core.getInput('sonar.host.url');
  const login = core.getInput('sonar.login');
  const token = core.getInput('github.token')
  console.log(`inputs => key:${key} / host:${host} / login:${login}`);
  console.log('secrets', token);
  
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