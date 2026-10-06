import { Crown, Sparkles } from "lucide-react";

function getLevelProgress(totalPoints: number) {
  const totalXP = Math.max(0, Math.floor(Number.isFinite(totalPoints) ? totalPoints : 0));
  const isMax = totalXP >= 10_000;
  const level = Math.min(100, Math.floor(totalXP / 100) + 1);
  const currentLevelXP = isMax ? 100 : totalXP % 100;

  if (totalXP >= 10_000) {
    return {
      level,
      currentLevelXP,
      isMax,
      crownClass: "size-5 scale-125 text-yellow-300 drop-shadow-[0_0_14px_rgba(253,224,71,0.95)]",
      badgeClass:
        "relative flex items-center gap-1 rounded-full border border-yellow-300/50 bg-yellow-300/10 px-2 py-1 shadow-[0_0_18px_rgba(250,204,21,0.45)]",
    };
  }

  if (totalXP >= 4_900) {
    return {
      level,
      currentLevelXP,
      isMax,
      crownClass: "size-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,0.75)]",
      badgeClass: "flex items-center rounded-full px-1.5 py-1",
    };
  }

  if (totalXP >= 2_400) {
    return {
      level,
      currentLevelXP,
      isMax,
      crownClass: "size-5 text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.7)]",
      badgeClass: "flex items-center rounded-full px-1.5 py-1",
    };
  }

  if (totalXP >= 900) {
    return {
      level,
      currentLevelXP,
      isMax,
      crownClass: "size-5 text-red-500 drop-shadow-[0_0_7px_rgba(239,68,68,0.65)]",
      badgeClass: "flex items-center rounded-full px-1.5 py-1",
    };
  }

  return {
    level,
    currentLevelXP,
    isMax,
    crownClass: "size-4 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]",
    badgeClass: "flex items-center rounded-full px-1.5 py-1",
  };
}

export function ProfileLevelProgress({ points }: { points: number }) {
  const { level, currentLevelXP, isMax, crownClass, badgeClass } = getLevelProgress(points);

  return (
    <section className="mt-5 rounded-2xl border border-emerald-400/15 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={badgeClass}>
            <Crown className={crownClass} />
            {isMax && (
              <Sparkles className="size-3 text-yellow-100 drop-shadow-[0_0_6px_rgba(253,224,71,0.95)]" />
            )}
          </span>
          <span className="text-sm font-bold text-white">لیڤڵ {level}</span>
        </div>
        <span className="text-xs tabular-nums text-white/55">
          {isMax ? "100 / 100 (MAX)" : `${currentLevelXP} / 100 XP`}
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label={`لیڤڵ ${level} XP`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={currentLevelXP}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300 shadow-[0_0_14px_rgba(52,211,153,0.55)]"
          style={{ width: `${currentLevelXP}%` }}
        />
      </div>
    </section>
  );
}
