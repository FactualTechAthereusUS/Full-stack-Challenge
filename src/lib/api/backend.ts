
// Mock backend API for the challenge
import { useState, useEffect } from 'react';

export const chatApi = {
    createChat: async (prompt: string) => {
        return { data: { chatId: 'mock-chat-id' }, error: null };
    },
    getMessages: async (chatId: string) => {
        return { data: [], error: null };
    },
    streamMessage: async (
        chatId: string,
        prompt: string,
        attachments: any[],
        signal: AbortSignal,
        mode?: string
    ) => {
        // Simulate a stream response
        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                const text = "This is a mock response from TradeBerg. In the real app, this would be a streaming AI response analyzing the market data.";
                let i = 0;

                const interval = setInterval(() => {
                    if (signal.aborted) {
                        clearInterval(interval);
                        controller.close();
                        return;
                    }

                    if (i >= text.length) {
                        clearInterval(interval);
                        controller.close();
                        return;
                    }

                    const chunk = text.slice(i, i + 5);
                    controller.enqueue(encoder.encode(chunk));
                    i += 5;
                }, 50);
            }
        });

        return new Response(stream);
    }
};

export const useChats = () => {
    return {
        startPollingChat: (chatId: string) => { }
    };
};
