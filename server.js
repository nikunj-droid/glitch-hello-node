const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// ── GAME STATE ────────────────────────────────────────
const HOST_SECRET = 'MATKAKING'; // host enters this as their name

const game = {
  players: {},      // socketId -> { name, bets, plays, picks, locked }
  draws: {},        // r1/r2/r3 -> [{ v, suit, red }]
  phase: 'lobby'   // lobby | picking | waiting | drawing
};

// ── STATIC ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── SOCKET ───────────────────────────────────────────
const VALS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  // Send current state on connect
  socket.emit('game:state', {
    phase: game.phase,
    playerCount: Object.keys(game.players).length,
    draws: game.draws
  });

  // Player joins
  socket.on('player:join', (data) => {
    const { name, bets, plays, picks } = data;
    const isHost = name.toUpperCase().replace(/\s/g,'') === HOST_SECRET;
    game.players[socket.id] = { name, bets, plays, picks, locked: {r1:true,r2:true,r3:true}, isHost };
    socket.emit('player:joined', { isHost, playerCount: Object.keys(game.players).length });
    io.emit('lobby:update', { playerCount: Object.keys(game.players).length });
    console.log(`${name} joined (host:${isHost})`);
  });

  // Host draws a round
  socket.on('host:draw', ({ round }) => {
    const player = game.players[socket.id];
    if (!player || !player.isHost) return;
    const count = { 1:1, 2:2, 3:3 }[round];
    const drawn = [];
    for (let i = 0; i < count; i++) {
      const v = VALS[Math.floor(Math.random() * VALS.length)];
      const red = Math.random() < 0.5;
      drawn.push({ v, suit: red ? (Math.random()<0.5?'♥':'♦') : (Math.random()<0.5?'♠':'♣'), red });
    }
    game.draws['r'+round] = drawn;
    // Broadcast to ALL players
    io.emit('round:drawn', { round, drawn });
    console.log(`R${round} drawn:`, drawn.map(d=>d.v).join(', '));
  });

  // Host resets game
  socket.on('host:reset', () => {
    const player = game.players[socket.id];
    if (!player || !player.isHost) return;
    game.draws = {};
    game.players = {};
    io.emit('game:reset');
    console.log('Game reset by host');
  });

  socket.on('disconnect', () => {
    delete game.players[socket.id];
    io.emit('lobby:update', { playerCount: Object.keys(game.players).length });
    console.log('disconnect', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Matka King running on port ${PORT}`));
