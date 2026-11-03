# 🌊 Ocean Cleanup 2

### A 3D Multiplayer Ocean Cleaning Game

**Ocean Cleanup 2** is a browser-based 3D ocean-cleaning game designed to raise awareness about marine pollution and promote the importance of protecting underwater ecosystems.

Inspired by multiplayer .io games, players explore a virtual ocean, operate boats, collect floating garbage, return to the harbour to recycle waste, earn rewards, upgrade their boats, and compete with other players.

The project aligns with **United Nations Sustainable Development Goal 14 (SDG 14): Life Below Water**, which focuses on conserving and sustainably using oceans, seas, and marine resources.

---

## 🌍 Project Overview

Ocean Cleanup 2 combines interactive 3D gameplay, real-time multiplayer networking, environmental awareness, and a progression system.

Players can:
- Explore a 3D ocean environment.
- Navigate boats across dynamic ocean waves.
- Collect floating garbage from the water.
- Return to the harbour to recycle collected waste.
- Earn points and coins through recycling and fishing.
- Upgrade boats using earned coins.
- Interact and compete with other players in real time.
- View rankings through an in-game leaderboard.
- Learn interesting facts about ocean pollution and marine conservation.

The game aims to make environmental education more engaging through interactive gameplay.

## ✨ Features

### 1. 3D Ocean Environment
- Interactive 3D ocean and harbour environment.
- Procedurally generated ocean waves.
- Custom Gerstner wave-based water simulation.
- Dynamic day and night cycle.
- Weather and environmental effects.
- Low-poly 3D visual style.
- Real-time water interaction with boats.

### 2. Boat Navigation and Physics
- Player-controlled boat movement.
- Custom boat physics and buoyancy simulation.
- Spring-damper-based buoyancy calculations.
- Boat inertia and movement handling.
- Camera and character controllers.
- Boat collision detection and response.
- Different boat upgrade levels.

### 3. Garbage Collection and Recycling
- Collect floating garbage while exploring the ocean.
- Store collected garbage in the boat's cargo.
- Return to the harbour to unload and recycle collected waste.
- Earn points and coins after successful recycling.

**Scoring system:**
- 10 leaderboard points per successfully recycled garbage item.
- 5 coins per successfully recycled garbage item.
- Collecting garbage alone does not award leaderboard points.
- Points are awarded only after successful recycling.

The game uses item-based scoring rather than weight-based scoring.

### 4. Fishing System
- Interactive fishing gameplay.
- Catch fish and earn coins.
- Fishing rewards contribute to the player's progression.

**Reward:** 3 coins per successfully caught fish.

### 5. Boat Upgrade System
- Purchase boat upgrades using earned coins.
- Upgrade levels provide a progression system.
- Upgrade costs:
  - Level 2: 20 coins.
  - Level 3: 50 coins.

Coins are separate from leaderboard points.

### 6. Real-Time Multiplayer
- Multiplayer functionality powered by Socket.IO.
- Multiple players can join the same game server.
- Real-time player movement synchronization.
- Remote player character and boat rendering.
- Player joining and disconnection handling.
- Late-joining players receive existing player states.
- Unique usernames for connected players.
- Live leaderboard updates.
- Real-time boat collision handling.

**Multiplayer boat interactions include:**
- Head-on collisions.
- Side collisions.
- Moving boats hitting stationary boats.
- Collision-based speed reduction and separation.
- Server-authoritative collision handling to reduce synchronization issues.

The game can be demonstrated locally across multiple devices connected to the same Wi-Fi network or mobile hotspot.

### 7. Leaderboard System
- Live player rankings.
- Server-authoritative leaderboard points.
- Persistent leaderboard data.
- Rankings based on total accumulated points.
- Player rank and score visibility.
- In-game harbour leaderboard and sailing HUD leaderboard.

### 8. Admin Panel and Moderation
The game includes an administrative interface for managing multiplayer sessions.

**Admin capabilities:**
- View connected players.
- Monitor player information and progression.
- Search and manage players.
- Send warnings.
- Kick players from the session.
- View player reports.
- Review and resolve submitted reports.

Administrative actions are validated on the server.

### 9. Ocean Awareness
- In-game ocean facts and educational information.
- Environmental awareness integrated into gameplay.
- Focus on marine pollution and ocean conservation.

### 10. Audio System
- Procedurally generated audio using the Web Audio API.
- Boat-related sound effects.
- Environment and gameplay audio.

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React 19 | Frontend UI and component management |
| Three.js | 3D rendering and game environment |
| JavaScript (ES Modules) | Core application and game logic |
| Node.js | Backend runtime |
| Socket.IO | Real-time multiplayer communication |
| Vite | Development server and build tool |
| Tailwind CSS 4 | UI styling |
| Simplex Noise | Procedural environmental generation |
| WebGL / GLSL | GPU-based rendering and custom shaders |
| Web Audio API | Procedural audio generation |
| JSON | Server-side persistent data storage |
| localStorage | Client-side progression persistence |
| Git & GitHub | Version control and collaboration |

---

## 🏗️ Project Architecture

The project follows a modular client-server architecture.

### Frontend

The frontend handles rendering, player input, gameplay systems, UI, and communication with the multiplayer server.

