import { NextRequest, NextResponse } from "next/server";
import { io as socketIO } from "socket.io-client";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  const kumaUrl = process.env.KUMA_URL || "http://127.0.0.1:3001";

  // Try to authenticate against Kuma
  const result = await new Promise<{ ok: boolean; msg?: string }>((resolve) => {
    const socket = socketIO(kumaUrl, {
      reconnection: false,
      transports: ["websocket"],
      timeout: 8000,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      resolve({ ok: false, msg: "Connection timeout" });
    }, 8000);

    socket.on("connect", () => {
      socket.emit("login", { username, password, token: "" }, (res: any) => {
        clearTimeout(timeout);
        socket.disconnect();
        resolve({ ok: !!res.ok, msg: res.msg || "" });
      });
    });

    socket.on("connect_error", (err: Error) => {
      clearTimeout(timeout);
      socket.disconnect();
      resolve({ ok: false, msg: `Cannot connect to Kuma: ${err.message}` });
    });
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.msg || "Invalid credentials" }, { status: 401 });
  }

  // Generate a simple session token (base64 of username:timestamp)
  const token = Buffer.from(`${username}:${Date.now()}`).toString("base64");

  const response = NextResponse.json({ success: true, username });
  response.cookies.set("kumamap_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 86400 * 7, // 7 days
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("kumamap_session");
  return response;
}
