import { Check, CopyIcon, Eye, Loader2, Play } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  AssistantToolMessageGroup,
  ChatAssistantMessage,
  ChatMessage,
} from '../../types/chat'
import { ChatModel } from '../../types/chat-model.types'
import { ResponseUsage } from '../../types/llm/response'
import { calculateLLMCost } from '../../utils/llm/price-calculator'

import LLMResponseInfoPopover from './LLMResponseInfoPopover'
import { getToolMessageContent } from './ToolMessage'

function CopyButton({ messages }: { messages: AssistantToolMessageGroup }) {
  const [copied, setCopied] = useState(false)

  const content = useMemo(() => {
    return messages
      .map((message) => {
        switch (message.role) {
          case 'assistant':
            return message.content === '' ? null : message.content
          case 'tool':
            return getToolMessageContent(message)
        }
      })
      .filter(Boolean)
      .join('\n\n')
  }, [messages])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
    }, 1500)
  }

  return (
    <button
      onClick={copied ? undefined : handleCopy}
      className="smtcmp-assistant-action-btn"
    >
      {copied ? <Check size={12} /> : <CopyIcon size={12} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

function ViewRawButton({
  isRawMode,
  onToggle,
}: {
  isRawMode: boolean
  onToggle: () => void
}) {
  return (
    <button onClick={onToggle} className="smtcmp-assistant-action-btn">
      <Eye size={12} />
      <span>{isRawMode ? 'View Formatted' : 'View Raw'}</span>
    </button>
  )
}

function ApplyButton({
  messages,
  contextMessages,
  onApply,
  isApplying,
}: {
  messages: AssistantToolMessageGroup
  contextMessages: ChatMessage[]
  onApply: (blockToApply: string, chatMessages: ChatMessage[]) => void
  isApplying: boolean
}) {
  const content = useMemo(() => {
    return messages
      .map((message) => {
        if (message.role === 'assistant' && message.content !== '') {
          return message.content
        }
        return null
      })
      .filter(Boolean)
      .join('\n\n')
  }, [messages])

  return (
    <button
      className="smtcmp-assistant-action-btn"
      onClick={
        isApplying
          ? undefined
          : () => {
              onApply(content, contextMessages)
            }
      }
      aria-disabled={isApplying}
    >
      {isApplying ? (
        <>
          <Loader2 className="spinner" size={12} />
          <span>Applying...</span>
        </>
      ) : (
        <>
          <Play size={12} />
          <span>Apply</span>
        </>
      )}
    </button>
  )
}

function LLMResponseInfoButton({
  messages,
}: {
  messages: AssistantToolMessageGroup
}) {
  const usage = useMemo<ResponseUsage | null>(() => {
    return messages.reduce((acc: ResponseUsage | null, message) => {
      if (message.role === 'assistant' && message.metadata?.usage) {
        if (!acc) {
          return message.metadata.usage
        }
        return {
          prompt_tokens:
            acc.prompt_tokens + message.metadata.usage.prompt_tokens,
          completion_tokens:
            acc.completion_tokens + message.metadata.usage.completion_tokens,
          total_tokens: acc.total_tokens + message.metadata.usage.total_tokens,
        }
      }
      return acc
    }, null)
  }, [messages])

  // TODO: Handle multiple models in the same message group
  const model = useMemo<ChatModel | undefined>(() => {
    const assistantMessageWithModel = messages.find(
      (message): message is ChatAssistantMessage =>
        message.role === 'assistant' && !!message.metadata?.model,
    )
    return assistantMessageWithModel?.metadata?.model
  }, [messages])

  const cost = useMemo<number | null>(() => {
    if (!model || !usage) {
      return null
    }
    return calculateLLMCost({
      model,
      usage,
    })
  }, [model, usage])

  return (
    <LLMResponseInfoPopover
      usage={usage}
      estimatedPrice={cost}
      model={model?.model ?? null}
    />
  )
}

export default function AssistantToolMessageGroupActions({
  messages,
  contextMessages,
  isRawMode,
  onToggleRawMode,
  onApply,
  isApplying,
}: {
  messages: AssistantToolMessageGroup
  contextMessages: ChatMessage[]
  isRawMode: boolean
  onToggleRawMode: () => void
  onApply: (blockToApply: string, chatMessages: ChatMessage[]) => void
  isApplying: boolean
}) {
  return (
    <div className="smtcmp-assistant-message-actions">
      <LLMResponseInfoButton messages={messages} />
      <ViewRawButton isRawMode={isRawMode} onToggle={onToggleRawMode} />
      <CopyButton messages={messages} />
      <ApplyButton
        messages={messages}
        contextMessages={contextMessages}
        onApply={onApply}
        isApplying={isApplying}
      />
    </div>
  )
}
