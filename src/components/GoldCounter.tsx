import { useState, useEffect, useRef } from "react";
import { useApp } from "@/lib/app-store";
import { GoldBar } from "@/components/GoldBar";
import { useChrome } from "@/components/chrome";
import { useLocation } from "@tanstack/react-router";

export function GoldCounter() {
  const app = useApp();
  const { hidden } = useChrome();
  const gold = app.gold || 0;

  const [displayGold, setDisplayGold] = useState(gold);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // ستەیتی نوێ بۆ کاتی یاریکردن
  const [notificationHides, setNotificationHides] = useState(0);
  const notificationHidesRef = useRef(0);

  // وەرگرتنی زانیاری پەیجی ئێستا
  const location = useLocation();
  // ئەگەر وشەی "friends" لە لینکەکەدا هەبوو، واتە لە بەشی هاوڕێکانین
  const isFriendsSection = location.pathname.includes("friends");

  useEffect(() => {
    const handleDeduct = (e: any) => {
      const amount = e.detail;
      const currentGold = app.gold || 0;
      const newGold = Math.max(0, currentGold - amount);

      if (typeof (app as any).setGold === "function") {
        (app as any).setGold(newGold);
      } else if (typeof (app as any).updateGold === "function") {
        (app as any).updateGold(newGold);
      } else if (typeof (useApp as any).setState === "function") {
        (useApp as any).setState({ gold: newGold });
      } else {
        setDisplayGold(newGold);
      }
    };

    // ئاماژەکان بۆ شاردنەوە و پیشاندانەوەی زێڕەکە
    const handleHide = () => setIsPlaying(true);
    const handleShow = () => setIsPlaying(false);
    const handleNotificationHide = () => {
      notificationHidesRef.current += 1;
      setNotificationHides(notificationHidesRef.current);
    };
    const handleNotificationShow = () => {
      notificationHidesRef.current = Math.max(0, notificationHidesRef.current - 1);
      setNotificationHides(notificationHidesRef.current);
    };

    window.addEventListener("deduct-gold", handleDeduct);
    window.addEventListener("hide-gold-counter", handleHide);
    window.addEventListener("show-gold-counter", handleShow);
    window.addEventListener("hide-gold-counter-notification", handleNotificationHide);
    window.addEventListener("show-gold-counter-notification", handleNotificationShow);

    return () => {
      window.removeEventListener("deduct-gold", handleDeduct);
      window.removeEventListener("hide-gold-counter", handleHide);
      window.removeEventListener("show-gold-counter", handleShow);
      window.removeEventListener("hide-gold-counter-notification", handleNotificationHide);
      window.removeEventListener("show-gold-counter-notification", handleNotificationShow);
    };
  }, [app]);

  useEffect(() => {
    if (displayGold === gold) return;

    let animationFrameId: number;
    let startTimestamp: number | null = null;
    const startGold = displayGold;
    const endGold = gold;

    // کاتی ئەنیمەیشنەکە ٤٠٠ ملی‌چرکە (٠.٤ چرکە)
    const duration = 400;

    setIsAnimating(true);

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);

      const easeOut = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(startGold + (endGold - startGold) * easeOut);

      setDisplayGold(current);

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        setDisplayGold(endGold);
        setIsAnimating(false);
      }
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [gold]);

  // مەرجی شاردنەوە: ئەگەر لە بەشی هاوڕێکان بێت، یان یاری دەستی پێکردبێت، ئەوا زێڕەکە ون دەبێت
  if (hidden || isFriendsSection || isPlaying) {
    return null;
  }

  return (
    <div className={`absolute top-4 left-4 z-[100] pointer-events-none transition-opacity duration-200 ${notificationHides > 0 ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
      <div className="glass-strong flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 pointer-events-auto">
        <span className="flex size-7 items-center justify-center rounded-full bg-black/30">
          <GoldBar className="w-5" />
        </span>
        <span
          className={`min-w-6 text-sm font-bold tabular-nums inline-block origin-left transition-all duration-150 ${
            isAnimating
              ? "text-yellow-400 scale-[1.6] drop-shadow-[0_0_8px_rgba(250,204,21,1)]"
              : "text-gold scale-100"
          }`}
        >
          {displayGold}
        </span>
      </div>
    </div>
  );
}

export function GoldPill({ amount }: { amount: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-panel-border bg-panel-foreground/5 py-1 pr-3 pl-1.5">
      <GoldBar className="w-9" />
      <span className="text-sm font-bold tabular-nums text-panel-foreground">{amount}</span>
    </div>
  );
}
