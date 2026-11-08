import { io, Socket } from "socket.io-client";

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:5000";

// Сокет для гостя
export const guestSocket: Socket = io(`${WS_URL}/guest`, {
  autoConnect: false,
  auth: (cb) => {
    cb({ tableToken: localStorage.getItem("table_token") || "" });
  }
});

// Сокет для персонала
export const staffSocket: Socket = io(WS_URL, {
  autoConnect: false,
  auth: (cb) => {
    const token = localStorage.getItem("staff_token");
    cb({ token: token ? `Bearer ${token}` : "" });
  }
});