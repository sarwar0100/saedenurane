import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  MapPin,
  UserPlus,
  X,
} from "lucide-react";
import snakesBg from "@/assets/snakes-bg.jpg";
import snakeGreen from "@/assets/snake-green.png";
import snakeBrown from "@/assets/snake-brown.png";
import { useApp, type ProfileRecord } from "@/lib/app-store";
import { supabase } from "@/lib/supabase";

const normalizeUsername = (username: string) => username.trim().toLowerCase();
const birthYears = Array.from({ length: 61 }, (_, index) => String(2020 - index));
const cities = [
  "هەولێر",
  "دهۆک",
  "زاخۆ",
  "ئامێدی",
  "سۆران",
  "کەرکوک",
  "سلێمانی",
  "هەڵەبجە",
  "ئاکرێ",
  "ڕۆڤیا",
  "بەردەڕەش",
  "کەڵەکچی",
  "خەبات",
  "شەقڵاوە",
];

const isUsernameConflict = (error: {
  code?: string;
  constraint?: string;
  details?: string;
  message?: string;
}) => {
  if (error.code !== "23505") return false;
  const text =
    `${error.constraint ?? ""} ${error.details ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("username") || text.includes("profiles_username");
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "چوونەژوورەوە — مار و پەیژە" },
      { name: "description", content: "بچۆ ژوورەوە یان هەژمارێکی نوێ دروست بکە و یاری بکە." },
      { property: "og:title", content: "چوونەژوورەوە — مار و پەیژە" },
      { property: "og:description", content: "بچۆ ژوورەوە و یاری مار و پەیژە بکە." },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4Z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.6a14.5 14.5 0 0 1 0-9.3l-7.8-6.1a24 24 0 0 0 0 21.5l7.8-6.1Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48Z"
      />
    </svg>
  );
}

function FacebookIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.017 1.792-4.685 4.533-4.685 1.313 0 2.686.236 2.686.236v2.973h-1.514c-1.491 0-1.955.93-1.955 1.887v2.249h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z"
      />
    </svg>
  );
}

function AuthPage() {
  const { savedAccount, login, loginWithProfile, register } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [city, setCity] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"available" | "taken" | "checking" | null>(
    null,
  );
  const usernameTooLong = username.length > 20;
  const [loginInvalid, setLoginInvalid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (mode !== "register" || !username.trim() || usernameTooLong || !client) {
      setUsernameStatus(null);
      return;
    }

    let cancelled = false;
    const checkUsername = async () => {
      setUsernameStatus("checking");
      const { data, error } = await client
        .from("profiles")
        .select("username")
        .eq("username", normalizeUsername(username));

      if (cancelled) return;
      if (error) {
        console.error("Username availability check failed:", error);
        setUsernameStatus(null);
        return;
      }
      setUsernameStatus(data && data.length > 0 ? "taken" : "available");
    };

    void checkUsername();
    return () => {
      cancelled = true;
    };
  }, [mode, username, usernameTooLong]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (
      !email.trim() ||
      (mode === "register" && (!password || !username.trim() || !birthYear || !city)) ||
      !password
    )
      return;
    setIsSubmitting(true);
    try {
      if (mode === "register") {
        if (usernameTooLong || password.length < 8 || password.length > 20 || !birthYear || !city)
          return;
        const normalizedUsername = normalizeUsername(username);
        setUsernameStatus("checking");

        let profileId: string | undefined;
        if (supabase) {
          const { data: existingProfiles, error: usernameError } = await supabase
            .from("profiles")
            .select("username")
            .eq("username", normalizedUsername);
          if (usernameError) {
            setUsernameStatus(null);
            throw usernameError;
          }
          if (existingProfiles && existingProfiles.length > 0) {
            setUsernameStatus("taken");
            return;
          }

          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
          });
          if (authError) {
            throw authError;
          }
          if (!authData.user?.id || !authData.session) {
            throw new Error(
              "Disable email confirmation in Supabase Authentication settings to allow immediate sign-in",
            );
          }

          const profile = {
            id: authData.user.id,
            username: normalizedUsername,
            avatar_url: "",
            birth_year: birthYear,
            age: new Date().getFullYear() - Number(birthYear),
            city,
          };
          const { data: savedProfile, error: profileError } = await supabase
            .from("profiles")
            .upsert(profile, { onConflict: "id" })
            .select("*")
            .single();
          if (profileError) {
            if (isUsernameConflict(profileError)) setUsernameStatus("taken");
            throw profileError;
          }
          loginWithProfile(savedProfile as ProfileRecord, password);
          setUsernameStatus("available");
          navigate({ to: "/app/play" });
          return;
        }
        if (!register(normalizedUsername, password, birthYear, city, profileId)) {
          throw new Error("هەژمارەکە نەتوانرا دروست بکرێت");
        }
        setEmail("");
        setUsername("");
        setPassword("");
        setBirthYear("");
        setCity("");
        setUsernameStatus(null);
        navigate({ to: "/app/profile" });
      } else {
        if (supabase) {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (authError || !authData.user) {
            setLoginInvalid(true);
            return;
          }
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authData.user.id)
            .maybeSingle();
          if (profileError) throw profileError;
          if (!profile) {
            setLoginInvalid(true);
            return;
          }
          loginWithProfile(profile as ProfileRecord, password);
          setLoginInvalid(false);
        } else if (!login(email.trim(), password)) {
          setLoginInvalid(true);
          return;
        }
        setLoginInvalid(false);
        navigate({ to: "/app/play" });
      }
    } catch (error) {
      console.error("Signup error detail:", error);
      const errorRecord =
        error && typeof error === "object"
          ? (error as { message?: unknown; error_description?: unknown })
          : null;
      const errorMessage =
        (typeof errorRecord?.message === "string" && errorRecord.message) ||
        (typeof errorRecord?.error_description === "string" && errorRecord.error_description) ||
        "کێشەی پەیوەندی لەگەڵ سێرڤەر هەبوو";
      alert("کێشەیەک لە تۆمارکردن هەبوو: " + errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const googleAuth = async () => {
    if (supabase) {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    if (mode === "login" && savedAccount) {
      if (login(savedAccount.name, savedAccount.password ?? "")) navigate({ to: "/app/play" });
      return;
    }
    if (mode === "register") {
      register("بەکارهێنەری Google", crypto.randomUUID());
      navigate({ to: "/app/profile" });
    }
  };

  const facebookAuth = async () => {
    if (supabase) {
      await supabase.auth.signInWithOAuth({
        provider: "facebook",
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    if (mode === "login" && savedAccount) {
      if (login(savedAccount.name, savedAccount.password ?? "")) navigate({ to: "/app/play" });
      return;
    }
    if (mode === "register") {
      register("بەکارهێنەری Facebook", crypto.randomUUID());
      navigate({ to: "/app/profile" });
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <img
        src={snakesBg}
        alt="مارە ڕەش و سەوز و قاوەییەکان"
        width={896}
        height={1600}
        className="animate-float-slow absolute inset-0 size-full object-cover blur-[3px]"
      />

      {/* Animated snakes gliding with depth */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={snakeGreen}
          alt=""
          className="animate-glide-right absolute top-[12%] w-[130%] max-w-none opacity-70 blur-[1px] drop-shadow-[0_25px_35px_rgba(0,0,0,0.6)]"
        />
        <img
          src={snakeBrown}
          alt=""
          className="animate-glide-left absolute top-[55%] w-[150%] max-w-none opacity-55 blur-[2px] drop-shadow-[0_25px_35px_rgba(0,0,0,0.6)]"
        />
        <img
          src={snakeGreen}
          alt=""
          className="animate-glide-left absolute top-[78%] w-[95%] max-w-none opacity-40 blur-[3px]"
          style={{ animationDuration: "44s" }}
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/55 to-background/90" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <div className="animate-rise-in mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">مار و پەیژە</h1>
          <p className="mt-2 text-sm text-muted-foreground">یاری ئۆنلاین لەگەڵ هاوڕێکانت</p>
        </div>

        <div className="glass-strong animate-rise-in rounded-3xl p-5">
          <div className="mb-5 flex rounded-2xl bg-secondary p-1">
            {(["register", "login"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`press flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "text-muted-foreground"
                }`}
              >
                {m === "login" ? "چوونەژوورەوە" : "تۆمارکردن"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                ئیمەیڵ
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLoginInvalid(false);
                }}
                placeholder="example@email.com"
                autoComplete={mode === "register" ? "email" : "username"}
                required
                className={`w-full rounded-2xl border bg-input px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary ${mode === "login" && loginInvalid ? "border-red-500 ring-2 ring-red-500" : "border-border"}`}
              />
            </label>
            {mode === "register" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  ناوی بەکارهێنەر
                </span>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    maxLength={20}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setUsernameStatus(null);
                    }}
                    placeholder="ناوەکەت بنووسە"
                    autoComplete="nickname"
                    required
                    className={`w-full rounded-2xl border bg-input px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary ${usernameTooLong || usernameStatus === "taken" ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : usernameStatus === "available" ? "border-emerald-500 ring-2 ring-emerald-500" : "border-border"}`}
                  />
                  {usernameStatus === "available" && (
                    <CircleCheck className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-emerald-500" />
                  )}
                  {usernameStatus === "taken" && (
                    <CircleX className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-red-500" />
                  )}
                </div>
                {usernameTooLong && (
                  <span className="mt-1 block text-xs font-semibold text-red-500">
                    لە 20 پیت کەمتر
                  </span>
                )}
                {!usernameTooLong && usernameStatus === "taken" && (
                  <span className="mt-1 block text-xs font-semibold text-red-500">
                    تکایە ئەم ناوە هەیە بیگۆرە
                  </span>
                )}
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                وشەی نهێنی
              </span>
              <div className="relative">
                <input
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  maxLength={20}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoginInvalid(false);
                  }}
                  placeholder="••••••"
                  className={`w-full rounded-2xl border bg-input px-4 py-3 pl-12 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary ${mode === "login" && loginInvalid ? "border-red-500 ring-2 ring-red-500" : mode === "register" && (password.length < 8 || password.length > 20) && password.length > 0 ? "border-red-500 ring-2 ring-red-500" : "border-border"}`}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "شاردنەوەی وشەی نهێنی" : "پیشاندانی وشەی نهێنی"}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {passwordVisible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              {mode === "register" && password.length > 0 && password.length < 8 && (
                <span className="mt-1 block text-xs font-semibold text-red-500">
                  تکایە بیکە 8 پیت
                </span>
              )}
              {mode === "register" && password.length > 20 && (
                <span className="mt-1 block text-xs font-semibold text-red-500">
                  تکایە لە 20 پیت زیاتر نەبێت
                </span>
              )}
            </label>

            {mode === "register" && (
              <div className="grid grid-cols-2 gap-3">
                <WheelPickerField
                  label="شار"
                  placeholder="شار"
                  value={city}
                  options={cities}
                  icon={<MapPin className="size-5" />}
                  onChange={setCity}
                />
                <WheelPickerField
                  label="تەمەن"
                  placeholder="ساڵی لەدایکبوون"
                  value={birthYear}
                  options={birthYears}
                  icon={<CalendarDays className="size-5" />}
                  onChange={setBirthYear}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-glow)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="size-5 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="size-5" />
              ) : (
                <UserPlus className="size-5" />
              )}
              {isSubmitting
                ? "چاوەڕێ بە..."
                : mode === "login"
                  ? "چوونەژوورەوە"
                  : "دروستکردنی هەژمار"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">یان</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={googleAuth}
            className="press flex w-full items-center justify-center gap-3 rounded-2xl bg-panel py-3.5 text-sm font-bold text-panel-foreground shadow-[var(--shadow-glass)]"
          >
            <GoogleIcon className="size-5" />
            {mode === "register" ? "لەسەر گووگڵ دروستی بکە" : "هەژماری کۆن"}
          </button>
          <button
            type="button"
            onClick={facebookAuth}
            className="press mt-3 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1877F2] py-3.5 text-sm font-bold text-white shadow-[var(--shadow-glass)]"
          >
            <FacebookIcon className="size-5" />
            {mode === "register" ? "لەسەر فەیسبوک دروستی بکە" : "هەژماری کۆن"}
          </button>
        </div>
      </div>
    </main>
  );
}

function WheelPickerField({
  label,
  placeholder,
  value,
  options,
  icon,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  icon: React.ReactNode;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="relative flex h-[46px] w-full items-center rounded-2xl border border-border bg-input px-3 pr-10 text-sm text-foreground outline-none transition-colors hover:border-primary focus:border-primary"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={value ? "font-semibold" : "text-muted-foreground"}>
          {value || placeholder}
        </span>
        <span className="absolute right-3 text-muted-foreground">{icon}</span>
      </button>
      {isOpen && (
        <WheelPickerModal
          title={placeholder}
          value={value}
          options={options}
          onClose={() => setIsOpen(false)}
          onSelect={(selectedValue) => {
            onChange(selectedValue);
            setIsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function WheelPickerModal({
  title,
  value,
  options,
  onClose,
  onSelect,
}: {
  title: string;
  value: string;
  options: string[];
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const itemHeight = 52;
  const initialIndex = Math.max(options.indexOf(value), 0);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: initialIndex * itemHeight });
  }, [initialIndex]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nextIndex = Math.max(
      0,
      Math.min(options.length - 1, Math.round(element.scrollTop / itemHeight)),
    );
    setActiveIndex(nextIndex);
  };

  const chooseActive = () => {
    const selectedValue = options[activeIndex];
    if (selectedValue) onSelect(selectedValue);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-5 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="animate-soft-in w-full max-w-sm rounded-3xl border border-border bg-panel p-4 text-panel-foreground shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="داخستن"
            className="press flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <X className="size-4" />
          </button>
          <h2 className="font-bold">{title}</h2>
          <span className="size-9" />
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-input">
          <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-[52px] -translate-y-1/2 rounded-xl border border-primary/60 shadow-[var(--shadow-glow)]" />
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[260px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[104px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {options.map((option, index) => {
              const distance = Math.abs(index - activeIndex);
              const scale = Math.max(0.78, 1 - distance * 0.1);
              const opacity = Math.max(0.35, 1 - distance * 0.24);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    scrollRef.current?.scrollTo({ top: index * itemHeight, behavior: "smooth" });
                    setActiveIndex(index);
                  }}
                  className="flex h-[52px] w-full snap-center items-center justify-center text-lg font-bold transition-all duration-200"
                  style={{ opacity, transform: `scale(${scale})`, perspective: "500px" }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={chooseActive}
          className="press mt-3 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-glow)]"
        >
          هەڵبژاردن
        </button>
      </div>
    </div>
  );
}
