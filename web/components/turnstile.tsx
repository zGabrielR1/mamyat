"use client"

import * as React from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      reset: (widget?: string) => void
      remove: (widget?: string) => void
      ready: (callback: () => void) => void
    }
  }
}

type TurnstileProps = {
  siteKey: string
  action: string
  onToken: (token: string) => void
  className?: string
  resetKey?: number
}

const SCRIPT_ID = "cf-turnstile-script"

export function Turnstile({ siteKey, action, onToken, className, resetKey = 0 }: TurnstileProps) {
  const container = React.useRef<HTMLDivElement>(null)
  const widget = React.useRef<string>("")
  const callback = React.useRef(onToken)
  callback.current = onToken

  React.useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    callback.current("")

    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return
      if (widget.current) {
        try {
          window.turnstile.remove(widget.current)
        } catch {
          // widget already gone
        }
      }
      widget.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action,
        theme: "auto",
        language: "pt-BR",
        callback: (token: string) => callback.current(token),
        "expired-callback": () => callback.current(""),
        "error-callback": () => callback.current(""),
        "timeout-callback": () => callback.current(""),
      })
    }

    const onLoad = () => window.turnstile?.ready(render)
    let script: HTMLScriptElement | null = null
    if (window.turnstile) {
      window.turnstile.ready(render)
    } else {
      script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
      if (!script) {
        script = document.createElement("script")
        script.id = SCRIPT_ID
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
      script.addEventListener("load", onLoad, { once: true })
    }

    return () => {
      cancelled = true
      script?.removeEventListener("load", onLoad)
      if (widget.current && window.turnstile) {
        try {
          window.turnstile.remove(widget.current)
        } catch {
          // nothing to remove
        }
        widget.current = ""
      }
    }
  }, [siteKey, action, resetKey])

  if (!siteKey) return null
  return <div ref={container} className={className} />
}
