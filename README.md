# NilsBohr

A codebase exploration tool that transforms GitHub repositories into interactive, gamified "world maps" — representing your code as Cities, Buildings, Rooms, and Artifacts connected by Routes.

### How it works
1. Login with GitHub OAuth
2. Paste a GitHub repo URL
3. NilsBohr clones it, parses the source code (Rust, Python, JS/TS, C/C++, Java) using tree-sitter, and builds a navigable world representation
4. Explore the structure, complexity, and interconnections of any codebase

### Stack
- **Backend:** Rust (Axum, git2, tree-sitter, MongoDB, Redis)
- **Frontend:** React (Vercel)
