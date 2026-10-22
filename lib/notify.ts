/**
 * Zamanlanmış işlerin bildirimi. macOS'ta masaüstü bildirimi (osascript); `NTFY_TOPIC` tanımlıysa ayrıca ntfy ile
 * telefona (sunucuda tek kanal). Bildirim gönderilemezse iş sürer: hata yutulur, süreç ayrık başlatıldığı için çağıran
 * hemen çıkabilir.
 */
import { spawn } from "node:child_process";

function fire(cmd: string, args: string[]) {
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // bildirim kaybı işi durdurmaz
  }
}

export function notify(title: string, text: string) {
  if (process.platform === "darwin") {
    const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    fire("osascript", ["-e", `display notification "${q(text)}" with title "${q(title)}"`]);
  }
  const topic = process.env.NTFY_TOPIC?.trim();
  if (topic) {
    const body = JSON.stringify({ topic, title, message: text });
    fire("curl", ["-s", "-m", "15", "-H", "Content-Type: application/json", "-d", body, process.env.NTFY_URL ?? "https://ntfy.sh/"]);
  }
}
