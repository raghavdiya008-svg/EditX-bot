# EditX Omni Discord Bot 🚀

An enterprise-grade, all-in-one Discord management, moderation, and community engagement system engineered for creative networks, editors, designers, and freelance marketplaces.

---

## 🌟 Key Features & Architecture

### 1. 💼 Interactive Hiring & Freelance Marketplace (`modules/hiring.js`)
- **1-Click Native In-App Modals**: Zero external website redirects.
- **Dedicated Employer Board (`/hiring`)**: Job listings with formatted compensation, scope, timeline, and automatic applicant inquiry threads.
- **Dedicated Creator Showcase (`/for-hire`)**: Showcase portfolio links, starting rates, software proficiency, and availability.
- **Automated Anti-Chat Guard**: Blocks off-topic chatter in marketplace channels, routing users to structured buttons.

### 2. 🛡️ AI Moderation Sentinel & Honeypot (`modules/ai_moderator.js` & `modules/moderation.js`)
- **Report-Only Copilot**: Scans messages with Google Gemini AI and generates 1-click mod incident action cards (`Delete`, `1h Timeout`, `Ban`, `Warn`, `Dismiss`) in staff modlogs.
- **Honeypot Trap**: Automated trap channel that executes an instant **Softban + 1-Hour server-wide message purge** across all channels.
- **Deconfliction with Wick Bot**: Yields anti-nuke and server-join protection exclusively to Wick without role/permission clashes.

### 3. 👋 Luxury Graphic Welcomer & Invite Tracker (`modules/utility.js`)
- **Canvas Card Engine**: Renders 760x210 high-resolution obsidian glass cards with avatar rings and typography.
- **Welcome Desk Embed**: Displays welcome header, member position count (`#146`), account creation date, and channel navigation shortcuts.
- **Real Invites Ledger**: Accurate invite calculation (`real = regular + bonus - leaves - fake`) logged directly to `#invites-tracker`.

### 4. 📌 Persistent Sticky Notices & TagScript (`modules/tags.js`)
- **Persistent Sticky Messages (`/sticky`)**: Pins channel notices that automatically re-anchor to the bottom of the feed as members chat.
- **TagScript Engine (`/tag`)**: Dynamic variables (`{user}`, `{server.name}`, `{random:1-100}`, `{choose:a|b}`).
- **Auto-Responders & AFK (`/autoresponder`, `/afk`)**.

### 5. 🎭 Self-Assign Role Panels & Verification Gate (`modules/roles.js`)
- **Interactive Dropdown Menus**: Creative specialties, editing software, and notification pings.
- **Entry Gate**: Verification button assigning `@Members` to authenticated users.

### 6. 🎫 Support Ticket Tool (`modules/tickets.js`)
- **Department Routing**: Multi-category dropdown support portals with HTML transcript export.

### 7. 🚀 Bump Buddy & Server Stats (`modules/utility.js`)
- Automated 2-hour reminder interval for Disboard & Bump Buddy.
- Live voice-channel counters for server members and boost tiers.

---

## 🛠️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/raghavdiya008-svg/EditX-bot.git
   cd EditX-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in your Discord credentials:
   ```env
   DISCORD_TOKEN=your_token_here
   CLIENT_ID=your_client_id_here
   GUILD_ID=your_guild_id_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Deploy Slash Commands:**
   ```bash
   node deploy_commands.js
   ```

5. **Run Automated Test Suite (25 Tests):**
   ```bash
   node test_suite.js
   ```

6. **Start the Bot:**
   ```bash
   npm start
   ```

---

## 🔒 Security & Privacy
- Zero tokens, credentials, or API keys are stored in the repository.
- Sensitive environment configurations are shielded via `.gitignore`.
