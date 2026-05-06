const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const path = require("path");
const fs = require("fs");

module.exports = {
  packagerConfig: {
    name: "Codex",
    executableName: "Codex",
    appBundleId: "com.openai.codex",
    icon: "./resources/electron",
    asar: {
      unpack: "{**/*.node,**/node-pty/build/Release/spawn-helper,**/node-pty/prebuilds/*/spawn-helper}",
    },
    extraResource: ["./resources/notification.wav"],
    ignore: (filePath) => {
      if (filePath === "") return false;
      const allowedPrefixes = [
        "/src/.vite/build",
        "/src/webview",
        "/src/skills",
        "/src/native-menu-locales",
        "/node_modules",
      ];
      if (filePath === "/package.json") return false;
      for (const prefix of allowedPrefixes) {
        if (prefix.startsWith(filePath) || filePath.startsWith(prefix)) return false;
      }
      return true;
    },
    osxSign: process.env.SKIP_SIGN ? undefined : {
      identity: process.env.APPLE_IDENTITY,
      identityValidation: false,
    },
    osxNotarize: process.env.SKIP_NOTARIZE ? undefined : {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
    win32metadata: {
      CompanyName: "OpenAI",
      ProductName: "Codex",
    },
  },
  rebuildConfig: {},
  makers: [
    { name: "@electron-forge/maker-dmg", config: { format: "ULFO", icon: "./resources/electron.icns" } },
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "Codex",
        authors: "OpenAI, Cometix Space",
        description: "Codex Desktop App",
        setupIcon: "./resources/electron.ico",
        iconUrl: "https://raw.githubusercontent.com/Haleclipse/CodexDesktop-Rebuild/master/resources/electron.ico",
      },
    },
    { name: "@electron-forge/maker-zip", platforms: ["win32"] },
    {
      name: "@electron-forge/maker-deb",
      config: { options: { name: "codex", productName: "Codex", genericName: "AI Coding Assistant", categories: ["Development", "Utility"], bin: "Codex", maintainer: "Cometix Space", homepage: "https://github.com/Haleclipse/CodexDesktop-Rebuild", icon: "./resources/electron.png" } },
    },
    {
      name: "@electron-forge/maker-rpm",
      config: { options: { name: "codex", productName: "Codex", genericName: "AI Coding Assistant", categories: ["Development", "Utility"], bin: "Codex", license: "Apache-2.0", homepage: "https://github.com/Haleclipse/CodexDesktop-Rebuild", icon: "./resources/electron.png" } },
    },
    { name: "@electron-forge/maker-zip", platforms: ["linux"] },
  ],
  plugins: [
    { name: "@electron-forge/plugin-auto-unpack-natives", config: {} },
    {
      name: "@electron-forge/plugin-fuses",
      config: {
        version: FuseVersion.V1,
        [FuseV1Options.RunAsNode]: true,
        [FuseV1Options.EnableCookieEncryption]: false,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: true,
        [FuseV1Options.EnableNodeCliInspectArguments]: true,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
        [FuseV1Options.OnlyLoadAppFromAsar]: false,
      },
    },
  ],
  hooks: {
    // Copy all upstream resources (repacked app.asar, unpacked, binaries, plugins, etc.)
    // prepare-src.js already repacked the ASAR and replaced codex binary.
    // This hook copies everything from the platform dir to the app's Resources.
    packageAfterCopy: async (config, buildPath, electronVersion, platform, arch) => {
      console.log(`\n-- packageAfterCopy: ${platform}-${arch}`);

      const resourcesPath = path.dirname(buildPath);
      const platformKey = platform === "win32" ? "win"
        : platform === "linux" ? `mac-${arch}` // Linux uses macOS ASAR
        : `mac-${arch}`;

      const platformDir = path.join(__dirname, "src", platformKey);
      if (!fs.existsSync(platformDir)) {
        console.log(`   [!] Platform dir not found: src/${platformKey}/`);
        return;
      }

      // Skip items that forge handles (ASAR content is already in buildPath)
      const skip = new Set(["_asar", "app.asar"]);

      let copied = 0;
      for (const entry of fs.readdirSync(platformDir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        if (entry.name.endsWith(".lproj")) continue;

        const srcPath = path.join(platformDir, entry.name);
        const destPath = path.join(resourcesPath, entry.name);

        if (entry.isDirectory()) {
          const copyDir = (s, d) => {
            fs.mkdirSync(d, { recursive: true });
            for (const e of fs.readdirSync(s, { withFileTypes: true })) {
              const sp = path.join(s, e.name), dp = path.join(d, e.name);
              if (e.isDirectory()) copyDir(sp, dp);
              else if (!e.isSymbolicLink()) { fs.copyFileSync(sp, dp); copied++; }
            }
          };
          copyDir(srcPath, destPath);
        } else if (!entry.isSymbolicLink()) {
          fs.copyFileSync(srcPath, destPath);
          try { fs.chmodSync(destPath, 0o755); } catch {}
          copied++;
        }
      }

      console.log(`   [ok] ${copied} extra resources copied`);
    },
  },
};
