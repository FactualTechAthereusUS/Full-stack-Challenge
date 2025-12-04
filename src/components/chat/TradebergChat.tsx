"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Home,
    FileText,
    Settings,
    Plus,
    ChevronDown,
    Paperclip,
    Mic,
    ArrowUp,
    User,
    ThumbsUp,
    ThumbsDown,
    Copy,
    Globe,
    Camera,
    History,
    Sun,
    Moon,
    Monitor,
    X,
    TrendingUp,
    BarChart4,
    Sparkle,
    Pencil,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme as useNextTheme } from "next-themes";
import { chatApi, useChats } from "@/lib/api/backend";
import Link from "next/link";
import FinancialChart from "../chart/FinancialChart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = "user" | "assistant";

type Attachment =
    | { type: "image"; data: string }
    | { type: "url"; data: string }
    | { type: "file"; data: string };

type ChatMessage = {
    role: Role;
    content: string;
    attachments?: Attachment[];
};

// ---------------------------------------------------------------------------
// Core Chat Interface (hooked to backend streaming API)
// ---------------------------------------------------------------------------

export function ChatInterface({
    initialChatId,
    showUpgrade,
    onCloseChat,
    mode,
}: {
    initialChatId?: string;
    showUpgrade?: boolean;
    onCloseChat?: () => void;
    mode?: "chat" | "trade";
}) {
    const [chatId, setChatId] = useState<string | null>(initialChatId ?? null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isWebpageModalOpen, setIsWebpageModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const messageScrollRef = useRef<HTMLDivElement | null>(null);
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const [editDraft, setEditDraft] = useState("");
    const [isAssistantTyping, setIsAssistantTyping] = useState(false);
    const [forceCompleteTyping, setForceCompleteTyping] = useState(false);
    const { startPollingChat } = useChats();

    // Load history when opening an existing chat
    useEffect(() => {
        if (!initialChatId) return;

        const loadHistory = async () => {
            const res = await chatApi.getMessages(initialChatId);
            if (res.error || !Array.isArray(res.data)) return;

            const history: ChatMessage[] =
                res.data.map((m: any) => ({
                    role: m.role === "assistant" ? "assistant" : "user",
                    content: m.content ?? "",
                })) ?? [];

            setMessages(history);
        };

        loadHistory();
    }, [initialChatId]);

    const handleSubmit = async (prompt: string) => {
        if (isLoading || (!prompt.trim() && attachments.length === 0)) return;

        const currentAttachments = attachments;

        // push user message (with attachments rendered in bubble)
        setMessages((prev) => [
            ...prev,
            { role: "user", content: prompt, attachments: currentAttachments },
        ]);
        setAttachments([]);
        setIsLoading(true);

        let activeChatId = chatId;
        let full = "";

        try {
            // create chat if needed
            if (!activeChatId) {
                const res = await chatApi.createChat(prompt);
                if (res.error || !res.data?.chatId) {
                    setIsLoading(false);
                    return;
                }
                activeChatId = String(res.data.chatId);
                setChatId(activeChatId);
                // start polling so sidebar title updates when backend sets it
                startPollingChat(activeChatId);
            }

            // If there is an existing stream, abort it before starting a new one.
            if (abortController) {
                abortController.abort();
            }
            const controller = new AbortController();
            setAbortController(controller);

            // call streaming endpoint but buffer full text, then let MessageBubble handle typing animation
            const response = await chatApi.streamMessage(
                activeChatId as string,
                prompt,
                currentAttachments,
                controller.signal,
                mode
            );

            const reader = response.body?.getReader();
            if (reader) {
                const decoder = new TextDecoder();
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    full += decoder.decode(value, { stream: true });
                }
            } else {
                full = await response.text();
            }

            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: full ?? "" },
            ]);
            setIsAssistantTyping(true);
            setForceCompleteTyping(false);
        } catch (err) {
            if ((err as any)?.name === "AbortError") {
                // Stream was manually stopped by the user; keep whatever content we have so far.
                console.warn("chat stream aborted by user");
                if (full) {
                    setMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: full ?? "" },
                    ]);
                    setIsAssistantTyping(true);
                    setForceCompleteTyping(false);
                }
            } else {
                console.error("chat error", err);
            }
        } finally {
            setIsLoading(false);
            setAbortController(null);
        }
    };

    const handleStopStreaming = () => {
        if (abortController) {
            abortController.abort();
            setAbortController(null);
            setIsLoading(false);
        }
        if (isAssistantTyping) {
            setForceCompleteTyping(true);
            setIsAssistantTyping(false);
        }
    };

    const handleAssistantTypingDone = () => {
        setIsAssistantTyping(false);
        setForceCompleteTyping(false);
    };

    const handleSetAttachment = (att: Attachment | null) => {
        if (!att) return;
        setAttachments((prev) => [...prev, att]);
    };

    const removeAttachment = () => {
        setAttachments([]);
    };

    const renderAttachmentThumbnail = () => {
        if (!attachments.length) return null;

        return attachments.map((attachment, index) => {
            const isImage = attachment.type === "image";

            let content: React.ReactNode;
            if (isImage) {
                content = (
                    <button
                        type="button"
                        className="block w-full h-full"
                        onClick={() => setPreviewImage(attachment.data)}
                    >
                        <img
                            src={attachment.data}
                            alt="Attachment preview"
                            className="w-full h-full object-cover"
                        />
                    </button>
                );
            } else {
                // Non-image attachment preview (e.g. URL or file).
                // Use TradeBerg card surfaces + text tokens so it matches the global theme.
                content = (
                    <div className="p-2 flex items-center gap-2 rounded-lg bg-[var(--tradeberg-card-bg)] border border-[var(--tradeberg-card-border)]">
                        <FileText
                            size={16}
                            className="text-[var(--tradeberg-text-secondary)] flex-shrink-0"
                        />
                        <span className="text-sm font-medium text-[var(--tradeberg-text-primary)] truncate">
                            {attachment.data}
                        </span>
                    </div>
                );
            }

            const removeAtIndex = () => {
                setAttachments((prev) => prev.filter((_, i) => i !== index));
            };

            if (isImage) {
                return (
                    <motion.div
                        key={`${attachment.type}-${attachment.data}-${index}`}
                        className="relative w-full max-w-sm h-auto mb-2 rounded-lg overflow-hidden border border-[var(--tradeberg-card-border)]"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <button
                            type="button"
                            className="block w-full h-full"
                            onClick={() => setPreviewImage(attachment.data)}
                        >
                            <img
                                src={attachment.data}
                                alt="Attachment preview"
                                className="w-full h-auto object-contain max-h-[300px]"
                            />
                        </button>
                        <button
                            onClick={removeAtIndex}
                            className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 z-10 backdrop-blur-sm transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </motion.div>
                );
            }

            return (
                <motion.div
                    key={`${attachment.type}-${attachment.data}-${index}`}
                    className="relative mb-2 rounded-lg overflow-hidden"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                >
                    {content}
                    <button
                        onClick={removeAtIndex}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/80 z-10"
                    >
                        <X size={12} />
                    </button>
                </motion.div>
            );
        });
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!messageScrollRef.current) return;
        messageScrollRef.current.scrollTop += e.deltaY;
    };

    const handleStartEdit = (content: string) => {
        setEditDraft(content);
        setIsEditingPrompt(true);
    };

    const handleEditCancel = () => {
        setIsEditingPrompt(false);
        setEditDraft("");
    };

    const handleEditSend = () => {
        if (!editDraft.trim()) {
            handleEditCancel();
            return;
        }
        // Reuse normal submit flow; this will append a new message + response.
        // We intentionally don't mutate history in the DB for simplicity.
        // This mirrors ChatGPT "edit and resend" UX at the UI layer.
        // Attachments are not reused for edits.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleSubmit(editDraft);
        setIsEditingPrompt(false);
        setEditDraft("");
    };

    return (
        <div
            className="flex-1 flex flex-col overflow-hidden h-full"
            onWheel={handleWheel}
        >
            <ChatHeader showUpgrade={showUpgrade} onCloseChat={onCloseChat} />
            <MessageList
                messages={messages}
                isLoading={isLoading}
                isAssistantTyping={isAssistantTyping}
                forceCompleteTyping={forceCompleteTyping}
                onAssistantTypingDone={handleAssistantTypingDone}
                onImageClick={(url) => setPreviewImage(url)}
                scrollRef={messageScrollRef}
                onEditRequest={handleStartEdit}
            />

            {isEditingPrompt ? (
                <div className="px-4 md:px-6 pb-4">
                    <div className="max-w-2xl mx-auto rounded-[32px] bg-[#3f3f3f] px-6 py-4 flex flex-col md:flex-row md:items-end gap-4">
                        <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="flex-1 bg-transparent text-[var(--tradeberg-text-primary)] placeholder:text-[var(--tradeberg-text-secondary)] resize-none focus:outline-none min-h-[60px]"
                            autoFocus
                        />
                        <div className="flex gap-2 self-end md:flex-col md:self-auto">
                            <button
                                type="button"
                                onClick={handleEditCancel}
                                className="px-4 py-2 rounded-full bg-black text-white text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleEditSend}
                                className="px-4 py-2 rounded-full bg-white text-black text-sm"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-4 md:p-6 w-full max-w-3xl mx-auto">
                    <AnimatePresence>{renderAttachmentThumbnail()}</AnimatePresence>
                    <PromptTray
                        onSubmit={handleSubmit}
                        isLoading={isLoading}
                        isTyping={isAssistantTyping}
                        onStop={isAssistantTyping || abortController ? handleStopStreaming : undefined}
                        onAttachment={handleSetAttachment}
                        onOpenWebModal={() => setIsWebpageModalOpen(true)}
                    />
                </div>
            )}

            <AnimatePresence>
                {isWebpageModalOpen && (
                    <AttachWebpageModal
                        onClose={() => setIsWebpageModalOpen(false)}
                        onAdd={(url) => {
                            handleSetAttachment({ type: "url", data: url });
                            setIsWebpageModalOpen(false);
                        }}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {previewImage && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setPreviewImage(null)}
                    >
                        <motion.div
                            className="relative w-full max-w-5xl max-h-[90vh] p-4"
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => setPreviewImage(null)}
                                className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
                                aria-label="Close image preview"
                            >
                                <X size={18} />
                            </button>
                            <img
                                src={previewImage}
                                alt="Chart screenshot preview"
                                className="w-full max-h-[82vh] object-contain rounded-xl"
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Chat Header (simple, optional Upgrade button for Trade view)
// ---------------------------------------------------------------------------

function ChatHeader({ showUpgrade, onCloseChat }: { showUpgrade?: boolean; onCloseChat?: () => void }) {
    return (
        <div className="flex-shrink-0">
            <div className="max-w-3xl mx-auto flex items-center px-4 py-4">
                <div className="flex items-center gap-2 md:hidden">
                    <Home size={20} />
                    <span className="text-lg font-semibold">Tradeberg</span>
                </div>
                <div className="flex-1 flex justify-center">

                </div>
                {onCloseChat && (
                    <button
                        type="button"
                        onClick={onCloseChat}
                        className="ml-2 p-1.5 rounded-full hover:bg-[var(--tradeberg-card-bg)] text-[var(--tradeberg-text-secondary)] border border-[var(--tradeberg-card-border)] bg-transparent"
                        aria-label="Close chat"
                    >
                        {/* light theme arrow (dark icon) */}
                        <img
                            src="/arrow-black.png"
                            alt="Close chat"
                            className="block dark:hidden w-3.5 h-3.5"
                        />
                        {/* dark theme arrow (light icon) */}
                        <img
                            src="/arrow-white.png"
                            alt="Close chat"
                            className="hidden dark:block w-3.5 h-3.5"
                        />
                    </button>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Message list + loading indicator
// ---------------------------------------------------------------------------

function MessageList({
    messages,
    isLoading,
    isAssistantTyping,
    forceCompleteTyping,
    onAssistantTypingDone,
    onImageClick,
    scrollRef,
    onEditRequest,
}: {
    messages: ChatMessage[];
    isLoading: boolean;
    isAssistantTyping: boolean;
    forceCompleteTyping: boolean;
    onAssistantTypingDone: () => void;
    onImageClick: (url: string) => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    onEditRequest?: (content: string) => void;
}) {

    useEffect(() => {
        const node = scrollRef.current;
        if (node) {
            node.scrollTop = node.scrollHeight;
        }
    }, [messages, isLoading, scrollRef]);

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="flex justify-center">
                <div className="w-full max-w-2xl px-4 md:px-6 py-4 md:py-6 space-y-6">
                    {messages.length === 0 && !isLoading && <EmptyState />}
                    {messages.map((msg, idx) => {
                        const isLastAssistant =
                            idx === messages.length - 1 && msg.role === "assistant";
                        return (
                            <MessageBubble
                                key={idx}
                                message={msg}
                                onImageClick={onImageClick}
                                onEditRequest={onEditRequest}
                                enableTyping={isLastAssistant && isAssistantTyping}
                                forceCompleteTyping={isLastAssistant && forceCompleteTyping}
                                onTypingDone={
                                    isLastAssistant ? onAssistantTypingDone : undefined
                                }
                            />
                        );
                    })}
                    {isLoading && <LoadingIndicator />}
                    <div className="h-1" />
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Empty state + suggestions
// ---------------------------------------------------------------------------

function EmptyState() {
    // Intentionally render nothing for a clean blank start state.
    return null;
}

// ---------------------------------------------------------------------------
// Loading indicator
// ---------------------------------------------------------------------------

function LoadingIndicator() {
    return (
        <motion.div
            className="flex items-center gap-3 p-4 self-start"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <motion.div
                className="w-8 h-8 flex items-center justify-center"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            >
                {/* Light mode spinner */}
                <img
                    src="/tradeberg-spinner-light.png"
                    alt="Loading"
                    className="w-5 h-5 block dark:hidden"
                />
                {/* Dark mode spinner */}
                <img
                    src="/tradeberg-spinner-dark.png"
                    alt="Loading"
                    className="w-5 h-5 hidden dark:block"
                />
            </motion.div>
            <span className="text-sm text-gray-500 dark:text-gray-400 italic">
                Tradeberg is thinking...
            </span>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Message bubble with typing animation for AI
// ---------------------------------------------------------------------------

function MessageBubble({
    message,
    onImageClick,
    onEditRequest,
    enableTyping,
    forceCompleteTyping,
    onTypingDone,
}: {
    message: ChatMessage;
    onImageClick: (url: string) => void;
    onEditRequest?: (content: string) => void;
    enableTyping?: boolean;
    forceCompleteTyping?: boolean;
    onTypingDone?: () => void;
}) {
    const { role, content, attachments } = message;
    const isUser = role === "user";
    const [displayedContent, setDisplayedContent] = useState("");
    const typingIntervalRef = useRef<number | null>(null);

    // Typing animation control
    useEffect(() => {
        if (isUser) {
            setDisplayedContent(content);
            return;
        }

        // For non-typing messages, just show full content.
        if (!enableTyping) {
            setDisplayedContent(content);
            return;
        }

        // Check for charts - if present, skip typing to prevent JSON glitches
        const hasChart = content.includes('json-chart') ||
            (content.includes('"type":') && content.includes('"series":'));

        if (hasChart) {
            setDisplayedContent(content);
            if (onTypingDone) onTypingDone();
            return;
        }

        // Reset and start typing animation.
        setDisplayedContent("");
        let i = 0;

        // Speed up typing: add 3 characters every 5ms
        const CHARS_PER_TICK = 3;

        typingIntervalRef.current = window.setInterval(() => {
            // Add a chunk of characters
            const chunk = content.slice(i, i + CHARS_PER_TICK);
            setDisplayedContent((prev) => prev + chunk);
            i += CHARS_PER_TICK;

            if (i >= content.length) {
                if (typingIntervalRef.current !== null) {
                    clearInterval(typingIntervalRef.current);
                    typingIntervalRef.current = null;
                }
                if (onTypingDone) onTypingDone();
            }
        }, 5);

        return () => {
            if (typingIntervalRef.current !== null) {
                clearInterval(typingIntervalRef.current);
                typingIntervalRef.current = null;
            }
        };
    }, [content, isUser, enableTyping, onTypingDone]);

    // Force-complete typing when user hits stop.
    useEffect(() => {
        if (!enableTyping || !forceCompleteTyping) return;
        if (typingIntervalRef.current !== null) {
            clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;
        }
        setDisplayedContent(content);
        if (onTypingDone) onTypingDone();
    }, [forceCompleteTyping, enableTyping, content, onTypingDone]);

    const renderAttachments = () => {
        if (!attachments || attachments.length === 0) return null;

        return attachments.map((attachment, index) => {
            if (attachment.type === "image") {
                return (
                    <button
                        key={`${attachment.type}-${attachment.data}-${index}`}
                        type="button"
                        className="block w-full max-w-xs mb-2"
                        onClick={() => onImageClick(attachment.data)}
                    >
                        <img
                            src={attachment.data}
                            alt="Chart Screenshot"
                            className="w-full rounded-lg"
                        />
                    </button>
                );
            }

            if (attachment.type === "url" || attachment.type === "file") {
                return (
                    <div
                        key={`${attachment.type}-${attachment.data}-${index}`}
                        className="flex items-center gap-2 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 mb-2"
                    >
                        <FileText
                            size={16}
                            className="text-gray-600 dark:text-gray-300"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-xs">
                            {attachment.data}
                        </span>
                    </div>
                );
            }
            return null;
        });
    };

    if (isUser) {
        return (
            <motion.div
                className="group flex flex-col items-end self-end max-w-3xl"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
            >
                <div className="flex items-start gap-3">
                    <div className="bg-[var(--tradeberg-card-bg)] text-[var(--tradeberg-text-primary)] p-4 rounded-2xl rounded-br-none">
                        {renderAttachments()}
                        <p>{content}</p>
                    </div>
                </div>
                {onEditRequest && (
                    <div className="mt-1 pr-1 flex items-center gap-1 text-xs text-[var(--tradeberg-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            type="button"
                            onClick={() => onEditRequest(content)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-[var(--tradeberg-card-border)]/40 transition-colors"
                        >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                        </button>
                    </div>
                )}
            </motion.div>
        );
    }

    return (
        <motion.div
            className="flex items-start gap-3 self-start max-w-3xl"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
        >
            <img
                src="/illuminati-exchange-logo.png"
                alt="AI Avatar"
                className="w-5 h-5 mt-1 flex-shrink-0"
            />
            <div className="flex flex-col gap-3 pt-1">
                <article className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                const language = match ? match[1] : '';
                                const contentString = String(children).replace(/\n$/, '');

                                // Check for json-chart blocks
                                const isJsonChart = language === 'json-chart';
                                const looksLikeChartData = language === 'json' &&
                                    contentString.includes('"series"') &&
                                    contentString.includes('"data"') &&
                                    contentString.includes('"values"');

                                if (!inline && (isJsonChart || looksLikeChartData)) {
                                    try {
                                        const data = JSON.parse(contentString);
                                        return (
                                            <div className="not-prose my-4">
                                                <FinancialChart data={data} />
                                            </div>
                                        );
                                    } catch (e) {
                                        console.error("Failed to parse chart JSON", e);
                                        return <code className={className} {...props}>{children}</code>;
                                    }
                                }

                                return <code className={className} {...props}>{children}</code>;
                            },
                        }}
                    >
                        {displayedContent}
                    </ReactMarkdown>
                </article>

                {displayedContent.length === content.length && (
                    <motion.div
                        className="flex items-center gap-2 text-gray-500 dark:text-gray-400"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <ActionButton icon={<ThumbsUp size={14} />} />
                        <ActionButton icon={<ThumbsDown size={14} />} />
                        <ActionButton icon={<Copy size={14} />} />
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}

function ActionButton({ icon }: { icon: React.ReactNode }) {
    return (
        <button className="p-1.5 rounded-md transition-colors hover:bg-[var(--tradeberg-card-border)]/50">
            {icon}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Prompt tray (input + attachments)
// ---------------------------------------------------------------------------

function PromptTray({
    onSubmit,
    isLoading,
    isTyping,
    onAttachment,
    onOpenWebModal,
    onStop,
}: {
    onSubmit: (prompt: string) => void;
    isLoading: boolean;
    isTyping: boolean;
    onAttachment: (att: Attachment | null) => void;
    onOpenWebModal: () => void;
    onStop?: () => void;
}) {
    const [prompt, setPrompt] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            // 1. Reset to auto to correctly calculate shrinkage
            textarea.style.height = "auto";

            // 2. Calculate new height
            // Add a small buffer (2px) to prevent sub-pixel overflow triggering scrollbars
            const nextHeight = textarea.scrollHeight;

            // 3. Apply height (capped by CSS max-h-[300px])
            textarea.style.height = `${nextHeight}px`;

            // 4. Toggle scrollbar based on explicit max-height check
            // This ensures we don't show scrollbar unless we've actually hit the limit
            if (nextHeight > 300) {
                textarea.style.overflowY = "auto";
            } else {
                textarea.style.overflowY = "hidden";
            }
        }
    }, [prompt]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(prompt);
        setPrompt("");
        // Reset height after submit
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.overflowY = "hidden";
        }
    };

    // Capture TradingView chart (or entire tab as fallback) into an image attachment
    const handleCaptureClick = async () => {
        // -----------------------------------------------------------------------
        // CHALLENGE: "Explain This Move"
        // -----------------------------------------------------------------------
        // Your task is to implement this function.
        //
        // GOAL:
        // Capture the visual state of the TradingView chart (which is a cross-origin iframe)
        // and create a data URL (PNG) of the screenshot.
        //
        // ONCE CAPTURED:
        // Call `onAttachment({ type: "image", data: yourDataUrl })` to attach it to the chat.
        //
        // NOTE:
        // Standard html2canvas will not work due to CORS on the iframe.
        // You need to find a creative workaround or use a specific browser API.
        // -----------------------------------------------------------------------
        console.log("Capture clicked - functionality to be implemented by candidate.");
    };

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onAttachment({ type: "file", data: file.name });
        }
        event.target.value = "";
    };

    return (
        <motion.form
            onSubmit={handleFormSubmit}
            className="relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
            />

            <div className="flex flex-col p-4 bg-[var(--tradeberg-card-bg)] dark:bg-[#181818] border border-[var(--tradeberg-card-border)] rounded-2xl shadow-lg focus-within:ring-1 focus-within:ring-[var(--tradeberg-accent-color)]/30 transition-all duration-200">
                <textarea
                    ref={textareaRef}
                    suppressHydrationWarning
                    className="w-full bg-transparent text-lg text-[var(--tradeberg-text-primary)] placeholder:text-[var(--tradeberg-text-secondary)] resize-none focus:outline-none max-h-[300px] overflow-hidden overscroll-contain [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-500/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-500/40"
                    placeholder="Ask Tradeberg AI..."
                    value={prompt}
                    onWheel={(e) => e.stopPropagation()}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleFormSubmit(e);
                        }
                    }}
                    rows={1}
                    disabled={isLoading}
                />

                <div className="h-4" />

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <IconButton onClick={handleFileClick}>
                            <Paperclip size={18} />
                        </IconButton>
                        <IconButton onClick={onOpenWebModal}>
                            <Globe size={18} />
                        </IconButton>
                        <IconButton onClick={handleCaptureClick} disabled={isCapturing}>
                            {isCapturing ? (
                                <div className="w-4 h-4 border-2 border-t-purple-500 border-transparent rounded-full animate-spin" />
                            ) : (
                                <Camera size={18} />
                            )}
                        </IconButton>
                        <IconButton>
                            <History size={18} />
                        </IconButton>
                    </div>

                    <div className="flex items-center gap-2">
                        <AnimatePresence mode="popLayout">
                            {(isLoading || isTyping) && onStop ? (
                                <motion.div
                                    key="stop"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                >
                                    <button
                                        type="button"
                                        onClick={onStop}
                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                                    >
                                        {/* simple square stop icon */}
                                        <span className="w-3 h-3 bg-white rounded-[3px]" />
                                    </button>
                                </motion.div>
                            ) : prompt.length === 0 ? (
                                <motion.div
                                    key="mic"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                >
                                    <button
                                        type="button"
                                        className="flex items-center justify-center w-8 h-8 rounded-full text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700"
                                    >
                                        <Mic size={18} />
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="send"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                >
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:bg-[var(--tradeberg-card-border)]"
                                    >
                                        <ArrowUp size={18} />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </motion.form>
    );
}

function IconButton({
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded-full text-[var(--tradeberg-text-secondary)] hover:bg-[var(--tradeberg-card-border)]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            {...props}
        >
            {children}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Appearance modal wired to next-themes
// ---------------------------------------------------------------------------

function AppearanceModal({ onClose }: { onClose: () => void }) {
    const { theme, setTheme, resolvedTheme } = useNextTheme();
    const current = theme ?? resolvedTheme ?? "dark";

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="bg-white dark:bg-[var(--tradeberg-bg)] rounded-2xl shadow-2xl w-full max-w-md p-6"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Appearance</h2>
                    <IconButton onClick={onClose}>
                        <X size={18} />
                    </IconButton>
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Select your preferred interface theme.
                </p>

                <div className="grid grid-cols-3 gap-4">
                    <ThemeOption
                        icon={<Monitor size={20} />}
                        label="System"
                        isSelected={current === "system"}
                        onClick={() => setTheme("system")}
                    />
                    <ThemeOption
                        icon={<Sun size={20} />}
                        label="Light"
                        isSelected={current === "light"}
                        onClick={() => setTheme("light")}
                    />
                    <ThemeOption
                        icon={<Moon size={20} />}
                        label="Dark"
                        isSelected={current === "dark"}
                        onClick={() => setTheme("dark")}
                    />
                </div>
            </motion.div>
        </motion.div>
    );
}

function ThemeOption({
    icon,
    label,
    isSelected,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    isSelected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors ${isSelected
                ? "border-[var(--tradeberg-accent-color)] bg-[var(--tradeberg-accent-color)]/10 text-[var(--tradeberg-accent-color)]"
                : "border-[var(--tradeberg-card-border)] hover:bg-[var(--tradeberg-card-border)]/40"
                }`}
        >
            {icon}
            <span className="text-sm font-medium">{label}</span>
        </button>
    );
}

// ---------------------------------------------------------------------------
// Attach webpage modal
// ---------------------------------------------------------------------------

function AttachWebpageModal({
    onClose,
    onAdd,
}: {
    onClose: () => void;
    onAdd: (url: string) => void;
}) {
    const [url, setUrl] = useState("");

    const handleAdd = () => {
        if (url.trim()) onAdd(url.trim());
    };

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="bg-[var(--tradeberg-card-bg)] rounded-2xl shadow-2xl w-full max-w-md p-6 border border-[var(--tradeberg-card-border)]"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-[var(--tradeberg-text-primary)]">
                        Attach Webpage
                    </h2>
                    <IconButton onClick={onClose}>
                        <X size={18} className="text-gray-400" />
                    </IconButton>
                </div>

                <p className="text-sm text-[var(--tradeberg-text-secondary)] mb-4">
                    Webpage URL
                </p>

                <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full p-3 rounded-lg bg-[var(--tradeberg-bg)] text-[var(--tradeberg-text-primary)] placeholder-[var(--tradeberg-text-secondary)] border border-[var(--tradeberg-card-border)] focus:outline-none focus:ring-2 focus:ring-[var(--tradeberg-accent-color)]"
                />

                <div className="flex justify-end gap-2 mt-6">
                    <button
                        onClick={onClose}
                        className="py-2 px-4 rounded-lg text-sm font-medium text-[var(--tradeberg-text-secondary)] hover:bg-[var(--tradeberg-card-border)]/40 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAdd}
                        className="py-2 px-4 rounded-lg text-sm font-medium text-black bg-white hover:bg-gray-200 transition-colors"
                    >
                        Add
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Trade view with TradingView widget + right chat (optional)
// ---------------------------------------------------------------------------

export function TradeView() {
    const [chatFraction, setChatFraction] = useState(0.32); // ~32% initial
    const [isDragging, setIsDragging] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(true);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Global drag listeners for smooth resize
    useEffect(() => {
        const handleDragMove = (e: MouseEvent) => {
            if (!isDragging || !isChatOpen) return;
            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const totalWidth = rect.width;
            const x = e.clientX - rect.left;

            // Chat width as fraction from right side
            let nextFraction = 1 - x / totalWidth;
            const minFraction = 0.2;
            const maxFraction = 0.6;
            nextFraction = Math.min(Math.max(minFraction, nextFraction), maxFraction);

            setChatFraction(nextFraction);
        };

        const handleDragEnd = () => {
            if (!isDragging) return;
            setIsDragging(false);
            if (typeof document !== 'undefined') {
                document.body.style.cursor = 'default';
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isDragging, isChatOpen]);

    const startDragging = (e: React.MouseEvent) => {
        if (!isChatOpen) return;
        e.preventDefault();
        setIsDragging(true);
        if (typeof document !== 'undefined') {
            document.body.style.cursor = 'col-resize';
        }
    };

    const handleCloseChat = () => {
        setIsChatOpen(false);
        if (typeof document !== 'undefined') {
            document.body.style.cursor = 'default';
        }
    };

    const handleOpenChat = () => {
        setIsChatOpen(true);
    };

    const chartWidth = isChatOpen ? `${(1 - chatFraction) * 100}%` : '100%';
    const chatWidth = isChatOpen ? `${chatFraction * 100}%` : '0%';

    return (
        <div ref={containerRef} className="flex h-full overflow-hidden relative">
            {/* LEFT: CHART */}
            <motion.div
                className="h-full overflow-hidden"
                animate={{ width: chartWidth }}
                transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
                style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
            >
                <TradingViewWidget />
            </motion.div>

            {/* DIVIDER / REOPEN HANDLE */}
            {isChatOpen ? (
                <div
                    className={`w-px z-50 flex-shrink-0 border-l transition-colors ${isDragging
                        ? 'border-l-[var(--tradeberg-accent-color)]'
                        : 'border-l-[var(--sidebar-border)] hover:border-l-[var(--tradeberg-accent-color)]'
                        }`}
                    style={{ cursor: 'col-resize', backgroundColor: 'transparent' }}
                    onMouseDown={startDragging}
                />
            ) : (
                <button
                    type="button"
                    onClick={handleOpenChat}
                    className="z-50 flex-shrink-0 px-1.5 py-3 bg-transparent border border-[var(--tradeberg-card-border)] rounded-r-lg flex items-center justify-center self-start mt-4"
                    aria-label="Open chat"
                >
                    {/* use same arrow asset but flipped to point into the chat area */}
                    <img
                        src="/arrow-black.png"
                        alt="Open chat"
                        className="block dark:hidden w-3.5 h-3.5 rotate-180"
                    />
                    <img
                        src="/arrow-white.png"
                        alt="Open chat"
                        className="hidden dark:block w-3.5 h-3.5 rotate-180"
                    />
                </button>
            )}

            {/* RIGHT: CHAT */}
            <motion.div
                className="flex flex-col h-full bg-white dark:bg-[var(--tradeberg-bg)] overflow-hidden flex-shrink-0"
                animate={{ width: chatWidth }}
                transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
                style={{ pointerEvents: isDragging || !isChatOpen ? 'none' : 'auto' }}
            >
                {isChatOpen && (
                    <div className="h-full overflow-hidden w-full">
                        <ChatInterface showUpgrade onCloseChat={handleCloseChat} mode="trade" />
                    </div>
                )}
            </motion.div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TradingView widget with theme-aware config
// ---------------------------------------------------------------------------

function TradingViewWidget() {
    const container = useRef<HTMLDivElement | null>(null);
    const widgetInstance = useRef<any>(null);
    const { resolvedTheme } = useNextTheme();

    useEffect(() => {
        let tvWidget: any;

        function createWidget() {
            if (container.current && (window as any).TradingView) {
                container.current.innerHTML = "";

                const theme = resolvedTheme === "dark" ? "dark" : "light";
                const widgetOptions = {
                    width: "100%",
                    height: "100%",
                    symbol: "BINANCE:BTCUSDT",
                    interval: "D",
                    timezone: "Etc/UTC",
                    theme,
                    style: "1",
                    locale: "en",
                    toolbar_bg: theme === "dark" ? "#131722" : "#f1f3f6",
                    enable_publishing: false,
                    allow_symbol_change: true,
                    container_id: "tradingview-widget-container-trade",
                    onChartReady: () => {
                        widgetInstance.current = tvWidget;
                    },
                };

                tvWidget = new (window as any).TradingView.widget(widgetOptions);
            }
        }

        if (document.getElementById("tradingview-widget-script")) {
            if ((window as any).TradingView) createWidget();
        } else {
            const script = document.createElement("script");
            script.id = "tradingview-widget-script";
            script.src = "https://s3.tradingview.com/tv.js";
            script.type = "text/javascript";
            script.async = true;
            script.onload = createWidget;
            document.head.appendChild(script);
        }

        return () => {
            if (container.current) {
                try {
                    widgetInstance.current?.remove();
                } catch (e) {
                    console.error("Error removing widget", e);
                }
                container.current.innerHTML = "";
            }
            widgetInstance.current = null;
        };
    }, [resolvedTheme]);

    return (
        <div
            id="tradingview-widget-container-trade"
            ref={container}
            style={{ height: "100%", width: "100%" }}
        />
    );
}
