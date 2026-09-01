module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) automatically adds react-native-worklets/plugin
    // — which Reanimated 4 requires — when react-native-worklets is installed, so
    // no manual Reanimated/worklets plugin entry is needed here.
    presets: ["babel-preset-expo"],
  };
};
