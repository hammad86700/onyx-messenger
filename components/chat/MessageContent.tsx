'use client';

import React, { useState } from 'react';
import { Copy, Check, Code2, Terminal } from 'lucide-react';

interface MessageContentProps {
  content: string;
  highlightQuery?: string;
  isMine?: boolean;
}

export default function MessageContent({ content, highlightQuery = '', isMine = false }: MessageContentProps) {
  // Parse content for fenced code blocks
  // Format: ```(language)?\n(code)```
  const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(
        <TextSegment
          key={`text-${lastIndex}`}
          text={textBefore}
          highlightQuery={highlightQuery}
          isMine={isMine}
        />
      );
    }

    const language = (match[1] || 'plaintext').toLowerCase();
    const code = match[2];

    parts.push(
      <CodeBlockCard
        key={`code-${match.index}`}
        language={language}
        code={code}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  const textRemaining = content.substring(lastIndex);
  if (textRemaining) {
    parts.push(
      <TextSegment
        key={`text-${lastIndex}`}
        text={textRemaining}
        highlightQuery={highlightQuery}
        isMine={isMine}
      />
    );
  }

  return <div className="space-y-1 text-sm leading-relaxed">{parts}</div>;
}

// IDE-Styled Fenced Code Block Container
function CodeBlockCard({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const lines = code.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="my-2 rounded-xl border border-white/10 bg-[#050608] shadow-2xl overflow-hidden select-text text-left">
      {/* IDE Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-white/5 text-xs text-slate-400 select-none">
        <div className="flex items-center gap-2">
          {/* Mac-style terminal dots */}
          <div className="flex items-center gap-1.5 mr-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-brand-400" />
          <span className="font-mono uppercase font-bold text-[10px] tracking-wider text-slate-300">
            {language}
          </span>
        </div>

        {/* 1-Click Copy Button */}
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-[11px] font-mono shadow-sm"
          title="Copy Code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300 text-[10px] font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body with IDE Line Numbers Gutter */}
      <div className="flex overflow-x-auto text-xs font-mono leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
        <div className="py-3 pl-3 pr-2.5 select-none text-slate-600 bg-white/[0.02] border-r border-white/5 text-right min-w-[2.2rem]">
          {lines.map((_, i) => (
            <div key={i} className="leading-relaxed">
              {i + 1}
            </div>
          ))}
        </div>

        <pre className="py-3 px-3.5 text-emerald-300/90 flex-1 overflow-x-visible">
          <code>{lines.join('\n')}</code>
        </pre>
      </div>
    </div>
  );
}

// Text Segment with inline code and search highlight
function TextSegment({
  text,
  highlightQuery,
  isMine,
}: {
  text: string;
  highlightQuery: string;
  isMine: boolean;
}) {
  // Parse inline code: `code`
  const inlineRegex = /`([^`]+)`/g;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    const rawText = text.substring(lastIndex, match.index);
    if (rawText) {
      segments.push(
        <HighlightableText
          key={`inline-txt-${lastIndex}`}
          text={rawText}
          highlightQuery={highlightQuery}
        />
      );
    }

    const inlineCode = match[1];
    segments.push(
      <code
        key={`inline-code-${match.index}`}
        className="px-1.5 py-0.5 rounded-md bg-black/40 text-amber-300 font-mono text-xs border border-white/10 mx-0.5"
      >
        {inlineCode}
      </code>
    );

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.substring(lastIndex);
  if (remaining) {
    segments.push(
      <HighlightableText
        key={`inline-txt-${lastIndex}`}
        text={remaining}
        highlightQuery={highlightQuery}
      />
    );
  }

  return <span className="whitespace-pre-wrap break-words">{segments}</span>;
}

// Text with search query keyword highlighting and URL linkification
function HighlightableText({
  text,
  highlightQuery,
}: {
  text: string;
  highlightQuery: string;
}) {
  const query = highlightQuery?.trim();
  if (!query) {
    return <>{text}</>;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-amber-400 text-black font-bold px-0.5 rounded shadow-sm selection:bg-amber-300"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
