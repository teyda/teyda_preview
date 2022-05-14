import { yamlParse } from './deps.ts'
import { TelegramBot } from "./src/core/adapter/telegram/bot.ts"

const config = yamlParse(await Deno.readTextFile("./teyda.yml"))

const tg = new TelegramBot(config as any)

tg.run()
