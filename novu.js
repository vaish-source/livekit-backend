const { Novu } = require("@novu/node");

const novu = new Novu({
  secretKey: process.env.NOVU_SECRET_KEY,
  backendUrl: "http://localhost:3000",
});

module.exports = novu;