import { TelegramConfig } from './config.ts'
import { OneBot, ImplConfig, Logger } from "./deps.ts";
import { TelegramHandler } from './handle.ts';
import { TelegramForm } from './form.ts';

export class TelegramBot {
    private ob: OneBot
    private form: TelegramForm
    public info: Record<string, any> = {}
    private offset: number = 0
    public version: string = "0.0.1"
    public logger: Logger
    constructor(public config: TelegramConfig) {
        this.ob = new OneBot({
            impl: "Teyda",
            platform: "telegram",
            self_id: config.self_id,
            config: ImplConfig.Default(),
            action_handler: new TelegramHandler(this)
        })
        this.form = new TelegramForm(this.ob, this)
        this.logger = new Logger("Teyda", `[${Logger.color6("Telegram")}:${Logger.color5(this.config.self_id)}]`)
    }
    polling() {
        let get_updates = () => {
            fetch(`${this.config.endpoint}/bot${this.config.token}/getUpdates`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    timeout: this.config.pollingTimeout,
                    offset: this.offset + 1
                })
            }).then(res => res.json()).then(data => {
                if (data.ok) {
                    for (const update of data.result) {
                        this.offset = Math.max(this.offset, update.update_id)
                        this.form.handle(update)
                    }
                    this.ob.set_online(true)
                } else {
                    this.ob.set_online(false)
                }
                get_updates()
            }).catch(err => {
                if (err.message.includes("error sending request for url")) {
                    this.logger.warn(`获取 Telegram 事件失败，请检查网络是否正常`)
                } else {
                    this.logger.warn(err.message)
                }
                this.ob.set_online(false)
                setTimeout(get_updates, 500)
            })
        }
        get_updates()
    }
    run() {
        this.logger.info(`正在尝试获取机器人自身信息`)
        let get_me = () => {
            fetch(`${this.config.endpoint}/bot${this.config.token}/getMe`).then(res => res.json()).then(data => {
                if (data.ok) {
                    this.info = data.result
                    this.logger.info(`自身信息获取成功`)
                    this.logger.info(`id: "${this.info.id}", first_name: "${this.info.first_name}", username: "${this.info.username}"`)
                    this.ob.run()
                    this.ob.stop_heartbeat()
                    this.polling()
                } else {
                    this.logger.warn(`获取 Telegram 自身信息失败，请检查 token 是否正确，错误描述: "${data.description}"`)
                }
            }).catch(err => {
                if (err.message.includes("error sending request for url")) {
                    this.logger.warn(`获取 Telegram 自身信息失败，请检查网络是否正常`)
                } else {
                    this.logger.warn(err.message)
                }
                setTimeout(get_me, 500)
            })
        }
        get_me()
    }
    stop() {
        this.ob.stop()
    }
}