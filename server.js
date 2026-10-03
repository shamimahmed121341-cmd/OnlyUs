const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

const USERS_FILE = "users.json";
const MESSAGES_FILE = "messages.json";

// OnlyUs-এর দুইজন
const USER1 = "Shamim";
const USER2 = "muntaha";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "onlyus-secret-2026",
    resave: false,
    saveUninitialized: false
  })
);

app.use(express.static("public"));

// ===============================
// USERS
// ===============================

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(USERS_FILE, "utf8")
    );
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(users, null, 2)
  );
}

// ===============================
// MESSAGES
// ===============================

function loadMessages() {
  if (!fs.existsSync(MESSAGES_FILE)) {
    return [];
  }

  try {
    return JSON.parse(
      fs.readFileSync(MESSAGES_FILE, "utf8")
    );
  } catch {
    return [];
  }
}

function saveMessages(messages) {
  fs.writeFileSync(
    MESSAGES_FILE,
    JSON.stringify(messages, null, 2)
  );
}

// ===============================
// GET PARTNER
// ===============================

function getPartner(username) {
  if (username === USER1) {
    return USER2;
  }

  if (username === USER2) {
    return USER1;
  }

  return null;
}

// ===============================
// REGISTER
// ===============================

app.post("/register", async (req, res) => {

  const username =
    String(req.body.username || "").trim();

  const password =
    String(req.body.password || "");

  if (!username || !password) {
    return res.json({
      success: false,
      message: "Username এবং password দিন"
    });
  }

  if (username !== USER1 && username !== USER2) {
    return res.json({
      success: false,
      message: "OnlyUs-এ শুধু Shamim এবং muntaha account ব্যবহার করা যাবে"
    });
  }

  if (password.length < 4) {
    return res.json({
      success: false,
      message: "Password কমপক্ষে 4 অক্ষরের হতে হবে"
    });
  }

  const users = loadUsers();

  if (users[username]) {
    return res.json({
      success: false,
      message: "এই username আগে থেকেই আছে"
    });
  }

  const hashedPassword =
    await bcrypt.hash(password, 10);

  users[username] = {
    password: hashedPassword
  };

  saveUsers(users);

  res.json({
    success: true,
    message: "Account তৈরি হয়েছে"
  });
});

// ===============================
// LOGIN
// ===============================

app.post("/login", async (req, res) => {

  const username =
    String(req.body.username || "").trim();

  const password =
    String(req.body.password || "");

  if (username !== USER1 && username !== USER2) {
    return res.json({
      success: false,
      message: "এই username OnlyUs-এর জন্য অনুমোদিত নয়"
    });
  }

  const users = loadUsers();

  if (!users[username]) {
    return res.json({
      success: false,
      message: "Username অথবা password ভুল"
    });
  }

  const passwordCorrect =
    await bcrypt.compare(
      password,
      users[username].password
    );

  if (!passwordCorrect) {
    return res.json({
      success: false,
      message: "Username অথবা password ভুল"
    });
  }

  req.session.username = username;

  res.json({
    success: true,
    message: "Login সফল হয়েছে"
  });
});

// ===============================
// CURRENT USER
// ===============================

app.get("/me", (req, res) => {

  res.json({
    success: !!req.session.username,
    username: req.session.username || null
  });

});

// ===============================
// OLD PRIVATE MESSAGES
// ===============================

app.get("/messages", (req, res) => {

  if (!req.session.username) {
    return res.status(401).json({
      success: false,
      message: "Login করুন"
    });
  }

  const username = req.session.username;
  const partner = getPartner(username);

  if (!partner) {
    return res.json({
      success: true,
      messages: []
    });
  }

  const messages = loadMessages();

  const privateMessages = messages.filter(
    message =>
      (message.from === username &&
       message.to === partner) ||
      (message.from === partner &&
       message.to === username)
  );

  res.json({
    success: true,
    messages: privateMessages
  });

});

// ===============================
// SOCKET.IO
// ===============================

io.on("connection", (socket) => {

  console.log(
    "User connected:",
    socket.id
  );

  // -----------------------------
  // JOIN PRIVATE ROOM
  // -----------------------------

  socket.on("join", (username) => {

    if (username !== USER1 && username !== USER2) {
      socket.disconnect();
      return;
    }

    socket.username = username;

    socket.join(username);

    console.log(
      username + " joined private room"
    );

  });

  // -----------------------------
  // SEND PRIVATE MESSAGE
  // -----------------------------

  socket.on("send-message", (text) => {

    if (!socket.username) {
      return;
    }

    const username = socket.username;
    const partner = getPartner(username);

    if (!partner) {
      return;
    }

    const cleanText =
      String(text || "").trim();

    if (!cleanText) {
      return;
    }

    const message = {
      from: username,
      to: partner,
      text: cleanText,
      time: new Date().toISOString()
    };

    // পুরোনো মেসেজের সাথে নতুন মেসেজ যোগ
    const messages = loadMessages();

    messages.push(message);

    saveMessages(messages);

    // শুধু Shamim ও muntaha-এর room-এ যাবে
    io.to(USER1)
      .to(USER2)
      .emit(
        "receive-message",
        message
      );

  });

  // -----------------------------
  // DISCONNECT
  // -----------------------------
// ==========================
// AUDIO/VIDEO CALL SIGNALING
// ==========================

socket.on("call-user", ({ to, offer }) => {
  if (!socket.username) return;

  io.to(to).emit("incoming-call", {
    from: socket.username,
    offer
  });
});

socket.on("answer-call", ({ to, answer }) => {
  if (!socket.username) return;

  io.to(to).emit("call-answered", {
    answer
  });
});

socket.on("ice-candidate", ({ to, candidate }) => {
  if (!socket.username) return;

  io.to(to).emit("ice-candidate", {
    candidate
  });
});

socket.on("end-call", ({ to }) => {
  if (!socket.username) return;

  io.to(to).emit("call-ended");
});
  socket.on("disconnect", () => {

    console.log(
      "User disconnected:",
      socket.id
    );

  });

});

// ===============================
// START SERVER
// ===============================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "==============================="
    );

    console.log(
      "       OnlyUs ❤️ SERVER"
    );

    console.log(
      "==============================="
    );

    console.log(
      "Private Chat:"
    );

    console.log(
      "Shamim ❤️ muntaha"
    );

    console.log(
      "Server running on port " + PORT
    );

  }
);
