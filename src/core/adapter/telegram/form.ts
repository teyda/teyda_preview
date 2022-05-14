import { OneBot, MessageContent, TelegramMessageSegment, NoticeContent, Logger, Message } from './deps.ts';
import { Update, Message as TGMessage, MessageEntity, ChatMemberUpdated, ChatMemberRestricted } from './types/mod.ts';
import { TelegramBot } from './bot.ts'

export class TelegramForm {
    constructor(private ob: OneBot, private bot: TelegramBot) { }
    handle(data: Update): void {
        //console.log(data)
        let content: NoticeContent | undefined | null
        if (data.message) {
            this.message(data.message)
        } else if (data.my_chat_member) {
            content = this.myChatMember(data.my_chat_member)
        }
        if (content) {
            this.ob.send_event(this.ob.new_event({
                type: 'notice',
                ...content
            }, this.getTime()))
        }
    }
    getTime(): number {
        return Date.now()
    }
    myChatMember(e: ChatMemberUpdated): NoticeContent | null {
        if (e.chat?.type === 'private') {
            return {
                detail_type: e.new_chat_member?.status === "member" ? "friend_increase" : "friend_decrease",
                sub_type: "",
                user_id: e.from?.id?.toString()!
            }
        } else if (e.chat?.type === 'group' || e.chat?.type === 'supergroup') {
            const old_status = e.old_chat_member?.status
            const new_status = e.new_chat_member?.status
            const r = e.new_chat_member as ChatMemberRestricted
            const old_r = e.new_chat_member as ChatMemberRestricted
            if (new_status === "administrator" && old_status === "member") {
                return {
                    detail_type: "group_admin_set",
                    sub_type: "",
                    user_id: e.new_chat_member?.user?.id?.toString()!,
                    group_id: e.chat.id?.toString()!,
                    operator_id: e.from?.id?.toString()!
                }
            } else if (new_status === "member" && old_status == "administrator") {
                return {
                    detail_type: "group_admin_unset",
                    sub_type: "",
                    user_id: e.new_chat_member?.user?.id?.toString()!,
                    group_id: e.chat.id?.toString()!,
                    operator_id: e.from?.id?.toString()!
                }
            } else if (new_status === "restricted" && (old_status === "member" || old_status === "administrator") && !r.can_send_messages) {
                return {
                    detail_type: "group_member_ban",
                    sub_type: "",
                    user_id: e.new_chat_member?.user?.id?.toString()!,
                    group_id: e.chat.id?.toString()!,
                    operator_id: e.from?.id?.toString()!
                }
            } else if (new_status === "restricted" && old_status === "restricted") {
                const old_ban = old_r.can_send_messages
                const ban = r.can_send_messages
                if (old_ban !== ban) {
                    return {
                        detail_type: ban ? "group_member_ban" : "group_member_unban",
                        sub_type: "",
                        user_id: e.new_chat_member?.user?.id?.toString()!,
                        group_id: e.chat.id?.toString()!,
                        operator_id: e.from?.id?.toString()!
                    }
                }
            } else if ((new_status === "member" || new_status === "administrator") && old_status === "restricted" && !old_r.can_send_messages) {
                return {
                    detail_type: "group_member_unban",
                    sub_type: "",
                    user_id: e.new_chat_member?.user?.id?.toString()!,
                    group_id: e.chat.id?.toString()!,
                    operator_id: e.from?.id?.toString()!
                }
            }
        }
        return null
    }
    message(e: TGMessage): void {
        let content: MessageContent | undefined
        if (e.chat?.type === "group" || e.chat?.type === 'supergroup') {
            if (e.new_chat_members) {
                for (const m of e.new_chat_members) {
                    const content: NoticeContent = {
                        type: 'notice',
                        detail_type: 'group_member_increase',
                        user_id: m.id?.toString()!,
                        group_id: e.chat.id?.toString()!,
                        sub_type: e.from?.id === m.id ? 'join' : 'invite',
                        operator_id: e.from?.id?.toString()!,
                        'telegram.date': e.date,
                        'telegram.is_bot': m.is_bot
                    }
                    this.ob.send_event(this.ob.new_event({
                        type: 'notice',
                        ...content
                    }, this.getTime()))
                }
            } else if (e.left_chat_member) {
                const content: NoticeContent = {
                    type: 'notice',
                    detail_type: 'group_member_decrease',
                    user_id: e.left_chat_member.id?.toString()!,
                    group_id: e.chat.id?.toString()!,
                    sub_type: e.from?.id === e.left_chat_member.id ? 'leave' : 'kick',
                    operator_id: e.from?.id?.toString()!,
                    'telegram.date': e.date,
                    'telegram.is_bot': e.left_chat_member.is_bot
                }
                this.ob.send_event(this.ob.new_event({
                    type: 'notice',
                    ...content
                }, this.getTime()))
            } else if (!e.new_chat_title && !e.new_chat_photo) {
                const segs = TelegramForm.parse(e)
                this.bot.logger.info(`收到消息: "${Message.alt(segs)}", 来自群组(${Logger.color9(e.chat.id?.toString()!)})用户: "${e.from?.first_name}"(${Logger.color10(e.from?.id?.toString()!)})`)
                content = MessageContent.new_group_message_content(segs, `${e.chat.id}/${e.message_id}`, e.from?.id?.toString()!, e.chat?.id?.toString()!)
            }
        } else if (e.chat?.type === 'private') {
            const segs = TelegramForm.parse(e)
            this.bot.logger.info(`收到消息: "${Message.alt(segs)}", 来自私聊用户: "${e.from?.first_name}"(${Logger.color10(e.from?.id?.toString()!)})`)
            content = MessageContent.new_private_message_content(segs, `${e.chat.id}/${e.message_id}`, e.from?.id?.toString()!)
        }
        if (content) {
            this.ob.send_event(this.ob.new_event({
                type: 'message',
                'telegram.date': e.date,
                ...content
            }, this.getTime()))
        }
    }
}

