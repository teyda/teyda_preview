import { ActionHandler, StandardAction, Resps, CustomOneBot, Resp, RespContent, TelegramMessageSegment, Message, crypto, ensureDir, base64Decode, extname, base64urlEncode, basename, base64Encode } from "./deps.ts";
import { TelegramBot } from './bot.ts'
import { TelegramConfig } from './config.ts'
import { Logger } from "./deps.ts";
import { Message as TGMessage, MessageEntity, MessageEntityType, User, Chat, ChatMember } from './types/mod.ts';
import { uint8ArrayToHexString } from './utils.ts'

export class TelegramHandler<E> extends ActionHandler<StandardAction, Resps, CustomOneBot<E, StandardAction, Resps>>{
    private config: TelegramConfig
    constructor(private bot: TelegramBot) {
        super()
        this.config = this.bot.config
    }
    async handle(data: StandardAction, ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resps> {
        const supported_actions = ["get_version", 'get_supported_actions', 'get_status', 'send_message', 'delete_message', 'get_self_info', 'get_user_info', 'get_group_info', 'get_group_member_info', 'set_group_name', 'leave_group', 'kick_group_member', 'ban_group_member', 'unban_group_member', 'set_group_admin', 'unset_group_admin', 'upload_file', 'upload_file_fragmented', 'get_file', 'get_file_fragmented']
        if (data.action === 'get_version') {
            return await this.getVersion(data, ob)
        } else if (data.action === 'get_supported_actions') {
            return Resp.success(supported_actions)
        } else if (data.action === 'get_status') {
            return Resp.success(ob.get_status())
        } else if (data.action === 'send_message') {
            return await this.sendMessage(data, ob)
        } else if (data.action === 'delete_message') {
            return await this.deleteMessage(data, ob)
        } else if (data.action === 'get_self_info') {
            return await this.getSelfInfo(data, ob)
        } else if (data.action === 'get_user_info') {
            return await this.getUserInfo(data, ob)
        } else if (data.action === 'get_group_info') {
            return await this.getGroupInfo(data, ob)
        } else if (data.action === 'get_group_member_info') {
            return await this.getGroupMemberInfo(data, ob)
        } else if (data.action === 'set_group_name') {
            return await this.setGroupName(data, ob)
        } else if (data.action === 'leave_group') {
            return await this.leaveGroup(data, ob)
        } else if (data.action === 'kick_group_member') {
            return await this.kickGroupMember(data, ob)
        } else if (data.action === 'ban_group_member') {
            return await this.banGroupMember(data, ob)
        } else if (data.action === 'unban_group_member') {
            return await this.unbanGroupMember(data, ob)
        } else if (data.action === 'set_group_admin') {
            return await this.setGroupAdmin(data, ob)
        } else if (data.action === 'unset_group_admin') {
            return await this.unbanGroupMember(data, ob)
        } else if (data.action === 'upload_file') {
            return await this.uploadFile(data, ob)
        } else if (data.action === 'upload_file_fragmented') {
            return await this.uploadFileFragmented(data, ob)
        } else if (data.action === 'get_file') {
            return await this.getFile(data, ob)
        } else if (data.action === 'get_file_fragmented') {
            return await this.getFileFragmented(data, ob)
        } else {
            return Resp.unsupported_action()
        }
    }
    async getFileFragmented(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const params = data.params
            if (params.stage && params.file_id) {
                const target = params.file_id.split('/')
                if (params.stage === 'prepare') {
                    if (target[0] === 'tg') {
                        this.bot.logger.info(`分片获取文件: file_id: "${params.file_id}"`)
                        const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/getFile`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                file_id: target[1]
                            })
                        })
                        const parsed = await res.json()
                        if (parsed.ok) {
                            const res = await fetch(`${this.config.endpoint}/file/bot${this.config.token}/${parsed.result.file_path}`)
                            if (!res.ok) {
                                throw new Error('Network response was not OK')
                            }
                            const buf = await res.arrayBuffer()
                            const digest = await crypto.subtle.digest("SHA-256", buf)
                            const hash = uint8ArrayToHexString(new Uint8Array(digest))
                            await ensureDir("./teyda_data")
                            await Deno.writeFile(`./teyda_data/${target[1]}`, new Uint8Array(buf))
                            const file_info = await Deno.stat(`./teyda_data/${target[1]}`)
                            return Resp.success({
                                name: basename(parsed.result.file_path),
                                total_size: file_info.size,
                                sha256: hash
                            })
                        } else {
                            return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                        }
                    }
                } else if (params.stage === 'transfer') {
                    if (target[0] === 'tg') {
                        this.bot.logger.info(`分片获取文件: 传输阶段, file_id: "${params.file_id}", offset: "${params.offset}"`)
                        const stat = await Deno.lstat(`./teyda_data/${target[1]}`)
                        if (!stat.isFile) {
                            return Resp.empty_fail(32002, 'file_id 错误')
                        }
                        const file = await Deno.open(`./teyda_data/${target[1]}`, { read: true })
                        await file.seek(params.offset, 0)
                        const buf = new Uint8Array(params.size)
                        await file.read(buf)
                        file.close()
                        return Resp.success({
                            data: base64Encode(buf)
                        })
                    }
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async getFile(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const params = data.params
            if (params.file_id && params.type) {
                const target = params.file_id.split('/')
                if (params.type === 'data') {
                    if (target[0] === 'tg') {
                        this.bot.logger.info(`获取文件: file_id: "${params.file_id}"`)
                        const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/getFile`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                file_id: target[1]
                            })
                        })
                        const parsed = await res.json()
                        if (parsed.ok) {
                            const res = await fetch(`${this.config.endpoint}/file/bot${this.config.token}/${parsed.result.file_path}`)
                            if (!res.ok) {
                                throw new Error('Network response was not OK')
                            }
                            const buf = await res.arrayBuffer()
                            const digest = await crypto.subtle.digest("SHA-256", buf)
                            const hash = uint8ArrayToHexString(new Uint8Array(digest))
                            return Resp.success({
                                name: basename(parsed.result.file_path),
                                data: base64Encode(new Uint8Array(buf)),
                                sha256: hash
                            })
                        } else {
                            return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                        }
                    } else if (target[0] === 'td') {
                        this.bot.logger.info(`获取文件: file_id: "${params.file_id}"`)
                        const stat = await Deno.lstat(`./teyda_data/${target[1]}`)
                        if (!stat.isFile) {
                            return Resp.empty_fail(32002, 'file_id 错误')
                        }
                        const data = await Deno.readFile(`./teyda_data/${target[1]}`)
                        const digest = await crypto.subtle.digest("SHA-256", data.buffer)
                        const hash = uint8ArrayToHexString(new Uint8Array(digest))
                        return Resp.success({
                            name: target[1],
                            data: base64Encode(data),
                            sha256: hash
                        })
                    }
                } else if (params.type === 'path') {
                    if (target[0] === 'tg') {
                        this.bot.logger.info(`获取文件: file_id: "${params.file_id}"`)
                        const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/getFile`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                file_id: target[1]
                            })
                        })
                        const parsed = await res.json()
                        if (parsed.ok) {
                            const res = await fetch(`${this.config.endpoint}/file/bot${this.config.token}/${parsed.result.file_path}`)
                            if (!res.ok) {
                                throw new Error('Network response was not OK')
                            }
                            const buf = await res.arrayBuffer()
                            const digest = await crypto.subtle.digest("SHA-256", buf)
                            const hash = uint8ArrayToHexString(new Uint8Array(digest))
                            const file_name = `${base64urlEncode(digest)}${extname(parsed.result.file_path)}`
                            await ensureDir("./teyda_data")
                            await Deno.writeFile(`./teyda_data/${file_name}`, new Uint8Array(buf))
                            return Resp.success({
                                name: file_name,
                                path: await Deno.realPath(`./teyda_data/${file_name}`),
                                sha256: hash
                            })
                        } else {
                            return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                        }
                    } else if (target[0] === 'td') {
                        this.bot.logger.info(`获取文件: file_id: "${params.file_id}"`)
                        const stat = await Deno.lstat(`./teyda_data/${target[1]}`)
                        if (!stat.isFile) {
                            return Resp.empty_fail(32002, 'file_id 错误')
                        }
                        const data = await Deno.readFile(`./teyda_data/${target[1]}`)
                        const digest = await crypto.subtle.digest("SHA-256", data.buffer)
                        const hash = uint8ArrayToHexString(new Uint8Array(digest))
                        return Resp.success({
                            name: target[1],
                            path: await Deno.realPath(`./teyda_data/${target[1]}`),
                            sha256: hash
                        })
                    }
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async uploadFileFragmented(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const params = data.params
            if (params.stage) {
                if (params.stage === 'prepare' && params.total_size && params.sha256 && params.name) {
                    if (/^[a-z0-9]{64}$/.test(params.sha256)) {
                        this.bot.logger.info(`分片上传文件: 准备阶段, sha256: "${params.sha256}"`)
                        await ensureDir("./teyda_data")
                        const file_name = `temp_${params.sha256}${extname(params.name)}`
                        const file = await Deno.open(`./teyda_data/${file_name}`, { read: true, write: true, create: true })
                        await Deno.ftruncate(file.rid, params.total_size)
                        file.close()
                        return Resp.success({
                            file_id: `td_t/${file_name}`
                        })
                    } else {
                        return Resp.empty_fail(32003, '非正确的 SHA256 校验和, 建议检查字母是否全部为小写')
                    }
                } else if (params.stage === 'transfer' && params.file_id && params.offset && params.data) {
                    const target = params.file_id.split('/')
                    if (target[0] === 'td_t') {
                        this.bot.logger.info(`分片上传文件: 传输阶段, file_id: "${params.file_id}", offset: "${params.offset}"`)
                        const stat = await Deno.lstat(`./teyda_data/${target[1]}`)
                        if (!stat.isFile) {
                            return Resp.empty_fail(32002, 'file_id 错误')
                        }
                        const file = await Deno.open(`./teyda_data/${target[1]}`, { read: true, write: true })
                        await file.seek(params.offset, 0)
                        await file.write(base64Decode(params.data))
                        file.close()
                        return Resp.empty_success()
                    }
                } else if (params.stage === 'finish' && params.file_id) {
                    const target = params.file_id.split('/')
                    if (target[0] === 'td_t') {
                        this.bot.logger.info(`分片上传文件: 结束阶段, file_id: "${params.file_id}"`)
                        const stat = await Deno.lstat(`./teyda_data/${target[1]}`)
                        if (!stat.isFile) {
                            return Resp.empty_fail(32002, 'file_id 错误')
                        }
                        const data = await Deno.readFile(`./teyda_data/${target[1]}`)
                        const digest = await crypto.subtle.digest("SHA-256", data.buffer)
                        const hash = uint8ArrayToHexString(new Uint8Array(digest))
                        const old_hash = target[1].split('.')[0]
                        if (hash !== old_hash) {
                            return Resp.fail({}, 32001, 'SHA-256 Hex 不匹配')
                        }
                        const file_name = target[1].replace('temp_', '')
                        await Deno.rename(`./teyda_data/${target[1]}`, `./teyda_data/${file_name}`)
                        return Resp.success({
                            file_id: `td/${file_name}`
                        })
                    }
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async uploadFile(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const params = data.params
            if (params.name && params.type) {
                if (params.type === 'url' && params.url) {
                    this.bot.logger.info(`上传文件: 从"${params.url}"获取文件`)
                    const res = await fetch(params.url, {
                        headers: params.headers ? params.headers : {}
                    })
                    if (!res.ok) {
                        throw new Error('Network response was not OK')
                    }
                    const buf = await res.arrayBuffer()
                    return await TelegramHandler.saveFile(buf, params.name, params.sha256)
                } else if (params.type === 'path' && params.path) {
                    this.bot.logger.info(`上传文件: 从"${params.path}"获取文件`)
                    const data = await Deno.readFile(params.path)
                    const buf = data.buffer
                    return await TelegramHandler.saveFile(buf, params.name, params.sha256)
                } else if (params.type === 'data' && params.data) {
                    this.bot.logger.info(`上传文件: 从 data 获取文件`)
                    const data = base64Decode(params.data)
                    const buf = data.buffer
                    return await TelegramHandler.saveFile(buf, params.name, params.sha256)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async unsetGroupAdmin(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.group_id && data.params.user_id) {
                this.bot.logger.info(`${Logger.color8('取消设置群组管理员')}: group_id: "${data.params.group_id}", user_id: "${data.params.user_id}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/promoteChatMember`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: data.params.group_id,
                        user_id: data.params.user_id,
                        can_pin_messages: false,
                        can_invite_users: false,
                        can_change_info: false,
                        can_restrict_members: false,
                        can_manage_video_chats: false,
                        can_delete_messages: false
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async setGroupAdmin(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.group_id && data.params.user_id) {
                this.bot.logger.info(`${Logger.color8('设置群组管理员')}: group_id: "${data.params.group_id}", user_id: "${data.params.user_id}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/promoteChatMember`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: data.params.group_id,
                        user_id: data.params.user_id,
                        can_pin_messages: true,
                        can_invite_users: true,
                        can_change_info: true,
                        can_restrict_members: true,
                        can_manage_video_chats: true,
                        can_delete_messages: true
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async unbanGroupMember(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.group_id && data.params.user_id) {
                this.bot.logger.info(`${Logger.color8('取消禁言群组成员')}: group_id: "${data.params.group_id}", user_id: "${data.params.user_id}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/restrictChatMember`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: data.params.group_id,
                        user_id: data.params.user_id,
                        permissions: {
                            can_send_messages: true,
                            can_send_media_messages: true,
                            can_send_polls: true,
                            can_send_other_messages: true,
                            can_add_web_page_previews: true
                        }
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async banGroupMember(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.group_id && data.params.user_id) {
                this.bot.logger.info(`${Logger.color8('禁言群组成员')}: group_id: "${data.params.group_id}", user_id: "${data.params.user_id}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/restrictChatMember`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: data.params.group_id,
                        user_id: data.params.user_id,
                        permissions: {
                            can_send_messages: false,
                        }
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async kickGroupMember(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.group_id && data.params.user_id) {
                this.bot.logger.info(`${Logger.color8('踢出群组成员')}: group_id: "${data.params.group_id}", user_id: "${data.params.user_id}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/banChatMember`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: data.params.group_id,
                        user_id: data.params.user_id
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async leaveGroup(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const target = data.params.group_id
            if (target) {
                this.bot.logger.info(`${Logger.color8("退出群组")}: group_id: "${target}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/leaveChat`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: target
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async setGroupName(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.group_id && data.params.group_name) {
                this.bot.logger.info(`${Logger.color8('设置群组名称')}: group_id: "${data.params.group_id}", group_name: "${data.params.group_name}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/setChatTitle`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: data.params.group_id,
                        title: data.params.group_name
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async getGroupMemberInfo(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.group_id && data.params.user_id) {
                this.bot.logger.info(`获取群成员成员信息: group_id: "${data.params.group_id}", user_id: "${data.params.user_id}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/getChatMember`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: data.params.group_id,
                        user_id: data.params.user_id
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    const result: ChatMember = parsed.result
                    return Resp.success({
                        user_id: result.user?.id?.toString(),
                        nickname: result.user?.first_name,
                    })
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async getGroupInfo(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const target = data.params.group_id
            if (target) {
                this.bot.logger.info(`获取群组信息: group_id: "${target}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/getChat`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: target,
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    const result: Chat = parsed.result
                    return Resp.success({
                        group_id: result.id?.toString(),
                        group_name: result.title,
                    })
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async getUserInfo(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const target = data.params.user_id
            if (target) {
                this.bot.logger.info(`获取用户信息: user_id: "${target}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/getChat`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: target,
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    const result: User = parsed.result
                    return Resp.success({
                        user_id: result.id?.toString(),
                        nickname: result.first_name,
                        'telegram.is_bot': result.is_bot
                    })
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async getSelfInfo(_data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            const info = this.bot.info
            return Resp.success({
                user_id: info.id.toString(),
                nickname: info.first_name
            })
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async deleteMessage(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            if (data.params.message_id) {
                const target = data.params.message_id.split('/')
                this.bot.logger.info(`${Logger.color8('删除消息')}: message_id: "${target[1]}", chat_id: "${target[0]}"`)
                const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/deleteMessage`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: target[0],
                        message_id: target[1]
                    })
                })
                const parsed = await res.json()
                if (parsed.ok) {
                    return Resp.empty_success()
                } else {
                    return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async sendMessage(data: StandardAction, _ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            let chat_id
            let send_to = ''
            if (data.params.detail_type === "group" && data.params.group_id) {
                chat_id = data.params.group_id
                send_to = `群组(${Logger.color9(chat_id)})`
            } else if (data.params.detail_type === 'private' && data.params.user_id) {
                chat_id = data.params.user_id
                send_to = `私聊用户(${Logger.color10(chat_id)})`
            }
            if (chat_id) {
                const message: TelegramMessageSegment[] | string | TelegramMessageSegment = data.params.message
                let ret: Record<string, any> = {}
                let message_type = 'text'
                let message_data: Record<string, any> = {}
                let raw_type: 'array' | 'string' | 'object'
                if (message) {
                    const non_text = ['image', 'voice', 'audio', 'video', 'file', 'location', 'telegram.animation', 'telegram.sticker']
                    if (Array.isArray(message)) {
                        raw_type = 'array'
                        const excludeReply: TelegramMessageSegment[] = message.filter(element => {
                            if (element.type === 'reply') {
                                ret.reply_to_message_id = parseInt(element.data.message_id)
                            } else if (non_text.includes(element.type)) {
                                message_type = element.type
                                message_data = element.data
                            } else {
                                return element
                            }
                        })
                        if (message_type === 'text') {
                            let text_parsed = ""
                            let entities: MessageEntity[] = []
                            let offset = 0
                            for (const seg of excludeReply) {
                                const [text, entity, unsupported] = TelegramHandler.segmentConverter(seg, text_parsed, offset)
                                if (unsupported) {
                                    return Resp.unsupported_segment()
                                }
                                text_parsed = text_parsed + text
                                entities.push(entity)
                            }
                            ret.text = text_parsed
                            ret.entities = entities
                        }
                    } else if (typeof message === 'string') {
                        raw_type = 'string'
                        ret.text = message
                    } else if (message.constructor == Object) {
                        raw_type = 'object'
                        if (message.type === 'reply') {
                            return Resp.unsupported_segment_data()
                        }
                        if (non_text.includes(message.type)) {
                            message_type = message.type
                            message_data = message.data
                        } else {
                            const [text, entity, unsupported] = TelegramHandler.segmentConverter(message)
                            if (unsupported) {
                                return Resp.unsupported_segment()
                            }
                            ret.text = text
                            Object.getOwnPropertyNames(entity).length !== 0 && (ret.entities = [entity])
                        }
                    }
                    if (Object.getOwnPropertyNames(ret).length !== 0) {
                        let method = ''
                        if (message_type === 'text') {
                            method = 'sendMessage'
                        } else if (message_type === 'image') {
                            method = 'sendPhoto'
                            ret.photo = message_data.file_id
                        } else if (message_type === 'file') {
                            method = 'sendDocument'
                            ret.document = message_data.file_id
                        } else if (message_type === 'telegram.animation') {
                            method = 'sendAnimation'
                            ret.animation = message_data.file_id
                        } else if (message_type === 'audio') {
                            method = 'sendAudio'
                            ret.audio = message_data.file_id
                        } else if (message_type === 'video') {
                            method = 'sendVideo'
                            ret.video = message_data.file_id
                        } else if (message_type === 'voice') {
                            method = 'sendVoice'
                            ret.voice = message_data.file_id
                        } else if (message_type === 'location') {
                            method = 'sendLocation'
                            ret.latitude = message_data.latitude
                            ret.longitude = message_data.longitude
                        } else if (message_type === 'telegram.sticker') {
                            method = 'sendSticker'
                            ret.sticker = message_data.file_id
                        }
                        const message_alt = raw_type! === 'string' ? message : (raw_type! === 'object' ? Message.alt([message] as TelegramMessageSegment[]) : Message.alt(message as TelegramMessageSegment[]))
                        this.bot.logger.info(`${Logger.color8('发送消息')}: "${message_alt}", 至${send_to}`)
                        const res = await fetch(`${this.config.endpoint}/bot${this.config.token}/${method}`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                chat_id,
                                ...ret
                            })
                        })
                        const parsed = await res.json()
                        if (parsed.ok) {
                            const result: TGMessage = parsed.result
                            return Resp.success({
                                message_id: `${chat_id}/${result.message_id}`,
                                time: new Date().getTime(),
                            })
                        } else {
                            return Resp.empty_fail(34000, `聊天机器人平台未执行此操作: "${parsed.description}"`)
                        }
                    } else {
                        return Resp.unsupported_segment()
                    }
                }
            }
            return Resp.unsupported_param()
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
    async getVersion(_data: StandardAction, ob: CustomOneBot<E, StandardAction, Resps>): Promise<Resp<RespContent>> {
        const callback = async () => {
            return Resp.success({
                impl: ob.impl,
                platform: ob.platform,
                onebot_version: ob.onebot_version,
                version: this.bot.version
            })
        }
        return await callback().then(data => data).catch(err => TelegramHandler.defaultErrorHandler(err, this.bot.logger))
    }
}

export namespace TelegramHandler {
    export function defaultErrorHandler(err: any, logger: Logger): Resp<RespContent> {
        if (err.message.includes("error sending request for url")) {
            logger.warn(`网络不通畅`)
            return Resp.empty_fail(33001, "网络不通畅")
        }
        console.debug(err)
        logger.warn(`未知错误，请寻求帮助`)
        return Resp.empty_fail(20002, "未知错误，请寻求帮助")
    }
    export function segmentConverter(seg: TelegramMessageSegment, text: string = '', offset: number = 0): [string, MessageEntity, boolean] {
        let unsupported = false
        const rich_text = ['telegram.bot_command', 'telegram.url', 'telegram.bold', 'telegram.cashtag', "telegram.italic", "telegram.underline", "telegram.strikethrough", 'telegram.email', "telegram.phone_number", "telegram.spoiler", "telegram.code"]
        let entity: MessageEntity = {}
        if (seg.type === 'text') {
            text = text + seg.data.text
            offset = offset + seg.data.text.length
        } else if (seg.type === 'mention') {
            text = seg.data['telegram.text']
            const length = seg.data['telegram.text'].length
            entity = {
                type: 'mention',
                offset: offset,
                length
            }
            offset = offset + length
        } else if (seg.type === 'telegram.text_mention') {
            text = text + seg.data.text
            const length = seg.data.text.length
            entity = {
                type: 'text_mention',
                offset: offset,
                length,
                user: {
                    id: parseInt(seg.data.user_id)
                }
            }
            offset = offset + length
        } else if (seg.type === 'telegram.text_link') {
            text = text + seg.data.text
            const length = seg.data.text.length
            entity = {
                type: 'text_mention',
                offset: offset,
                length,
                url: seg.data.url
            }
            offset = offset + length
        } else if (rich_text.includes(seg.type)) {
            text = text + seg.data.text
            const length = seg.data.text.length
            entity = {
                type: seg.type.split(".")[1] as MessageEntityType,
                offset: offset,
                length,
            }
            offset = offset + length
        } else {
            unsupported = true
        }
        return [text, entity, unsupported]
    }
    export async function saveFile(buf: ArrayBuffer, name: string, sha256: string): Promise<Resp<RespContent>> {
        const digest = await crypto.subtle.digest("SHA3-224", buf)
        if (sha256) {
            const digest = await crypto.subtle.digest("SHA-256", buf)
            const hash = uint8ArrayToHexString(new Uint8Array(digest))
            if (hash !== sha256) {
                return Resp.fail({}, 32001, 'SHA-256 hash 不匹配')
            }
        }
        const file_name = `${base64urlEncode(digest)}${extname(name)}`
        await ensureDir("./teyda_data")
        await Deno.writeFile(`./teyda_data/${file_name}`, new Uint8Array(buf))
        return Resp.success({
            file_id: `td/${file_name}`
        })
    }
}