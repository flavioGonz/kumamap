module.exports = {
  apps: [
    {
      name: "kumamap",
      script: "npx",
      args: "tsx server.ts",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
