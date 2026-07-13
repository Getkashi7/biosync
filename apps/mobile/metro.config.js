// Metro config. As of Expo SDK 54, getDefaultConfig is monorepo-aware out of the
// box: it populates watchFolders with the workspace root's node_modules and every
// workspace package, and sets resolver.nodeModulesPaths to [app, workspace root].
// So no manual pnpm-workspace overrides are needed here anymore.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
