const core = require('@actions/core');
const github = require('@actions/github');
const {HttpClient} = require('@actions/http-client');
const {BasicCredentialHandler} = require('@actions/http-client/lib/auth');
const fs = require('fs');
const path = require('path');


//inputs
const key = core.getInput('sonar.projectKey');
const host = core.getInput('sonar.host.url');
const sonarLogin = core.getInput('sonar.login');
const githubToken = core.getInput('github.token')

console.log(`inputs => key:${key} / host:${host} / login:${sonarLogin}`);

//http
const authHandler = new BasicCredentialHandler(sonarLogin, "")
const http = new HttpClient('github-action', [authHandler])

//octokit
const octo = github.getOctokit(githubToken)

class Comment {
  comment
  constructor(comment){
    this.comment = comment
  }
  pad(str){
    this.comment += str
  }
  add(str){
    this.pad('\n'+str)
  }
  toString(){
    return this.comment
  }
}

const run = async () => {
  
  try{

    //Comment
    let comment = new Comment('### SonarQube Check Result')
    
    //Get task file
    const taskFilePath = '.scannerwork/report-task.txt'
    const homePath = `/home/runner/work/${github.context.issue.repo}/${github.context.issue.repo}`
    console.log('home path => '+homePath);
    console.log('find taskFile => '+taskFilePath);
    const taskFileString = fs.readFileSync(path.resolve(homePath, taskFilePath), {encoding:'utf8'})
    console.log('taskFileString =>\n'+taskFileString);

    //Task status get
    const ceTaskUrl = taskFileString.split('ceTaskUrl=')[1].replace(/\\r\\n/g, '')
    const taskInfo = await getTaskInfo(ceTaskUrl)

    comment.add('```java')
    comment.add(`Task   : ${taskInfo.status}`)
    

    //Task detail get
    const taskDetail = await getTaskDetail(taskInfo.componentKey)
    
    //List pull requests files
    const prFiles = await octo.rest.pulls.listFiles({
      owner:github.context.issue.owner,
      repo:github.context.issue.repo,
      pull_number:github.context.payload.pull_request.number
    })

    const prFileNames = prFiles.data.map((ff)=>{
      return ff.filename
    })

    console.log('prFileNames => '+JSON.stringify(prFileNames))

    //Check PR Files Fail
    let failed = false
    const failedFiles = []
    taskDetail.components.forEach((elem)=>{
      if(Number(elem.measures[0].value) > 0 && prFileNames.filter((fname)=>{return elem.path.includes(fname)}).length > 0){
        failed = true
        failedFiles.push(`${elem.path} | ${elem.measures[0].value}`)
      }
    })

    comment.add(`Result : ${failed?'FAIL ❌':'PASS 🟢'}`)
    comment.add('```')
    comment.add('')
    comment.add('### Summary')
    comment.add('```java')
    comment.add(`Repo Check Total : ${taskDetail.paging.total}`)
    comment.add(`Repo Bugs  Total : ${taskDetail.baseComponent.measures[0].value}`)
    comment.add(`This PR(${github.context.payload.pull_request.number}) Bugs : ${failedFiles.length}`)
    comment.add('```')
    comment.add('')
    
    if(failed){
      
      comment.add('### Bugs Detail')
      comment.add('|File Name|Bugs|')
      comment.add('|--|:--:|')
      failedFiles.forEach((elem)=>{
        comment.add(elem)
      })

    }

    comment.add(`>[Check SonarQube Site Here !!!](${host}/project/issues?id=${taskInfo.componentKey}&resolved=false)`)
      
    //create pr comment
    octo.rest.issues.createComment({
      owner:github.context.issue.owner,
      repo:github.context.issue.repo,
      issue_number:github.context.issue.number,
      title:'test issue from action',
      body:comment.toString()
    })

    if(failed){
      core.setFailed('SonarQube Check Result Failed !!!');
    }

  }catch(error){
    core.setFailed(error.message);
  }
}

/**
 * Get Task Detail
 * @param {*} componentKey 
 * @returns 
 */
const getTaskDetail = async (componentKey) => {

  const res = await http.get(`${host}/api/measures/component_tree?component=${componentKey}&metricKeys=bugs&qualifiers=FIL,TRK`)
  const bodyString = await res.readBody()
  return JSON.parse(bodyString)

}

/**
 * Task Status Check
 * @param {*} ceTaskUrl 
 * @param {*} token 
 * @returns 
 */
const getTaskInfo = async (ceTaskUrl) => {

  return new Promise((resolve)=>{

    const startTime = new Date().getTime()
    let count = 0
    const inter = setInterval(async ()=>{
  
      if(new Date().getTime() - startTime > 600000){ //10분 타임아웃
        clearInterval(inter)
        throw new Error('[getTaskInfo] 10 min timed out!!!')
      }

      count += 1

      console.log(`[getTaskInfo][try ${count}][${ceTaskUrl}] send!!!`);
      const res = await http.get(ceTaskUrl)
      const bodyString = await res.readBody()
      console.log(`[getTaskInfo][try ${count}][${bodyString}] received!!!`);
      const body = JSON.parse(bodyString)
      console.log(`[getTaskInfo][try ${count}][${ceTaskUrl}]\n${JSON.stringify(body, undefined, 2)}`);

      const status = body.task.status

      if(status != 'PENDING' && status != 'IN_PROGRESS'){
        clearInterval(inter)
        resolve(body.task)
      }
  
    }, 3000) //3초 마다 체크

  })

}

//run task
run()
