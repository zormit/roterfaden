// chat
const sqlite3 = require("sqlite3");
const { Server } = require("socket.io");
const { open } = require("sqlite");

async function setup(server) {
  const io = new Server(server, {
    connectionStateRecovery: {},
  });

  // Setup DB
  const db = await open({
    filename: "chat.db",
    driver: sqlite3.Database,
  });
  db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
      );
    `);

  io.on("connection", async (socket) => {
    socket.on("chat message", async (msg, clientOffset, callback) => {
      let result;
      try {
        result = await db.run(
          "INSERT INTO messages (content, client_offset) VALUES (?, ?)",
          msg,
          clientOffset,
        );
      } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */) {
          callback();
        } else {
          // nothing to do, just let the client retry
        }
        return;
      }
      io.emit("chat message", msg, result.lastID);
      callback();
    });

    if (!socket.recovered) {
      try {
        await db.each(
          "SELECT id, content FROM messages WHERE id > ?",
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit("chat message", row.content, row.id);
          },
        );
      } catch (e) {
        // something went wrong
      }
    }
  });
}
module.exports = { setup };
