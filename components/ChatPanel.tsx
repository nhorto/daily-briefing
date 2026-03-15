'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { Article } from '@/lib/types';

interface ChatPanelProps {
  mode: 'global' | 'briefing' | 'article';
  articles: Article[];
  articleId?: string;
  className?: string;
  // Modal mode props (when not embedded)
  isOpen?: boolean;
  onClose?: () => void;
  clusterId?: string;
}

export default function ChatPanel({
  mode,
  articles,
  articleId,
  className = '',
  isOpen,
  onClose,
  clusterId,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isEmbedded = mode === 'global' || mode === 'article';
  const isModal = !isEmbedded;

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: '/api/chat',
        body: { articles, clusterId },
      }),
    [articles, clusterId]
  );

  const { messages, sendMessage, status } = useChat({ transport });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // For modal mode, don't render if not open
  if (isModal && !isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ parts: [{ type: 'text', text: input }] });
    setInput('');
  }

  const headerText = mode === 'article'
    ? 'Ask about this article'
    : mode === 'briefing'
      ? 'Ask about today\'s content'
      : 'Chat';

  const contextText = clusterId
    ? 'Focused on selected topic'
    : `${articles.length} articles in context`;

  const chatContent = (
    <div className={`flex flex-col h-full ${isEmbedded ? '' : 'max-h-[80vh]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{headerText}</h2>
          <p className="text-xs text-text-muted">{contextText}</p>
        </div>
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-text-muted py-6">
            <p className="text-sm mb-3">Ask me anything about today's briefing!</p>
            <div className="text-xs space-y-1">
              <p className="text-text-muted">Try:</p>
              <p>"What's the biggest story today?"</p>
              <p>"Summarize the main topics"</p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'bg-accent text-bg-primary'
                  : 'bg-bg-elevated text-text-primary'
              }`}
            >
              {message.parts?.map((part, i) =>
                part.type === 'text' ? <span key={i}>{part.text}</span> : null
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-bg-elevated rounded-lg px-3 py-2">
              <div className="flex space-x-1.5">
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border px-4 py-3 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 px-3 py-2 bg-bg-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary placeholder-text-muted text-sm"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );

  // Embedded mode: render inline
  if (isEmbedded) {
    return (
      <div className={`bg-bg-surface border border-border rounded-lg overflow-hidden ${className}`}>
        {chatContent}
      </div>
    );
  }

  // Modal mode: render as overlay
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        {chatContent}
      </div>
    </div>
  );
}
