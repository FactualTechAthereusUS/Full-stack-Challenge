"use client";

import { TradeView } from "@/components/chat/TradebergChat";

export default function Home() {
  return (
    <div className="flex-1 h-full bg-background flex flex-col">
      <TradeView />
    </div>
  );
}
