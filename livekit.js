
const {
  RoomServiceClient,
  IngressClient,
} = require("livekit-server-sdk");

const livekitHttpUrl = process.env.LIVEKIT_URL
  .replace(/^wss:/, "https:")
  .replace(/^ws:/, "http:");

const roomService = new RoomServiceClient(
  livekitHttpUrl,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

const ingressClient = new IngressClient(
  livekitHttpUrl,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

module.exports = {
  roomService,
  ingressClient,
};
