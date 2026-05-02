module.exports = {
  apps: [
    {
      name: "kumamap",
      script: "server.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/opt/kumamap",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
