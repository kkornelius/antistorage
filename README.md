# AntiStorage 🗄️🚀

**AntiStorage** is a unified cloud storage aggregator built for the modern desktop. Manage multiple cloud storage accounts (Google Drive, MEGA, and more to come) seamlessly from a single, beautiful interface without having to open multiple browser tabs or applications. 

Built with **Electron**, **React**, and **TypeScript**, AntiStorage prioritizes performance, privacy, and user experience.

## ✨ Features

- **Multi-Cloud Integration**: Connect and manage multiple Google Drive and MEGA accounts simultaneously.
- **Unified File Manager**: Browse, upload, download, move, rename, and delete files across different clouds with a native desktop feel.
- **Advanced Transfer Manager**: Track your active uploads and downloads in real-time with a dedicated transfer queue.
- **Secure & Private**: Your credentials (OAuth tokens, passwords) are stored strictly locally on your machine. AntiStorage communicates directly with the cloud providers—no middleman servers.
- **Beautiful UI**: A clean, responsive interface built for maximum productivity.
- **Cross-Platform**: Available for Windows, macOS, and Linux.

## 🛠️ Tech Stack

- **Core**: [Electron](https://www.electronjs.org/) & [Node.js](https://nodejs.org/)
- **Frontend**: [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Bundler**: [Vite](https://vitejs.dev/) via [electron-vite](https://electron-vite.org/)
- **Cloud APIs**: `googleapis`, `megajs`

## 🚀 Getting Started

Follow these instructions to set up the project locally for development.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kkornelius/antistorage.git
   cd antistorage
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   - Copy the `.env.example` file and rename it to `.env`.
   - Fill in your Google API credentials (Client ID, Client Secret, etc.) for Google Drive integration to work properly.

4. **Start Development Server:**
   ```bash
   npm run dev
   ```

## 📝 License

This project is licensed under the MIT License.
