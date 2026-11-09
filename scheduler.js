const cron = require("node-cron");
const Stream = require("../models/Stream");

const loggedStreams = new Set();

function startScheduler() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      const dueStreams = await Stream.find({
        status: "scheduled",
        startTime: { $lte: now, $ne: null },
      }).select("roomName title startTime");

      for (const stream of dueStreams) {
        const streamKey = String(stream._id);

        if (!loggedStreams.has(streamKey)) {
          console.log(
            `[SCHEDULER] Stream is due: ${stream.title} (${stream.roomName})`
          );
          loggedStreams.add(streamKey);
        }
      }
    } catch (error) {
      console.error("[SCHEDULER ERROR]", error.message);
    }
  });

  console.log("[SCHEDULER] Started — checking scheduled streams every minute");
}

module.exports = startScheduler;
