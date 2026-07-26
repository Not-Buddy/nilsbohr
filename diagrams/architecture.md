# NilsBohr — Architecture Diagrams

Detailed mermaid diagrams showing the full system architecture, container interactions, database responsibilities, and module organization.

---

## Table of Contents

1. [System Deployment Overview](#1-system-deployment-overview)
2. [Container Network Topology](#2-container-network-topology)
3. [Backend Module Architecture](#3-backend-module-architecture)
4. [Frontend Application Architecture](#4-frontend-application-architecture)
5. [Game Engine Architecture](#5-game-engine-architecture)
6. [City Generator Subsystem](#6-city-generator-subsystem)
7. [Database Responsibility Map](#7-database-responsibility-map)
8. [MongoDB Document Collections](#8-mongodb-document-collections)
9. [Redis Key Layout](#9-redis-key-layout)
10. [MySQL Schema](#10-mysql-schema)

---

## 1. System Deployment Overview

The entire stack runs in Docker Compose. Six containers across two networks (`edge` for user-facing traffic, `data` for internal DB access). Only the nginx container publishes a port (`8080`) to the host — all other containers are reachable only within the Docker network.

```mermaid
graph TB
    User["🧑 User<br/>(Browser)"]

    subgraph Host["Host Machine :8080"]
        Nginx["nginx<br/>(Reverse Proxy)<br/>:8080 → :80"]
    end

    subgraph Edge["edge network"]
        Nginx
        Frontend["frontend<br/>(nginx static)<br/>:80"]
        Backend["backend<br/>(Rust/Axim)<br/>:5000"]
    end

    subgraph Data["data network"]
        Backend
        MySQL[("MySQL 8.4<br/>:3306")]
        MongoDB[("MongoDB 4.4<br/>:27017")]
        Redis[("Valkey 8<br/>:6379")]
    end

    User -->|"HTTP :8080"| Nginx
    Nginx -->|"/ → static files"| Frontend
    Nginx -->|"/auth/* /parse /parties /health /ws/*"| Backend
    Nginx -->|"WebSocket Upgrade /ws/*"| Backend

    Backend -->|"SQL: users, oauth_identities"| MySQL
    Backend -->|" BSON: repositories,<br/>parsed_worlds, entities, routes"| MongoDB
    Backend -->|"RESP: sessions, users,<br/>gh_tokens, parties"| Redis
    Backend -->|"HTTPS: OAuth + API"| GitHub["GitHub API<br/>api.github.com"]
    Backend -->|"HTTPS: OAuth"| Google["Google API<br/>oauth2.googleapis.com"]

    Frontend -.->|"Served build-time<br/>VITE_BACKEND_URL"| User

    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Nginx fill:#fbb,stroke:#333,stroke-width:2px
    style Frontend fill:#bfb,stroke:#333,stroke-width:2px
    style Backend fill:#bbf,stroke:#333,stroke-width:2px
    style MySQL fill:#fb6,stroke:#333,stroke-width:2px
    style MongoDB fill:#6f6,stroke:#333,stroke-width:2px
    style Redis fill:#f66,stroke:#333,stroke-width:2px
    style GitHub fill:#fff,stroke:#333,stroke-dasharray: 5 5
    style Google fill:#fff,stroke:#333,stroke-dasharray: 5 5
```

### Key points
- **nginx** is the single ingress point. It routes `/auth/*`, `/parse`, `/parties`, `/health`, and `/ws/*` to the backend, and everything else (`/`) to the static frontend.
- The **backend** is on both networks: `edge` (to receive proxied requests from nginx) and `data` (to reach MySQL, MongoDB, Redis).
- The three databases are on the `data` network only — not exposed to the host.
- The backend also makes outbound HTTPS calls to GitHub and Google for OAuth and repository metadata.

---

## 2. Container Network Topology

A closer look at the Docker Compose services, their build contexts, health checks, and dependency graph.

```mermaid
graph LR
    subgraph Build["Build contexts (Dockerfiles)"]
        DF["frontend/Dockerfile<br/>(node 24 → nginx)"]
        DB["Dockerfile<br/>(rust 1 → debian)"]
        DN["nginx/Dockerfile<br/>(nginx)"]
    end

    subgraph Services["docker-compose services"]
        Nginx["nginx<br/>build: nginx/Dockerfile<br/>ports: 8080:80<br/>depends_on: frontend, backendhealthy"]
        Frontend["frontend<br/>build: frontend/Dockerfile<br/>args: VITE_BACKEND_URL<br/>nginx static :80"]
        Backend["backend<br/>build: Dockerfile<br/>env_file: .env<br/>depends_on: mysql, mongo, redis healthy"]
        MySQL["mysql<br/>image: mysql:8.4<br/>volume: mysql-data<br/>env: MYSQL_DATABASE/PASSWORD"]
        MongoDB["mongo<br/>image: mongo:4.4<br/>volume: mongo-data<br/>healthcheck: mongo --eval"]
        Redis["redis<br/>image: valkey/valkey:8<br/>volume: redis-data<br/>healthcheck: valkey-cli ping"]
    end

    DF --> Frontend
    DB --> Backend
    DN --> Nginx

    Nginx -->|"service_started"| Frontend
    Nginx -->|"service_healthy"| Backend
    Backend -->|"service_healthy"| MySQL
    Backend -->|"service_healthy"| MongoDB
    Backend -->|"service_healthy"| Redis

    subgraph Volumes["Docker Volumes"]
        V1[("mysql-data<br/>/var/lib/mysql")]
        V2[("mongo-data<br/>/data/db")]
        V3[("redis-data<br/>/data")]
    end

    MySQL --> V1
    MongoDB --> V2
    Redis --> V3

    style Nginx fill:#fbb,stroke:#333,stroke-width:2px
    style Frontend fill:#bfb,stroke:#333,stroke-width:2px
    style Backend fill:#bbf,stroke:#333,stroke-width:2px
    style MySQL fill:#fb6,stroke:#333,stroke-width:2px
    style MongoDB fill:#6f6,stroke:#333,stroke-width:2px
    style Redis fill:#f66,stroke:#333,stroke-width:2px
```

### Service details

| Service | Image / Build | Port | Health Check | Restart Policy |
|---|---|---|---|---|
| `nginx` | `nginx/Dockerfile` → `nginx:stable` | `8080:80` | (none — depends on backend) | `unless-stopped` |
| `frontend` | `frontend/Dockerfile` → multi-stage `node24` → `nginx` | `80` (internal) | (none) | `unless-stopped` |
| `backend` | `Dockerfile` → multi-stage `rust1` → `debian-slim` | `5000` (internal) | `curl -f http://localhost:5000/health` | `unless-stopped` |
| `mysql` | `mysql:8.4` | `3306` (internal) | `mysqladmin ping -h localhost` | `unless-stopped` |
| `mongo` | `mongo:4.4` | `27017` (internal) | `mongo --eval db.adminCommand('ping')` | `unless-stopped` |
| `redis` | `valkey/valkey:8` | `6379` (internal) | `valkey-cli ping` | `unless-stopped` |

---

## 3. Backend Module Architecture

The Rust backend is organized into 14 top-level modules under `backend/src/`. This diagram shows the dependency graph (which module imports which) and the flow of data through the system.

```mermaid
graph TB
    subgraph Entry["Entry point"]
        Main["main.rs<br/>#[tokio::main]<br/>builds AppState → build_app"]
        Lib["lib.rs<br/>build_app → Router<br/>CORS layer, routes"]
    end

    subgraph State["State & Config"]
        AppState["state.rs<br/>AppState {config, redis, http, db, mysql}"]
        AuthConfig["auth/config.rs<br/>AuthConfig::from_env"]
    end

    subgraph Auth["auth/ — OAuth, JWT, sessions"]
        AuthMod["auth/mod.rs"]
        JWT["auth/jwt.rs<br/>create_token / verify_token"]
        MW["auth/middleware.rs<br/>AuthUser extractor<br/>(Bearer + cookie)"]
        RedisAuth["auth/redis.rs<br/>bb8 pool<br/>user/session/gh_token keys<br/>TTL = 7d"]
        Github["auth/oauth/github.rs<br/>build_authorize_url<br/>exchange_code<br/>fetch_github_user"]
        Google["auth/oauth/google.rs<br/>build_google_authorize_url<br/>exchange_google_code<br/>fetch_google_user"]
        AuthRoutes["auth/routes/<br/>login, callback, google_*,<br/>logout, me, repos"]
        AuthModels["auth/models.rs<br/>User, AuthUser, Claims,<br/>GitHubUser, GoogleUser"]
    end

    subgraph DB["db/ — Persistence"]
        DBMod["db/mod.rs<br/>MongoDB init + indexes"]
        ModelsDB["db/models.rs<br/>RepoDoc, ParsedWorldDoc,<br/>EntityDoc, RouteDoc"]
        RepoDB["db/repository.rs<br/>find_or_create_repo<br/>update_repo_after_parse"]
        WorldDB["db/world.rs<br/>get_cached_world<br/>store_world"]
        MySQLMod["db/mysql/mod.rs<br/>pool + migrate"]
        UsersDB["db/mysql/users.rs<br/>find_or_create_oauth_user"]
        MySQLModels["db/mysql/models.rs<br/>UserRow, OAuthIdentityRow"]
    end

    subgraph Parser["Parser pipeline"]
        ParserMod["parser.rs<br/>generate_world (orchestrator)"]
        Walker["walker.rs<br/>collect_file_paths"]
        Hierarchy["hierarchy.rs<br/>reconstruct_hierarchy<br/>(files → districts)"]
        SymTab["symbol_table.rs<br/>index_cities / resolve"]
        GitLayer["git_layer.rs<br/>shallow_clone + tip metadata"]
    end

    subgraph Langs["languages/ — tree-sitter parsers"]
        Registry["languages/registry.rs<br/>parse_by_extension"]
        Parsers["Parsers:<br/>rs, ts, js, py,<br/>cpp, c, java"]
        ParserUtils["languages/parser_utils.rs"]
    end

    subgraph Domain["domain/"]
        EntityTree["entity_tree.rs<br/>flatten / reconstruct<br/>(MongoDB round-trip)"]
    end

    subgraph Multi["multiplayer/"]
        MultiMod["multiplayer/<br/>create_party, get_party,<br/>ws_handler"]
        Party["party.rs<br/>add_member / remove_member"]
        Store["store.rs<br/>Redis keys +<br/>broadcast channels"]
        Messages["messages.rs<br/>PartyMessage enum"]
    end

    subgraph Services["services/ — orchestration"]
        AuthSvc["services/auth_service.rs<br/>handle_callback, issue_session,<br/>list_user_repos"]
        GithubSvc["services/github_service.rs<br/>fetch_repo_metadata,<br/>fetch_latest_commit_hash,<br/>fetch_user_repos"]
        ParseSvc["services/parse_service.rs<br/>parse_repository orchestrator"]
    end

    subgraph Routes["routes/"]
        RoutesMod["routes.rs<br/>parse_repo_handler"]
    end

    subgraph Models["models.rs"]
        GameModels["GameEntity (City/District/<br/>Building/Room/Artifact),<br/>WorldSeed, Route"]
    end

    subgraph Errors["error.rs"]
        AppError["AppError enum<br/>NotFound, Unauthorized,<br/>Database, Sqlx, Git, ..."]
    end

    %% Core connections
    Main --> AppState
    Main --> Lib
    Lib --> AuthRoutes
    Lib --> RoutesMod
    Lib --> MultiMod
    Lib --> AuthConfig
    Lib --> AppState

    %% State
    AppState --> AuthConfig
    AppState --> RedisAuth
    AppState --> DBMod
    AppState --> MySQLMod

    %% Auth flow
    AuthRoutes --> AuthSvc
    AuthSvc --> Github
    AuthSvc --> Google
    AuthSvc --> UsersDB
    AuthSvc --> RedisAuth
    AuthSvc --> JWT
    AuthSvc --> AuthModels
    MW --> JWT
    MW --> RedisAuth

    %% Parse flow
    RoutesMod --> ParseSvc
    ParseSvc --> GithubSvc
    ParseSvc --> RepoDB
    ParseSvc --> WorldDB
    ParseSvc --> GitLayer
    ParseSvc --> ParserMod

    ParserMod --> Walker
    ParserMod --> Hierarchy
    ParserMod --> SymTab
    ParserMod --> Registry
    ParserMod --> GameModels

    Registry --> Parsers
    Parsers --> ParserUtils
    Parsers --> GameModels

    WorldDB --> EntityTree
    WorldDB --> ModelsDB
    RepoDB --> ModelsDB

    %% Multiplayer
    MultiMod --> Party
    MultiMod --> Store
    MultiMod --> Messages
    Store --> RedisAuth

    %% Errors everywhere
    AppError -.->|"From&lt;mongodb::Error&gt;"| DBMod
    AppError -.->|"From&lt;sqlx::Error&gt;"| UsersDB
    AppError -.->|"map_err"| AuthSvc
    AppError -.->|"map_err"| ParseSvc

    %% GitHub external
    Github -->|"HTTPS"| ExtGH["GitHub API"]
    GithubSvc -->|"HTTPS"| ExtGH
    Google -->|"HTTPS"| ExtGG["Google API"]

    style Main fill:#bbf,stroke:#333,stroke-width:2px
    style Lib fill:#bbf,stroke:#333,stroke-width:2px
    style AppState fill:#fdd,stroke:#333,stroke-width:2px
    style ParseSvc fill:#dfd,stroke:#333,stroke-width:2px
    style AuthSvc fill:#dfd,stroke:#333,stroke-width:2px
    style AppError fill:#fbb,stroke:#333,stroke-width:2px
    style ExtGH fill:#fff,stroke:#333,stroke-dasharray: 5 5
    style ExtGG fill:#fff,stroke:#333,stroke-dasharray: 5 5
```

### Module responsibilities at a glance

| Module | Key files | Responsibility |
|---|---|---|
| `auth` | `oauth/`, `routes/`, `jwt.rs`, `middleware.rs`, `redis.rs` | GitHub + Google OAuth, JWT issuance/verification, session management, `AuthUser` extractor |
| `db` | `mod.rs`, `repository.rs`, `world.rs`, `mysql/` | MongoDB connection + indexes, repo world cache, MySQL user persistence |
| `domain` | `entity_tree.rs` | Flatten/reconstruct GameEntity tree for MongoDB round-trip |
| `error` | `error.rs` | `AppError` enum → HTTP status mapping |
| `git_layer` | `git_layer.rs` | libgit2 shallow clone, tip-commit metadata |
| `hierarchy` | `hierarchy.rs` | Directory tree → `District`/`Building` GameEntities |
| `languages` | `*.rs` parsers, `registry.rs`, `traits.rs` | tree-sitter AST → `GameEntity` (Buildings/Rooms/Artifacts) per language |
| `models` | `models.rs` | Core domain: `GameEntity`, `WorldSeed`, `Route`, `WorldResponse` |
| `multiplayer` | `mod.rs`, `party.rs`, `store.rs`, `messages.rs` | Party CRUD (Redis), WebSocket relay hub |
| `parser` | `parser.rs` | Orchestrates walk → parse → symbol resolve → world seed |
| `routes` | `routes.rs` | HTTP handlers (`parse_repo_handler`) |
| `services` | `auth_service.rs`, `github_service.rs`, `parse_service.rs` | Business logic: OAuth callback handling, repo → world pipeline, GitHub REST API client |
| `state` | `state.rs` | `AppState` — shared handle (config + pool handles) |
| `symbol_table` | `symbol_table.rs` | Resolves call/import targets to entity IDs |
| `walker` | `walker.rs` | Recursive file walker with extension filtering |

---

## 4. Frontend Application Architecture

The React frontend. The component tree shows how guards, providers, and routes nest — only `/game` is wrapped with `BackendGuard`.

```mermaid
graph TB
    Index["index.html<br/>→ main.tsx"]

    subgraph App["App.tsx — top-level composition"]
        DeviceGuard["DeviceGuard<br/>(blocks touch-only devices)"]
        AuthProvider["AuthProvider<br/>(loads token, fetches /auth/me)"]
        BrowserRouter["BrowserRouter"]
        Routes["Routes"]
    end

    subgraph PublicRoutes["Public routes"]
        Landing["/  →  LandingPage<br/>(login buttons)"]
        Callback["/login/callback  →  CallbackPage<br/>(captures token from URL)"]
    end

    subgraph Protected["Protected routes (require auth)"]
        ProtectedRoute["ProtectedRoute<br/>(Navigate to / if unauth)"]
        Home["/home  →  Home<br/>(repo list + create party)"]
        PartyLobby["/parties/*  →  PartyLobbyPage<br/>(party setup)"]
        Game["/game  →  PixiApp<br/>(the game)"]
    end

    subgraph GameRoute["/game nested providers"]
        PartyProvider["PartyProvider<br/>(WebSocket state)"]
        BackendGuard["BackendGuard<br/>(polls /health every 5s)"]
        PixiApp["PixiApp<br/>(PixiJS canvas + SceneManager)"]
    end

    Index --> DeviceGuard
    DeviceGuard --> AuthProvider
    AuthProvider --> BrowserRouter
    BrowserRouter --> Routes

    Routes --> Landing
    Routes --> Callback
    Routes --> ProtectedRoute

    ProtectedRoute --> Home
    ProtectedRoute --> PartyLobby
    ProtectedRoute --> Game

    Game --> PartyProvider
    PartyProvider --> BackendGuard
    BackendGuard --> PixiApp

    subgraph AuthInfra["Auth infrastructure"]
        Axios["api.ts<br/>(axios instance)<br/>Bearer interceptor<br/>401 → redirect /"]
        AuthCtx["AuthContext.tsx<br/>login(provider), logout,<br/>user/token state"]
        ProtectedLogic["ProtectedRoute.tsx<br/>isLoading → spinner<br/>!isAuth → Navigate /"]
    end

    AuthProvider -.-> AuthCtx
    AuthCtx -.-> Axios
    Axios -.->|"GET /auth/me"| AuthCtx
    Axios -.->|"POST /logout"| AuthCtx

    style DeviceGuard fill:#fcf,stroke:#333,stroke-width:2px
    style BackendGuard fill:#fcf,stroke:#333,stroke-width:2px
    style ProtectedRoute fill:#fdd,stroke:#333,stroke-width:2px
    style PixiApp fill:#bbf,stroke:#333,stroke-width:2px
```

### Guard chain (innermost → outermost)

```
DeviceGuard        ← blocks on touch-only devices (phones/tablets)
  └─ AuthProvider  ← loads JWT from localStorage, fetches /auth/me
     └─ ProtectedRoute  ← redirects to / if not authenticated
        └─ PartyProvider  ← manages WebSocket for party
           └─ BackendGuard  ← polls /health, shows retry screen when backend down
              └─ PixiApp  ← actual game
```

---

## 5. Game Engine Architecture

The PixiJS-based game engine. The `SceneManager` drives a single active `Scene`, which in turn orchestrates the engine subsystems (camera, chunks, ground, minimaps).

```mermaid
graph TB
    PixiApp["PixiApp.tsx<br/>fetchSeed() → seed state<br/>Creates SceneManager + Pixi Canvas"]

    subgraph Engine["Engine core (engine/)"]
        SceneManager["SceneManager<br/>switch(scene), ticker loop<br/>calls scene.update(dt)"]
        Camera["Camera<br/>lerp-follow player<br/>world container wrapper"]
        Input["Inputs<br/>(KeyW/A/S/D, KeyJ, Escape)<br/>isDown / isJustPressed"]
        SeededRandom["SeededRandom<br/>Mulberry32 + DJB2<br/>at(x,y) spatial hashing<br/>fork(key)"]
        WorldGen["WorldGenerator<br/>golden-angle spiral city layout<br/>resolve city collisions"]
        ChunkManager["ChunkManager<br/>cities: chunkSize 1000<br/>loadRadius 5, unloadRadius 3"]
        Minimap["Minimap (city)<br/>districts, viewport rect<br/>top-right corner"]
        WorldMiniMap["WorldMiniMap<br/>cities colored by language<br/>top-right corner"]
    end

    subgraph GroundEngine["Ground Graphics (engine/GroundGraphics/)"]
        Terrain["Terrain<br/>value-noise fbm heightmap<br/>island radial falloff"]
        GroundTiles["GroundTiles<br/>auto-tile system<br/>grass/sand/stone/water"]
        GroundProps["GroundProps<br/>14 prop types<br/>biome-aware placement"]
        GroundChunkMgr["GroundChunkManager<br/>chunkSize 512, loadRadius 2<br/>water collision rects"]
    end

    subgraph Scenes["Scene hierarchy (scenes/)"]
        WorldScene["WorldScene<br/>overworld, cities, minimap"]
        CityScene["CityScene<br/>districts, buildings, roads<br/>biome rendering"]
        BuildingScene["BuildingScene<br/>rooms, header info"]
        RoomScene["RoomScene<br/>artifacts, parameter display"]
    end

    subgraph Sprites["Sprites (sprites/)"]
        Player["Player<br/>4-dir animated sprite<br/>WASD movement + collision"]
        RemotePlayer["RemotePlayer<br/>green circle + label<br/>(multiplayer — not wired)"]
        CitySprite["City<br/>radius from LOC<br/>language-colored border"]
        BuildingSprite["Building<br/>biome-themed shape<br/>empty = red dashed"]
        RoomSprite["Room<br/>room-type colored<br/>async/main badges"]
        ArtifactSprite["Artifact<br/>variable/const display<br/>force-directed layout"]
    end

    PixiApp --> SceneManager
    SceneManager -->|"current scene"| WorldScene
    WorldScene -->|"KeyJ near city"| CityScene
    CityScene -->|"KeyJ near building"| BuildingScene
    BuildingScene -->|"KeyJ near room"| RoomScene
    RoomScene -->|"Escape"| BuildingScene
    BuildingScene -->|"Escape"| CityScene
    CityScene -->|"Escape (lazy import)"| WorldScene

    WorldScene --> WorldGen
    WorldScene --> ChunkManager
    WorldScene --> WorldMiniMap
    WorldScene --> Camera
    WorldScene --> Input
    WorldScene --> GroundTiles
    WorldScene --> GroundProps
    WorldScene --> GroundChunkMgr
    GroundChunkMgr --> GroundTiles
    GroundChunkMgr --> GroundProps
    GroundTiles --> Terrain

    CityScene -->|"CityGenerator"| CityGenMod["CityGenerator/<br/>organic layout"]
    CityScene --> Minimap
    CityScene --> Camera
    CityScene --> Input

    BuildingScene --> Camera
    BuildingScene --> Input

    RoomScene --> Camera
    RoomScene --> Input

    WorldScene --> Player
    CityScene --> Player
    BuildingScene --> Player
    RoomScene --> Player

    WorldScene --> CitySprite
    CityScene --> BuildingSprite
    BuildingScene --> RoomSprite
    RoomScene --> ArtifactSprite

    style PixiApp fill:#bbf,stroke:#333,stroke-width:2px
    style SceneManager fill:#fdd,stroke:#333,stroke-width:2px
    style WorldGen fill:#dfd,stroke:#333,stroke-width:2px
    style Player fill:#fbb,stroke:#333,stroke-width:2px
```

---

## 6. City Generator Subsystem

The `engine/CityGenerator/` directory is a self-contained procedural city layout system. `CityScene` uses the `'organic'` strategy.

```mermaid
graph TB
    CityScene["CityScene.tsx<br/>spawns CityGenerator"]

    subgraph CityGen["CityGenerator/"]
        CityGenMain["CityGenerator.ts<br/>generate(strategy)<br/>forks rng per city"]

        subgraph Layout["Layouters"]
            DistrictLayouter["DistrictLayouter.ts<br/>4 strategies:<br/>radial / grid / organic / linear"]
            BuildingLayouter["BuildingLayouter.ts<br/>4 strategies:<br/>grid / packed / scattered / street"]
        end

        CollisionResolver["CollisionResolver.ts<br/>10-iter force push<br/>constrain to district"]
        BiomeConfig["BiomeConfig.ts<br/>6 biomes:<br/>forest / desert / tundra /<br/>volcanic / crystal / tech<br/>palettes + shapes"]
        RoadNetwork["RoadNetwork.ts<br/>Kruskal MST highways<br/>+ nearest-neighbor streets<br/>renders with L-paths"]
        CityGroundRenderer["CityGroundRenderer.ts<br/>biome terrain fill<br/>+ pattern overlays<br/>+ edge noise + blend zones"]
    end

    SeededRandom["SeededRandom<br/>fork(city:id)"]

    CityScene -->|"new CityGenerator(seed)"| CityGenMain
    CityGenMain -->|"1. Calculate district sizes"| DistrictLayouter
    CityGenMain -->|"2. Layout districts"| DistrictLayouter
    CityGenMain -->|"3. Per-district building layout"| BuildingLayouter
    CityGenMain -->|"4. Resolve collisions"| CollisionResolver
    CityGenMain -->|"5. Assign biomes"| BiomeConfig
    CityGenMain -->|"6. Generate roads"| RoadNetwork
    CityGenMain -->|"7. Render ground"| CityGroundRenderer

    CityGenMain --> SeededRandom
    DistrictLayouter --> SeededRandom
    BuildingLayouter --> SeededRandom
    BiomeConfig --> SeededRandom
    RoadNetwork --> SeededRandom
    CityGroundRenderer --> BiomeConfig

    subgraph Strategies["Strategy details"]
        Radial["Radial<br/>Fermat golden-angle spiral"]
        Grid["Grid<br/>regular spacing"]
        Organic["Organic<br/>50-iter force-directed<br/>(used by CityScene)"]
        Linear["Linear<br/>alternating sides of axis"]
        Packed["Packed<br/>Tetris-style bin packing"]
        Scattered["Scattered<br/>gaussian + retry"]
        Street["Street<br/>alternating along street"]
    end

    DistrictLayouter --> Radial
    DistrictLayouter --> Grid
    DistrictLayouter --> Organic
    DistrictLayouter --> Linear
    BuildingLayouter --> Grid
    BuildingLayouter --> Packed
    BuildingLayouter --> Scattered
    BuildingLayouter --> Street

    style CityGenMain fill:#bbf,stroke:#333,stroke-width:2px
    style Organic fill:#bfb,stroke:#333,stroke-width:2px
    style BiomeConfig fill:#fcf,stroke:#333,stroke-width:2px
```

### Biome palettes

| Biome | Ground | Buildings | Border | Shape | Pattern |
|---|---|---|---|---|---|
| Forest | `#2d5a3d` darkgreen | `#4a7c5c` | `#1a3a26` | rounded | hex |
| Desert | `#c2a160` sand | `#d4b878` | `#8a6d3b` | rect | dots |
| Tundra | `#a8c5d6` paleblue | `#7896a8` | `#4a6678` | diamond | grid |
| Volcanic | `#3d1414` darkred | `#5a2424` | `#1a0808` | rect | diagonal |
| Crystal | `#4a3d7a` purple | `#6b5bb0` | `#2d2050` | diamond | dots |
| Tech | `#1a2a3a` bluegray | `#2a4a5a` | `#0a1a2a` | rounded | grid |

---

## 7. Database Responsibility Map

Which backend module is responsible for which database. Each database has a distinct role.

```mermaid
graph LR
    subgraph Backend["Backend (Rust / Axum)"]
        AuthMiddleware["auth/middleware.rs"]
        AuthService["services/auth_service.rs"]
        ParseService["services/parse_service.rs"]
        MultiHandler["multiplayer/mod.rs"]
        MultiStore["multiplayer/store.rs"]
        UsersQuery["db/mysql/users.rs"]
        WorldDB["db/world.rs"]
        RepoDB["db/repository.rs"]
    end

    subgraph MySQLDB["MySQL — Identity store (relational)"]
        UsersTable["users<br/>(id, email, display_name,<br/>avatar_url, timestamps)"]
        OAuthTable["oauth_identities<br/>(user_id FK, provider,<br/>provider_user_id UNIQUE)"]
    end

    subgraph Mongo["MongoDB — Parsed-world document store (BSON)"]
        Repos["repositories<br/>(repo_url, latest_commit_hash,<br/>github_metadata)"]
        Worlds["parsed_worlds<br/>(repo_id, commit_hash,<br/>city/building/room counts)"]
        Entities["entities<br/>(world_id, parent_entity_id,<br/>sort_order, GameEntity)"]
        RoutesCol["routes<br/>(world_id, Route)"]
    end

    subgraph RedisDB["Redis — Ephemeral state (RESP)"]
        SessionKeys["session:{uuid} → github_id<br/>TTL = 7 days"]
        UserKeys["user:{github_id} → User JSON<br/>(no TTL — cache)"]
        GhTokenKeys["gh_token:{github_id} → access_token<br/>(no TTL)"]
        PartyKeys["party:{uuid} → Party JSON<br/>TTL = 24 hours"]
        BroadcastMap["BROADCASTS (process-local)<br/>HashMap&lt;party_id, broadcast::Sender&gt;<br/>(in-memory, single-instance)"]
    end

    %% MySQL connections
    AuthService -->|"find_or_create_oauth_user"| UsersQuery
    UsersQuery --> UsersTable
    UsersQuery --> OAuthTable

    %% MongoDB connections
    ParseService -->|"find_or_create_repo"| RepoDB
    ParseService -->|"get_cached_world / store_world"| WorldDB
    RepoDB --> Repos
    WorldDB --> Worlds
    WorldDB --> Entities
    WorldDB --> RoutesCol

    %% Redis connections
    AuthService -->|"store_user / get_user"| UserKeys
    AuthService -->|"store_session / get_session / delete_session"| SessionKeys
    AuthService -->|"store_github_token / get_github_token"| GhTokenKeys
    AuthMiddleware -->|"verify session exists"| SessionKeys
    ParseService -->|"get_github_token (for private repos)"| GhTokenKeys
    MultiHandler -->|"create_party → save_party"| MultiStore
    MultiStore --> PartyKeys
    MultiStore --> BroadcastMap

    style MySQLDB fill:#fb6,stroke:#333,stroke-width:2px
    style Mongo fill:#6f6,stroke:#333,stroke-width:2px
    style RedisDB fill:#f66,stroke:#333,stroke-width:2px
```

### Three-database philosophy

| Database | Role | Lifespan | Consistency | Sharding strategy |
|---|---|---|---|---|
| **MySQL** | User identity + OAuth linkage | persistent (lifetime of account) | strong (ACID relational) | vertical — grows with users |
| **MongoDB** | Parsed-world documents (immutable per commit) | persistent — content-addressed by `(repo_id, commit_hash)` | eventually consistent, single-doc atomic | append-only — old commits stay cached |
| **Redis** | Sessions, profile cache, GitHub tokens, parties, WS broadcast | ephemeral (7d sessions, 24h parties) | eventual (Redis replication not configured) | process-local broadcast map limits WS to single instance |

---

## 8. MongoDB Document Collections

The MongoDB "nilsbohr" database has four collections. Parsed worlds are stored flat (`EntityDoc` rows) and reconstructed into a tree on load.

```mermaid
graph TB
    subgraph Mongo["MongoDB — 'nilsbohr' database"]
        subgraph ReposCol["repositories collection"]
            RepoDoc["RepoDoc<br/><br/>_id: ObjectId<br/>repo_url: String (indexed)<br/>owner, repo_name (compound indexed)<br/>latest_commit_hash: String<br/>default_branch: String<br/>last_parsed_at: DateTime<br/>github_metadata: Object?"]
        end

        subgraph WorldsCol["parsed_worlds collection"]
            WorldDoc["ParsedWorldDoc<br/><br/>_id: ObjectId<br/>repository_id: ObjectId<br/>commit_hash: String<br/>(compound indexed)<br/>project_name<br/>city/building/room/<br/>artifact_counts<br/>generated_at: DateTime"]
        end

        subgraph EntitiesCol["entities collection"]
            EntityDoc["EntityDoc<br/><br/>_id: ObjectId<br/>world_id: ObjectId (indexed)<br/>parent_entity_id: ObjectId?<br/>(compound indexed with sort_order)<br/>entity_id: String (indexed)<br/>sort_order: i32<br/>kind: 'building' / 'room' / ...<br/>spec: { ...stripped GameEntity }"]
        end

        subgraph RoutesCol["routes collection"]
            RouteDoc["RouteDoc<br/><br/>_id: ObjectId<br/>world_id: ObjectId (indexed)<br/>Route { id, from_id, to_id,<br/>route_type, bidirectional,<br/>metadata? }"]
        end
    end

    RepoDoc -->|"1:N"| WorldDoc
    WorldDoc -->|"1:N (via flatten/reconstruct)"| EntityDoc
    WorldDoc -->|"1:N"| RouteDoc

    subgraph Flatten["db/world.rs — store_world"]
        FlattenNote["flatten_entities() walks GameEntity tree<br/>writes children-stripped EntityDoc<br/>batch insert_many(500) chunks<br/>uses sort_order to preserve child ordering"]
    end

    subgraph Reconstruct["db/world.rs — get_cached_world"]
        ReconstructNote["reconstruct_tree() groups by parent_entity_id<br/>orders children by sort_order<br/>rebuilds nested GameEntity"]
    end

    EntityDoc -->|"store_world"| Flatten
    Flatten --> EntityDoc
    EntityDoc -->|"get_cached_world"| Reconstruct
    Reconstruct --> EntityDoc

    style Mongo fill:#6f6,stroke:#333,stroke-width:2px
```

### Indexes (defined in `db/mod.rs:22-76`)

| Collection | Index fields | Purpose |
|---|---|---|
| `repositories` | `repo_url` | find existing repo by URL |
| `repositories` | `(owner, repo_name)` | uniqueness + lookup by name |
| `parsed_worlds` | `(repository_id, commit_hash)` | cache lookup by commit |
| `entities` | `(world_id, parent_entity_id)` | tree reconstruction grouping |
| `entities` | `entity_id` | local entity lookup |
| `routes` | `world_id` | fetch all routes for a world |

---

## 9. Redis Key Layout

```mermaid
graph TB
    subgraph Redis["Redis (bb8 pool, max_size 16)"]
        subgraph Sessions["Session lifecycle (TTL = 7 days)"]
            SessKey["session:&lt;uuid&gt;"]
            SessKey -->|"SETEX 604800 → github_id:i64"| Verify["get_session()<br/>delete_session()"]
        end

        subgraph Users["User profile cache (no TTL)"]
            UserKey["user:&lt;github_id&gt;"]
            UserKey -->|"SET → User JSON"| UserStore["store_user()<br/>get_user()"]
        end

        subgraph GhTokens["GitHub access tokens (no TTL)"]
            TkKey["gh_token:&lt;github_id&gt;"]
            TkKey -->|"SET → access_token"| TokenStore["store_github_token()<br/>get_github_token()<br/>(used by /auth/repos + /parse)"]
        end

        subgraph Parties["Party state (TTL = 24 hours)"]
            PartyKey["party:&lt;uuid&gt;"]
            PartyKey -->|"SETEX 86400 → Party JSON"| PartyStore["save_party()<br/>get_party()"]
        end
    end

    subgraph InMemory["Process-local (in-memory, single-instance limitation)"]
        Broadcasts["BROADCASTS<br/>LazyLock&lt;Mutex&lt;<br/>HashMap&lt;String, broadcast::Sender&gt;&gt;&gt;<br/>per-party broadcast channel<br/>capacity 256"]
    end

    PartyKey -.->|"Parallel"| Broadcasts

    AuthServiceImpl["services/auth_service.rs"] --> SessKey
    AuthServiceImpl --> UserKey
    AuthServiceImpl --> TkKey
    MiddlewareImpl["auth/middleware.rs"] --> SessKey
    ParseService["services/parse_service.rs"] --> TkKey
    MultiService["multiplayer/store.rs"] --> PartyKey
    MultiService --> Broadcasts

    style Redis fill:#f66,stroke:#333,stroke-width:2px
    style InMemory fill:#faa,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5
    style Broadcasts fill:#faa,stroke:#333,stroke-dasharray: 5 5
```

### Key TTL summary

| Key pattern | TTL | Module | Purpose |
|---|---|---|---|
| `session:{uuid}` | 7 days (`SESSION_TTL_SECS`) | `auth_service.rs`, `middleware.rs` | Session → github_id lookup |
| `user:{github_id}` | none (cache) | `auth_service.rs` (via `auth/redis.rs`) | Cached User profile |
| `gh_token:{github_id}` | none | `parse_service.rs`, `auth_service.rs` | GitHub access token for API calls |
| `party:{uuid}` | 24 hours (`TTL_SECS = 86400`) | `multiplayer/store.rs` | Party state (members, repo_url) |

> **Limitation**: The in-memory `BROADCASTS` map means WebSocket party relay only works on a single backend instance — horizontal scaling would require Redis Pub/Sub instead.

---

## 10. MySQL Schema

```mermaid
erDiagram
    users ||--o{ oauth_identities : "has"
    users {
        BIGINT_UNSIGNED id PK
        VARCHAR(255) email UK "nullable"
        VARCHAR(255) display_name "NOT NULL"
        VARCHAR(512) avatar_url "nullable"
        DATETIME created_at "DEFAULT NOW()"
        DATETIME updated_at "ON UPDATE NOW()"
        DATETIME last_login_at "nullable"
    }
    oauth_identities {
        BIGINT_UNSIGNED id PK
        BIGINT_UNSIGNED user_id FK "→ users.id, ON DELETE CASCADE"
        ENUM provider "github | google"
        VARCHAR(255) provider_user_id "NOT NULL"
        VARCHAR(255) provider_email "nullable"
        DATETIME created_at "DEFAULT NOW()"
    }
```

### Migrations

A single migration file `migrations/20240101000000_initial.sql` defines both tables. The migration system uses `sqlx::migrate!("./migrations")` which stores applied migrations in a `_sqlx_migrations` table (checksummed).

### Query patterns

| Module | Operation | Tables |
|---|---|---|
| `db/mysql/users.rs:find_or_create_oauth_user` | SELECT by (provider, provider_user_id) | `oauth_identities` + `users` (JOIN via user_id) |
| (same) | INSERT new user + identity (transactionally) | `users` then `oauth_identities` |
| (same) | UPDATE last_login_at = NOW() on existing user | `users` |

### Notes
- The `users.display_name` is derived from `gh_user.login` (GitHub) or `google_user.name` (Google).
- Google users don't have a GitHub id — a **synthetic `github_id`** is derived from the MySQL row id (`user.id as i64`) so the Redis/JWT system stays uniform.