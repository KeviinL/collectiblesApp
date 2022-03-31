import dotenv from "dotenv-safe"
import express, {Request, Response} from "express"
import freeClimbSdk from "@freeclimb/sdk"
import bodyParser from "body-parser"
import { StringifyOptions } from "querystring"
import { resolve } from "path"
import { isNumericLiteral } from "typescript"

dotenv.config()
const { ACCOUNT_ID, API_KEY, HOST_URL, PORT } = process.env

const app = express()

app.use(bodyParser.urlencoded({ extended: true}))
app.use(bodyParser.json())

interface SmsBody{
    from: string
    to: string
    text: string
}

interface Instruction {
    script: string
    redirect: string
}

interface InstructionMap {
    [key: string]: Instruction
}

const freeClimbModule = freeClimbSdk(ACCOUNT_ID, API_KEY)

let mainMenuErrorCount = 0

app.post("/incomingSms", async (req: Request<any, any, SmsBody>, res: Response) => {
    const { from, to, text } = req.body
    await freeClimbModule.api.messages.create(to, from, "This is the Web App")
    res.sendStatus(200)
})

app.post("/incomingCall", async (req: Request, res: Response) => {
    const redirectUrl = `${HOST_URL}/mainMenuPrompt`
    const greeting = "Hello welcome to the Collectibles App"
    const welcomePercl = freeClimbModule.percl.build(
        freeClimbModule.percl.say(greeting),
        freeClimbModule.percl.pause(100),
        freeClimbModule.percl.redirect(redirectUrl)
    )
    res.json(welcomePercl)
})

app.post("/mainMenuPrompt", async (req: Request, res: Response<freeClimbSdk.PerCL.Command[]>) => {
    const actionUrl = `${HOST_URL}/mainMenu`
    const getDigitsPercl = freeClimbModule.percl.getDigits(actionUrl, {
        prompts: [
            freeClimbModule.percl.say("Please listen carefully as our menu options have changes"),
            freeClimbModule.percl.pause(100),
            freeClimbModule.percl.say("for existing orders press 1"),
            freeClimbModule.percl.say("for new orders press 2"),
            freeClimbModule.percl.say("for hours and location press 3")


        ],
        maxDigits: 1,
        minDigits: 1,
        initialTimeoutMs: 12000,
        digitTimeoutMs: 6000
    })
    res.json(freeClimbModule.percl.build(getDigitsPercl))
})

app.post("/mainMenu", async (req: Request<any, freeClimbSdk.PerCL.Command[], { digits: string }>, res) => {
    const { digits } = req.body
    const instructionMap: InstructionMap = {
        "1": {
            script: "Redirecting your call to existing orders",
            redirect: `${HOST_URL}/transfer`
        },
        "2": {
            script: "Redirecting your call to new orders",
            redirect: `${HOST_URL}/transfer`
        },
        "3": {
            script: `We are open from Monday to Saturday from 9am to 5pm, 
            on Sunday, we are open from 11pm to 5pm`,
            redirect: `${HOST_URL}/endCall`
        }
    } 
    //instructionMap["5"] = undefined
    const instructions = instructionMap[digits]
    const redirectUrl = `${HOST_URL}/mainMenuPrompt`
    //invalid input and less than error retry limit
    if ((!digits || !instructions) && mainMenuErrorCount < 3 ) {
        mainMenuErrorCount++
        res.json(
            freeClimbModule.percl.build(
                freeClimbModule.percl.say("Error, please try again"),
                freeClimbModule.percl.redirect(redirectUrl)

            )
        )
        // surpassed error retry limit
    } else if (mainMenuErrorCount >= 3) {
        mainMenuErrorCount = 0
        res.json(
            freeClimbModule.percl.build(
                freeClimbModule.percl.say("Maximum retry limit was reached"),
                freeClimbModule.percl.redirect(`${HOST_URL}/endcall`)
            )
        )
        // user provided good input
    } else {
        mainMenuErrorCount = 0
        res.json(
            freeClimbModule.percl.build(
                freeClimbModule.percl.say(instructions.script),
                freeClimbModule.percl.redirect(instructions.redirect)
            )
        )
    }
})

app.post("/transfer", (req: Request, res: Response) => {
    res.json(
        freeClimbModule.percl.build(
            freeClimbModule.percl.say("Please wait while we transfer you to an operator"),
            freeClimbModule.percl.redirect(`${HOST_URL}/endCall`)
        )
    )
})

app.post("/endCall", (req: Request, res: Response) => {
    res.json(
        freeClimbModule.percl.build(
            freeClimbModule.percl.say("Thank you for calling The Collectibles App, have a good rest of your day."),
            freeClimbModule.percl.hangup()
        )
    )
})

app.listen(PORT, function() {
    console.log(`Server is running at: ${PORT}`)
})

