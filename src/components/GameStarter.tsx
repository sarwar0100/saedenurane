import { useState } from "react";
import { Dices } from "lucide-react";
import { useApp } from "@/lib/app-store";
import { boards as defaultBoards } from "@/lib/game-data";
import { SnakesGame } from "@/components/SnakesGame";

export function GameStarter({ stickers = [], customBoards = [] }: { stickers?: any[]; customBoards?: any[] }) {
  const { boardId, tokenId, user } = useApp();
  const [playing, setPlaying] = useState(false);

  // تێکەڵکردنی تەختە بنەڕەتییەکان و تەختە نوێیەکانی سۆپابەیس
  const allBoards = [...defaultBoards, ...customBoards];
  const board = allBoards.find((b) => b.id === boardId) || defaultBoards[0] || {
    id: "",
    name: "",
    colors: ["#ffffff", "#ffffff", "#ffffff"] as [string, string, string],
  };

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center mt-8">
        <div className="glass-strong animate-rise-in w-full rounded-3xl p-6 text-center shadow-lg">
          <h1 className="text-2xl font-extrabold">ئامادەیت بۆ یاری؟</h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            چاوەڕێی سێ یاریزان بە
          </p>
          <button
            onClick={() => {
              setPlaying(true);
              window.dispatchEvent(new Event("hide-gold-counter"));
            }}
            className="press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-lg text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            <Dices className="size-6" />
            دەستپێکردنی یاری
          </button>
        </div>
      </div>

      {playing && (
        <SnakesGame
          board={board}
          me={{ 
            name: user?.name ?? "من", 
            avatar: user?.avatar ?? "", 
            token_url: tokenId ? (user as any)?.token_url : undefined 
          }}
          stickers={stickers}
          onClose={() => {
            setPlaying(false);
            window.dispatchEvent(new Event("show-gold-counter"));
          }}
        />
      )}
    </>
  );
}