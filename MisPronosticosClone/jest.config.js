module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|@react-navigation|react-native-paper|react-native-vector-icons|@react-native-vector-icons|react-native-safe-area-context|react-native-screens)/)',
  ],
};