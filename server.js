const Chatbot = require('darwin-sdk').Chatbot
const Query = require('darwin-sdk').Query
const OpenSkillEvent = require('darwin-sdk').OpenSkillEvent
const QuitSkillEvent = require('darwin-sdk').QuitSkillEvent
const NoResponseEvent = require('darwin-sdk').NoResponseEvent
const RecordFinishEvent = require('darwin-sdk').RecordFinishEvent
const RecordFailEvent = require('darwin-sdk').RecordFailEvent
const PlayFinishEvent = require('darwin-sdk').PlayFinishEvent
const Response = require('aixbot').Response
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

function buildAixbotReply(ctx, chatbotReply) {
    const instructs = chatbotReply.getInstructs()
    if (!instructs) return ctx.query(chatbotReply.getReply())

    let quitSkill = false
    let text = chatbotReply.getReply()
    let response = null
    //response = ctx.directiveTts(text)
    
    if (text.length > 0 ) {
        response = ctx.directiveTts(text)
    }
    else{
        response = ctx.response
    }
    
    let flag = true

    for (let instruct of instructs) {
        if(instruct.type === "play-audio") {
            response.directiveAudio(instruct['url'])
            response.registerPlayFinishing()
            flag = false
        }
        if(instruct.type === "play-record") {
            response.directiveRecord(instruct['mediaId'])
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
    return quitSkill ? response.closeSession() : response.openMic(flag)
}

aixbot.use(async (ctx, next) => {
    ctx.getUserId = () => {
        return 'darwin_' + ctx.request.user.user_id
    }
    await next()
})

aixbot.use(async (ctx, next) => {
    const agent = getAgentName(ctx.request.appId)
    const chatbot = agent ? new Chatbot(config.chatbot_url, agent, config.source) : null
    ctx.handleEvent = async (event) => {
        if(!chatbot) {
            console.error('ERROR: found no agent')
            return ctx.reply("抱歉，没有找到技能").closeSession();
        }

        console.log(`receive: ${JSON.stringify(event.body)}`)
        const chatbotReply = await chatbot.dispose(event)
        const result = buildAixbotReply(ctx, chatbotReply)
        console.log(`reply : ${JSON.stringify(result)}`)
        return result
    }
    await next()
})

aixbot.onEvent('noResponse', async (ctx) =>{
    await ctx.handleEvent(new NoResponseEvent(ctx.getUserId()))
})

aixbot.onEvent('enterSkill', async (ctx) => {
    console.log('onEvent enterSkill')
    await ctx.handleEvent(new OpenSkillEvent(ctx.getUserId()))
})

aixbot.onEvent('quitSkill', async (ctx) => {
    await ctx.handleEvent(new QuitSkillEvent(ctx.getUserId()))
})

aixbot.onEvent('inSkill', async (ctx) => {
    await ctx.handleEvent(new Query(ctx.getUserId(), ctx.request.query))
})

aixbot.onEvent('recordFinish', async (ctx) => {
    const userId = ctx.getUserId()
    const asrText = ctx.request.eventProperty.asr_text
    const mediaId = ctx.request.eventProperty.msg_file_id
    await ctx.handleEvent(new RecordFinishEvent(userId, mediaId, asrText));
});

aixbot.onEvent('recordFail', async (ctx) => {
    await ctx.handleEvent(new RecordFailEvent(ctx.getUserId()));
});

aixbot.onEvent('playFinishing', async (ctx) => {
    console.log('onEvent playFinishing')
    await ctx.handleEvent(new PlayFinishEvent(ctx.getUserId(), ctx.request.quer));
});

aixbot.onError((err, ctx) => {
    ctx.reply('内部错误，稍后再试').closeSession()
    console.error(`error occurred: ${err}`)
    console.error(`error stack: ${err.stack}`)
})

aixbot.run(config.port, config.host)
console.log('aixbot server run success on port ' + config.port)
