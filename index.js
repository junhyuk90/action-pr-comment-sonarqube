const core = require('@actions/core');
const github = require('@actions/github');
const {HttpClient} = require('@actions/http-client');
const {BearerCredentialHandler} = require('@actions/http-client/lib/auth');
const fs = require('fs');
const path = require('path');

const run = async () => {
  
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
    const taskFileString = fs.readFileSync(path.resolve(homePath, taskFilePath), {encoding:'utf8'})
    console.log('taskFileString =>\n'+taskFileString);

    const ceTaskUrl = taskFileString.split('ceTaskUrl=')[1]

    const taskStatus = await checkTaskStatus(ceTaskUrl, login)
    
    const octo = github.getOctokit(token)

    octo.rest.issues.createComment({
      owner:github.context.issue.owner,
      repo:github.context.issue.repo,
      issue_number:github.context.issue.number,
      title:'test issue from action',
      body:`[SonarQube Check Result]\nCheck Status => ${taskStatus} !!!`
    })

  }catch(error){
    core.setFailed(error.message);
  }
}

const checkTaskStatus = async (ceTaskUrl, token) => {

  return new Promise((resolve)=>{

    const authHandler = new BearerCredentialHandler(token)
    const http = new HttpClient('github-action', [authHandler])
  
    const startTime = new Date().getTime()
    const inter = setInterval(async ()=>{
  
      if(new Date().getTime() - startTime > 600000){ //10분 타임아웃
        clearInterval(inter)
        throw new Error('[checkTaskStatus] 10 min timed out!!!')
      }

      const res = await http.get(ceTaskUrl)
      const body = JSON.parse(await res.readBody())
      console.log(`[${ceTaskUrl}]\n${JSON.stringify(body, undefined, 2)}`);

      const status = body.projectStatus.status

      if(status != 'PENDING' && status != 'IN_PROGRESS'){
        clearInterval(inter)
        resolve(status)
      }
  
    }, 3000) //3초 마다 체크

  })

}

//run task
run()
