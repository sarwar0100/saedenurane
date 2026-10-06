import { useState, useEffect } from "react";
import { ArrowRight, Plus, Trash2, Volume2, Sticker, LayoutGrid, User } from "lucide-react";
import { useHideChrome } from "@/components/chrome";
import { supabase } from "@/lib/supabase";

export function AdminPanel({ onClose }: { onClose: () => void }) {
  useHideChrome();
  const [tab, setTab] = useState<"sounds" | "stickers" | "boards" | "tokens">("sounds");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetchItems();
  }, [tab]);

  const fetchItems = async () => {
    if (!supabase) return;
    const { data } = await supabase.from(tab).select("*");
    if (data) setItems(data);
    else setItems([]);
  };

  const handleAdd = async () => {
    if (!name || !url) return alert("تکایە ناو و لینک بنووسە");
    if (!supabase) return alert("Supabase connection is unavailable");
    setLoading(true);

    const itemPrice = parseInt(price) || 0;

    const payload = tab === "sounds" 
      ? { name, audio_url: url, price: itemPrice } 
      : { name, image_url: url, price: itemPrice };

    const { error } = await supabase.from(tab).insert([payload]);
    if (error) {
      alert("هەڵەیەک ڕوویدا: " + error.message);
    } else {
      setName("");
      setUrl("");
      setPrice("");
      fetchItems();
    }
    setLoading(false);
  };

  const handleDelete = async (id: number | string) => {
    if (!supabase) return;
    // ١. ڕاستەوخۆ لە ڕووکارەکە (UI) دەیسڕێتەوە تا کات نەیبات و بەبێ پرسیار ڕەش بێتەوە
    setItems((prev) => prev.filter((item) => item.id !== id));

    // ٢. ڕاستەوخۆ لە داتابەیسی Supabaseش دەیسڕێتەوە
    const { error } = await supabase.from(tab).delete().eq("id", id);
    if (error) {
      console.error("Error deleting:", error);
      fetchItems(); // لە کاتی ڕوودانی کێشە لە سێرڤەر داتاکان دەهێنێتەوە
    }
  };

  return (
    <div className="glass-strong animate-soft-in fixed inset-0 z-50 mx-auto flex max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="glass press flex size-11 items-center justify-center rounded-full">
          <ArrowRight className="size-5" />
        </button>
        <h2 className="text-lg font-bold">بەڕێوەبەری ئادمین</h2>
        <span className="size-11" />
      </div>

      <div className="mt-4 flex-1 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-4 gap-1 border-b border-border pb-3">
          <button
            onClick={() => setTab("sounds")}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition-colors ${tab === "sounds" ? "bg-primary text-primary-foreground" : "glass"}`}
          >
            <Volume2 className="size-4" />
            ساوند
          </button>
          <button
            onClick={() => setTab("stickers")}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition-colors ${tab === "stickers" ? "bg-primary text-primary-foreground" : "glass"}`}
          >
            <Sticker className="size-4" />
            ستیکەر
          </button>
          <button
            onClick={() => setTab("boards")}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition-colors ${tab === "boards" ? "bg-primary text-primary-foreground" : "glass"}`}
          >
            <LayoutGrid className="size-4" />
            تەختە
          </button>
          <button
            onClick={() => setTab("tokens")}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition-colors ${tab === "tokens" ? "bg-primary text-primary-foreground" : "glass"}`}
          >
            <User className="size-4" />
            پوول
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 glass p-4 rounded-2xl">
          <h3 className="font-bold text-sm">زیادکردن</h3>
          <input
            type="text"
            placeholder="ناو"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="p-3 rounded-xl bg-input border border-border text-sm"
          />
          <input
            type="text"
            placeholder={tab === "sounds" ? "لینکی ساوند (MP3/OGG)" : "لینکی (GIF / MP4 / PNG / WEBM)"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="p-3 rounded-xl bg-input border border-border text-sm"
          />
          <input
            type="number"
            placeholder="نرخ بە زێڕ (نموونە: 100)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="p-3 rounded-xl bg-input border border-border text-sm"
            min="0"
          />
          <button
            onClick={handleAdd}
            disabled={loading}
            className="press flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground"
          >
            <Plus className="size-5" />
            {loading ? "چاوەڕێ بە..." : "زیادکردن"}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <h3 className="font-bold text-sm">لیستی تۆمارکراوەکان</h3>
          {items.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">هیچ بڕگەیەک تۆمار نەکراوە</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="glass p-3 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 overflow-hidden">
                  {tab === "sounds" ? (
                    <Volume2 className="size-5 shrink-0 text-primary" />
                  ) : item.image_url?.endsWith(".mp4") || item.image_url?.endsWith(".webm") ? (
                    <video src={item.image_url} autoPlay loop muted playsInline className="size-10 object-cover rounded-lg shrink-0" />
                  ) : (
                    <img src={item.image_url} alt={item.name} className="size-10 object-contain rounded-lg shrink-0 bg-black/10" />
                  )}
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-semibold text-sm truncate">{item.name}</span>
                    <span className="text-xs font-bold text-yellow-500 mt-0.5">
                      {item.price || 0} زێڕ
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}