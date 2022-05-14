export type TelegramConfig = {
    token: string,
    protocol: "polling",
    endpoint: string,
    headers?: Record<string, any>,
    pollingTimeout: number,
    self_id: string
}