export namespace TelegramForm {
    function textLinkSeg(text: string, entity: MessageEntity): TelegramMessageSegment | null {
        const select = text.slice(entity.offset!, entity.offset! + entity.length!)
        if (select !== '' && entity.length! === select.length) {
            return {
                type: 'telegram.text_link',
                data: {
                    text: text.slice(entity.offset!, entity.offset! + entity.length!),
                    url: entity.url!
                }
            }
        } else if (text !== select) {
            return textSeg(text)
        }
        return null

    }
    function textSeg(text: string): TelegramMessageSegment {
        return {
            type: 'text',
            data: {
                text: text,
            }
        }
    }
    function mentionSeg(text: string, entity: MessageEntity): TelegramMessageSegment | null {
        const select = text.slice(entity.offset!, entity.offset! + entity.length!)
        if (select !== '' && entity.length! === select.length) {
            return {
                type: 'mention',
                data: {
                    user_id: '',
                    'telegram.text': select,
                }
            }
        } else if (text !== select) {
            return textSeg(text)
        }
        return null
    }
    function textMentionSeg(text: string, entity: MessageEntity): TelegramMessageSegment | null {
        const select = text.slice(entity.offset!, entity.offset! + entity.length!)
        if (select !== '' && entity.length! === select.length) {
            return {
                type: 'telegram.text_mention',
                data: {
                    user_id: entity.user?.id?.toString()!,
                    text: select,
                }
            }
        } else if (text !== select) {
            return textSeg(text)
        }
        return null
    }
    function richTextSeg(text: string, entity: MessageEntity, name: string): TelegramMessageSegment | null {
        const select = text.slice(entity.offset!, entity.offset! + entity.length!)
        if (select !== '' && entity.length! === select.length) {
            return {
                type: name as any,
                data: {
                    text: text.slice(entity.offset!, entity.offset! + entity.length!),
                }
            }
        } else if (text !== select) {
            return textSeg(text)
        }
        return null

    }
    export function parseText(text: string, entities: MessageEntity[]): TelegramMessageSegment[] {
        //console.log(entities)
        let curr = 0
        let segs: TelegramMessageSegment[] = []
        const rich_text = ['bot_command', 'url', 'bold', 'cashtag', "italic", "underline", "strikethrough", 'email', "phone_number", "spoiler", "code"]
        for (const e of entities) {
            if (e.type === 'text_link') {
                segs.push(textLinkSeg(text, e)!)
                const prev = textLinkSeg(text.slice(curr, e.offset), e)
                prev !== null && segs.splice(-1, 0, prev)
                curr = e.offset! + e.length!
            } else if (e.type === 'mention') {
                segs.push(mentionSeg(text, e)!)
                const prev = mentionSeg(text.slice(curr, e.offset), e)
                prev !== null && segs.splice(-1, 0, prev)
                curr = e.offset! + e.length!
            } else if (e.type === 'text_mention') {
                segs.push(textMentionSeg(text, e)!)
                const prev = textMentionSeg(text.slice(curr, e.offset), e)
                prev !== null && segs.splice(-1, 0, prev)
                curr = e.offset! + e.length!
            } else if (rich_text.includes(e.type!)) {
                segs.push(richTextSeg(text, e, `telegram.${e.type}`)!)
                const prev = richTextSeg(text.slice(curr, e.offset), e, `telegram.${e.type}`)
                prev !== null && segs.splice(-1, 0, prev)
                curr = e.offset! + e.length!
            } else {
                continue
            }
        }
        if (text && (curr < text.length || 0)) {
            segs.push(textSeg(text.slice(curr)))
        }
        return segs
    }
    export function parse(e: TGMessage): TelegramMessageSegment[] {
        let segments: TelegramMessageSegment[] = []
        if (e.reply_to_message) {
            segments.push({
                type: 'reply',
                data: {
                    message_id: e.reply_to_message.message_id?.toString()!,
                    user_id: e.reply_to_message.from?.id?.toString()!
                }
            })
        }
        if (e.location) {
            segments.push({
                type: 'location',
                data: {
                    latitude: e.location.latitude!,
                    longitude: e.location.longitude!,
                    title: "",
                    content: ""
                }
            })
        }
        if (e.photo) {
            const photo = e.photo.sort((s1, s2) => s2.file_size! - s1.file_size!)[0]
            segments.push({
                type: 'image',
                data: {
                    file_id: photo.file_id!
                }
            })
        }
        if (e.animation) {
            segments.push({
                type: 'telegram.animation',
                data: {
                    file_id: e.animation.file_id!
                }
            })
        } else if (e.voice) {
            segments.push({
                type: 'voice',
                data: {
                    file_id: e.voice.file_id!
                }
            })
        } else if (e.video) {
            segments.push({
                type: 'video',
                data: {
                    file_id: e.video.file_id!
                }
            })
        } else if (e.document) {
            segments.push({
                type: 'file',
                data: {
                    file_id: e.document.file_id!
                }
            })
        } else if (e.audio) {
            segments.push({
                type: 'audio',
                data: {
                    file_id: e.audio.file_id!
                }
            })
        } else if (e.sticker) {
            segments.push({
                type: 'telegram.sticker',
                data: {
                    file_id: e.sticker.file_id!,
                    "telegram.emoji": e.sticker.emoji!,
                    "telegram.set_name": e.sticker.set_name!
                }
            })
        }
        const msgText: string = e.text! || e.caption!
        segments.push(...parseText(msgText, e.entities || []))
        //console.log(segments)
        return segments
    }
}