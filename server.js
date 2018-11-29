const Chatbot = require('darwin-sdk').Chatbot
const Query = require('darwin-sdk').Query
const OpenSkillEvent = require('darwin-sdk').OpenSkillEvent
const QuitSkillEvent = require('darwin-sdk').QuitSkillEvent
const NoResponseEvent = require('darwin-sdk').NoResponseEvent
const AixBot = require('aixbot')
const config = require('./config')

const aixbot = new AixBot()

aixbot.use(async (ctx, next) => {
    console.log(`process request for '${ctx.request.query}' ...`)
    var start = new Date().getTime()
    await next()
    var execTime = new Date().getTime() - start
    console.log(`... response in duration ${execTime}ms`)
})

function getAgentName(appId) {
    return config.agents[`${appId}`]
}

function buildAixbotReply(ctx, rsp) {
    const instructs = rsp.getInstructs()
    if (!instructs) return ctx.query(rsp.getReply())

    let quitSkill = false
    let response = ctx.directiveTts(rsp.getReply())
    for (let instruct of instructs) {
        if(instruct.type === "play-audio") {
            response.directiveAudio(instruct['url'])
        }
        if(instruct.type === "text") {
            response.directiveTts(instruct['reply'])
        }
        if(instruct.type === "tts") {
            response.directiveTts(instruct['text'])
        }
        if(instruct.type === "quit-skill") {
            quitSkill = true
        }
    }
    return quitSkill ? response.closeSession() : response.wait()
}

aixbot.use(async (ctx, next) => {
    const agent = getAgentName(ctx.request.appId)
    const chatbot = agent ? new Chatbot(config.chatbot_url, agent, config.source) : null
    ctx.handleEvent = async (event) => {
        if(!chatbot){
            return ctx.reply("抱歉，没有找到技能").closeSession();
        }
        const rsp = await chatbot.dispose(event)
        return buildAixbotReply(ctx, rsp)
    }
    await next()
})

aixbot.onEvent('noResponse', async (ctx) =>{
    await ctx.handleEvent(new NoResponseEvent(ctx.request.user.user_id))
})

aixbot.onEvent('enterSkill', async (ctx) => {
    await ctx.handleEvent(new OpenSkillEvent(ctx.request.user.user_id))
})

aixbot.onEvent('quitSkill', async (ctx) => {
    await ctx.handleEvent(new QuitSkillEvent(ctx.request.user.user_id))
})

aixbot.onEvent('inSkill', async (ctx) => {
    await ctx.handleEvent(new Query(ctx.request.user.user_id, ctx.request.query))
})

aixbot.onError((err, ctx) => {
    ctx.reply('内部错误，稍后再试').closeSession()
    console.error(`error occurred: ${err}`)
    console.error(`error stack: ${err.stack}`)
})

aixbot.run(config.port, config.host)
console.log('aixbot server run success on port ' + config.port)