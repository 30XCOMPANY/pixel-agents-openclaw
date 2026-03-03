/**
 * [INPUT]: 依赖浏览器 EventSource 与消息回调
 * [OUTPUT]: 对外提供 vscode 兼容消息桥，支持 add/remove handler 与 postMessage
 * [POS]: webview 运行时通信层（浏览器模式）
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

type MessageHandler = (msg: unknown) => void

class BrowserApi {
  private handlers: MessageHandler[] = []
  private eventSource: EventSource | null = null

  constructor() {
    this.connect()
  }

  private connect(): void {
    // Connect to SSE for real-time updates
    this.eventSource = new EventSource('/events')

    this.eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as unknown
        this.handlers.forEach((handler) => handler(msg))
      } catch (e) {
        console.error('[Pixel Agents] Failed to parse message:', e)
      }
    }

    this.eventSource.onerror = () => {
      console.log('[Pixel Agents] SSE connection lost, reconnecting...')
      setTimeout(() => this.connect(), 3000)
    }
  }

  postMessage(msg: unknown): void {
    void fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch((err) => {
      console.error('[Pixel Agents] postMessage failed:', err)
    })
  }

  addMessageHandler(handler: MessageHandler): void {
    this.handlers.push(handler)
  }

  removeMessageHandler(handler: MessageHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler)
  }
}

export const vscode = new BrowserApi()
