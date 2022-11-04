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
const sonarMetric = core.getInput('sonar.metric')
const sonarMetricList = sonarMetric.split(',')
const githubToken = core.getInput('github.token')

console.log(`inputs => key:${key} / host:${host} / login:${sonarLogin} / sonarMetric:${sonarMetric}`);

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
    const taskDetailMap = new Map()
    for(let tempMetric of sonarMetricList){

      const data = await getTaskDetail(taskInfo.componentKey, tempMetric)
      data.forEach((dataElem)=>{

        let value = 0
        dataElem.measures.forEach((elem)=>{
          if(elem.metric == tempMetric){
            value = Number(elem.value)
            return false;
          }
        })

        let tempTaskDetail = taskDetailMap.get(dataElem.path)
        if(tempTaskDetail){
          tempTaskDetail.measures.push(...dataElem.measures)
          tempTaskDetail.total += value
        }else{
          dataElem.total = value
          taskDetailMap.set(dataElem.path, dataElem)
        }
      })
      
    }

    const taskDetail = taskDetailMap.values()
    
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
    let failedCount = 0
    taskDetail.forEach((elem)=>{
      console.log('[from sonar file] '+elem.path);
      if(elem.total > 0 && prFileNames.filter((fname)=>{return elem.path == fname}).length > 0){
        failed = true
        failedCount += 1
        let filestr = `${elem.path}`
        elem.measures.forEach((measure)=>{
          filestr += ` | ${measure.value}`
        })
        failedFiles.push(filestr)
      }
    })

    comment.add(`Result : ${failed?'FAIL ❌':'PASS 🟢'}`)
    comment.add('```')
    comment.add('')
    comment.add('### Summary')
    comment.add('```java')
    comment.add(`Repo Check Total : ${taskDetail.paging.total}`)
    comment.add(`Repo Error Total : ${taskDetail.baseComponent.measures[0].value}`)
    comment.add(`This PR(${github.context.payload.pull_request.number}) ERRs : ${failedCount}`)
    comment.add('```')
    comment.add('')
    
    if(failed){
      
      comment.add('### Bugs Detail')
      let tableHeader = `|File Name|`
      let tableHeaderAlign = `|--|`
      sonarMetricList.forEach((metric)=>{
        tableHeader += `${metric}|`
        tableHeaderAlign += `:--:|`
      })
      comment.add(tableHeader)
      comment.add(tableHeaderAlign)
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
const getTaskDetail = async (componentKey, metric) => {

  const result = []

  let pageNo = 0
  const time = new Date().getTime()
  while(new Date().getTime() - time < 3000){ //최대 3초까지만

    pageNo += 1
    console.log(`[TaskDetailApi] pageNo:${pageNo} metric:${metric} api start`)
    const {components} = await taskDetailApi(componentKey, metric, pageNo)
    if(!components || components.length == 0){
      console.log(`[TaskDetailApi] end search (pageNo:${pageNo})`)
      break;
    }

    const availableData = components.map((elem)=>{
      if(Number(elem.measures[0].value) > 0){
        return elem
      }
    })

    if(availableData && availableData.length > 0){
      result.push(...availableData)
    }else{
      console.log(`[TaskDetailApi] end search (pageNo:${pageNo})`)
      break;
    }
    
  }

  return result

}

const taskDetailApi = async (componentKey, metric, pageNo) => {

  const res = await http.get(`${host}/api/measures/component_tree
  ?component=${componentKey}
  &p=${pageNo}
  &ps=2
  &metricKeys=${metric}
  &qualifiers=FIL,TRK
  &metricSortFilter=withMeasuresOnly
  &metricSort=${metric}
  &s=metric
  &asc=false`)
  const bodyString = await res.readBody()
  return bodyString?JSON.parse(bodyString):{}

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