```text
src/
├── main.jsx
├── App.jsx
│
├── engine/
│   ├── Engine.js
│   ├── AssetManager.js
│   └── GameStateManager.js
│
├── core/
│   ├── GameLoop.js
│   ├── TimeSystem.js
│   └── WeatherSystem.js
│
├── player/
│   ├── CharacterController.js
│   ├── ProceduralCharacter.js
│   ├── BoatController.js
│   ├── BoatBuoyancy.js
│   ├── BoatInertia.js
│   ├── BoatModelBuilder.js
│   ├── CameraController.js
│   └── InputManager.js
│
├── physics/
│   └── BoatCollisionSystem.js
│
├── world/
│   ├── WaveSampler.js
│   ├── HarbourManager.js
│   ├── TrashSystem.js
│   ├── UnloadZone.js
│   ├── FishingSystem.js
│   └── BiomeManager.js
│
├── multiplayer/
│   ├── NetworkManager.js
│   ├── RemotePlayerManager.js
│   ├── LeaderboardDisplay.js
│   └── ...
│
├── ui/
│   ├── HUD.jsx
│   ├── MainMenu.jsx
│   ├── AdminPanel.jsx
│   ├── OceanFactsUI.jsx
│   ├── InBoatLeaderboard.jsx
│   └── MultiplayerStatusChip.jsx
│
├── audio/
│   ├── AudioManager.js
│   └── BoatAudioController.js
│
└── config/
    ├── BoatConfig.js
    ├── ProgressionConfig.js
    └── oceanFacts.js
```

### Backend

The backend manages multiplayer connections, player states, collision handling, leaderboard data, and moderation.

```text
server/
├── index.js
├── multiplayerServer.js
├── LeaderboardStore.js
├── ReportStore.js
├── leaderboard-data.json
└── reports-data.json
```

### Architecture Explanation

- **Engine:** Initializes and coordinates the game systems.
- **Game Loop:** Handles continuous game updates.
- **Player Controllers:** Manage player movement, boats, and camera.
- **World Systems:** Handle ocean waves, harbour, garbage, fishing, and environmental elements.
- **Physics Systems:** Manage buoyancy, inertia, and collisions.
- **Network Manager:** Connects the frontend to the multiplayer server.
- **Remote Player Manager:** Renders and synchronizes other players.
- **UI Components:** Display menus, HUD, leaderboard, and admin interfaces.
- **Multiplayer Server:** Manages authoritative multiplayer state and player interactions.
- **Data Stores:** Persist leaderboard scores and player reports.

---

## 🚀 Getting Started

### Prerequisites

Make sure you have installed:

- Node.js 18 or later.
- npm.
- Git.
- A modern browser with WebGL support.

### 1. Clone the Repository

```bash
git clone https://github.com/adityagurav/OceanCleanup2.git
```

### 2. Navigate to the Project

```bash
cd OceanCleanup2
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Multiplayer Server

Open a terminal and run:

```bash
npm run server
```

The multiplayer backend runs on port `3001` by default.

### 5. Start the Frontend

Open another terminal in the project directory:

```bash
npm run dev -- --host 0.0.0.0
```

Vite will provide the local development URL, normally:

```text
http://localhost:5173/
```

Open this URL in your browser to play.

---

## 🎮 Multiplayer Setup (Local Network)

Ocean Cleanup 2 supports local multiplayer across devices connected to the same Wi-Fi network or mobile hotspot.

### Host Setup

1. Start the multiplayer server.
2. Start the Vite development server using `--host 0.0.0.0`.
3. Find the host machine's local IP address.

On macOS:

```bash
ipconfig getifaddr en0
```

### Other Players

Other devices connected to the same network can open:

```text
http://HOST_IP:5173/
```

Replace `HOST_IP` with the host computer's local IP address.

**Important:** Keep both the frontend and multiplayer server running on the host machine while other players are connected.

---

## 🧪 Testing

The project includes automated tests for important gameplay and backend systems.

Run the production build:

```bash
npm run build
```

Additional test scripts include:

```bash
node scripts/test-multiplayer-server.mjs
node scripts/test-admin-system.mjs
node scripts/test-ocean-facts.mjs
node scripts/test-fishing-feature.mjs
node scripts/test-recycling-leaderboard.mjs
```

These tests cover areas such as:
- Multiplayer server functionality.
- Admin authorization and moderation.
- Ocean facts.
- Fishing rewards.
- Recycling and leaderboard scoring.
- Boat collision and synchronization systems.

---

## 💾 Data Persistence

The project uses different storage approaches depending on the type of data.

| Data | Storage |
|---|---|
| Leaderboard points | Server-side JSON |
| Player reports | Server-side JSON |
| Player coins and progression | Browser localStorage |
| Temporary multiplayer state | Multiplayer server memory |

Leaderboard points and player reports are stored separately from client-side progression.

---

## 🌱 Environmental Impact

Ocean Cleanup 2 is designed around the idea that technology and interactive entertainment can help communicate environmental challenges.

Through gameplay, players experience the process of collecting marine waste, returning it to the harbour, and recycling it.

The project supports awareness of:

- Marine pollution.
- Plastic waste in oceans.
- Ocean ecosystem conservation.
- Sustainable use of marine resources.
- UN Sustainable Development Goal 14: Life Below Water.

---

## 🔮 Future Improvements

Potential future additions include:

- More ocean environments and biomes.
- Additional types of marine waste.
- More boat models and upgrades.
- Expanded fishing mechanics.
- Marine-life rescue missions.
- Oil-spill cleanup missions.
- Improved multiplayer scalability.
- Additional environmental challenges.
- More educational content and ocean conservation missions.

---

## 👥 Contributors

**Created and maintained by [adityaagurav](https://github.com/adityaagurav).**

---

## 📄 License

Add the project's chosen license here before distributing the repository. Until a license is added, the repository should not be assumed to grant permission for reuse or redistribution.

---

**Ocean Cleanup 2 — Explore. Collect. Recycle. Protect Our Oceans. 🌊**
