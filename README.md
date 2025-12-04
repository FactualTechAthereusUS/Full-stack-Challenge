# TradeBerg Challenge: The "Explain This Move" Feature

## The Mission
You are building the core feature of TradeBerg: **"Explain This Move"**.
The goal is simple: When the user clicks the camera icon in the chat input, capture the **visual state** of the TradingView chart and display a preview of it in the chat interface.

## The Problem
The chart is a **cross-origin iframe** (TradingView widget).
Standard tools like `html2canvas` **will not work** because of browser security policies (CORS).
If you try to screenshot the DOM directly, you will get a blank space where the iframe should be.

## The Task
1.  **Locate the Handler**: Open `src/components/chat/TradebergChat.tsx` and find the `handleCaptureClick` function.
2.  **Implement Capture**: Write the logic to capture the chart's visual state.
3.  **Attach to Chat**: Once you have a data URL (image), pass it to the `onAttachment` callback provided in the component.

## The Rules
*   **No Restrictions**: You can use any library, browser API, server-side rendering technique, or creative workaround you want.
*   **Mock Backend**: The backend is mocked. You don't need to build a real backend.
*   **Focus**: We don't care about the CSS (it's already done). We care about how you solve the **iframe capture problem**.

## Getting Started
1.  `npm install`
2.  `npm run dev`
3.  Open http://localhost:3000

## "If you can improve this in any meaningful way, you earn the interview."
Good luck.
